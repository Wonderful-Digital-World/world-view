import { describe, expect, it } from "vitest";

import { GameWorld, ROOM_REGISTRY } from "@src/iso";
import { WDW_ROOM_REGISTRY } from "@src/world";

describe("World View room registry", (): void => {
	it("retains the five upstream rooms in their existing order", (): void => {
		expect(ROOM_REGISTRY.map(({ key }): string => key)).toEqual([
			"poker",
			"court",
			"office",
			"home",
			"outside",
		]);
		expect(ROOM_REGISTRY).toHaveLength(5);
		expect(
			ROOM_REGISTRY.every(
				({ name, description }): boolean =>
					name.length > 0 && description.length > 0
			)
		).toBe(true);
	});

	it("exposes only the three native WDW rooms to World View", (): void => {
		expect(WDW_ROOM_REGISTRY.map(({ key }): string => key)).toEqual([
			"workshop",
			"lab",
			"outside",
		]);
		expect(WDW_ROOM_REGISTRY).toHaveLength(3);
		expect(
			WDW_ROOM_REGISTRY.every(
				({ name, description }): boolean =>
					name.length > 0 && description.length > 0
			)
		).toBe(true);
		expect(WDW_ROOM_REGISTRY.map(({ key }): string => key)).not.toContain(
			"office"
		);
	});

	it("injects the WDW rooms without changing the demo registry", (): void => {
		const world = new GameWorld({ roomRegistry: WDW_ROOM_REGISTRY });

		expect(world.rooms.map(({ key }): string => key)).toEqual([
			"workshop",
			"lab",
			"outside",
		]);
		expect(world.currentRoomKey).toBe("workshop");
		expect((): void => {
			world.setRoom("office");
		}).toThrow('Unknown room key: "office"');
		expect(ROOM_REGISTRY.some(({ key }): boolean => key === "office")).toBe(
			true
		);

		world.destroy();
	});
});
