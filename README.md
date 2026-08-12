# World View

World View is the standalone isometric world viewer extracted from the tiny.place renderer for Wonderful Digital World.

The website retains the PixiJS renderer, its state-control APIs, and all five upstream rooms:

- Poker
- Court
- Office
- Home
- Outside

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

World View preserves the upstream tiny.place renderer and GPL-3.0-or-later licensing. See [`docs/upstream-baseline.md`](docs/upstream-baseline.md) for the trusted baseline and provenance record.
