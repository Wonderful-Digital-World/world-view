/* eslint-disable camelcase */

import { describe, expect, it } from "vitest";

import { parseRuntimeOverview } from "./runtime";

const overview = (): Record<string, unknown> => ({
	generatedAt: "2026-08-21T09:30:00Z",
	residents: [
		{
			display_name: "Coach",
			resident_id: "coach",
			state: "thinking",
			status_summary: "Finding a pattern.",
		},
		{
			display_name: "Bridget",
			resident_id: "bridget",
			state: "needs_human",
			status_summary: "Needs a decision.",
		},
		{ display_name: "Mini Me", resident_id: "mini-me", state: "idle" },
		{
			display_name: "Banjo",
			resident_id: "banjo",
			state: "blocked",
			status_summary: "Waiting for evidence.",
		},
		{
			display_name: "Future resident",
			resident_id: "future",
			state: "working",
		},
	],
	schema: "wdw.operator-overview.v1",
});

describe("runtime World View adapter", (): void => {
	it("projects the four commissioned residents in canonical order and rooms", (): void => {
		const projection = parseRuntimeOverview(overview());
		expect(projection.residents.map((resident) => resident.agentId)).toEqual([
			"bridget",
			"banjo",
			"coach",
			"mini-me",
		]);
		expect(projection.residents.map((resident) => resident.placeId)).toEqual([
			"workshop",
			"workshop",
			"lab",
			"lab",
		]);
		expect(projection.residents[0]?.attention).toBe("needs-user");
		expect(projection.residents[1]?.attention).toBe("blocked");
		expect(projection.residents[2]?.activity).toBe("thinking");
	});

	it.each([
		["wrong schema", { ...overview(), schema: "other" }],
		[
			"bad activity",
			{
				...overview(),
				residents: [
					{ display_name: "Bridget", resident_id: "bridget", state: "dancing" },
				],
			},
		],
		[
			"missing resident",
			{
				...overview(),
				residents: (overview()["residents"] as Array<unknown>).slice(1),
			},
		],
	])("rejects %s so callers can degrade explicitly", (_label, input): void => {
		expect(() => parseRuntimeOverview(input)).toThrow();
	});
});
