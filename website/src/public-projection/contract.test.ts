import { describe, expect, it } from "vitest";
import {
	PUBLIC_DELAY_MS,
	SNAPSHOT_SCHEMA,
	parsePublicSnapshot,
	selectLatestEligible,
	sha256,
	type PublicProjectionPayload,
	type PublicSnapshot,
} from "./contract";

function buildSnapshot(generatedAt: string, state = "steady"): PublicSnapshot {
	const payload: PublicProjectionPayload = {
		schema: "wdw.systems.v1",
		generatedAt,
		sourceObservedAt: generatedAt,
		releaseDelayHours: 24,
		state,
		residents: { total: 4, active: 2, needsAttention: 1 },
		intelligence: {
			thoughts: 12,
			candidates: 3,
			reviewed: 2,
			meanSimilarity: 0.72,
			precisionAtK: 0.8,
			precisionAtKState: "measured",
		},
	};
	const eligibleAt = new Date(
		Date.parse(generatedAt) + PUBLIC_DELAY_MS
	).toISOString();
	const contentHash = sha256(payload);
	const unsigned: Omit<PublicSnapshot, "snapshotId"> = {
		schema: SNAPSHOT_SCHEMA,
		generatedAt,
		eligibleAt,
		contentHash,
		payload,
	};
	return { snapshotId: sha256(unsigned), ...unsigned };
}

describe("public projection boundary", () => {
	it("keeps a snapshot inaccessible at 23:59 and exposes it at exactly 24:00", () => {
		const snapshot = buildSnapshot("2026-08-20T12:00:00.000Z");
		const candidate = [{ snapshot, verified: true }];
		expect(
			selectLatestEligible(candidate, new Date("2026-08-21T11:59:59.999Z"))
		).toBeNull();
		expect(
			selectLatestEligible(candidate, new Date("2026-08-21T12:00:00.000Z"))
				?.snapshotId
		).toBe(snapshot.snapshotId);
	});

	it("selects the newest verified eligible snapshot", () => {
		const older = buildSnapshot("2026-08-19T12:00:00.000Z", "older");
		const newer = buildSnapshot("2026-08-20T12:00:00.000Z", "newer");
		expect(
			selectLatestEligible(
				[
					{ snapshot: older, verified: true },
					{ snapshot: newer, verified: true },
				],
				new Date("2026-08-22T12:00:00.000Z")
			)?.payload.state
		).toBe("newer");
	});

	it("preserves last-known-good when newer candidates are corrupt or unverified", () => {
		const lastKnownGood = buildSnapshot(
			"2026-08-19T12:00:00.000Z",
			"last-known-good"
		);
		const corrupt = {
			...buildSnapshot("2026-08-20T12:00:00.000Z"),
			contentHash: `sha256:${"0".repeat(64)}`,
		};
		const unverified = buildSnapshot("2026-08-21T12:00:00.000Z");
		expect(
			selectLatestEligible(
				[
					{ snapshot: corrupt, verified: true },
					{ snapshot: unverified, verified: false },
					{ snapshot: lastKnownGood, verified: true },
				],
				new Date("2026-08-23T12:00:00.000Z")
			)?.payload.state
		).toBe("last-known-good");
	});

	it("rejects extra and sensitive fields before storage", () => {
		const snapshot = buildSnapshot("2026-08-20T12:00:00.000Z");
		expect(() =>
			parsePublicSnapshot({ ...snapshot, privateNote: "no" })
		).toThrow("unsupported field");
		expect(() =>
			parsePublicSnapshot({
				...snapshot,
				payload: {
					...snapshot.payload,
					residents: { ...snapshot.payload.residents, email: "no" },
				},
			})
		).toThrow();
	});
});
