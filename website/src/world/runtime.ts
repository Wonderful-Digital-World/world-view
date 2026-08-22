import { WORLD_PLACES } from "./fixtures";
import type {
	ResidentActivity,
	ResidentAttention,
	ResidentProjection,
	WorldProjection,
} from "./types";

const ACTIVITIES = new Set<ResidentActivity>([
	"idle",
	"working",
	"thinking",
	"waiting",
	"blocked",
	"needs_human",
	"error",
	"offline",
]);

const RESIDENTS = ["bridget", "banjo", "coach", "mini-me"] as const;
const RESIDENT_SET = new Set<string>(RESIDENTS);

const placeFor = (residentId: string): "workshop" | "lab" =>
	residentId === "bridget" || residentId === "banjo" ? "workshop" : "lab";

const attentionFor = (activity: ResidentActivity): ResidentAttention => {
	if (activity === "blocked" || activity === "error") return "blocked";
	if (activity === "needs_human") return "needs-user";
	if (activity === "waiting") return "info";
	return "none";
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const requiredString = (
	record: Record<string, unknown>,
	key: string
): string => {
	const value = record[key];
	if (typeof value !== "string" || value.length === 0) {
		throw new Error(`Runtime overview has invalid ${key}.`);
	}
	return value;
};

const toResident = (value: unknown): ResidentProjection | null => {
	if (!isRecord(value))
		throw new Error("Runtime overview has an invalid resident.");
	const agentId = requiredString(value, "resident_id");
	if (!RESIDENT_SET.has(agentId)) return null;
	const activity = requiredString(value, "state");
	if (!ACTIVITIES.has(activity as ResidentActivity)) {
		throw new Error(`Runtime overview has invalid activity for ${agentId}.`);
	}
	const canonicalActivity = activity as ResidentActivity;
	const summary = value["status_summary"];
	return {
		activity: canonicalActivity,
		agentId,
		attention: attentionFor(canonicalActivity),
		displayName: requiredString(value, "display_name"),
		placeId: placeFor(agentId),
		...(typeof summary === "string" && summary.length > 0 ? { summary } : {}),
	};
};

/** Convert the private operator overview into the deliberately small World View contract. */
export const parseRuntimeOverview = (value: unknown): WorldProjection => {
	if (!isRecord(value) || value["schema"] !== "wdw.operator-overview.v1") {
		throw new Error("Runtime overview has an unsupported schema.");
	}
	const generatedAt = requiredString(value, "generatedAt");
	if (Number.isNaN(Date.parse(generatedAt))) {
		throw new Error("Runtime overview has an invalid generatedAt timestamp.");
	}
	const sourceResidents = value["residents"];
	if (!Array.isArray(sourceResidents)) {
		throw new Error("Runtime overview has no residents array.");
	}
	const byId = new Map<string, ResidentProjection>();
	for (const sourceResident of sourceResidents) {
		const resident = toResident(sourceResident);
		if (resident === null) continue;
		if (byId.has(resident.agentId)) {
			throw new Error(`Runtime overview duplicates ${resident.agentId}.`);
		}
		byId.set(resident.agentId, resident);
	}
	const residents = RESIDENTS.map((residentId) => byId.get(residentId));
	if (residents.some((resident) => resident === undefined)) {
		throw new Error("Runtime overview is missing a commissioned resident.");
	}
	return {
		generatedAt,
		places: WORLD_PLACES,
		residents: residents as Array<ResidentProjection>,
	};
};
