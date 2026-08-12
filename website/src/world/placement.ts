import type { AgentAction, Facing } from "@src/iso";

import type { ResidentActivity } from "./types";

export type RendererRoomKey = "poker" | "court" | "office" | "home" | "outside";

export interface RendererPlacement {
	action: AgentAction;
	facing: Facing;
	x: number;
	y: number;
}

type PlacementCandidate = Omit<RendererPlacement, "action">;

const PLACEMENT_CANDIDATES: Readonly<
	Record<
		RendererRoomKey,
		Partial<Record<ResidentActivity, Array<PlacementCandidate>>>
	>
> = {
	court: {
		communicating: [
			{ facing: "right", x: 3, y: 10 },
			{ facing: "left", x: 4, y: 10 },
		],
		idle: [{ facing: "right", x: 6, y: 8 }],
		offline: [{ facing: "right", x: 6, y: 8 }],
		reviewing: [
			{ facing: "right", x: 7, y: 10 },
			{ facing: "left", x: 8, y: 10 },
		],
		waiting: [{ facing: "right", x: 6, y: 8 }],
		working: [{ facing: "right", x: 6, y: 8 }],
	},
	home: {
		communicating: [{ facing: "left", x: 7, y: 4 }],
		idle: [{ facing: "right", x: 6, y: 9 }],
		offline: [{ facing: "right", x: 6, y: 9 }],
		reviewing: [{ facing: "left", x: 7, y: 4 }],
		waiting: [{ facing: "right", x: 6, y: 9 }],
		working: [{ facing: "left", x: 7, y: 4 }],
	},
	office: {
		communicating: [
			{ facing: "right", x: 2, y: 10 },
			{ facing: "right", x: 6, y: 10 },
			{ facing: "right", x: 10, y: 10 },
		],
		idle: [
			{ facing: "right", x: 2, y: 10 },
			{ facing: "right", x: 6, y: 10 },
			{ facing: "right", x: 10, y: 10 },
		],
		offline: [{ facing: "right", x: 6, y: 10 }],
		reviewing: [{ facing: "left", x: 11, y: 2 }],
		waiting: [{ facing: "right", x: 2, y: 10 }],
		working: [
			{ facing: "right", x: 1, y: 3 },
			{ facing: "right", x: 5, y: 3 },
			{ facing: "right", x: 9, y: 3 },
			{ facing: "right", x: 1, y: 7 },
			{ facing: "right", x: 5, y: 7 },
			{ facing: "right", x: 9, y: 7 },
		],
	},
	outside: {
		communicating: [
			{ facing: "right", x: 30, y: 32 },
			{ facing: "left", x: 31, y: 32 },
		],
		idle: [
			{ facing: "right", x: 30, y: 24 },
			{ facing: "right", x: 31, y: 24 },
			{ facing: "left", x: 29, y: 24 },
		],
		offline: [{ facing: "right", x: 30, y: 24 }],
		reviewing: [{ facing: "right", x: 30, y: 32 }],
		waiting: [{ facing: "right", x: 30, y: 24 }],
		working: [{ facing: "right", x: 30, y: 24 }],
	},
	poker: {
		idle: [{ facing: "right", x: 6, y: 9 }],
	},
};

const DEFAULT_PLACEMENT: PlacementCandidate = { facing: "right", x: 6, y: 9 };

const rendererActionForActivity = (activity: ResidentActivity): AgentAction => {
	if (activity === "working") {
		return "sitting";
	}
	if (activity === "reviewing") {
		return "inspecting";
	}
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
	return {
		...candidate,
		action: rendererActionForActivity(activity),
	};
};
