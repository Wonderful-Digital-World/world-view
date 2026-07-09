import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { makeContext, saveOpenHumanOwner } from "../src/cli/context.js";

/**
 * The TUI "Connect with OpenHuman" step persists the owner so the next launch
 * auto-connects the bridge without re-asking. These lock the round-trip through
 * the CLI config file (independent of the interactive Blessed layer).
 */
describe("OpenHuman owner persistence", () => {
  async function tempConfig(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "tinyplace-owner-"));
    return join(dir, "config.json");
  }

  it("saves the owner and makeContext reads it back", async () => {
    const configPath = await tempConfig();
    const env = { TINYPLACE_CONFIG: configPath };

    await saveOpenHumanOwner(env, "@carol");

    // Persisted to disk under the documented key.
    const onDisk = JSON.parse(await readFile(configPath, "utf8")) as {
      openHumanOwner?: string;
    };
    expect(onDisk.openHumanOwner).toBe("@carol");

    // And surfaced on the context the TUI auto-connects from.
    const ctx = await makeContext({ env });
    expect(ctx.openHumanOwner).toBe("@carol");
  });

  it("trims whitespace and preserves the identity key on the same file", async () => {
    const configPath = await tempConfig();
    await writeFile(
      configPath,
      JSON.stringify({ secretKey: "ab".repeat(32) }),
      "utf8",
    );
    const env = { TINYPLACE_CONFIG: configPath };

    await saveOpenHumanOwner(env, "  6wNaBJkatir4B86cw5ykHZWQ3xoNaKygX5vAU9MQbHSh  ");

    const onDisk = JSON.parse(await readFile(configPath, "utf8")) as {
      openHumanOwner?: string;
      secretKey?: string;
    };
    expect(onDisk.openHumanOwner).toBe(
      "6wNaBJkatir4B86cw5ykHZWQ3xoNaKygX5vAU9MQbHSh",
    );
    // The wallet key the config already held is untouched by the owner write.
    expect(onDisk.secretKey).toBe("ab".repeat(32));
  });

  it("clears the stored owner when passed an empty value", async () => {
    const configPath = await tempConfig();
    const env = { TINYPLACE_CONFIG: configPath };

    await saveOpenHumanOwner(env, "@dave");
    await saveOpenHumanOwner(env, "   ");

    const ctx = await makeContext({ env });
    expect(ctx.openHumanOwner).toBeUndefined();
  });
});
