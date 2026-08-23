"use client";

import { type ReactElement, useEffect, useState } from "react";

interface ProjectionView {
	eligibleAt: string;
	generatedAt: string;
	state: string;
	residents: {
		active: number;
		needsAttention: number;
		total: number;
	};
}

interface PublicProjectionPanelProps {
	fallback: ProjectionView["residents"];
}

const finiteCount = (value: unknown): number | null =>
	typeof value === "number" && Number.isSafeInteger(value) && value >= 0
		? value
		: null;

const projectionView = (input: unknown): ProjectionView | null => {
	if (!input || typeof input !== "object") return null;
	const snapshot = (input as { snapshot?: unknown }).snapshot;
	if (!snapshot || typeof snapshot !== "object") return null;
	const candidate = snapshot as {
		eligibleAt?: unknown;
		generatedAt?: unknown;
		payload?: unknown;
	};
	if (
		typeof candidate.eligibleAt !== "string" ||
		typeof candidate.generatedAt !== "string" ||
		!candidate.payload ||
		typeof candidate.payload !== "object"
	) {
		return null;
	}
	const payload = candidate.payload as { residents?: unknown; state?: unknown };
	if (
		typeof payload.state !== "string" ||
		!payload.residents ||
		typeof payload.residents !== "object"
	) {
		return null;
	}
	const residents = payload.residents as Record<string, unknown>;
	const total = finiteCount(residents["total"]);
	const active = finiteCount(residents["active"]);
	const needsAttention = finiteCount(residents["needsAttention"]);
	if (
		total === null ||
		active === null ||
		needsAttention === null ||
		active > total ||
		!Number.isFinite(Date.parse(candidate.generatedAt)) ||
		!Number.isFinite(Date.parse(candidate.eligibleAt))
	) {
		return null;
	}
	return {
		eligibleAt: candidate.eligibleAt,
		generatedAt: candidate.generatedAt,
		state: payload.state,
		residents: { active, needsAttention, total },
	};
};

export const PublicProjectionPanel = ({
	fallback,
}: PublicProjectionPanelProps): ReactElement => {
	const [projection, setProjection] = useState<ProjectionView | null>(null);
	const [settled, setSettled] = useState(false);

	useEffect(() => {
		const controller = new AbortController();
		let disposed = false;
		void fetch("/api/wdw/projection", {
			cache: "no-store",
			signal: controller.signal,
		})
			.then(async (response) =>
				response.ok ? projectionView(await response.json()) : null
			)
			.then((next) => {
				if (!disposed && next) setProjection(next);
			})
			.catch(() => undefined)
			.finally(() => {
				if (!disposed) setSettled(true);
			});
		return (): void => {
			disposed = true;
			controller.abort();
		};
	}, []);

	const residents = projection?.residents ?? fallback;
	const source = projection
		? "24-hour delayed public snapshot"
		: "safe local fixture";

	return (
		<section
			className="flex flex-col gap-3 rounded-lg border border-border bg-bg/60 p-3"
			data-testid="public-projection-panel"
		>
			<div>
				<div className="flex items-center justify-between gap-2">
					<h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
						Public projection
					</h2>
					<span className="text-[10px] uppercase tracking-wide text-muted">
						{settled ? source : "Loading"}
					</span>
				</div>
				<p className="mt-1 text-[11px] leading-relaxed text-muted">
					Aggregate-only status. Published data is inaccessible until its full
					24-hour delay has elapsed.
				</p>
			</div>
			<div className="grid grid-cols-3 gap-2 text-center">
				<div className="rounded-md border border-border p-2">
					<p className="text-lg font-semibold text-front">{residents.total}</p>
					<p className="text-[10px] text-muted">Residents</p>
				</div>
				<div className="rounded-md border border-border p-2">
					<p className="text-lg font-semibold text-front">{residents.active}</p>
					<p className="text-[10px] text-muted">Active</p>
				</div>
				<div className="rounded-md border border-border p-2">
					<p className="text-lg font-semibold text-front">
						{residents.needsAttention}
					</p>
					<p className="text-[10px] text-muted">Attention</p>
				</div>
			</div>
			{projection ? (
				<p className="text-[10px] text-muted" data-testid="projection-metadata">
					State: {projection.state} · generated {projection.generatedAt} ·
					eligible {projection.eligibleAt}
				</p>
			) : null}
		</section>
	);
};
