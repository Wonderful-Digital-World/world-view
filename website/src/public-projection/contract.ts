import { createHash } from "node:crypto";

export const PUBLIC_DELAY_MS = 24 * 60 * 60 * 1000;
export const SNAPSHOT_SCHEMA = "wdw.public-snapshot.v1";
export const PAYLOAD_SCHEMA = "wdw.systems.v1";

export interface PublicProjectionPayload {
	schema: typeof PAYLOAD_SCHEMA;
	generatedAt: string;
	sourceObservedAt: string;
	releaseDelayHours: number;
	state: string;
	residents: { total: number; active: number; needsAttention: number };
	intelligence: {
		thoughts: number | null;
		candidates: number | null;
		reviewed: number | null;
		meanSimilarity: number | null;
		precisionAtK: number | null;
		precisionAtKState: string;
	};
}

export interface PublicSnapshot {
	snapshotId: string;
	schema: typeof SNAPSHOT_SCHEMA;
	generatedAt: string;
	eligibleAt: string;
	contentHash: string;
	payload: PublicProjectionPayload;
}

const SENSITIVE_KEYS = new Set([
	"activity",
	"activities",
	"candidate_id",
	"email",
	"external_id",
	"health",
	"name",
	"note",
	"payload_private",
	"resident_id",
	"source_ref",
	"url",
]);
const HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;
const TIMEZONE_PATTERN = /(?:Z|[+-]\d{2}:\d{2})$/;

function record(value: unknown, label: string): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new Error(`${label} must be an object`);
	}
	return value as Record<string, unknown>;
}

function exactKeys(
	value: Record<string, unknown>,
	keys: Array<string>,
	label: string
): void {
	const actual = Object.keys(value).sort();
	const expected = [...keys].sort();
	if (
		actual.length !== expected.length ||
		actual.some((key, index) => key !== expected[index])
	) {
		throw new Error(`${label} has an unsupported field`);
	}
}

function finiteNumber(value: unknown, label: string): number {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		throw new Error(`${label} must be a finite number`);
	}
	return value;
}

function count(value: unknown, label: string): number {
	if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
		throw new Error(`${label} must be a non-negative safe integer`);
	}
	return value;
}

function nullableNumber(value: unknown, label: string): number | null {
	return value === null ? null : finiteNumber(value, label);
}

function textValue(value: unknown, label: string): string {
	if (typeof value !== "string") throw new Error(`${label} must be a string`);
	return value;
}

function timestamp(value: unknown, label: string): string {
	const text = textValue(value, label);
	if (!TIMEZONE_PATTERN.test(text) || !Number.isFinite(Date.parse(text))) {
		throw new Error(`${label} must be a timezone-aware timestamp`);
	}
	return text;
}

function rejectSensitiveKeys(value: unknown, path = "payload"): void {
	if (Array.isArray(value)) {
		value.forEach((child, index) => {
			rejectSensitiveKeys(child, `${path}.${index}`);
		});
		return;
	}
	if (!value || typeof value !== "object") return;
	for (const [key, child] of Object.entries(value)) {
		const normalized = key.toLowerCase().replace(/-/g, "_");
		if (SENSITIVE_KEYS.has(normalized))
			throw new Error(`sensitive field at ${path}.${key}`);
		rejectSensitiveKeys(child, `${path}.${key}`);
	}
}

export function canonicalJson(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
	if (value && typeof value === "object") {
		return `{${Object.entries(value)
			.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
			.map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`)
			.join(",")}}`;
	}
	const encoded = JSON.stringify(value);
	if (encoded === undefined) throw new Error("unsupported JSON value");
	return encoded;
}

export function sha256(value: unknown): string {
	return `sha256:${createHash("sha256").update(canonicalJson(value), "utf8").digest("hex")}`;
}

export function parsePublicSnapshot(input: unknown): PublicSnapshot {
	const envelope = record(input, "snapshot");
	exactKeys(
		envelope,
		[
			"snapshotId",
			"schema",
			"generatedAt",
			"eligibleAt",
			"contentHash",
			"payload",
		],
		"snapshot"
	);
	if (envelope["schema"] !== SNAPSHOT_SCHEMA)
		throw new Error("unsupported snapshot schema");
	const generatedAt = timestamp(envelope["generatedAt"], "generatedAt");
	const eligibleAt = timestamp(envelope["eligibleAt"], "eligibleAt");
	if (Date.parse(eligibleAt) - Date.parse(generatedAt) !== PUBLIC_DELAY_MS) {
		throw new Error("eligibleAt must be exactly 24 hours after generatedAt");
	}

	const payload = record(envelope["payload"], "payload");
	exactKeys(
		payload,
		[
			"schema",
			"generatedAt",
			"sourceObservedAt",
			"releaseDelayHours",
			"state",
			"residents",
			"intelligence",
		],
		"payload"
	);
	if (payload["schema"] !== PAYLOAD_SCHEMA)
		throw new Error("unsupported payload schema");
	if (
		timestamp(payload["generatedAt"], "payload.generatedAt") !== generatedAt
	) {
		throw new Error("payload generation time does not match envelope");
	}
	timestamp(payload["sourceObservedAt"], "payload.sourceObservedAt");
	if (finiteNumber(payload["releaseDelayHours"], "releaseDelayHours") !== 24) {
		throw new Error("releaseDelayHours must be 24");
	}
	const residents = record(payload["residents"], "payload.residents");
	exactKeys(
		residents,
		["total", "active", "needsAttention"],
		"payload.residents"
	);
	const residentCounts = {
		total: count(residents["total"], "residents.total"),
		active: count(residents["active"], "residents.active"),
		needsAttention: count(
			residents["needsAttention"],
			"residents.needsAttention"
		),
	};
	if (residentCounts.active > residentCounts.total) {
		throw new Error("active residents cannot exceed total residents");
	}
	const intelligence = record(payload["intelligence"], "payload.intelligence");
	exactKeys(
		intelligence,
		[
			"thoughts",
			"candidates",
			"reviewed",
			"meanSimilarity",
			"precisionAtK",
			"precisionAtKState",
		],
		"payload.intelligence"
	);
	rejectSensitiveKeys(payload);

	const parsedPayload: PublicProjectionPayload = {
		schema: PAYLOAD_SCHEMA,
		generatedAt,
		sourceObservedAt: payload["sourceObservedAt"] as string,
		releaseDelayHours: 24,
		state: textValue(payload["state"], "payload.state"),
		residents: residentCounts,
		intelligence: {
			thoughts: nullableNumber(
				intelligence["thoughts"],
				"intelligence.thoughts"
			),
			candidates: nullableNumber(
				intelligence["candidates"],
				"intelligence.candidates"
			),
			reviewed: nullableNumber(
				intelligence["reviewed"],
				"intelligence.reviewed"
			),
			meanSimilarity: nullableNumber(
				intelligence["meanSimilarity"],
				"intelligence.meanSimilarity"
			),
			precisionAtK: nullableNumber(
				intelligence["precisionAtK"],
				"intelligence.precisionAtK"
			),
			precisionAtKState: textValue(
				intelligence["precisionAtKState"],
				"intelligence.precisionAtKState"
			),
		},
	};
	const contentHash = textValue(envelope["contentHash"], "contentHash");
	const snapshotId = textValue(envelope["snapshotId"], "snapshotId");
	if (
		!HASH_PATTERN.test(contentHash) ||
		sha256(parsedPayload) !== contentHash
	) {
		throw new Error("content hash mismatch");
	}
  const unsigned: Omit<PublicSnapshot, "snapshotId"> = {
		schema: SNAPSHOT_SCHEMA,
		generatedAt,
		eligibleAt,
		contentHash,
		payload: parsedPayload,
	};
	if (!HASH_PATTERN.test(snapshotId) || sha256(unsigned) !== snapshotId) {
		throw new Error("snapshot ID mismatch");
	}
	return { snapshotId, ...unsigned };
}

export interface SnapshotCandidate {
	snapshot: unknown;
	verified: boolean;
}

export function selectLatestEligible(
	candidates: Array<SnapshotCandidate>,
	now: Date
): PublicSnapshot | null {
	const valid: Array<PublicSnapshot> = [];
	for (const candidate of candidates) {
		if (!candidate.verified) continue;
		try {
			const snapshot = parsePublicSnapshot(candidate.snapshot);
			if (Date.parse(snapshot.eligibleAt) <= now.getTime())
				valid.push(snapshot);
		} catch {
			// Corrupt rows cannot displace an older last-known-good snapshot.
		}
	}
	valid.sort(
		(left, right) =>
			Date.parse(right.generatedAt) - Date.parse(left.generatedAt)
	);
	return valid[0] ?? null;
}
