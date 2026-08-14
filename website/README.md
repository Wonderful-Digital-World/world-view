# World View

World View is a standalone Next.js application for the retained [tiny.place](https://github.com/tinyhumansai/tiny.place) isometric renderer. It renders the five upstream rooms and supports switching between them without Tiny Place product services, wallet providers, or API initialization.

## Development

From the repository root:

```bash
pnpm install
pnpm --filter @wonderful-digital-world/world-view dev
```

Open <http://localhost:3000/rooms>.

## Validation

```bash
pnpm --filter @wonderful-digital-world/world-view lint
pnpm --filter @wonderful-digital-world/world-view test:unit
pnpm --filter @wonderful-digital-world/world-view build
pnpm --filter @wonderful-digital-world/world-view test:e2e
```

The renderer and room registry are retained under `src/iso/`. The extraction record is documented at `../docs/wp2-extraction.md`.
