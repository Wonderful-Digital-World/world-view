export {
	activityToRendererAction,
	createRendererCommands,
	getFixtureForScenario,
	getRendererRoomKey,
	getResidentVisualIdentity,
	PLACE_ROOM_MAP,
	type RendererResidentCommand,
	type ResidentVisualIdentity,
} from "./adapter";
export { getWorldFixture, WORLD_FIXTURES, WORLD_PLACES } from "./fixtures";
export {
	resolveRendererPlacement,
	type RendererPlacement,
	type RendererRoomKey,
} from "./placement";
export type {
	PlaceProjection,
	ResidentActivity,
	ResidentAttention,
	ResidentProjection,
	WorldFixture,
	WorldFixtureScenario,
	WorldProjection,
} from "./types";
