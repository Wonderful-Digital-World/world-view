# World View

World View is the standalone isometric world viewer extracted from the [tiny.place](https://github.com/tinyhumansai/tiny.place) renderer for [Wonderful Digital World](https://github.com/Wonderful-Digital-World/wonderful-digital-world).

It is an authorized, noncanonical, and replaceable projection of selected WDW
state. The view may lag, omit details, or be unavailable; absence from World
View is not evidence that something is absent from the world. World View owns
presentation, layout, and public-safe adaptation. It does not own residents,
domain state, work routing, or durable evidence.

The website retains the PixiJS renderer, its state-control APIs, and all five upstream rooms:

- Poker
- Court
- Office
- Home
- Outside

The renderer, geometry, pathfinding, and inherited art are the tiny.place
foundation. The WDW adaptation adds its own place registry, projection policy,
view models, privacy delay, and fallback behavior rather than redefining the
upstream rooms.

## What I built on top of tiny.place

Most of this repository's history is the upstream tiny.place project. My work
(August–October 2026) turns its renderer into a live view of my agents:

- **Extraction.** Split a standalone World View app out of the tiny.place
  monorepo, with an upstream baseline record for provenance and licensing.
- **Semantic projection.** WDW residents and places are mapped onto the rooms
  through a place registry and view models, with fixtures, instead of hard-coding
  the upstream layout.
- **Live resident activity.** Each agent's status comes from WDW's Command Center
  and moves it between rooms; an expired signal shows as "Quiet", not offline.
- **Privacy delay.** The public projection is served on a delay and filtered to
  public-safe fields, so the view never exposes live private state.
- **Agent conversations.** Notes the agents leave each other in the shared Library
  replay as speech bubbles over the sender ("→ Bridget: ..."), following that
  agent's room.
- **Zoom controls** and native WDW rooms.

Code: `website/src/world/` (projection, runtime mapping, conversations),
`website/app/api/` (local projection and conversation endpoints) and
`website/src/views/RoomsWorld.tsx`.

## Recent activity

The Rooms experience can present a bounded overview of recent resident
activity—such as a public-safe place, work state, and freshness indication—from
an eligible WDW projection. These are visualization cues, not authoritative
resident or work records. A quiet or missing view leaves the underlying world
state unknown.

## Run locally

Prerequisites: Node 22 and pnpm 10.

```bash
pnpm install
pnpm dev
```

Open <http://localhost:3000/rooms>.

## Validate

```bash
pnpm lint
pnpm test
pnpm build
```

The WP2 extraction record is documented in [`docs/wp2-extraction.md`](docs/wp2-extraction.md). The retained renderer lives under `website/src/iso/`.

## Repository shape

The standalone website is the only active pnpm workspace package. The upstream SDKs, Solana contract, and specification documents remain in the repository as provenance and future integration material, but are not initialized by the `/rooms` application.

## Provenance and license

World View preserves the upstream [tiny.place](https://github.com/tinyhumansai/tiny.place) renderer and GPL-3.0-or-later licensing. See [`docs/upstream-baseline.md`](docs/upstream-baseline.md) for the trusted baseline and provenance record.
