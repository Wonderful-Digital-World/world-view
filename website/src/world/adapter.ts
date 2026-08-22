import type { AgentAction, AgentState } from "@src/iso";

import { getWorldFixture } from "./fixtures";
import { resolveRendererPlacement, type RendererRoomKey } from "./placement";
import type {
	ResidentActivity,
	ResidentProjection,
	WorldFixture,
	WorldProjection,
	WorldFixtureScenario,
} from "./types";

export const PLACE_ROOM_MAP: Readonly<Record<string, RendererRoomKey>> = {
	lab: "lab",
	outside: "outside",
	workshop: "workshop",
};

export interface ResidentVisualIdentity {
	accessoryStrategy: "renderer-deterministic";
	label: string;
	tint: number;
}

export interface RendererResidentCommand {
	resident: ResidentProjection;
	roomKey: RendererRoomKey;
	state: AgentState;
}

const RESIDENT_IDENTITIES: Readonly<Record<string, ResidentVisualIdentity>> = {
	banjo: {
		accessoryStrategy: "renderer-deterministic",
		label: "Banjo",
		tint: 0x60a5fa,
	},
	bridget: {
		accessoryStrategy: "renderer-deterministic",
		label: "Bridget",
		tint: 0xf472b6,
	},
	coach: {
		accessoryStrategy: "renderer-deterministic",
		label: "Coach",
		tint: 0xfbbf24,
	},
	"mini-me": {
		accessoryStrategy: "renderer-deterministic",
		label: "Mini Me",
		tint: 0xa78bfa,
	},
};

const hashAgentId = (agentId: string): number => {
	let hash = 0;
	for (const character of agentId) {
		hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
	}
	return hash;
};

const fallbackIdentityFor = (
	resident: ResidentProjection
): ResidentVisualIdentity => {
	const tintPalette = [0x34d399, 0x38bdf8, 0xfb7185, 0xc084fc];
	return {
		accessoryStrategy: "renderer-deterministic",
		label: resident.displayName,
		tint:
			tintPalette[hashAgentId(resident.agentId) % tintPalette.length] ??
			0x38bdf8,
	};
};

export const getRendererRoomKey = (placeId: string): RendererRoomKey | null =>
	PLACE_ROOM_MAP[placeId] ?? null;

export const activityToRendererAction = (
	activity: ResidentActivity
): AgentAction => {
	if (activity === "working") return "sitting";
	if (activity === "thinking" || activity === "reviewing") return "inspecting";
	return "idle";
};

export const getResidentVisualIdentity = (
	resident: ResidentProjection
): ResidentVisualIdentity =>
	RESIDENT_IDENTITIES[resident.agentId] ?? fallbackIdentityFor(resident);

export const createRendererCommands = (
	projection: WorldProjection,
	placeId: string
): Array<RendererResidentCommand> => {
	const roomKey = getRendererRoomKey(placeId);
	if (roomKey === null) return [];

	return projection.residents
		.filter((resident) => resident.placeId === placeId)
		.map((resident, index) => {
			const identity = getResidentVisualIdentity(resident);
			const placement = resolveRendererPlacement(
				roomKey,
				resident.activity,
				index
			);
			return {
				resident,
				roomKey,
				state: {
					action: activityToRendererAction(resident.activity),
					facing: placement.facing,
					label: identity.label,
					say:
						resident.attention === "needs-user" && resident.summary
							? { text: resident.summary }
							: undefined,
					tint: identity.tint,
					x: placement.x,
					y: placement.y,
				},
			};
		});
};

export const getFixtureForScenario = (
	scenario: WorldFixtureScenario
): WorldFixture => getWorldFixture(scenario);
