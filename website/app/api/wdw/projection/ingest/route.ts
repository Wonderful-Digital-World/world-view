import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import {
	parsePublicSnapshot,
	type PublicSnapshot,
} from "@src/public-projection/contract";
import { insertSnapshot } from "@src/public-projection/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_BODY_BYTES = 64 * 1024;

function authorized(request: NextRequest): boolean {
	const expected = process.env["WDW_PUBLIC_INGEST_TOKEN"];
	const header = request.headers.get("authorization");
	if (!expected || !header?.startsWith("Bearer ")) return false;
	const suppliedBytes = Buffer.from(header.slice(7));
	const expectedBytes = Buffer.from(expected);
	return (
		suppliedBytes.length === expectedBytes.length &&
		timingSafeEqual(suppliedBytes, expectedBytes)
	);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
	if (!authorized(request)) {
		return NextResponse.json({ error: "unauthorized" }, { status: 401 });
	}
	const contentLength = Number(request.headers.get("content-length") ?? 0);
	if (contentLength > MAX_BODY_BYTES) {
		return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
	}
	const body = await request.text();
	if (Buffer.byteLength(body, "utf8") > MAX_BODY_BYTES) {
		return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
	}

	let snapshot: PublicSnapshot;
	try {
		snapshot = parsePublicSnapshot(JSON.parse(body));
		if (Date.parse(snapshot.generatedAt) > Date.now() + 5 * 60 * 1000) {
			throw new Error("generatedAt is too far in the future");
		}
	} catch {
		return NextResponse.json(
			{ error: "invalid_snapshot" },
			{ status: 400, headers: { "Cache-Control": "no-store" } }
		);
	}

	try {
		const result = await insertSnapshot(snapshot);
		return NextResponse.json(
			{ snapshotId: result.snapshot.snapshotId, inserted: result.inserted },
			{
				status: result.inserted ? 201 : 200,
				headers: { "Cache-Control": "no-store" },
			}
		);
	} catch {
		return NextResponse.json(
			{ error: "ingest_unavailable" },
			{ status: 503, headers: { "Cache-Control": "no-store" } }
		);
	}
}
