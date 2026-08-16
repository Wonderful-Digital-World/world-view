import { BaseRoom } from "@src/iso/BaseRoom";
import { OutsideWorldRoom, type RoomEntry } from "@src/iso/rooms";
import type { TextureFactory } from "@src/iso/textures";
import {
	TileCode,
	type FurnitureConfig,
	type RoomDefinition,
	type RoomPalette,
} from "@src/iso/types";

const WORKSHOP_PALETTE: RoomPalette = {
	accent: 0xf59e0b,
	background: 0x1c1512,
	dais: 0x8d6e63,
	floorSide: 0x4e342e,
	floorTop: 0x6d4c41,
	wall: 0x3e2723,
};

const LAB_PALETTE: RoomPalette = {
	accent: 0x38bdf8,
	background: 0x0d171b,
	dais: 0x607d8b,
	floorSide: 0x1c313a,
	floorTop: 0x37474f,
	wall: 0x102027,
};

const createRoomMatrix = (
	width: number,
	height: number
): Array<Array<TileCode>> => {
	const matrix = Array.from(
		{ length: height },
		(): Array<TileCode> =>
			Array.from({ length: width }, (): TileCode => TileCode.Floor)
	);

	for (let column = 0; column < width; column += 1) {
		matrix[0]![column] = TileCode.Wall;
	}
	for (let row = 0; row < height; row += 1) {
		matrix[row]![0] = TileCode.Wall;
	}

	return matrix;
};

const furniture = (
	kind: FurnitureConfig["kind"],
	tileX: number,
	tileY: number
): FurnitureConfig => ({ kind, tileX, tileY });

const createWorkshopDefinition = (): RoomDefinition => ({
	description: "Shared workroom for Bridget and Banjo.",
	furniture: [
		furniture("bookshelf", 1, 1),
		furniture("desk", 2, 3),
		furniture("chair", 2, 4),
		furniture("desk", 7, 3),
		furniture("chair", 7, 4),
		furniture("whiteboard", 10, 1),
		furniture("rug", 3, 7),
		furniture("plant", 10, 8),
		furniture("crate", 1, 9),
	],
	key: "workshop",
	matrix: createRoomMatrix(13, 12),
	name: "Workshop",
	palette: WORKSHOP_PALETTE,
	spawnTile: { x: 6, y: 9 },
});

const createLabDefinition = (): RoomDefinition => ({
	description: "Research room for Coach and Mini Me.",
	furniture: [
		furniture("bookshelf", 1, 1),
		furniture("desk", 2, 4),
		furniture("chair", 2, 5),
		furniture("desk", 7, 4),
		furniture("chair", 7, 5),
		furniture("whiteboard", 10, 1),
		furniture("stool", 5, 8),
		furniture("plant", 10, 8),
		furniture("crate", 1, 9),
	],
	key: "lab",
	matrix: createRoomMatrix(13, 12),
	name: "Lab",
	palette: LAB_PALETTE,
	spawnTile: { x: 6, y: 9 },
});

export class WorkshopRoom extends BaseRoom {
	public constructor(factory: TextureFactory) {
		super(createWorkshopDefinition(), factory);
	}
}

export class LabRoom extends BaseRoom {
	public constructor(factory: TextureFactory) {
		super(createLabDefinition(), factory);
	}
}

export const WDW_ROOM_REGISTRY: ReadonlyArray<RoomEntry> = [
	{
		create: (factory: TextureFactory): BaseRoom => new WorkshopRoom(factory),
		description: "Shared workroom for Bridget and Banjo.",
		key: "workshop",
		name: "Workshop",
	},
	{
		create: (factory: TextureFactory): BaseRoom => new LabRoom(factory),
		description: "Research room for Coach and Mini Me.",
		key: "lab",
		name: "Lab",
	},
	{
		create: (factory: TextureFactory): BaseRoom =>
			new OutsideWorldRoom(factory),
		description: "Outdoor commons for residents between rooms.",
		key: "outside",
		name: "Outside",
	},
];
