# WP3 world projection

The Rooms experience projects deterministic WDW fixture state into a native
three-room renderer model. It does not translate WDW places into the upstream
demo room names.

## Native places

| Key        | Label    |
| ---------- | -------- |
| `workshop` | Workshop |
| `lab`      | Lab      |
| `outside`  | Outside  |

The WDW room registry exposes those keys in that order. Workshop and Lab have
dedicated indoor room definitions; Outside reuses the renderer's outdoor room.
The upstream demo registry remains unchanged and separately testable. A room
registry is injected into `GameWorld` so the Rooms experience can select the WDW
registry without relabeling Poker, Court, Office, or Home.

## Deterministic fixture states

The development fixture selector exposes four named states:

- Normal Workday: Bridget and Banjo are in Workshop; Coach and Mini Me are in
  Lab.
- Needs Haley: residents remain in their native rooms and the fixture exposes
  the assistance state.
- Blocked: residents remain in their native rooms and the fixture exposes the
  blocked state.
- Quiet: no residents are active.

These are view-model types, not a canonical backend contract. WP3 began with
the fixture as its only data source; it remains the deterministic development
and availability fallback. A later adapter can now fetch an eligible delayed
[WDW](https://github.com/Wonderful-Digital-World/wonderful-digital-world) public
projection as described in [`dynamic-public-projection.md`](dynamic-public-projection.md).

Only the four active WDW residents are projected. The normal Rooms experience
does not add synthetic population.

## Projection boundary

World View is an authorized, noncanonical, replaceable projection. It owns the
renderer-facing layout and adaptation, not resident identity, domain state,
work routing, or durable evidence. Projection data can lag or omit information,
so a resident, place, or activity missing here must not be interpreted as
missing from WDW.

The live view can express recent resident activity conceptually through bounded
place, work-state, and freshness cues. Those cues summarize an eligible public
snapshot; they do not become canonical records in this repository.

## Resident projection

Fixture place keys map directly to renderer room keys. Resident positions are
deterministic per room, and status labels come from the selected fixture. Mini
Me always uses the tint `0xa78bfa`.

## UI boundaries

The place selector contains exactly Workshop, Lab, and Outside. Fixture state
is explicitly labeled as a deterministic development control. The resident
list and renderer both follow the selected native room; renderer demo controls
and demo population controls are not exposed in this experience.

The PixiJS renderer, geometry, pathfinding, and inherited assets come from
tiny.place. The three-place registry, WDW resident view models, projection
policy, delay behavior, and fallback semantics are the WDW-specific adaptation.

## Regression coverage

Unit coverage protects the WDW registry, registry injection, direct place
mapping, and Mini Me's tint. The Rooms browser coverage protects the exact
three-option selector and the Normal Workday resident distribution.
