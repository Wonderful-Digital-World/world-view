import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
  asCodexWrapperConfig,
  parseHarnessWrapperArgs,
  runHarnessCommand,
  type CodexWrapperConfig,
} from "./harness-wrapper.js";
import type { TinyPlaceCliOptions, TinyPlaceCliResult } from "./types.js";

/** Prod endpoint the SDK falls back to (mirrors `context.ts`). */
const DEFAULT_ENDPOINT = "https://api.tiny.place";

/**
 * `tinyplace codex` has two mutually-exclusive modes per invocation:
 *
 * - default (no `--agent`): the **harness wrapper** — spawn plain codex, tail
 *   `~/.codex/sessions`, one-way DM session envelopes to an owner. Observability.
 * - `--agent`: boot a first-class **agent** session via the unified tiny.place
 *   plugin launcher (`sdk/plugin-tinyplace`, `--harness codex`): the session gets
 *   its own wallet + MCP tools and can DM peers bidirectionally. (Not `--tui` —
 *   the top-level `tinyplace tui` command already means the proxy TUI.)
 *
 * They are exclusive because the plugin isolates `CODEX_HOME` (which would blind
 * the wrapper's tailer) and DMs from a different identity than the wrapper.
 */
export async function runCodexCommand(
  argv: Array<string>,
  options: TinyPlaceCliOptions = {},
): Promise<TinyPlaceCliResult> {
  if (wantsAgentMode(argv)) {
    return runCodexAgentTui(argv, options);
  }
  return runHarnessCommand("codex", argv, options);
}

export async function runClaudeCommand(
  argv: Array<string>,
  options: TinyPlaceCliOptions = {},
): Promise<TinyPlaceCliResult> {
  return runHarnessCommand("claude", argv, options);
}

export function parseCodexWrapperArgs(
  argv: Array<string>,
  env: Record<string, string | undefined> = process.env,
): CodexWrapperConfig {
  return asCodexWrapperConfig(parseHarnessWrapperArgs("codex", argv, env));
}

// ── Agent (TUI) mode ─────────────────────────────────────────────────────────

/** Args after the first `--` are forwarded verbatim; our flags live before it. */
function splitAtForward(argv: Array<string>): { pre: Array<string>; post: Array<string> } {
  const at = argv.indexOf("--");
  if (at === -1) return { pre: argv, post: [] };
  return { pre: argv.slice(0, at), post: argv.slice(at + 1) };
}

/** `--agent` before any `--` selects the plugin launcher (agent mode). */
export function wantsAgentMode(argv: Array<string>): boolean {
  return splitAtForward(argv).pre.some((a) => a === "--agent");
}

/** The published launcher package + its bin subpath, resolved when installed. */
const PLUGIN_PACKAGE = "@tinyhumansai/tinyplace-plugin";
const PLUGIN_BIN_SUBPATH = "bin/tinyplace.mjs";

/**
 * Locate the unified plugin launcher, preferring an in-repo checkout and falling
 * back to an installed `@tinyhumansai/tinyplace-plugin` dependency. Returns null
 * when neither is present (e.g. a published SDK with the plugin not installed).
 *
 * Resolution ladder:
 *   1. In-repo: `codex.js` lives at `sdk/typescript/dist/cli/`, so the launcher
 *      sits at `sdk/plugin-tinyplace/bin/tinyplace.mjs` a few levels up. This is
 *      the path used by OpenHuman's vendored/submodule build.
 *   2. Installed dependency: resolve the package's launcher bin via Node
 *      resolution (works once the plugin is published and depended on).
 */
function resolveUnifiedLauncher(): string | null {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 8; depth += 1) {
    const candidate = join(dir, "plugin-tinyplace", "bin", "tinyplace.mjs");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  try {
    return createRequire(import.meta.url).resolve(`${PLUGIN_PACKAGE}/${PLUGIN_BIN_SUBPATH}`);
  } catch {
    return null;
  }
}

function resolveBaseUrl(env: Record<string, string | undefined>): string {
  return (
    env.TINYPLACE_ENDPOINT ??
    env.TINYPLACE_API_URL ??
    env.NEXT_PUBLIC_API_URL ??
    DEFAULT_ENDPOINT
  );
}

export interface AgentInvocation {
  wallet: string | undefined;
  autorespond: boolean;
  passthrough: Array<string>;
  forwarded: Array<string>;
}

/** Strip our own flags from `pre`, keep the rest as launcher passthrough. */
export function parseAgentArgs(argv: Array<string>): AgentInvocation {
  const { pre, post } = splitAtForward(argv);
  const passthrough: Array<string> = [];
  let wallet: string | undefined;
  let autorespond = false;
  for (let i = 0; i < pre.length; i += 1) {
    const arg = pre[i];
    if (arg === "--agent" || arg === "--tui") continue;
    if (arg === "--autorespond") {
      autorespond = true;
      continue;
    }
    if (arg === "--wallet") {
      wallet = pre[i + 1];
      i += 1;
      continue;
    }
    if (arg.startsWith("--wallet=")) {
      wallet = arg.slice("--wallet=".length);
      continue;
    }
    passthrough.push(arg);
  }
  return { wallet, autorespond, passthrough, forwarded: post };
}

async function runCodexAgentTui(
  argv: Array<string>,
  options: TinyPlaceCliOptions,
): Promise<TinyPlaceCliResult> {
  const launcher = resolveUnifiedLauncher();
  if (!launcher) {
    return failure(
      `tinyplace codex --agent needs the unified plugin (${PLUGIN_PACKAGE}), which is not ` +
        "installed. Install it (npm i " +
        `${PLUGIN_PACKAGE}) and re-run, run from a tiny.place checkout, or launch the ` +
        "plugin directly: node sdk/plugin-tinyplace/bin/tinyplace.mjs --harness codex",
    );
  }
  // An installed dependency (resolved from node_modules) already has its deps;
  // only the in-repo checkout — a standalone package excluded from the workspace
  // — can be missing them, and would otherwise crash with ERR_MODULE_NOT_FOUND.
  const isInstalledDependency = launcher.includes(`${sep}node_modules${sep}`);
  const pluginDir = dirname(dirname(launcher));
  if (!isInstalledDependency && !existsSync(join(pluginDir, "node_modules"))) {
    return failure(
      `The tiny.place plugin at ${pluginDir} has no node_modules — it is a standalone ` +
        "package excluded from the workspace. Install its deps first: " +
        `(cd ${pluginDir} && pnpm install), then re-run tinyplace codex --agent.`,
    );
  }

  const { wallet, autorespond, passthrough, forwarded } = parseAgentArgs(argv);
  const launcherArgs: Array<string> = [launcher, "--harness", "codex"];
  if (wallet) launcherArgs.push("--wallet", wallet);
  const forwardTail = [...passthrough, ...forwarded];
  if (forwardTail.length > 0) launcherArgs.push("--", ...forwardTail);

  // Env: make the launched session follow the CLI's environment (prod by
  // default) instead of the plugin's hardcoded staging default, and keep the
  // auto-responder OFF unless explicitly opted in — an unattended agent that
  // LLM-answers strangers should never be implicit.
  const baseEnv = options.env ?? process.env;
  const childEnv: NodeJS.ProcessEnv = { ...baseEnv };
  if (!childEnv.TINYPLACE_API_URL) childEnv.TINYPLACE_API_URL = resolveBaseUrl(baseEnv);
  if (!autorespond && childEnv.TINYPLACE_AUTORESPOND === undefined) {
    childEnv.TINYPLACE_AUTORESPOND = "off";
  }

  const code = await spawnInteractive("node", launcherArgs, childEnv);
  return { code, stdout: "", stderr: "" };
}

function failure(message: string): TinyPlaceCliResult {
  return { code: 1, stdout: "", stderr: `${JSON.stringify({ error: message }, null, 2)}\n` };
}

/** Spawn the interactive launcher, inheriting the TTY; resolve its exit code. */
function spawnInteractive(
  command: string,
  args: Array<string>,
  env: NodeJS.ProcessEnv,
): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: "inherit", env });
    child.on("error", () => resolve(1));
    child.on("exit", (code) => resolve(code ?? 0));
  });
}
