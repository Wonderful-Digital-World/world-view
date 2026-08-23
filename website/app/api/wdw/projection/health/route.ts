import { NextResponse } from "next/server";
import { projectionHealth } from "@src/public-projection/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
	try {
		return NextResponse.json(await projectionHealth(), {
			headers: { "Cache-Control": "no-store" },
		});
	} catch {
		return NextResponse.json(
			{ status: "unavailable" },
			{ status: 503, headers: { "Cache-Control": "no-store" } }
		);
	}
}
