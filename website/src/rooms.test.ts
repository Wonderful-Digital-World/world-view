import { describe, expect, it } from "vitest";

import { ROOM_REGISTRY } from "@src/iso";

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
});
