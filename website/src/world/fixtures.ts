import type { WorldFixture, WorldFixtureScenario } from "./types";

const GENERATED_AT = "2026-08-12T09:00:00.000Z";

export const WORLD_PLACES: WorldFixture["places"] = [
	{
		description: "The shared gathering point for messages and coordination.",
		id: "main-square",
		name: "Main Square",
	},
	{
		description: "A focused workspace for building and reviewing work.",
		id: "workshop",
		name: "Workshop",
	},
	{
		description: "A practice space for coaching and structured review.",
		id: "coachs-gym",
		name: "Coach’s Gym",
	},
	{
		description: "A quieter personal space for Mini Me.",
		id: "mini-mes-place",
		name: "Mini Me’s Place",
	},
];

const baseResidents: WorldFixture["residents"] = [
	{
		activity: "communicating",
		agentId: "bridget",
		attention: "none",
		displayName: "Bridget",
		placeId: "main-square",
		summary: "Keeping the group in sync.",
	},
	{
		activity: "working",
		agentId: "banjo",
		attention: "info",
		displayName: "Banjo",
		placeId: "workshop",
		summary: "Making progress on a small task.",
	},
	{
		activity: "reviewing",
		agentId: "coach",
		attention: "none",
		displayName: "Coach",
		placeId: "coachs-gym",
		summary: "Reviewing the latest practice notes.",
	},
	{
		activity: "idle",
		agentId: "mini-me",
		attention: "none",
		displayName: "Mini Me",
		placeId: "mini-mes-place",
		summary: "Taking a quiet break.",
	},
];

const withResidents = (
	scenario: WorldFixtureScenario,
	label: string,
	description: string,
	residents: WorldFixture["residents"]
): WorldFixture => ({
	description,
	generatedAt: GENERATED_AT,
	label,
	places: WORLD_PLACES,
	residents,
	scenario,
});

export const WORLD_FIXTURES: Readonly<
	Record<WorldFixtureScenario, WorldFixture>
> = {
	blocked: withResidents(
		"blocked",
		"Blocked",
		"A focused workday with one resident blocked on a decision.",
		baseResidents.map((resident) => {
			if (resident.agentId === "banjo") {
				return {
					...resident,
					attention: "blocked",
					summary: "Waiting for a decision before continuing.",
				};
			}
			if (resident.agentId === "bridget") {
				return { ...resident, activity: "waiting", attention: "info" };
			}
			return { ...resident, attention: "none" };
		})
	),
	"needs-haley": withResidents(
		"needs-haley",
		"Needs Haley",
		"A workday with a resident explicitly asking for Haley’s attention.",
		baseResidents.map((resident) => {
			if (resident.agentId === "bridget") {
				return {
					...resident,
					attention: "needs-user",
					summary: "Needs Haley to confirm the next step.",
				};
			}
			if (resident.agentId === "banjo") {
				return { ...resident, attention: "none" };
			}
			if (resident.agentId === "mini-me") {
				return { ...resident, attention: "info" };
			}
			return { ...resident, attention: "none" };
		})
	),
	"normal-workday": withResidents(
		"normal-workday",
		"Normal Workday",
		"A small, deterministic snapshot of an ordinary workday.",
		baseResidents
	),
	quiet: withResidents(
		"quiet",
		"Quiet",
		"A low-activity snapshot where the group is mostly offline or resting.",
		baseResidents.map((resident) => {
			if (resident.agentId === "bridget") {
				return { ...resident, activity: "idle" };
			}
			if (resident.agentId === "banjo" || resident.agentId === "coach") {
				return { ...resident, activity: "offline", attention: "none" };
			}
			return { ...resident, attention: "none" };
		})
	),
};

export const getWorldFixture = (scenario: WorldFixtureScenario): WorldFixture =>
	WORLD_FIXTURES[scenario];
