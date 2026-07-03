// OpenAI Codex CLI adapter — the per-harness deltas for Codex. Selected at runtime
// by mcp/harness.mjs. The shared core reads only this descriptor.
import { homedir } from "node:os";
import { join } from "node:path";

export const codexAdapter = {
  provider: "codex",

  dataDirEnv: "TINYPLACE_CODEX_HOME",
  dataDirDefault: join(homedir(), ".tinyplace-codex"),
  sessionLabelPrefix: "codex",

  harness: { command: "tinyplace-codex-plugin", argv: [] },

  // Codex does not (verified codex-cli 0.142.5) guarantee a session-id env to the
  // MCP subprocess, so try the plausible vars and fall back to a caller override;
  // the server self-generates a wrapper id when empty.
  resolveHarnessSessionId() {
    return (
      process.env.CODEX_SESSION_ID?.trim() ||
      process.env.CODEX_THREAD_ID?.trim() ||
      process.env.TINYPLACE_HARNESS_SESSION_ID?.trim() ||
      ""
    );
  },

  // Codex MCP is pull-only (no server→client push). New DMs surface via the
  // SessionStart/UserPromptSubmit hook + the inbox tool; foreground tmux inject is
  // the shared fallback that wakes an idle pane in-context.
  inbound: {
    push: false,
    pull: true,
    foregroundInject: true,
  },

  responder: {
    command: "codex",
    defaultModel: "gpt-5.4-mini",
    buildArgs(prompt, model /* pluginRoot unused: MCP comes from CODEX_HOME */) {
      return ["exec", "--dangerously-bypass-approvals-and-sandbox", "--skip-git-repo-check", "-m", model, prompt];
    },
  },

  install: { kind: "codex-home" },
};
