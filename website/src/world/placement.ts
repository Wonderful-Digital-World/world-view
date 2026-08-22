/* eslint-disable camelcase -- resident activity keys mirror the runtime API */

import type { AgentAction, Facing } from "@src/iso";

import type { ResidentActivity } from "./types";

export type RendererRoomKey = "workshop" | "lab" | "outside";

export interface RendererPlacement {
	action: AgentAction;
	facing: Facing;
	x: number;
	y: number;
}

type PlacementCandidate = Omit<RendererPlacement, "action">;

const INDOOR_PLACEMENT_CANDIDATES: Partial<
	Record<ResidentActivity, Array<PlacementCandidate>>
> = {
	blocked: [{ facing: "right", x: 6, y: 9 }],
	communicating: [
		{ facing: "right", x: 3, y: 8 },
		{ facing: "left", x: 4, y: 8 },
	],
	error: [{ facing: "right", x: 6, y: 9 }],
	idle: [{ facing: "right", x: 6, y: 9 }],
	needs_human: [
		{ facing: "right", x: 3, y: 8 },
		{ facing: "left", x: 4, y: 8 },
	],
	offline: [{ facing: "right", x: 6, y: 9 }],
	reviewing: [{ facing: "left", x: 10, y: 2 }],
	thinking: [{ facing: "left", x: 10, y: 2 }],
	waiting: [{ facing: "right", x: 6, y: 9 }],
	working: [
		{ facing: "right", x: 2, y: 4 },
		{ facing: "right", x: 7, y: 4 },
	],
};

const OUTSIDE_IDLE: Array<PlacementCandidate> = [
	{ facing: "right", x: 30, y: 24 },
	{ facing: "right", x: 31, y: 24 },
	{ facing: "left", x: 29, y: 24 },
];

const PLACEMENT_CANDIDATES: Readonly<
	Record<
		RendererRoomKey,
		Partial<Record<ResidentActivity, Array<PlacementCandidate>>>
	>
> = {
	lab: INDOOR_PLACEMENT_CANDIDATES,
	outside: {
		blocked: OUTSIDE_IDLE,
		communicating: [
			{ facing: "right", x: 30, y: 32 },
			{ facing: "left", x: 31, y: 32 },
		],
		error: OUTSIDE_IDLE,
		idle: OUTSIDE_IDLE,
		needs_human: [
			{ facing: "right", x: 30, y: 32 },
			{ facing: "left", x: 31, y: 32 },
		],
		offline: OUTSIDE_IDLE,
		reviewing: [{ facing: "right", x: 30, y: 32 }],
		thinking: [{ facing: "right", x: 30, y: 32 }],
		waiting: OUTSIDE_IDLE,
		working: OUTSIDE_IDLE,
	},
	workshop: INDOOR_PLACEMENT_CANDIDATES,
};

const DEFAULT_PLACEMENT: PlacementCandidate = { facing: "right", x: 6, y: 9 };

const rendererActionForActivity = (activity: ResidentActivity): AgentAction => {
	if (activity === "working") return "sitting";
	if (activity === "thinking" || activity === "reviewing") return "inspecting";
	return "idle";
};

export const resolveRendererPlacement = (
	roomKey: RendererRoomKey,
	activity: ResidentActivity,
	index: number
): RendererPlacement => {
	const candidates = PLACEMENT_CANDIDATES[roomKey][activity] ?? [
		DEFAULT_PLACEMENT,
	];
	const candidate = candidates[index % candidates.length] ?? DEFAULT_PLACEMENT;
	return { ...candidate, action: rendererActionForActivity(activity) };
};
