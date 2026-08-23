import "server-only";

import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import {
	parsePublicSnapshot,
	selectLatestEligible,
	type PublicSnapshot,
	type SnapshotCandidate,
} from "./contract";

interface SnapshotRow {
	envelope: unknown;
	verified: boolean;
	generatedAt: string;
	snapshotId: string;
}

function connection(kind: "read" | "write"): NeonQueryFunction<false, false> {
	const name =
		kind === "read"
			? "WDW_PUBLIC_READ_DATABASE_URL"
			: "WDW_PUBLIC_WRITE_DATABASE_URL";
	const url = process.env[name];
	if (!url) throw new Error(`${name} is not configured`);
	return neon(url);
}

function snapshotRows(value: unknown): Array<SnapshotRow> {
	if (!Array.isArray(value)) throw new Error("snapshot query returned no rows");
	return value.map((candidate) => {
		if (
			!candidate ||
			typeof candidate !== "object" ||
			Array.isArray(candidate)
		) {
			throw new Error("snapshot query returned a malformed row");
		}
		const row = candidate as Record<string, unknown>;
		if (
			typeof row["generated_at"] !== "string" ||
			typeof row["snapshot_id"] !== "string"
		) {
			throw new Error("snapshot query returned an invalid cursor");
		}
		return {
			envelope: row["envelope"],
			verified: row["verified"] === true,
			generatedAt: row["generated_at"],
			snapshotId: row["snapshot_id"],
		};
	});
}

export async function insertSnapshot(
	input: unknown
): Promise<{ snapshot: PublicSnapshot; inserted: boolean }> {
	const snapshot = parsePublicSnapshot(input);
	if (Date.parse(snapshot.generatedAt) > Date.now() + 5 * 60 * 1000) {
		throw new Error("generatedAt is too far in the future");
	}
	const sql = connection("write");
	const rows = await sql`
    INSERT INTO wdw_public_snapshots (
      snapshot_id, schema_name, generated_at, eligible_at, content_hash, envelope, verified
    ) VALUES (
      ${snapshot.snapshotId}, ${snapshot.schema}, ${snapshot.generatedAt}, ${snapshot.eligibleAt},
      ${snapshot.contentHash}, ${JSON.stringify(snapshot)}::jsonb, TRUE
    )
    ON CONFLICT (snapshot_id) DO NOTHING
    RETURNING snapshot_id
  `;
	return { snapshot, inserted: rows.length === 1 };
}

export async function latestEligibleSnapshot(
	now = new Date()
): Promise<PublicSnapshot | null> {
	const sql = connection("read");
	let beforeGeneratedAt: string | null = null;
	let beforeSnapshotId: string | null = null;

	for (;;) {
		const rowsPromise = beforeGeneratedAt
			? sql`
          SELECT envelope, verified, generated_at::text AS generated_at, snapshot_id
          FROM wdw_public_snapshots
          WHERE verified = TRUE
            AND eligible_at <= ${now.toISOString()}
            AND (generated_at, snapshot_id) < (
              ${beforeGeneratedAt}::timestamptz, ${beforeSnapshotId}
            )
          ORDER BY generated_at DESC, snapshot_id DESC
          LIMIT 50
        `
			: sql`
          SELECT envelope, verified, generated_at::text AS generated_at, snapshot_id
          FROM wdw_public_snapshots
          WHERE verified = TRUE AND eligible_at <= ${now.toISOString()}
          ORDER BY generated_at DESC, snapshot_id DESC
          LIMIT 50
        `;
		// Cursor pages are necessarily sequential: each query depends on the prior cursor.
		// eslint-disable-next-line no-await-in-loop
		const rawRows: unknown = await rowsPromise;
		const rows = snapshotRows(rawRows);
		const candidates: Array<SnapshotCandidate> = rows.map((row) => ({
			verified: row.verified === true,
			snapshot: row.envelope,
		}));
		const latest = selectLatestEligible(candidates, now);
		if (latest) return latest;
		if (rows.length < 50) return null;

		const cursor = rows[rows.length - 1];
		if (!cursor) return null;
		beforeGeneratedAt = cursor.generatedAt;
		beforeSnapshotId = cursor.snapshotId;
	}
}

export async function projectionHealth(): Promise<{
	status: "ok";
	latestEligibleAt: string | null;
}> {
	const latest = await latestEligibleSnapshot();
	return { status: "ok", latestEligibleAt: latest?.eligibleAt ?? null };
}
