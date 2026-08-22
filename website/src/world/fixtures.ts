import type { WorldFixture, WorldFixtureScenario } from "./types";

const GENERATED_AT = "2026-08-12T09:00:00.000Z";

export const WORLD_PLACES: WorldFixture["places"] = [
	{
		description:
			"The shared building workspace where Bridget and Banjo spend a normal workday.",
		id: "workshop",
		name: "Workshop",
	},
	{
		description:
			"The research and review space where Coach and Mini Me spend a normal workday.",
		id: "lab",
		name: "Lab",
	},
	{
		description: "The outdoor commons connecting the building's rooms.",
		id: "outside",
		name: "Outside",
	},
];

const baseResidents: WorldFixture["residents"] = [
	{
		activity: "working",
		agentId: "bridget",
		attention: "none",
		displayName: "Bridget",
		placeId: "workshop",
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
		activity: "thinking",
		agentId: "coach",
		attention: "none",
		displayName: "Coach",
		placeId: "lab",
		summary: "Reviewing the latest practice notes.",
	},
	{
		activity: "working",
		agentId: "mini-me",
		attention: "none",
		displayName: "Mini Me",
		placeId: "lab",
		summary: "Building alongside Coach in the lab.",
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
			if (resident.agentId === "banjo")
				return {
					...resident,
					activity: "blocked",
					attention: "blocked",
					summary: "Waiting for a decision before continuing.",
				};
			if (resident.agentId === "bridget")
				return { ...resident, activity: "waiting", attention: "info" };
			return { ...resident, attention: "none" };
		})
	),
	"needs-haley": withResidents(
		"needs-haley",
		"Needs Haley",
		"A workday with a resident explicitly asking for Haley’s attention.",
		baseResidents.map((resident) => {
			if (resident.agentId === "bridget")
				return {
					...resident,
					activity: "needs_human",
					attention: "needs-user",
					summary: "Needs Haley to confirm the next step.",
				};
			if (resident.agentId === "banjo")
				return { ...resident, attention: "none" };
			if (resident.agentId === "mini-me")
				return { ...resident, attention: "info" };
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
			if (resident.agentId === "bridget")
				return { ...resident, activity: "idle" };
			if (resident.agentId === "banjo" || resident.agentId === "coach")
				return { ...resident, activity: "offline", attention: "none" };
			return { ...resident, activity: "idle", attention: "none" };
		})
	),
};

export const getWorldFixture = (scenario: WorldFixtureScenario): WorldFixture =>
	WORLD_FIXTURES[scenario];
