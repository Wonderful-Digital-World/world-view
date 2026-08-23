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
