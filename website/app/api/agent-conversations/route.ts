import { readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import { NextResponse } from "next/server";

import { latestConversations, parseConversation } from "../../../src/world/conversations";

export const dynamic = "force-dynamic";

/** Local only: resident-to-resident messages from the private Library, for the rooms replay. */
export async function GET(): Promise<NextResponse> {
	const folder = process.env["WDW_LIBRARY_NOTES"] ?? join(homedir(), "Developer/library/agents/notes");
	try {
		const names = (await readdir(folder)).filter((name) => name.endsWith(".md"));
		const notes = await Promise.all(
			names.map(async (name) => parseConversation(await readFile(join(folder, name), "utf8")))
		);
		return NextResponse.json(
			{ conversations: latestConversations(notes) },
			{ headers: { "Cache-Control": "no-store" } }
		);
	} catch {
		return NextResponse.json({ conversations: [] }, { headers: { "Cache-Control": "no-store" } });
	}
}
