"use client";

import {
	type ChangeEvent,
	type ReactElement,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";

import { GameWorld, MAX_ZOOM, MIN_ZOOM, ZOOM_STEP } from "@src/iso";
import {
	createRendererCommands,
	getFixtureForScenario,
	getRendererRoomKey,
	parseRuntimeOverview,
	type ResidentAttention,
	type WorldProjection,
	type WorldFixtureScenario,
	WDW_ROOM_REGISTRY,
} from "@src/world";

interface RoomsWorldProps {
	displayOnly?: boolean;
}

type RuntimeStatus = "loading" | "live" | "fallback";

const FIXTURE_OPTIONS: Array<{
	label: string;
	value: WorldFixtureScenario;
}> = [
	{ label: "Normal Workday", value: "normal-workday" },
	{ label: "Needs Haley", value: "needs-haley" },
	{ label: "Blocked", value: "blocked" },
	{ label: "Quiet", value: "quiet" },
];

const attentionLabel = (attention: ResidentAttention): string => {
	if (attention === "needs-user") {
		return "Needs user";
	}
	return attention.charAt(0).toUpperCase() + attention.slice(1);
};

const attentionClass = (attention: ResidentAttention): string => {
	if (attention === "blocked") {
		return "text-danger";
	}
	if (attention === "needs-user") {
		return "text-warning";
	}
	return "text-muted";
};

export const RoomsWorld = ({
	displayOnly = false,
}: RoomsWorldProps): ReactElement => {
	const containerRef = useRef<HTMLDivElement>(null);
	const worldRef = useRef<GameWorld | null>(null);
	const [ready, setReady] = useState(false);
	const [fixtureScenario, setFixtureScenario] =
		useState<WorldFixtureScenario>("normal-workday");
	const [runtimeProjection, setRuntimeProjection] =
		useState<WorldProjection | null>(null);
	const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatus>("loading");
	const [selectedPlaceId, setSelectedPlaceId] = useState("workshop");
	const [zoom, setZoom] = useState(WDW_ROOM_REGISTRY[0]?.defaultZoom ?? 1);

	const fixture = useMemo(
		() => getFixtureForScenario(fixtureScenario),
		[fixtureScenario]
	);
	const projection = runtimeProjection ?? fixture;
	const activePlaceId = projection.places.some(
		(place) => place.id === selectedPlaceId
	)
		? selectedPlaceId
		: (projection.places[0]?.id ?? "workshop");
	const selectedPlace = projection.places.find(
		(place) => place.id === activePlaceId
	);
	const selectedResidents = projection.residents.filter(
		(resident) => resident.placeId === activePlaceId
	);
	const rendererCommands = useMemo(
		() => createRendererCommands(projection, activePlaceId),
		[projection, activePlaceId]
	);

	useEffect(() => {
		const controller = new AbortController();
		let disposed = false;
		const load = async (): Promise<void> => {
			try {
				const response = await fetch("/api/runtime-overview", {
					cache: "no-store",
					signal: controller.signal,
				});
				if (!response.ok) {
					throw new Error(
						`Runtime projection request failed: ${response.status}`
					);
				}
				const nextProjection = parseRuntimeOverview(await response.json());
				if (!disposed) {
					setRuntimeProjection(nextProjection);
					setRuntimeStatus("live");
				}
			} catch {
				if (!disposed && !controller.signal.aborted) {
					setRuntimeProjection(null);
					setRuntimeStatus("fallback");
				}
			}
		};

		void load();
		const timer = window.setInterval(() => void load(), 5000);
		return (): void => {
			disposed = true;
			controller.abort();
			window.clearInterval(timer);
		};
	}, []);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) {
			return;
		}
		const world = new GameWorld({
			initialRoomKey: "workshop",
			roomRegistry: WDW_ROOM_REGISTRY,
		});
		worldRef.current = world;
		let disposed = false;

		void world.init(container).then(() => {
			if (disposed) {
				world.destroy();
				return;
			}
			setZoom(world.getZoom());
			setReady(true);
		});

		return (): void => {
			disposed = true;
			world.destroy();
			worldRef.current = null;
		};
	}, []);

	useEffect(() => {
		const world = worldRef.current;
		const rendererRoomKey = getRendererRoomKey(activePlaceId);
		if (!world || !ready || rendererRoomKey === null) {
			return;
		}

		world.setRoom(rendererRoomKey);
		setZoom(world.getZoom());
		world.setAutonomous(false);
		for (const command of rendererCommands) {
			world.updateAgentState(command.resident.agentId, command.state);
		}
	}, [ready, rendererCommands, activePlaceId]);

	const handleFixtureChange = (event: ChangeEvent<HTMLSelectElement>): void => {
		setFixtureScenario(event.target.value as WorldFixtureScenario);
	};

	const handlePlaceChange = (event: ChangeEvent<HTMLSelectElement>): void => {
		setSelectedPlaceId(event.target.value);
	};

	const handleZoomChange = (event: ChangeEvent<HTMLInputElement>): void => {
		const world = worldRef.current;
		if (!world) {
			return;
		}
		setZoom(world.setZoom(Number(event.target.value)));
	};

	const handleZoomIn = (): void => {
		const world = worldRef.current;
		if (world) {
			setZoom(world.zoomIn());
		}
	};

	const handleZoomOut = (): void => {
		const world = worldRef.current;
		if (world) {
			setZoom(world.zoomOut());
		}
	};

	const handleFit = (): void => {
		const world = worldRef.current;
		if (world) {
			setZoom(world.resetZoom());
		}
	};

	const projectedRoomKey = getRendererRoomKey(activePlaceId);

	return (
		<div className="fixed inset-0 overflow-hidden bg-black">
			<div ref={containerRef} className="absolute inset-0" />
			{ready ? null : (
				<div className="absolute inset-0 flex items-center justify-center text-sm text-muted">
					Loading World View…
				</div>
			)}

			{displayOnly ? null : (
				<>
					<div
						aria-label="World zoom controls"
						className="absolute bottom-3 left-3 z-10 flex items-center gap-2 rounded-xl border border-border bg-surface/85 p-2 shadow-xl backdrop-blur-md"
						role="group"
					>
						<button
							aria-label="Zoom out"
							className="h-9 w-9 rounded-md border border-border bg-bg text-lg text-front transition hover:bg-surface disabled:opacity-50"
							data-testid="zoom-out"
							disabled={!ready || zoom <= MIN_ZOOM}
							type="button"
							onClick={handleZoomOut}
						>
							−
						</button>
						<input
							aria-label="World zoom"
							className="w-28 accent-primary sm:w-40"
							data-testid="zoom-slider"
							disabled={!ready}
							max={MAX_ZOOM}
							min={MIN_ZOOM}
							step={ZOOM_STEP}
							type="range"
							value={zoom}
							onChange={handleZoomChange}
						/>
						<button
							aria-label="Zoom in"
							className="h-9 w-9 rounded-md border border-border bg-bg text-lg text-front transition hover:bg-surface disabled:opacity-50"
							data-testid="zoom-in"
							disabled={!ready || zoom >= MAX_ZOOM}
							type="button"
							onClick={handleZoomIn}
						>
							+
						</button>
						<button
							className="h-9 rounded-md border border-border bg-bg px-3 text-sm font-medium text-front transition hover:bg-surface disabled:opacity-50"
							data-testid="zoom-fit"
							disabled={!ready}
							type="button"
							onClick={handleFit}
						>
							Fit
						</button>
					</div>

					<div className="pointer-events-none absolute left-3 top-3 z-10 max-w-sm rounded-xl border border-border bg-surface/80 px-4 py-3 shadow-xl backdrop-blur-md">
						<h1 className="text-lg font-semibold text-front">World View</h1>
						<p className="mt-1 text-xs leading-relaxed text-muted">
							A native view of the Workshop, Lab, and Outside.
						</p>
					</div>

					<aside className="absolute right-3 top-3 z-10 flex w-80 max-w-[calc(100%-1.5rem)] flex-col gap-4 overflow-y-auto rounded-xl border border-border bg-surface/80 p-4 shadow-xl backdrop-blur-md">
						<section
							className="flex flex-col gap-3 rounded-lg border border-border bg-bg/60 p-3"
							data-testid="fixture-panel"
						>
							<div>
								<h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
									Runtime projection
								</h2>
								<p className="mt-1 text-[11px] leading-relaxed text-muted">
									{runtimeStatus === "live"
										? "Live Command Center activity."
										: runtimeStatus === "loading"
											? "Loading live Command Center activity…"
											: "Live activity unavailable; using deterministic fixtures."}
								</p>
							</div>
							{runtimeStatus === "fallback" ? (
								<label
									className="flex flex-col gap-1 text-xs text-muted"
									htmlFor="fixture-selector"
								>
									Fixture state
									<select
										className="rounded-md border border-border bg-surface px-2 py-2 text-sm text-front"
										data-testid="fixture-selector"
										id="fixture-selector"
										value={fixtureScenario}
										onChange={handleFixtureChange}
									>
										{FIXTURE_OPTIONS.map((option) => (
											<option key={option.value} value={option.value}>
												{option.label}
											</option>
										))}
									</select>
								</label>
							) : null}
							<p
								className="text-xs leading-relaxed text-front"
								data-testid="fixture-description"
							>
								{runtimeStatus === "live"
									? `Live · generated ${projection.generatedAt}`
									: `${fixture.label}: ${fixture.description}`}
							</p>
							<label
								className="flex flex-col gap-1 text-xs text-muted"
								htmlFor="place-selector"
							>
								Active place
								<select
									className="rounded-md border border-border bg-surface px-2 py-2 text-sm text-front"
									data-testid="place-selector"
									id="place-selector"
									value={activePlaceId}
									onChange={handlePlaceChange}
								>
									{projection.places.map((place) => (
										<option key={place.id} value={place.id}>
											{place.name}
										</option>
									))}
								</select>
							</label>
							<p className="text-xs text-front" data-testid="active-place">
								{selectedPlace?.name ?? "Unknown place"}
							</p>
							<p
								className="text-[11px] text-muted"
								data-testid="active-renderer-room"
							>
								Renderer room: {projectedRoomKey ?? "unmapped"} · native WDW
								room
							</p>

							<div
								className="flex flex-col gap-2"
								data-testid="resident-statuses"
							>
								{selectedResidents.length === 0 ? (
									<p className="text-xs text-muted">
										No residents assigned here.
									</p>
								) : (
									selectedResidents.map((resident) => (
										<div
											key={resident.agentId}
											className="rounded-md border border-border px-2 py-2"
											data-testid={`resident-card-${resident.agentId}`}
										>
											<div className="flex items-center justify-between gap-2">
												<span className="text-sm font-medium text-front">
													{resident.displayName}
												</span>
												<span
													className={`text-[11px] font-medium ${attentionClass(resident.attention)}`}
												>
													{attentionLabel(resident.attention)}
												</span>
											</div>
											<p className="mt-1 text-xs text-muted">
												{resident.activity}
											</p>
											{resident.summary ? (
												<p className="mt-1 text-[11px] leading-relaxed text-muted">
													{resident.summary}
												</p>
											) : null}
										</div>
									))
								)}
							</div>
						</section>
					</aside>
				</>
			)}
		</div>
	);
};
