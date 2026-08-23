import { NextResponse } from "next/server";
import { latestEligibleSnapshot } from "@src/public-projection/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
	if (!process.env["WDW_PUBLIC_READ_DATABASE_URL"]) {
		return new NextResponse(null, {
			status: 204,
			headers: { "Cache-Control": "no-store" },
		});
	}
	try {
		const snapshot = await latestEligibleSnapshot();
		if (!snapshot) {
			return NextResponse.json(
				{ error: "no_eligible_snapshot" },
				{
					status: 404,
					headers: { "Cache-Control": "public, max-age=30, s-maxage=60" },
				}
			);
		}
		return NextResponse.json(
			{ snapshot },
			{ headers: { "Cache-Control": "public, max-age=60, s-maxage=300" } }
		);
	} catch {
		return NextResponse.json(
			{ error: "projection_unavailable" },
			{ status: 503, headers: { "Cache-Control": "no-store" } }
		);
	}
}
