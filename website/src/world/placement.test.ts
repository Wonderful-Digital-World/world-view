import { describe, expect, it } from "vitest";

import { resolveRendererPlacement } from "./placement";

describe("resolveRendererPlacement", () => {
	it("gives quiet residents sharing a room their own tiles", () => {
		const first = resolveRendererPlacement("lab", "idle", 0);
		const second = resolveRendererPlacement("lab", "idle", 1);
		expect([first.x, first.y]).not.toEqual([second.x, second.y]);
	});
});
