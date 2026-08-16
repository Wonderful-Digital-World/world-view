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

These are view-model types, not a canonical backend contract. The fixture is
the current data source. There is no live
[WDW](https://github.com/Wonderful-Digital-World/wonderful-digital-world) source,
backend call, database, Airtable integration, or projection service in WP3.

Only the four active WDW residents are projected. The normal Rooms experience
does not add synthetic population.

## Resident projection

Fixture place keys map directly to renderer room keys. Resident positions are
deterministic per room, and status labels come from the selected fixture. Mini
Me always uses the tint `0xa78bfa`.

## UI boundaries

The place selector contains exactly Workshop, Lab, and Outside. Fixture state
is explicitly labeled as a deterministic development control. The resident
list and renderer both follow the selected native room; renderer demo controls
and demo population controls are not exposed in this experience.

## Regression coverage

Unit coverage protects the WDW registry, registry injection, direct place
mapping, and Mini Me's tint. The Rooms browser coverage protects the exact
three-option selector and the Normal Workday resident distribution.
