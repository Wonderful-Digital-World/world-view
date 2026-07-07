import blessed, { type Widgets } from "blessed";
import { spawn as spawnChild, spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
} from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { dirname, relative, resolve, join, sep } from "node:path";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import type { IPty } from "node-pty";

import { bridgeLog, createBridgeDiagSink } from "./bridge-debug.js";
import {
  HarnessSessionTailer,
  InboundMessageReceiver,
  SessionEnvelopePublisher,
  parseHarnessWrapperArgs,
} from "./harness-wrapper.js";
import type {
  CliContext,
  TinyPlaceCliOptions,
  TinyPlaceCliResult,
} from "./types.js";

export type TinyVerseAgentKind = "claude" | "codex";

type TuiView = "welcome" | "settings" | "agent";

interface TuiState {
  activeSessionId?: string;
  autoStartAvailable: boolean;
  autoStartRemainingMs?: number;
  notice?: string;
  openHumanConnected: boolean;
  // Owner entered in the TUI (overrides env); the address/@handle we bridge to.
  openHumanOwner?: string;
  openHumanSessionId?: string;
  selectedIndex: number;
  view: TuiView;
}

interface AgentLaunch {
  args: Array<string>;
  command: string;
  label: string;
}

interface AgentProfile {
  disabledPtyEnv: string;
  displayName: string;
  kind: TinyVerseAgentKind;
  launch: AgentLaunch;
  pendingSessionId: string;
  sessionPollEnv: string;
  sessionsDir: string;
}

interface AgentSessionMeta {
  cwd?: string;
  path: string;
  sessionId: string;
}

const CODEX_ACTION_INDEX = 0;
const OPENHUMAN_ACTION_INDEX = 1;
const SETTINGS_ACTION_INDEX = 2;
const QUIT_ACTION_INDEX = 3;
const requireForTui = createRequire(import.meta.url);

export async function runTinyPlaceTui(
  ctx: CliContext,
  options: TinyPlaceCliOptions,
  agentKind: TinyVerseAgentKind = "codex",
): Promise<TinyPlaceCliResult> {
  const stdin = options.stdin ?? process.stdin;
  const stdout = options.stdout ?? process.stdout;
  const profile = buildAgentProfile(ctx.env, agentKind);

  if (!isTty(stdin) || !isTty(stdout)) {
    return {
      code: 0,
      stderr: "",
      stdout: renderStaticSnapshot(ctx, profile),
    };
  }

  await runInteractiveBlessedTui(ctx, options, profile);
  return { code: 0, stderr: "", stdout: "" };
}

export function parseTinyVerseAgentKind(
  value: string | undefined,
): TinyVerseAgentKind {
  if (value === undefined || value === "" || value === "codex") {
    return "codex";
  }
  if (value === "claude") {
    return "claude";
  }
  throw new Error(
    `unknown tinyverse agent "${value}" (expected codex or claude)`,
  );
}

function runInteractiveBlessedTui(
  ctx: CliContext,
  options: TinyPlaceCliOptions,
  profile: AgentProfile,
): Promise<void> {
  return new Promise((resolve) => {
    const app = new BlessedTinyPlaceTui(ctx, options, profile, resolve);
    app.start();
  });
}

class BlessedTinyPlaceTui {
  private body!: Widgets.BoxElement;
  private agentSessionMonitor?: AgentSessionMonitor;
  private autoStartInterval: ReturnType<typeof setInterval> | undefined;
  private autoStartTimer: ReturnType<typeof setTimeout> | undefined;
  private autoStartUsed = false;
  private child?: ChildProcessWithoutNullStreams;
  private closed = false;
  private footer!: Widgets.BoxElement;
  private nativeHadRawMode: boolean | undefined;
  private nativeInputHandler?: (chunk: Buffer | string) => void;
  private nativeResizeHandler?: () => void;
  private nativeRelayActive = false;
  private pty?: IPty;
  private renderQueued = false;
  private screen!: Widgets.Screen;
  private state: TuiState = {
    activeSessionId: "none",
    autoStartAvailable: true,
    openHumanConnected: false,
    selectedIndex: CODEX_ACTION_INDEX,
    view: "welcome",
  };
  private terminal?: Widgets.TerminalElement;
  private tmuxSession?: string;
  private tmuxSocket?: string;
  // Real OpenHuman bridge (replaces the mock): publisher + outbound tailer +
  // inbound receiver, reused from the harness wrapper.
  private bridgeTailer?: HarnessSessionTailer;
  private bridgeReceiver?: InboundMessageReceiver;

  public constructor(
    private readonly ctx: CliContext,
    private readonly options: TinyPlaceCliOptions,
    private readonly profile: AgentProfile,
    private readonly resolve: () => void,
  ) {
    this.createBlessedLayout();
  }

  private createBlessedLayout(): void {
    this.screen = blessed.screen({
      fullUnicode: true,
      input: (this.options.stdin ?? process.stdin) as never,
      output: (this.options.stdout ?? process.stdout) as never,
      smartCSR: true,
      title: "tiny.place",
      warnings: false,
    });
    this.body = blessed.box({
      bottom: 1,
      height: "100%-1",
      left: 0,
      parent: this.screen,
      style: {
        bg: "black",
        fg: "white",
      },
      tags: true,
      top: 0,
      width: "100%",
    });
    this.footer = blessed.box({
      bottom: 0,
      height: 1,
      left: 0,
      parent: this.screen,
      style: {
        bg: "black",
        fg: "gray",
      },
      tags: true,
      width: "100%",
    });
    this.screen.on("resize", () => {
      this.resizeAgentPty();
      this.queueScreenRender();
    });
  }

  private destroyBlessedLayout(): void {
    this.terminal = undefined;
    this.body.destroy();
    this.footer.destroy();
    this.screen.destroy();
  }

  public start(): void {
    this.registerKeys();
    this.render();
    this.scheduleAutoStart();
  }

  private registerKeys(): void {
    this.screen.key(["C-c"], () => {
      if (this.state.view === "agent") {
        return;
      }
      this.close();
    });
    this.screen.key(["escape", "q"], () => {
      if (this.state.view === "agent") {
        return;
      }
      if (this.state.view === "settings") {
        this.state = {
          ...this.state,
          autoStartRemainingMs: undefined,
          notice: "Returned to welcome.",
          view: "welcome",
        };
        this.scheduleAutoStart();
        this.render();
        return;
      }
      this.close();
    });
    this.screen.key(["up", "k"], () => {
      this.moveSelection(-1);
    });
    this.screen.key(["down", "j"], () => {
      this.moveSelection(1);
    });
    this.screen.key(["c", "n"], () => {
      if (this.state.view === "agent") {
        return;
      }
      void this.startAgent();
    });
    this.screen.key(["s"], () => {
      if (this.state.view !== "welcome") {
        return;
      }
      this.openSettings();
    });
    this.screen.key(["o"], () => {
      if (this.state.view !== "welcome") {
        return;
      }
      this.connectOpenHuman();
    });
    this.screen.key(["x"], () => {
      if (this.state.view !== "welcome") {
        return;
      }
      void this.startAgent();
    });
    this.screen.key(["enter"], () => {
      this.activateSelection();
    });
  }

  private moveSelection(delta: number): void {
    if (this.state.view !== "welcome") {
      return;
    }
    this.clearAutoStart();
    this.state = {
      ...this.state,
      notice: undefined,
      selectedIndex: clamp(
        this.state.selectedIndex + delta,
        0,
        QUIT_ACTION_INDEX,
      ),
    };
    this.render();
  }

  private activateSelection(): void {
    if (this.state.view === "agent") {
      return;
    }
    if (this.state.view === "settings") {
      this.state = {
        ...this.state,
        autoStartRemainingMs: undefined,
        notice: "Returned to welcome.",
        view: "welcome",
      };
      this.scheduleAutoStart();
      this.render();
      return;
    }
    if (this.state.selectedIndex === CODEX_ACTION_INDEX) {
      void this.startAgent();
      return;
    }
    if (this.state.selectedIndex === OPENHUMAN_ACTION_INDEX) {
      this.connectOpenHuman();
      return;
    }
    if (this.state.selectedIndex === SETTINGS_ACTION_INDEX) {
      this.openSettings();
      return;
    }
    this.close();
  }

  private openSettings(): void {
    this.clearAutoStart();
    this.state = {
      ...this.state,
      notice: undefined,
      view: "settings",
    };
    this.render();
  }

  /** The owner we bridge to: entered in the TUI (overrides) else from env. */
  private resolveOwner(): string | undefined {
    return this.state.openHumanOwner ?? bridgeOwner(this.ctx.env);
  }

  /** Prompt for the OpenHuman owner (@handle or address), store it, and — if the
   *  agent is already running — (re)start the bridge with it. */
  private connectOpenHuman(): void {
    this.clearAutoStart();
    const current = this.resolveOwner() ?? "";
    // Wrap the prompt + a hint line in a centered container so the hint (and the
    // long "@handle or address / Enter / Esc" guidance) sits *outside* the input
    // box instead of stuffed into the border label, where it overflows and
    // corrupts the border on narrow terminals.
    const modal = blessed.box({
      parent: this.screen,
      top: "center",
      left: "center",
      width: "80%",
      height: 5,
      style: { bg: "black" },
      tags: true,
    });
    const input = blessed.textbox({
      parent: modal,
      top: 0,
      left: 0,
      width: "100%",
      height: 3,
      border: { type: "line" },
      inputOnFocus: true,
      keys: true,
      // Deliberately NOT `mouse: true`: enabling mouse on any Blessed element
      // flips the terminal into SGR mouse-capture mode (program.enableMouse()),
      // which Blessed never turns back off when this modal closes. That kills
      // the terminal's native text selection / copy for the rest of the session.
      // The prompt is fully keyboard-driven (type · Enter · Esc), so mouse
      // capture buys nothing and costs the user their selection.
      label: " OpenHuman owner ",
      style: { fg: "white", bg: "black", border: { fg: "cyan" } },
      tags: true,
    });
    blessed.text({
      parent: modal,
      top: 3,
      left: 1,
      height: 1,
      width: "100%-2",
      content: "@handle or address · Enter to save · Esc to cancel",
      style: { fg: "gray", bg: "black" },
      tags: true,
    });
    input.setValue(current);
    input.focus();
    this.screen.render();

    let settled = false;
    const done = (value: string | undefined): void => {
      if (settled) {
        return;
      }
      settled = true;
      modal.destroy();
      const owner = value?.trim();
      if (owner) {
        this.state = {
          ...this.state,
          notice:
            this.state.view === "agent"
              ? `OpenHuman owner set to ${owner}; reconnecting bridge.`
              : `OpenHuman owner set to ${owner}. Launch ${this.profile.displayName} to connect.`,
          openHumanConnected: true,
          openHumanOwner: owner,
          openHumanSessionId: owner,
        };
        // If a session is live, restart the bridge so the new owner takes effect.
        if (this.state.view === "agent") {
          this.stopBridge();
          this.startBridge();
        }
      } else {
        this.state = { ...this.state, notice: "OpenHuman owner unchanged." };
      }
      this.render();
    };
    // `inputOnFocus` makes the textbox call `readInput(null)` on focus, so a
    // second `readInput(callback)` here would be dropped (`_reading` already
    // set) and Enter would never resolve — the box would hang on screen. Wire
    // the outcome through the textbox's own submit/cancel events instead.
    input.on("submit", (value: unknown) =>
      done(typeof value === "string" ? value : input.getValue()),
    );
    input.on("cancel", () => done(undefined));
    input.key(["escape"], () => done(undefined));
  }

  /** Start the real bidirectional OpenHuman bridge alongside the agent: publish
   *  keys, stream the agent's turns out (tailer), and inject inbound DMs into the
   *  live agent (receiver → writeAgentInput). No-op without a configured owner. */
  private startBridge(): void {
    if (this.bridgeTailer || this.bridgeReceiver) {
      return;
    }
    const owner = this.resolveOwner();
    if (!owner) {
      return;
    }
    const config = parseHarnessWrapperArgs(this.profile.kind, [], this.ctx.env);
    // A TUI-entered owner overrides env: bridge both directions to it.
    config.dmRecipient = owner;
    config.receiveFrom = owner;
    config.receiveEnabled = true;
    const cwd = this.options.cwd ?? process.cwd();
    bridgeLog("bridge.start", {
      owner,
      provider: config.provider,
      cwd,
      captureSession: config.captureSession,
      receiveEnabled: config.receiveEnabled,
      dmRecipient: config.dmRecipient,
      receiveFrom: config.receiveFrom,
      sessionsDir: this.profile.sessionsDir,
      dryRun: config.dryRun,
    });
    // Diagnostics from the bridge would corrupt the Blessed screen if written to
    // the real stderr, so they go to a discarding sink — but when
    // TINYPLACE_BRIDGE_LOG is set, `createBridgeDiagSink` tees them into the log
    // file instead so bridge failures are visible while debugging.
    const sink = createBridgeDiagSink();
    const publisher = new SessionEnvelopePublisher(config, this.options, sink);
    this.bridgeTailer = config.captureSession
      ? new HarnessSessionTailer(config, cwd, sink, publisher)
      : undefined;
    this.bridgeReceiver = config.receiveEnabled
      ? new InboundMessageReceiver(config, publisher, sink)
      : undefined;
    this.bridgeReceiver?.setSink((text) => {
      bridgeLog("inbound.inject", { chars: text.length });
      this.writeAgentInput(Buffer.from(text, "utf8"));
    });
    this.bridgeTailer?.start(new Date());
    void this.bridgeReceiver?.start();
    this.state = {
      ...this.state,
      openHumanConnected: true,
      openHumanSessionId: owner,
    };
    if (!this.nativeRelayActive) {
      this.renderFooter();
      this.queueScreenRender();
    }
  }

  private stopBridge(): void {
    void this.bridgeTailer?.stop();
    void this.bridgeReceiver?.stop();
    this.bridgeTailer = undefined;
    this.bridgeReceiver = undefined;
  }

  private async startAgent(): Promise<void> {
    this.clearAutoStart();
    if (this.child || this.pty) {
      return;
    }
    const { launch } = this.profile;
    this.state = {
      ...this.state,
      autoStartRemainingMs: undefined,
      activeSessionId: this.profile.pendingSessionId,
      notice: undefined,
      view: "agent",
    };
    this.agentSessionMonitor = new AgentSessionMonitor(
      this.ctx,
      this.options,
      this.profile,
      (meta) => {
        this.state = {
          ...this.state,
          activeSessionId: meta.sessionId,
        };
        if (this.nativeRelayActive) {
          this.updateNativeTerminalTitle();
        } else {
          this.renderFooter();
          this.queueScreenRender();
        }
      },
    );
    this.agentSessionMonitor.start(new Date());
    // Start the real OpenHuman bridge; the receiver's sink reads this.pty/this.child
    // lazily, so starting before spawn is safe (first inbound poll is ~1.5s out).
    this.startBridge();
    this.renderFooter();
    this.screen.render();
    this.clearBody();
    if (this.usesNativeRelay() && (await this.startNativeRelay(launch))) {
      return;
    }
    this.terminal = blessed.terminal({
      cursor: "block",
      handler: (input) => {
        this.writeAgentInput(input);
      },
      height: "100%",
      left: 0,
      parent: this.body,
      screenKeys: true,
      style: {
        bg: "black",
        fg: "white",
      },
      top: 0,
      width: "100%",
    });
    this.terminal.focus();
    this.terminal.write(`Starting ${launch.label}...\r\n`);
    this.renderFooter();
    this.screen.render();

    if (this.ctx.env[this.profile.disabledPtyEnv] !== "1") {
      try {
        fixNodePtyHelperPermissions();
        const { spawn } = await import("node-pty");
        const pty = spawn(launch.command, launch.args, {
          cols: terminalColumns(this.options),
          cwd: this.options.cwd ?? process.cwd(),
          env: childEnv(this.ctx.env),
          name: terminalName(this.ctx.env),
          rows: terminalRows(this.options),
        });
        this.pty = pty;
        pty.onData((chunk) => {
          this.writeAgentOutput(chunk);
        });
        pty.onExit(({ exitCode, signal }) => {
          const detail = signal ? `signal ${signal}` : `exit code ${exitCode}`;
          this.finishAgent(
            `${this.profile.displayName} exited with ${detail}.`,
          );
        });
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.terminal?.write(
          `node-pty unavailable: ${message}\r\nFalling back to pipe mode.\r\n`,
        );
        this.screen.render();
      }
    }

    const spawnFn = this.options.spawn ?? spawnChild;
    const child = spawnFn(launch.command, launch.args, {
      cwd: this.options.cwd ?? process.cwd(),
      env: childEnv(this.ctx.env),
    });
    this.child = child;
    child.stdin.on("error", () => {});
    child.stdout.on("data", (chunk: Buffer | string) => {
      this.writeAgentOutput(chunk);
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      this.writeAgentOutput(chunk);
    });
    child.on("error", (error) => {
      this.finishAgent(
        `${this.profile.displayName} failed to start: ${error.message}`,
      );
    });
    child.on("exit", (code, signal) => {
      const detail = signal ? `signal ${signal}` : `exit code ${code ?? 0}`;
      this.finishAgent(`${this.profile.displayName} exited with ${detail}.`);
    });
  }

  private writeAgentInput(input: Buffer): void {
    if (this.pty) {
      this.pty.write(input.toString("utf8"));
      return;
    }
    this.child?.stdin.write(input);
  }

  private writeAgentOutput(chunk: Buffer | string): void {
    if (this.state.view !== "agent") {
      return;
    }
    if (this.nativeRelayActive) {
      const stdout = this.options.stdout ?? process.stdout;
      stdout.write(Buffer.isBuffer(chunk) ? chunk.toString("utf8") : chunk);
      return;
    }
    this.terminal?.write(
      Buffer.isBuffer(chunk) ? chunk.toString("utf8") : chunk,
    );
    this.queueScreenRender();
  }

  private async startNativeRelay(launch: AgentLaunch): Promise<boolean> {
    if (this.ctx.env[this.profile.disabledPtyEnv] === "1") {
      return false;
    }
    const socket = `tinyverse-${process.pid}-${Date.now()}`;
    const session = `tinyverse-${process.pid}`;
    if (!this.createTmuxSession(socket, session, launch)) {
      return false;
    }
    let spawn: typeof import("node-pty").spawn;
    try {
      fixNodePtyHelperPermissions();
      ({ spawn } = await import("node-pty"));
    } catch {
      this.killTmuxSession(socket, session);
      return false;
    }
    this.destroyBlessedLayout();
    try {
      this.tmuxSocket = socket;
      this.tmuxSession = session;
      this.updateNativeTerminalTitle();
      const pty = spawn(
        "tmux",
        ["-L", socket, "attach-session", "-t", session],
        {
          cols: terminalColumns(this.options),
          cwd: this.options.cwd ?? process.cwd(),
          env: tmuxEnv(this.ctx.env),
          name: terminalName(this.ctx.env),
          rows: terminalPhysicalRows(this.options),
        },
      );
      this.pty = pty;
      this.nativeRelayActive = true;
      this.nativeInputHandler = (chunk) => {
        pty.write(Buffer.isBuffer(chunk) ? chunk.toString("utf8") : chunk);
      };
      const stdin = this.options.stdin ?? process.stdin;
      this.nativeHadRawMode = (stdin as { isRaw?: boolean }).isRaw ?? false;
      (stdin as { setRawMode?: (mode: boolean) => void }).setRawMode?.(true);
      stdin.on("data", this.nativeInputHandler);
      stdin.resume();
      this.nativeResizeHandler = () => {
        this.resizeAgentPty();
      };
      addResizeListener(
        this.options.stdout ?? process.stdout,
        this.nativeResizeHandler,
      );
      process.on("SIGWINCH", this.nativeResizeHandler);
      pty.onData((chunk) => {
        this.writeAgentOutput(chunk);
      });
      pty.onExit(({ exitCode, signal }) => {
        const detail = signal ? `signal ${signal}` : `exit code ${exitCode}`;
        this.finishAgent(`${this.profile.displayName} exited with ${detail}.`);
      });
      return true;
    } catch {
      this.nativeRelayActive = false;
      this.cleanupNativeRelay();
      this.killTmuxSession(socket, session);
      this.createBlessedLayout();
      this.registerKeys();
      this.render();
      return false;
    }
  }

  private usesNativeRelay(): boolean {
    const mode =
      this.ctx.env.TINYVERSE_CLAUDE_TERMINAL_MODE ??
      this.ctx.env.TINYPLACE_CLAUDE_TERMINAL_MODE;
    return this.profile.kind === "claude" && mode !== "blessed";
  }

  private updateNativeTerminalTitle(): void {
    if (!this.tmuxSocket || !this.tmuxSession) {
      return;
    }
    const activeSession = this.state.activeSessionId ?? "none";
    runTmuxCommand(
      this.tmuxSocket,
      [
        "set-option",
        "-t",
        this.tmuxSession,
        "status-left",
        tmuxFooterContent(this.ctx, activeSession),
      ],
      this.ctx.env,
      this.options.cwd,
    );
  }

  private cleanupNativeRelay(): void {
    const stdin = this.options.stdin ?? process.stdin;
    if (this.nativeInputHandler) {
      stdin.off("data", this.nativeInputHandler);
      this.nativeInputHandler = undefined;
    }
    if (this.nativeResizeHandler) {
      removeResizeListener(
        this.options.stdout ?? process.stdout,
        this.nativeResizeHandler,
      );
      process.off("SIGWINCH", this.nativeResizeHandler);
      this.nativeResizeHandler = undefined;
    }
    if (this.nativeHadRawMode !== undefined) {
      (stdin as { setRawMode?: (mode: boolean) => void }).setRawMode?.(
        this.nativeHadRawMode,
      );
      this.nativeHadRawMode = undefined;
    }
    this.nativeRelayActive = false;
    if (this.tmuxSocket && this.tmuxSession) {
      this.killTmuxSession(this.tmuxSocket, this.tmuxSession);
      this.tmuxSocket = undefined;
      this.tmuxSession = undefined;
    }
  }

  private createTmuxSession(
    socket: string,
    session: string,
    launch: AgentLaunch,
  ): boolean {
    const command = shellCommandFor(launch);
    const cwd = this.options.cwd ?? process.cwd();
    if (
      !runTmuxCommand(
        socket,
        ["new-session", "-d", "-s", session, "-c", cwd, command],
        this.ctx.env,
        cwd,
      )
    ) {
      return false;
    }
    for (const args of [
      ["set-option", "-t", session, "status", "on"],
      ["set-option", "-t", session, "status-position", "bottom"],
      ["set-option", "-t", session, "status-left-length", "200"],
      ["set-option", "-t", session, "status-right", ""],
      ["set-option", "-t", session, "status-style", "bg=black,fg=white"],
      ["set-window-option", "-t", session, "window-status-format", ""],
      ["set-window-option", "-t", session, "window-status-current-format", ""],
      [
        "set-option",
        "-t",
        session,
        "status-left",
        tmuxFooterContent(this.ctx, this.state.activeSessionId ?? "none"),
      ],
    ]) {
      if (!runTmuxCommand(socket, args, this.ctx.env, cwd)) {
        this.killTmuxSession(socket, session);
        return false;
      }
    }
    return true;
  }

  private killTmuxSession(socket: string, session: string): void {
    runTmuxCommand(
      socket,
      ["kill-session", "-t", session],
      this.ctx.env,
      this.options.cwd,
    );
  }

  private queueScreenRender(): void {
    if (this.closed || this.renderQueued) {
      return;
    }
    this.renderQueued = true;
    setTimeout(() => {
      this.renderQueued = false;
      if (!this.closed) {
        this.screen.render();
      }
    }, 16);
  }

  private resizeAgentPty(): void {
    if (!this.pty) {
      return;
    }
    this.pty.resize(
      terminalColumns(this.options),
      this.nativeRelayActive
        ? terminalPhysicalRows(this.options)
        : terminalRows(this.options),
    );
  }

  private finishAgent(notice: string): void {
    void notice;
    this.closed = true;
    this.clearAutoStart();
    this.child = undefined;
    this.agentSessionMonitor?.stop();
    this.agentSessionMonitor = undefined;
    this.stopBridge();
    this.cleanupNativeRelay();
    this.pty = undefined;
    this.terminal?.destroy();
    this.terminal = undefined;
    this.destroyScreenSafely();
    this.resolve();
  }

  private render(): void {
    this.clearBody();
    if (this.state.view === "settings") {
      this.body.setContent(renderSettingsContent(this.ctx, this.profile));
    } else {
      this.body.setContent(
        renderWelcomeContent(this.ctx, this.profile, this.state),
      );
    }
    this.renderFooter();
    this.screen.render();
  }

  private renderFooter(): void {
    const activeSession = this.state.activeSessionId ?? "none";
    const connected = Boolean(this.ctx.baseUrl);
    const status = connected
      ? "{green-fg}Connected to tiny.place{/green-fg}"
      : "{red-fg}Disconnected{/red-fg}";
    const openHuman = this.state.openHumanConnected
      ? `{green-fg}OpenHuman ${blessed.escape(this.state.openHumanSessionId ?? "")}{/green-fg}`
      : "{gray-fg}OpenHuman off{/gray-fg}";
    this.footer.setContent(
      ` ${status} {gray-fg}-{/gray-fg} ${openHuman} {gray-fg}- Chat id:{/gray-fg} {yellow-fg}${blessed.escape(activeSession)}{/yellow-fg}`,
    );
  }

  private clearBody(): void {
    for (const child of [...this.body.children]) {
      child.destroy();
    }
    this.body.setContent("");
  }

  private close(): void {
    this.closed = true;
    this.clearAutoStart();
    if (this.child) {
      this.child.kill();
      this.child = undefined;
    }
    this.stopBridge();
    this.cleanupNativeRelay();
    this.agentSessionMonitor?.stop();
    this.agentSessionMonitor = undefined;
    if (this.pty) {
      this.pty.kill();
      this.pty = undefined;
    }
    this.destroyScreenSafely();
    this.resolve();
  }

  private destroyScreenSafely(): void {
    try {
      this.screen.destroy();
    } catch {
      // The Claude/tmux path destroys Blessed before attaching the inner TUI.
    }
  }

  private scheduleAutoStart(): void {
    this.clearAutoStart();
    if (this.autoStartUsed) {
      return;
    }
    if (
      this.state.view !== "welcome" ||
      this.state.selectedIndex !== CODEX_ACTION_INDEX
    ) {
      return;
    }
    const timeoutMs = autoStartMs(this.ctx.env);
    if (timeoutMs <= 0) {
      return;
    }
    this.autoStartUsed = true;
    const deadline = Date.now() + timeoutMs;
    this.state = {
      ...this.state,
      autoStartAvailable: false,
      autoStartRemainingMs: timeoutMs,
    };
    this.render();
    this.autoStartInterval = setInterval(() => {
      const remainingMs = Math.max(0, deadline - Date.now());
      this.state = {
        ...this.state,
        autoStartRemainingMs: remainingMs,
      };
      if (this.state.view === "welcome") {
        this.render();
      }
    }, 100);
    this.autoStartTimer = setTimeout(() => {
      void this.startAgent();
    }, timeoutMs);
  }

  private clearAutoStart(): void {
    if (this.autoStartTimer) {
      clearTimeout(this.autoStartTimer);
      this.autoStartTimer = undefined;
    }
    if (this.autoStartInterval) {
      clearInterval(this.autoStartInterval);
      this.autoStartInterval = undefined;
    }
    this.state = {
      ...this.state,
      autoStartRemainingMs: undefined,
    };
  }
}

class AgentSessionMonitor {
  private readonly baselineMtimes: Map<string, number>;
  private lastSessionId: string | undefined;
  private startedAt: Date | undefined;
  private timer: ReturnType<typeof setInterval> | undefined;

  public constructor(
    private readonly ctx: CliContext,
    private readonly options: TinyPlaceCliOptions,
    private readonly profile: AgentProfile,
    private readonly onSession: (meta: AgentSessionMeta) => void,
  ) {
    this.baselineMtimes = baselineSessionMtimes(profile);
  }

  public start(startedAt: Date): void {
    this.startedAt = startedAt;
    this.poll(startedAt);
    const pollMs = Number(this.ctx.env[this.profile.sessionPollEnv] ?? 500);
    this.timer = setInterval(
      () => {
        this.poll(startedAt);
      },
      Number.isFinite(pollMs) && pollMs > 0 ? pollMs : 500,
    );
  }

  public stop(): void {
    if (this.startedAt) {
      this.poll(this.startedAt);
    }
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  private poll(startedAt: Date): void {
    const meta = locateCodexSession(
      this.profile,
      this.options.cwd ?? process.cwd(),
      this.baselineMtimes,
      startedAt,
    );
    if (!meta || meta.sessionId === this.lastSessionId) {
      return;
    }
    this.lastSessionId = meta.sessionId;
    this.onSession(meta);
  }
}

function renderWelcomeContent(
  ctx: CliContext,
  profile: AgentProfile,
  state: Readonly<TuiState>,
): string {
  const timeoutMs = autoStartMs(ctx.env);
  const launchLabel =
    state.autoStartRemainingMs !== undefined
      ? `[ Launch ${profile.displayName} automatically in ${formatDuration(state.autoStartRemainingMs)} ]`
      : state.autoStartAvailable && timeoutMs > 0
        ? `[ Launch ${profile.displayName} automatically in ${formatDuration(timeoutMs)} ]`
        : `[ Launch ${profile.displayName} ]`;
  const lines = [
    "{bold}welcome to tiny.place{/bold}",
    `{gray-fg}${profile.displayName} runs inside this shell while tiny.place tracks the active ${profile.displayName} session.{/gray-fg}`,
    "",
    renderKeyValue("tiny.place", ctx.baseUrl, "{cyan-fg}"),
    renderKeyValue("wallet", walletIdFor(ctx), "{yellow-fg}"),
    renderKeyValue(profile.kind, profile.launch.label, "{green-fg}"),
    renderKeyValue("sessions", profile.sessionsDir, "{cyan-fg}"),
    state.openHumanConnected
      ? renderKeyValue(
          "OpenHuman",
          `connected to ${state.openHumanSessionId ?? "openhuman:mock"}`,
          "{green-fg}",
        )
      : renderKeyValue("OpenHuman", "disconnected", "{gray-fg}"),
    "",
    renderActionRow(
      state.selectedIndex === CODEX_ACTION_INDEX,
      launchLabel,
      "{green-fg}",
    ),
    renderActionRow(
      state.selectedIndex === OPENHUMAN_ACTION_INDEX,
      state.openHumanConnected
        ? "[ Connect with OpenHuman ] connected"
        : "[ Connect with OpenHuman ]",
      state.openHumanConnected ? "{green-fg}" : "{cyan-fg}",
    ),
    renderActionRow(
      state.selectedIndex === SETTINGS_ACTION_INDEX,
      "[ Settings ]",
      "{cyan-fg}",
    ),
    renderActionRow(
      state.selectedIndex === QUIT_ACTION_INDEX,
      "[ Quit ]",
      "{gray-fg}",
    ),
    "",
    state.notice
      ? `{yellow-fg}${state.notice}{/yellow-fg}`
      : "{gray-fg}Enter launches the selected action. Move selection to cancel auto-launch. q quits.{/gray-fg}",
  ];
  return `${lines.join("\n")}\n`;
}

function renderActionRow(
  selected: boolean,
  label: string,
  colorTag: string,
): string {
  const row = `${selected ? ">" : " "} ${label}`;
  if (selected) {
    return `{inverse}${row}{/inverse}`;
  }
  return `${colorTag}${row}{/${colorTag.slice(1)}`;
}

function renderKeyValue(
  label: string,
  value: string,
  colorTag: string,
): string {
  return `{gray-fg}${label}:{/gray-fg} ${colorTag}${value}{/${colorTag.slice(1)}`;
}

function renderSettingsContent(ctx: CliContext, profile: AgentProfile): string {
  return [
    "{bold}tiny.place settings{/bold}",
    `{gray-fg}These are the runtime settings used by the ${profile.displayName} proxy.{/gray-fg}`,
    "",
    `endpoint: ${ctx.baseUrl}`,
    `wallet: ${walletIdFor(ctx)}`,
    `agent: ${profile.displayName}`,
    `${profile.kind} command: ${profile.launch.label}`,
    `${profile.kind} sessions dir: ${profile.sessionsDir}`,
    "openhuman: mock tiny.place session",
    `auto-launch: ${autoStartMs(ctx.env) > 0 ? formatDuration(autoStartMs(ctx.env)) : "disabled"}`,
    `node-pty: ${ctx.env[profile.disabledPtyEnv] === "1" ? "disabled" : "enabled"}`,
    "",
    `{gray-fg}Environment overrides: ${profileOverrideNames(profile).join(", ")}, TINYPLACE_TUI_AUTOSTART_MS.{/gray-fg}`,
    "",
    "{gray-fg}Press Enter or Esc to return. Press q to quit from the welcome screen.{/gray-fg}",
  ].join("\n");
}

function buildAgentProfile(
  env: Record<string, string | undefined>,
  kind: TinyVerseAgentKind,
): AgentProfile {
  if (kind === "claude") {
    const command =
      firstEnv(env, ["TINYVERSE_CLAUDE_BIN", "TINYPLACE_CLAUDE_BIN"]) ??
      "claude";
    const args = splitShellWords(
      firstEnv(env, ["TINYVERSE_CLAUDE_ARGS", "TINYPLACE_CLAUDE_ARGS"]) ?? "",
    );
    return {
      disabledPtyEnv: "TINYPLACE_CLAUDE_NO_PTY",
      displayName: "Claude",
      kind,
      launch: buildLaunch(command, args),
      pendingSessionId: "claude:pending",
      sessionPollEnv: "TINYPLACE_CLAUDE_SESSION_POLL_MS",
      sessionsDir:
        firstEnv(env, [
          "TINYVERSE_CLAUDE_SESSIONS_DIR",
          "TINYPLACE_CLAUDE_SESSIONS_DIR",
        ]) ?? join(homedir(), ".claude", "projects"),
    };
  }
  const command = env.TINYPLACE_CODEX_BIN ?? "codex";
  const args = splitShellWords(env.TINYPLACE_CODEX_ARGS ?? "");
  return {
    disabledPtyEnv: "TINYPLACE_CODEX_NO_PTY",
    displayName: "Codex",
    kind,
    launch: buildLaunch(command, args),
    pendingSessionId: "codex:pending",
    sessionPollEnv: "TINYPLACE_CODEX_SESSION_POLL_MS",
    sessionsDir:
      env.TINYPLACE_CODEX_SESSIONS_DIR ?? join(homedir(), ".codex", "sessions"),
  };
}

function buildLaunch(command: string, args: Array<string>): AgentLaunch {
  return {
    args,
    command,
    label: `${command}${args.length > 0 ? ` ${args.join(" ")}` : ""}`,
  };
}

function firstEnv(
  env: Record<string, string | undefined>,
  names: Array<string>,
): string | undefined {
  return names
    .map((name) => env[name])
    .find((value) => value !== undefined && value !== "");
}

function profileOverrideNames(profile: AgentProfile): Array<string> {
  if (profile.kind === "claude") {
    return [
      "TINYPLACE_CLAUDE_BIN",
      "TINYPLACE_CLAUDE_ARGS",
      "TINYPLACE_CLAUDE_SESSIONS_DIR",
    ];
  }
  return [
    "TINYPLACE_CODEX_BIN",
    "TINYPLACE_CODEX_ARGS",
    "TINYPLACE_CODEX_SESSIONS_DIR",
  ];
}

function childEnv(
  env: Record<string, string | undefined>,
): Record<string, string> {
  const merged: Record<string, string | undefined> = {
    ...process.env,
    ...env,
    TERM: terminalName(env),
  };
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(merged)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}

function terminalName(env: Record<string, string | undefined>): string {
  const value = env.TERM ?? process.env.TERM;
  return value && value !== "dumb" ? value : "xterm-256color";
}

function tmuxEnv(
  env: Record<string, string | undefined>,
): Record<string, string> {
  const result = childEnv(env);
  delete result.TMUX;
  return result;
}

function runTmuxCommand(
  socket: string,
  args: Array<string>,
  env: Record<string, string | undefined>,
  cwd: string | undefined,
): boolean {
  const result = spawnSync("tmux", ["-L", socket, ...args], {
    cwd: cwd ?? process.cwd(),
    env: tmuxEnv(env),
    stdio: "ignore",
  });
  return result.status === 0;
}

function shellCommandFor(launch: AgentLaunch): string {
  return [launch.command, ...launch.args]
    .map((part) => shellQuote(part))
    .join(" ");
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function tmuxFooterContent(ctx: CliContext, activeSession: string): string {
  const status = ctx.baseUrl
    ? "#[fg=green]Connected to tiny.place#[default]"
    : "#[fg=red]Disconnected#[default]";
  return `${status} - Chat id: #[fg=yellow]${tmuxEscape(activeSession)}#[default]`;
}

function tmuxEscape(value: string): string {
  return value.replace(/#/g, "##");
}

function locateCodexSession(
  profile: AgentProfile,
  cwd: string,
  baselineMtimes: ReadonlyMap<string, number>,
  startedAt: Date,
): AgentSessionMeta | undefined {
  const candidates = listAgentSessionFiles(profile)
    .filter((path) => {
      try {
        const mtimeMs = statSync(path).mtimeMs;
        return (
          mtimeMs >= startedAt.getTime() - 2_000 ||
          mtimeMs > (baselineMtimes.get(path) ?? 0)
        );
      } catch {
        return false;
      }
    })
    .map((path) => readAgentSessionMeta(profile, path))
    .filter((meta): meta is AgentSessionMeta => meta !== undefined)
    .sort(
      (left, right) =>
        statSync(right.path).mtimeMs - statSync(left.path).mtimeMs,
    );
  return (
    candidates.find((meta) => meta.cwd === cwd) ??
    candidates.find(
      (meta) => meta.cwd !== undefined && relatedCwd(meta.cwd, cwd),
    ) ??
    (Date.now() - startedAt.getTime() > 2_000 ? candidates[0] : undefined)
  );
}

function baselineSessionMtimes(profile: AgentProfile): Map<string, number> {
  const baseline = new Map<string, number>();
  for (const path of listAgentSessionFiles(profile)) {
    try {
      baseline.set(path, statSync(path).mtimeMs);
    } catch {
      continue;
    }
  }
  return baseline;
}

function listAgentSessionFiles(profile: AgentProfile): Array<string> {
  if (!existsSync(profile.sessionsDir)) {
    return [];
  }
  const out: Array<string> = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(path);
      } else if (
        entry.isFile() &&
        isAgentSessionFile(profile, path, entry.name)
      ) {
        out.push(path);
      }
    }
  };
  visit(profile.sessionsDir);
  return out;
}

function isAgentSessionFile(
  profile: AgentProfile,
  path: string,
  name: string,
): boolean {
  if (profile.kind === "codex") {
    return name.startsWith("rollout-") && name.endsWith(".jsonl");
  }
  return name.endsWith(".jsonl") && !path.includes(`${sep}subagents${sep}`);
}

function readAgentSessionMeta(
  profile: AgentProfile,
  path: string,
): AgentSessionMeta | undefined {
  return profile.kind === "claude"
    ? readClaudeSessionMeta(path)
    : readCodexSessionMeta(path);
}

function readCodexSessionMeta(path: string): AgentSessionMeta | undefined {
  let latest: AgentSessionMeta | undefined;
  for (const raw of readAllLines(path)) {
    const record = parseJsonObject(raw);
    if (record?.type !== "session_meta") {
      continue;
    }
    const payload = asObject(record.payload);
    if (!payload) {
      continue;
    }
    const sessionId = asString(payload.id) ?? asString(payload.session_id);
    if (!sessionId) {
      continue;
    }
    latest = {
      ...(asString(payload.cwd) ? { cwd: asString(payload.cwd) } : {}),
      path,
      sessionId,
    };
  }
  return latest;
}

function readClaudeSessionMeta(path: string): AgentSessionMeta | undefined {
  let latestCwd: string | undefined;
  let latestSessionId: string | undefined;
  for (const raw of readAllLines(path)) {
    const record = parseJsonObject(raw);
    if (!record) {
      continue;
    }
    latestCwd = asString(record.cwd) ?? latestCwd;
    latestSessionId = asString(record.sessionId) ?? latestSessionId;
  }
  if (!latestSessionId) {
    return undefined;
  }
  return {
    ...(latestCwd ? { cwd: latestCwd } : {}),
    path,
    sessionId: latestSessionId,
  };
}

function relatedCwd(left: string, right: string): boolean {
  const resolvedLeft = resolve(left);
  const resolvedRight = resolve(right);
  const leftToRight = relative(resolvedLeft, resolvedRight);
  const rightToLeft = relative(resolvedRight, resolvedLeft);
  return isRelativeDescendant(leftToRight) || isRelativeDescendant(rightToLeft);
}

function isRelativeDescendant(value: string): boolean {
  return (
    value.length === 0 || (!value.startsWith("..") && !value.startsWith("/"))
  );
}

function readAllLines(path: string): Array<string> {
  try {
    return readFileSync(path, "utf8")
      .split(/\r?\n/)
      .filter((line) => line.length > 0);
  } catch {
    return [];
  }
}

function parseJsonObject(raw: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return asObject(parsed);
  } catch {
    return undefined;
  }
}

function asObject(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function fixNodePtyHelperPermissions(): void {
  let packageDir: string;
  try {
    packageDir = dirname(requireForTui.resolve("node-pty/package.json"));
  } catch {
    return;
  }
  for (const helperPath of [
    join(packageDir, "build", "Release", "spawn-helper"),
    join(
      packageDir,
      "prebuilds",
      `${process.platform}-${process.arch}`,
      "spawn-helper",
    ),
  ]) {
    if (!existsSync(helperPath)) {
      continue;
    }
    chmodSync(helperPath, 0o755);
  }
}

function terminalColumns(options: TinyPlaceCliOptions): number {
  const columns =
    (options.stdout as { columns?: number } | undefined)?.columns ??
    process.stdout.columns ??
    80;
  return Math.max(20, columns);
}

function terminalRows(options: TinyPlaceCliOptions): number {
  return Math.max(4, terminalPhysicalRows(options) - 1);
}

function terminalPhysicalRows(options: TinyPlaceCliOptions): number {
  const rows =
    (options.stdout as { rows?: number } | undefined)?.rows ??
    process.stdout.rows ??
    24;
  return Math.max(5, rows);
}

function addResizeListener(stream: unknown, handler: () => void): void {
  (stream as { on?: (event: "resize", listener: () => void) => void }).on?.(
    "resize",
    handler,
  );
}

function removeResizeListener(stream: unknown, handler: () => void): void {
  (stream as { off?: (event: "resize", listener: () => void) => void }).off?.(
    "resize",
    handler,
  );
}

function splitShellWords(input: string): Array<string> {
  const words: Array<string> = [];
  let current = "";
  let quote: '"' | "'" | undefined;
  let escaped = false;
  for (const char of input) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) {
        quote = undefined;
      } else {
        current += char;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) {
        words.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }
  if (escaped) {
    current += "\\";
  }
  if (current) {
    words.push(current);
  }
  return words;
}

function renderStaticSnapshot(ctx: CliContext, profile: AgentProfile): string {
  const timeoutMs = autoStartMs(ctx.env);
  const lines = [
    "welcome to tiny.place",
    `${profile.displayName} runs inside this shell while tiny.place tracks the active ${profile.displayName} session.`,
    "",
    `tiny.place: ${ctx.baseUrl}`,
    `wallet: ${walletIdFor(ctx)}`,
    `${profile.kind}: ${profile.launch.label}`,
    `sessions: ${profile.sessionsDir}`,
    "OpenHuman: disconnected",
    "",
    `> ${
      timeoutMs > 0
        ? `[ Launch ${profile.displayName} automatically in ${formatDuration(timeoutMs)} ]`
        : `[ Launch ${profile.displayName} ]`
    }`,
    "  [ Connect with OpenHuman ]",
    "  [ Settings ]",
    "  [ Quit ]",
    "",
    "Enter launches the selected action. Move selection to cancel auto-launch. q quits.",
    `${ctx.baseUrl ? "Connected to tiny.place" : "Disconnected"} - Chat id: none`,
  ];
  return `${lines.join("\n")}\n`;
}

function walletIdFor(ctx: CliContext): string {
  return ctx.signer?.agentId ?? "mock-wallet-8Hf3Qp2N";
}

/** The configured OpenHuman owner (whom we bridge to), if any. Mirrors the
 *  wrapper's recipient resolution order. */
function bridgeOwner(
  env: Record<string, string | undefined>,
): string | undefined {
  return firstEnv(env, [
    "TINYPLACE_CODEX_DM_TO",
    "TINYPLACE_CLAUDE_DM_TO",
    "TINYPLACE_HARNESS_DM_TO",
    "TINYPLACE_OPENHUMAN_OWNER",
    "OPENHUMAN_OWNER_AGENT",
    "TINYPLACE_CODEX_RECEIVE_FROM",
    "TINYPLACE_CLAUDE_RECEIVE_FROM",
    "TINYPLACE_HARNESS_RECEIVE_FROM",
  ]);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function autoStartMs(env: Record<string, string | undefined>): number {
  const raw = env.TINYPLACE_TUI_AUTOSTART_MS ?? "2500";
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return 2500;
  }
  return Math.max(0, parsed);
}

function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  const seconds = ms / 1000;
  return Number.isInteger(seconds) ? `${seconds}s` : `${seconds.toFixed(1)}s`;
}

function isTty(stream: unknown): boolean {
  return (stream as { isTTY?: boolean }).isTTY === true;
}
