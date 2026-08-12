/**
 * Frontend-owned semantic projection types. These are view-model contracts,
 * not the canonical WDW data model.
 */
export type ResidentActivity =
	| "idle"
	| "working"
	| "waiting"
	| "reviewing"
	| "communicating"
	| "offline";

export type ResidentAttention = "none" | "info" | "needs-user" | "blocked";

export interface PlaceProjection {
	id: string;
	name: string;
	description?: string;
}

export interface ResidentProjection {
	agentId: string;
	displayName: string;
	placeId: string;
	activity: ResidentActivity;
	attention: ResidentAttention;
	summary?: string;
}

export interface WorldProjection {
	generatedAt: string;
	places: Array<PlaceProjection>;
	residents: Array<ResidentProjection>;
}

export type WorldFixtureScenario =
	| "normal-workday"
	| "needs-haley"
	| "blocked"
	| "quiet";

export interface WorldFixture extends WorldProjection {
	scenario: WorldFixtureScenario;
	label: string;
	description: string;
}
