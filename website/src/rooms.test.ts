import { describe, expect, it } from "vitest";

import { GameWorld, MAX_ZOOM, MIN_ZOOM, ROOM_REGISTRY } from "@src/iso";
import {
	createRendererCommands,
	getResidentVisualIdentity,
	getWorldFixture,
	WDW_ROOM_REGISTRY,
} from "@src/world";

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

	it("uses closer framing indoors than outside", (): void => {
		const defaultZoomByRoom = new Map(
			WDW_ROOM_REGISTRY.map(({ defaultZoom, key }) => [key, defaultZoom])
		);

		expect(defaultZoomByRoom.get("workshop")).toBe(1.5);
		expect(defaultZoomByRoom.get("lab")).toBe(1.5);
		expect(defaultZoomByRoom.get("outside")).toBe(1);
		expect(defaultZoomByRoom.get("workshop")).toBeGreaterThan(
			defaultZoomByRoom.get("outside") ?? 0
		);
	});

	it("owns bounded zoom state and resets to room defaults", (): void => {
		const world = new GameWorld({
			initialRoomKey: "workshop",
			roomRegistry: WDW_ROOM_REGISTRY,
		});

		expect(world.getZoom()).toBe(1.5);
		expect(world.setZoom(1.25)).toBe(1.25);
		expect(world.setZoom(Number.NaN)).toBe(1.25);
		expect(world.setZoom(MAX_ZOOM + 1)).toBe(MAX_ZOOM);
		expect(world.zoomIn()).toBe(MAX_ZOOM);
		expect(world.setZoom(MIN_ZOOM - 1)).toBe(MIN_ZOOM);
		expect(world.zoomOut()).toBe(MIN_ZOOM);

		world.setZoom(2);
		expect(world.resetZoom()).toBe(1.5);

		world.setZoom(2);
		world.setRoom("lab");
		expect(world.getZoom()).toBe(1.5);

		world.setZoom(2);
		world.setRoom("lab");
		expect(world.getZoom()).toBe(2);

		world.setRoom("outside");
		expect(world.getZoom()).toBe(1);
		expect(world.resetZoom()).toBe(1);

		world.destroy();
	});

	it("keeps canonical residents, assignments, and Mini Me tint", (): void => {
		const fixture = getWorldFixture("normal-workday");
		const assignments = new Map(
			fixture.residents.map((resident) => [
				resident.displayName,
				resident.placeId,
			])
		);

		expect(assignments).toEqual(
			new Map([
				["Bridget", "workshop"],
				["Banjo", "workshop"],
				["Coach", "lab"],
				["Mini Me", "lab"],
			])
		);

		const miniMe = fixture.residents.find(
			(resident) => resident.displayName === "Mini Me"
		);
		if (miniMe === undefined) {
			throw new Error("Expected Mini Me in the normal-workday fixture");
		}
		expect(getResidentVisualIdentity(miniMe)).toMatchObject({
			label: "Mini Me",
			tint: 0xa78bfa,
		});

		const workshopCommands = createRendererCommands(fixture, "workshop");
		expect(workshopCommands.map((command) => command.state.label)).toEqual([
			"Bridget",
			"Banjo",
		]);
	});
});
