import type { AgentAction } from "@src/iso";
import { describe, expect, it } from "vitest";

import {
	activityToRendererAction,
	createRendererCommands,
	getRendererRoomKey,
	getResidentVisualIdentity,
} from "./adapter";
import { getWorldFixture } from "./fixtures";
import type { ResidentActivity } from "./types";

describe("world fixture adapter", (): void => {
	it("maps semantic places to the existing renderer rooms", (): void => {
		expect(getRendererRoomKey("main-square")).toBe("outside");
		expect(getRendererRoomKey("workshop")).toBe("office");
		expect(getRendererRoomKey("coachs-gym")).toBe("court");
		expect(getRendererRoomKey("mini-mes-place")).toBe("home");
	});

	it("fails safely for an unknown semantic place", (): void => {
		expect(getRendererRoomKey("unknown-place")).toBeNull();
		expect(
			createRendererCommands(getWorldFixture("normal-workday"), "unknown-place")
		).toEqual([]);
	});

	it("maps every semantic activity to a valid existing renderer action", (): void => {
		const activities: Record<ResidentActivity, AgentAction> = {
			communicating: "idle",
			idle: "idle",
			offline: "idle",
			reviewing: "inspecting",
			waiting: "idle",
			working: "sitting",
		};

		for (const [activity, action] of Object.entries(activities)) {
			expect(activityToRendererAction(activity as ResidentActivity)).toBe(
				action
			);
		}
	});

	it("keeps visual identity stable for the named fixture residents", (): void => {
		const fixture = getWorldFixture("normal-workday");
		const bridget = fixture.residents.find(
			(resident) => resident.agentId === "bridget"
		);
		const banjo = fixture.residents.find(
			(resident) => resident.agentId === "banjo"
		);
		const coach = fixture.residents.find(
			(resident) => resident.agentId === "coach"
		);

		if (bridget === undefined || banjo === undefined || coach === undefined) {
			throw new Error("Expected all named fixture residents.");
		}

		expect(getResidentVisualIdentity(bridget)).toEqual(
			getResidentVisualIdentity(bridget)
		);
		expect(getResidentVisualIdentity(bridget).label).toBe("Bridget");
		expect(getResidentVisualIdentity(banjo).tint).not.toBe(
			getResidentVisualIdentity(coach).tint
		);
	});

	it("keeps coordinates in the adapter rather than semantic fixtures", (): void => {
		const fixture = getWorldFixture("normal-workday");
		const banjo = fixture.residents.find(
			(resident) => resident.agentId === "banjo"
		);
		const command = createRendererCommands(fixture, "workshop")[0];

		if (banjo === undefined || command === undefined) {
			throw new Error("Expected Banjo and a Workshop renderer command.");
		}

		expect(banjo).not.toHaveProperty("x");
		expect(banjo).not.toHaveProperty("y");
		expect(command.resident.agentId).toBe("banjo");
		expect(command.state.x).toEqual(expect.any(Number));
		expect(command.state.y).toEqual(expect.any(Number));
	});

	it("preserves needs-user attention through the renderer command", (): void => {
		const fixture = getWorldFixture("needs-haley");
		const bridget = fixture.residents.find(
			(resident) => resident.agentId === "bridget"
		);
		const command = createRendererCommands(fixture, "main-square")[0];

		expect(bridget?.attention).toBe("needs-user");
		expect(command?.resident.attention).toBe("needs-user");
		expect(command?.state.say?.text).toBe(bridget?.summary);
	});

	it("creates deterministic commands for a fixture and place", (): void => {
		const fixture = getWorldFixture("normal-workday");

		expect(createRendererCommands(fixture, "workshop")).toEqual(
			createRendererCommands(fixture, "workshop")
		);
	});
});
