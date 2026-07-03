// Foreground-inject slot — the shared abstraction for waking an IDLE interactive
// pane in-context when a new DM arrives (e.g. sanil-23's tmux send-keys approach,
// PR #212). It is deliberately a stub today: the SLOT exists in core so that when
// the inject strategy lands it drops in here, wired for every harness at once —
// no server/daemon/hook rework. Both adapters already advertise the capability
// via `inbound.foregroundInject: true`.
//
// Contract (kept stable so #212 fills the body, not the shape):
//   canForegroundInject(adapter) -> boolean   — does the active harness opt in?
//   foregroundInject(address, messages, opts) -> { injected, reason }
//     • MUST fail open — never throw into a hook; return {injected:false,reason}.
//     • MUST be idempotent w.r.t. the caller's own per-id dedup (surface-inbound
//       already marks surfaced ids), so it only nudges a genuinely idle pane.
import { activeAdapter } from "./harness.mjs";

// Pure predicate: is foreground inject enabled for this harness? Unit-testable.
export function canForegroundInject(adapter = activeAdapter()) {
  return adapter?.inbound?.foregroundInject === true;
}

// The injection entry point. Today a documented no-op: returns not-implemented so
// callers (surface-inbound, the daemon) treat it as "fell through to the pull /
// push path". When #212 lands, replace the body with the tmux send-keys logic;
// the signature + fail-open contract stay identical.
export function foregroundInject(address, messages, opts = {}) {
  void address;
  void messages;
  void opts;
  if (!canForegroundInject()) return { injected: false, reason: "disabled" };
  // TODO(#212): detect an idle foreground pane for this agent and inject a nudge
  // (tmux send-keys / equivalent). Until then, the pull surfacing + push channel
  // carry inbound, so this stays a no-op.
  return { injected: false, reason: "not-implemented" };
}
