// Shared identity (wallet) store — CLI-INDEPENDENT. An agent identity is a keypair;
// which harness (Claude / Codex) drives it is a runtime choice, so wallets live in one
// shared store (`~/.tinyplace/wallets.json`, override with TINYPLACE_HOME) rather than
// per-harness. Sessions/signal/queue/uuids stay per-harness (harnessDataDir).
//
// One-time migration: the first read folds any legacy per-harness `wallets.json`
// (~/.tinyplace-claude, ~/.tinyplace-codex) into the shared store, so existing
// identities aren't lost when this lands.
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { ADAPTERS, harnessDataDir } from "./harness.mjs";

export function sharedDir() {
  return process.env.TINYPLACE_HOME?.trim() || join(homedir(), ".tinyplace");
}
export function walletsFile() {
  return join(sharedDir(), "wallets.json");
}

function migrateLegacy() {
  const dest = walletsFile();
  if (existsSync(dest)) return; // already migrated / shared store exists
  const merged = new Map(); // name → wallet, first writer wins
  for (const adapter of Object.values(ADAPTERS)) {
    try {
      const list = JSON.parse(readFileSync(join(harnessDataDir(adapter), "wallets.json"), "utf8"))?.wallets ?? [];
      for (const w of Array.isArray(list) ? list : []) if (w?.name && !merged.has(w.name)) merged.set(w.name, w);
    } catch {
      /* no legacy store for this harness */
    }
  }
  if (!merged.size) return; // nothing to migrate — first real save creates the store
  try {
    mkdirSync(sharedDir(), { recursive: true });
    writeFileSync(dest, JSON.stringify({ wallets: [...merged.values()] }, null, 2) + "\n", { mode: 0o600 });
  } catch {
    /* best-effort — loadWallets falls back to [] */
  }
}

export function loadWallets() {
  migrateLegacy();
  try {
    const parsed = JSON.parse(readFileSync(walletsFile(), "utf8"));
    return Array.isArray(parsed?.wallets) ? parsed.wallets : [];
  } catch {
    return [];
  }
}

export function saveWallets(wallets) {
  mkdirSync(sharedDir(), { recursive: true });
  writeFileSync(walletsFile(), JSON.stringify({ wallets }, null, 2) + "\n", { mode: 0o600 });
  try {
    chmodSync(walletsFile(), 0o600);
  } catch {
    /* best-effort */
  }
}
