/**
 * Agent-to-agent messages from the shared Library, as a small local view model.
 * Library notes are the record; this only selects resident-to-resident ones to replay.
 */

export interface AgentConversation {
	id: string;
	from: string;
	to: Array<string>;
	at: string;
	title: string;
	excerpt: string;
}

const RESIDENTS = new Set(["bridget", "banjo", "coach", "mini-me"]);

const field = (frontmatter: string, key: string): string => {
	const match = new RegExp(`^${key}: (.*)$`, "m").exec(frontmatter);
	return match?.[1]?.trim() ?? "";
};

const unquote = (value: string): string => value.replace(/^"|"$/g, "");

const list = (value: string): Array<string> => {
	try {
		const parsed: unknown = JSON.parse(value);
		return Array.isArray(parsed)
			? parsed.filter((item): item is string => typeof item === "string")
			: [];
	} catch {
		return [];
	}
};

/** Parse one Library note; returns null unless it is a message from one resident to another. */
export const parseConversation = (markdown: string): AgentConversation | null => {
	const parts = markdown.split(/^---$/m);
	if (parts.length < 3) return null;
	const frontmatter = parts[1] ?? "";
	const from = unquote(field(frontmatter, "author"));
	const to = list(field(frontmatter, "to")).filter((agent) => RESIDENTS.has(agent));
	if (!RESIDENTS.has(from) || to.length === 0) return null;
	const body = parts.slice(2).join("---").trim();
	const sentences = body.split(/(?<=[.!?])\s/);
	const first = sentences[0] ?? "";
	// A very short opener ("Thanks.") says little on its own; keep the next sentence too.
	const text = first.length < 25 && sentences[1] ? `${first} ${sentences[1]}` : first;
	return {
		at: unquote(field(frontmatter, "created_at")),
		excerpt: text.length > 140 ? `${text.slice(0, 137)}…` : text,
		from,
		id: unquote(field(frontmatter, "id")),
		title: unquote(field(frontmatter, "title")),
		to,
	};
};

export const latestConversations = (
	conversations: Array<AgentConversation | null>,
	limit = 30
): Array<AgentConversation> =>
	conversations
		.filter((item): item is AgentConversation => item !== null)
		.sort((a, b) => a.at.localeCompare(b.at))
		.slice(-limit);
