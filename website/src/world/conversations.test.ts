import { describe, expect, it } from "vitest";

import { latestConversations, parseConversation } from "./conversations";

const note = (author: string, to: string, at = "2026-10-26T20:31:00Z"): string =>
	`---\nid: "n-${author}"\nauthor: "${author}"\ntitle: "${author} to them"\ncreated_at: "${at}"\nto: ${to}\n---\n\nThe deadlift session moved to Friday. Loads stay the same.\n`;

describe("agent conversations", () => {
	it("keeps resident-to-resident messages and their first sentence", () => {
		expect(parseConversation(note("coach", '["bridget"]'))).toMatchObject({
			excerpt: "The deadlift session moved to Friday.",
			from: "coach",
			to: ["bridget"],
		});
	});

	it("drops notes to or from non-residents and orders the rest by time", () => {
		expect(parseConversation(note("claude", '["codex"]'))).toBeNull();
		const later = parseConversation(note("mini-me", '["coach"]', "2026-10-27T20:31:00Z"));
		const earlier = parseConversation(note("coach", '["bridget"]'));
		expect(latestConversations([later, null, earlier]).map((c) => c.from)).toEqual(["coach", "mini-me"]);
	});
});
