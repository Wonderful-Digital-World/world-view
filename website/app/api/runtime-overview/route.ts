import { NextResponse } from "next/server";

const DEFAULT_COMMAND_CENTER = "http://127.0.0.1:8787";
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
	try {
		const base = new URL(
			process.env["WDW_COMMAND_CENTER_URL"] ?? DEFAULT_COMMAND_CENTER
		);
		if (base.protocol !== "http:" || !LOOPBACK_HOSTS.has(base.hostname)) {
			throw new Error("Command Center URL must use HTTP on a loopback host.");
		}
		const overviewUrl = new URL("/api/overview?view=private", base);
		const response = await fetch(overviewUrl, {
			cache: "no-store",
			signal: AbortSignal.timeout(3000),
		});
		if (!response.ok)
			throw new Error(`Command Center returned ${response.status}.`);
		return NextResponse.json(await response.json(), {
			headers: { "Cache-Control": "no-store" },
		});
	} catch (error: unknown) {
		return NextResponse.json(
			{
				error:
					error instanceof Error
						? error.message
						: "Runtime overview unavailable.",
			},
			{ headers: { "Cache-Control": "no-store" }, status: 502 }
		);
	}
}
