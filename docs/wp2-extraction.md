# WP2 extraction record

World View WP2 extracts the smallest standalone application around the trusted
tiny.place isometric renderer. The renderer remains in `website/src/iso/`, and
the `/rooms` route retains all five upstream rooms and room switching.

## Baseline and scope

- Trusted upstream baseline: `a28827be6c1d6aee8108a5d27b0f9df5fb0b40c4`
- WP1 local baseline: `624bfa07`
- WP2 starting commit: `7915db4c11d9517d18109075f1f2390d8d3a8c25`
- WP2 branch: `codex/wp2-minimal-world-view`
- Scope intentionally excludes WDW projections, new rooms, sprite or palette
  changes, framework migration, and renderer redesign.

## Retained application boundary

The active website now consists of the following routes and renderer-facing
modules:

- `/` redirects to `/rooms`.
- `/rooms` renders `RoomsWorldLoader` and `RoomsWorld`.
- `not-found` provides a minimal link back to `/rooms`.
- `website/src/iso/` retains `GameWorld`, `Agent`, `BaseRoom`, `ChatBubble`,
  furniture, textures, geometry, room definitions, types, and renderer state
  and room-control APIs.
- `website/src/styles/tailwind.css` remains because the retained shell and
  renderer controls use its token-backed styles.

The room registry remains the exact five-room upstream registry, in its
existing order: Poker, Court, Office, Home, and Outside.

## Removed product surface

The inherited Tiny Place shell and product routes were removed, including the
feed, profile, explore, settings, invite, post, poker, A2A, API, health,
robots, sitemap, and product error/hero routes. Product-only source trees,
public assets, scripts, Storybook configuration, the functional Playwright
configuration, and environment files were also removed.

The root layout no longer initializes the inherited provider tree. In
particular, the active `/rooms` application no longer initializes the API
client, TanStack Query, wallet adapters, Phantom or Solana providers, theme or
locale providers, onboarding, MoonPay, navigation, connection footer, or E2E
auth helpers. The page has no analytics bootstrap or remote font dependency.

The pnpm workspace now contains only the standalone website package. The
website runtime dependencies are limited to Next.js, React, React DOM, and
PixiJS; retained development dependencies are only the build, lint, test, and
CSS tooling needed by that package.

## Validation evidence

The following results are recorded after the final cleanup and lockfile
regeneration:

- Install: `pnpm install --frozen-lockfile` passed with only the root and
  standalone website workspace importers present.
- Build: `pnpm build` passed with the `/`, `/_not-found`, and `/rooms` routes.
- Lint: `pnpm lint` passed with zero warnings.
- Unit tests: `pnpm --filter @wonderful-digital-world/world-view test:unit`
  passed one focused registry test.
- E2E/runtime/network checks: `pnpm test` passed the focused unit test and one
  Playwright smoke. The smoke rendered the canvas, physically switched through
  all five room buttons, and observed zero requests to non-local hosts. A
  production server check returned HTTP 200 for `/rooms` and included the
  World View shell markers.

The focused regression coverage checks that the room registry still contains
exactly five rooms in the upstream order. The Playwright smoke checks the
standalone `/rooms` page, canvas rendering, room switching, and absence of
requests to non-local hosts.

No file under `website/src/iso/` changed during the extraction.

## Remaining coupling

The retained renderer is intentionally still the upstream tiny.place renderer,
including its PixiJS implementation and room assets. The repository also keeps
the upstream SDKs, Solana contract, and specification documents as provenance
and future integration material; they are no longer pnpm workspace packages
and are not initialized by `/rooms`.

Repository-level release and hook configuration may still mention the former
multi-package Tiny Place layout. Those references do not enter the standalone
website runtime and should be revisited only if WP3 needs a broader repository
packaging change.

## WP3 recommendation

Treat this extraction as the stopping point for WP2. WP3 can add WDW-specific
projection and policy work only after this standalone renderer boundary is
accepted, without changing the retained five-room renderer in WP2.
