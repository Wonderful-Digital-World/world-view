# World View — WP1 upstream baseline

This document records the trusted local baseline for World View before any WDW integration or renderer extraction. The source remains the upstream Tiny Place application at this stage; “World View” is the WDW product/repository name, not a source rebrand.

## Identity and provenance

| Field | Value |
| --- | --- |
| Product name | World View |
| GitHub organization | `Wonderful-Digital-World` (WDW) |
| Intended GitHub repository | `Wonderful-Digital-World/world-view` |
| Intended repository URL | <https://github.com/Wonderful-Digital-World/world-view> |
| Upstream repository | <https://github.com/tinyhumansai/tiny.place> |
| Baseline commit | `a28827be6c1d6aee8108a5d27b0f9df5fb0b40c4` |
| Imported | 2026-08-12 |
| License | GPL-3.0-or-later, preserved from upstream |
| Local branch | `codex/wp1-world-view` |

The complete upstream Git history was imported locally. The working tree is based on upstream `main` at the commit above. Upstream copyright, license files, and notices remain in place. The repository is intended for the `Wonderful-Digital-World` organization, abbreviated WDW; it is not a personal fork or a repository under the upstream Tiny Place organization.

## Local setup and validation

The upstream workspace uses pnpm. From the repository root:

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm --filter @tinyplace/website dev
```

The installed environment provided pnpm 9.13.0 directly, so the commands used locally were `pnpm ...`. The SDK workspace must be built before the website when starting from a clean install because the website's inherited providers import the SDK distribution files.

| Check | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | Pass; 1233 packages installed |
| `pnpm build` | Pass after the upstream SDK-first workspace build; Next generated the site, including `/rooms` |
| `pnpm lint` | Pass after the SDK build |
| `pnpm --filter @tinyplace/website lint` | Pass |
| `pnpm --filter @tinyplace/website test:unit` | Pass; 39 files and 197 tests |
| `pnpm test` | Partial: unit tests pass; 2 Playwright smoke tests fail because the Chromium headless executable is not installed, while 22 e2e tests are skipped |
| `/rooms` runtime | Pass at `http://localhost:3000/rooms` |

The e2e failure is environmental rather than a `/rooms` renderer failure. Playwright reported that its Chromium executable was missing and suggested `pnpm exec playwright install`. The installed dependencies also reported ignored optional build scripts for `bufferutil`, `esbuild`, `sharp`, and `utf-8-validate`; these did not block the build, lint, unit tests, or `/rooms` runtime.

## Runtime evidence

The local development server rendered `/rooms` successfully. The runtime check confirmed:

- PixiJS initialized and rendered the isometric canvas.
- The default Outside World rendered with buildings, roads, furniture, and agents.
- The default population was 100 agents and autonomous movement was enabled.
- The room picker switched successfully through `Poker`, `Court`, `Office`, `Home`, and `World` (the display name for the `outside` room).
- The route remained usable after room changes; the heading and world shell remained present for each selection.
- The route's resize observer and canvas renderer were active in the browser session.

Screenshot: [Outside World evidence](./evidence/rooms-outside.png)

The visible `Disconnected | server | staging-api.tiny.place` footer is inherited from the global Tiny Place application shell. It is not a direct dependency of the isometric renderer.

## World entry points

The verified execution path is:

```text
/rooms
  ↓
website/app/rooms/page.tsx
  ↓
website/src/views/RoomsWorldLoader.tsx
  ↓  dynamic client-only import, ssr: false
website/src/views/RoomsWorld.tsx
  ↓
website/src/iso/GameWorld.ts
  ├── Agent.ts
  ├── BaseRoom.ts
  ├── ChatBubble.ts
  ├── furniture.ts
  ├── geometry.ts
  ├── rooms.ts
  ├── textures.ts
  └── types.ts
```

`website/app/rooms/page.tsx` provides metadata and mounts `RoomsWorldLoader`. The loader avoids server-side execution because Pixi and browser rendering APIs are client-only. `RoomsWorld` creates and initializes `GameWorld`, selects `outside`, spawns the default population, enables autonomous movement, renders the room picker, and destroys the world during cleanup.

## Dependency map

### A. Core renderer — keep for the baseline

The core is in `website/src/iso/` and imports PixiJS plus local renderer modules only.

| Module | Responsibility |
| --- | --- |
| `GameWorld.ts` | Pixi application, render/update loop, camera, room lifecycle, agent lifecycle, selection, pointer input, resize handling, autonomous traffic |
| `Agent.ts` | Procedural agent sprite, label/nameplate, facing, movement interpolation, action animation, tint, accessory, speech anchor |
| `BaseRoom.ts` | Matrix-to-scene construction, walkability, seats, stations, depth ordering, BFS pathfinding, spawn nodes |
| `ChatBubble.ts` | In-world speech bubble display and timing |
| `rooms.ts` | Room registry and room definitions, including matrices, palettes, furniture, stations, and spawn configuration |
| `furniture.ts` | Procedural furniture blueprints, furniture sprites, and interaction-point metadata |
| `textures.ts` | Procedural Pixi texture generation and baked texture cache |
| `geometry.ts` | 2:1 isometric projection, depth, tile conversion, distance, and interpolation helpers |
| `types.ts` | Tile codes, room definitions, palettes, furniture configuration, interaction points, and `AgentState` |
| `color.ts` | Renderer color helpers |

The renderer is already PixiJS v8 based and requests WebGPU with a high-performance preference, while retaining Pixi's browser renderer behavior. No DOM replacement or framework migration was made.

### B. World React shell — keep/modify later

- `website/app/rooms/page.tsx`
- `website/src/views/RoomsWorldLoader.tsx`
- `website/src/views/RoomsWorld.tsx`

The shell directly needs React, Next's client-only dynamic import, i18next/react-i18next for UI strings, `GameWorld`, and `ROOM_REGISTRY`. It does not call the Tiny Place API, wallet SDK, or a WDW service itself.

### C. Shared infrastructure currently loaded around the route

The current `/rooms` page is still inside the full upstream app shell:

- `website/app/layout.tsx` loads global styles, metadata, structured data, analytics components, and a remote Google Fonts stylesheet.
- `website/app/providers.tsx` mounts React Query, the Tiny Place API provider, wallet context, theme and locale controllers, onboarding, MoonPay, the navigation shell, connection footer, and e2e auth glue.
- `website/app/explore-shell.tsx` supplies the global navigation/sidebar and route surfaces.
- `website/src/common/api-client.ts` and `website/src/common/api-context.tsx` provide the inherited Tiny Place client and default staging API configuration.
- `website/src/common/connection-footer.tsx` displays server connectivity state.
- Analytics/Sentry and Solana/MoonPay helpers are global product infrastructure, not renderer modules.

Some of this infrastructure is needed to boot the current route as shipped; it is not genuinely required by `GameWorld` or the local simulation. It is a likely boundary for WP2.

### D. Product functionality to consider only in a later extraction

The package and app retain upstream product areas for bounties, marketplace/economy, ledgers, leaderboards, stats, social/feed, messaging, identities, invitations, games, wallet/onramp/payment flows, and Tiny Place network services. They were not removed in WP1.

## Package dependency classification

This is a classification for future work, not a removal plan. The installed `website/package.json` remains unchanged.

| Classification | Dependencies/examples | Finding |
| --- | --- | --- |
| Required by the renderer | `pixi.js`, `react`, `react-dom`, `next` | Pixi renders the world; React/Next mount the client shell and route |
| Required by the current app shell | `i18next`, `react-i18next`, `i18next-browser-languagedetector`, `i18next-http-backend`, `@tanstack/react-query`, `zustand`, `@tinyhumansai/tinyplace`, Tailwind packages | Used by providers, navigation, translations, API state, or global styling; not imported by the iso core except through the surrounding app |
| Possibly required by shared/product UI | `zod`, `react-hook-form`, `@hookform/resolvers`, `react-markdown`, `dayjs`, `@tanstack/react-table`, `@nivo/*`, Sentry/OpenPanel packages | Used by other product surfaces or shared components; direct need for a future minimal world shell is not established |
| Clearly unrelated to the renderer | `@moonpay/moonpay-react`, `@phantom/react-sdk`, `@solana/web3.js`, payment/onramp code, economy/ledger/marketplace modules, social/messaging/identity modules, game-specific modules, Storybook packages | Keep for the imported baseline; candidate removal only after the future shell no longer loads the relevant feature |

The workspace SDK is a build-time/current-shell dependency because inherited providers reference `@tinyhumansai/tinyplace`. The renderer source itself has no direct SDK import.

## Backend and network coupling audit

### Core renderer result

The following renderer path is locally simulated and has no direct `fetch`, WebSocket, auth, wallet, SDK, API-client, or environment-variable dependency:

```text
RoomsWorld → GameWorld → Agent / BaseRoom / ChatBubble / furniture / rooms / textures / geometry
```

`GameWorld` constructs the Pixi application, rooms, agents, traffic, pathfinding, and autonomous movement locally. `spawnAgents()` creates deterministic local agents, and `setAutonomous(true)` makes them wander over walkable room nodes.

### Current full-route result

The current route still boots inside inherited product infrastructure that can reach external services:

- the API context and onboarding components use the Tiny Place client and default to the staging API when no local API base URL is set;
- the connection footer reads the same server configuration and exposes the inherited connection status;
- wallet context initializes Solana connection and Phantom-related configuration;
- MoonPay uses `NEXT_PUBLIC_MOONPAY_API_KEY` when configured;
- analytics/Sentry components may send telemetry;
- the global layout loads Google Fonts remotely.

Conclusion: the existing isometric world can run as a local frontend simulation, but the current unextracted `/rooms` route is not a completely offline application because the global shell remains attached around it. No external service was replaced or redirected to WDW in WP1.

## State-control audit

The current control surface is suitable for a future WDW projection adapter, but no adapter is implemented here.

1. An agent is created or updated through `GameWorld.updateAgentState(agentId, state)`. The map key is the stable external `agentId`; repeated updates reconcile the existing local `Agent` rather than creating a duplicate.
2. `AgentState` carries target tile coordinates (`x`, `y`), action (`idle`, `walking`, `sitting`, or `inspecting`), facing, speed, optional label/tint, and optional speech (`say`).
3. On a new or changed target, `GameWorld` asks the active `BaseRoom` for a path. Invalid or blocked targets fall back to a room spawn node. The agent walks the resulting path and interpolates toward the target.
4. `setRoom(roomKey)` validates against `ROOM_REGISTRY`, clears current agents and traffic, constructs a new `BaseRoom`, and resets the active room. Room membership is therefore currently a local active-room selection, not a server membership model.
5. `spawnAgents(count)` creates local demo agents from the active room's walkable nodes. `setAutonomous(true)` enables local wandering; external state updates can supersede a wandering target.
6. `speak(agentId, text)` creates or updates a `ChatBubble` attached to the agent. `AgentState.say` is reconciled through the same speech path.
7. Furniture interaction is represented by room stations and `InteractionPoint` metadata. `BaseRoom.stationAt()` resolves a station at a tile; pointer interaction can select walkable tiles and furniture stations. The renderer does not persist an interaction to a backend.

## Room system audit

`website/src/iso/rooms.ts` exports the registry and five built-in definitions:

| Registry key | Display name | Definition |
| --- | --- | --- |
| `poker` | Poker | Matrix-based interior with furniture and interaction stations |
| `court` | Court | Matrix-based interior with court furniture and stations |
| `office` | Office | Matrix-based interior with desks/furniture and stations |
| `home` | Home | Matrix-based interior with home furniture and stations |
| `outside` | World | Deterministically generated 62×62 open city/plaza world |

Each room definition combines a tile matrix, palette, furniture configuration, interaction points, and spawn information. `BaseRoom` derives walkability and depth from the matrix and uses BFS pathfinding with diagonal corner-cut prevention, elevation constraints, and seat-terminal behavior. The outside world adds generated buildings, roads, pavement, lamps, plants, a fountain, chairs, and moving traffic.

Adding future WDW rooms such as Main Square, Workshop, Coach's Gym, Mini Me's Place, Research Library, or Post Office should be a moderate registry/definition task once the shell boundary is extracted: add a definition, palette/furniture/station configuration, translations/display metadata, and test pathfinding/spawn tiles. No WDW rooms were added in WP1.

## Asset architecture audit

The iso renderer is predominantly procedural:

- `TextureFactory` draws Pixi primitives and bakes renderer textures rather than loading a room image atlas;
- `Agent` builds the body, face, accessory, shadow, label, and selection state from Pixi display objects and generated textures;
- furniture is described by blueprints and rendered procedurally by `FurnitureSprite`;
- room palettes and tile colors live in room definitions and renderer color helpers;
- fonts used by the renderer are Pixi bitmap text/font configuration, while the application shell also has file-backed site icons and a remote Google Fonts stylesheet.

The current `/rooms` proof did not require a separate WDW asset service. Any later reuse of third-party fonts, icons, or upstream visual assets should receive a separate attribution/license review; WP1 does not customize or replace them.

## Candidate cleanup after WP1

No candidate below was removed. The safe condition is intentionally deferred until the corresponding current route import/provider is no longer needed.

| Candidate cleanup | Reason | Likely safe to remove after |
| --- | --- | --- |
| Global Tiny Place API provider, onboarding, connection footer, and SDK | Current world core does not consume them; they couple the route to Tiny Place services | A minimal World View shell mounts `RoomsWorld` without those providers and local smoke tests pass |
| Wallet, Phantom, Solana RPC, and MoonPay | Payment/wallet surfaces are unrelated to the renderer | Navigation and providers no longer import wallet/onramp code |
| Economy, bounties, ledger, marketplace, storefront, leaderboards, and stats | Product functionality outside the visual world | A route/import audit proves no World View shell or test uses the modules |
| Feed, social, messaging, identities, invitations, and profile flows | Private Tiny Place product surfaces | The extracted app has an explicit replacement for any needed display identity/label behavior |
| Games and poker-specific product services | The `poker` room is a visual room, while game services are separate product behavior | Room rendering has no imports from game/network services |
| Analytics, remote font loading, and product-wide telemetry | May be inappropriate for a future public sanitized view | WDW privacy, telemetry, and offline/online requirements are decided |
| Large upstream docs and unrelated route assets | Reduce the public frontend surface and repository noise | The actual World View distribution boundary is agreed and documented |

## Known issues and limitations

- The imported repository is still branded and structured as Tiny Place source. This is intentional for provenance and baseline fidelity; naming and extraction belong to WP2.
- A clean workspace build needs the SDK packages built before the website because of inherited provider imports.
- The full Playwright suite could not launch in this environment until the Chromium headless executable is installed. Unit coverage and the browser smoke proof were run separately.
- The current route retains inherited API/wallet/analytics/remote-font shell coupling even though the iso renderer itself is locally simulated.
- The upstream build emitted non-blocking Node deprecation and experimental-localStorage warnings.

## Recommended next extraction step

WP2 should extract the smallest World View application shell around the existing `RoomsWorld` and `website/src/iso/*` implementation, preserving renderer behavior and first replacing/removing inherited global product providers only where tests prove they are unnecessary. It should begin from this exact baseline and keep the upstream provenance record.

No WDW projections, backend adapters, public sanitization, delay logic, new rooms, sprite customization, navigation redesign, framework migration, or private-repository changes were made in WP1.
