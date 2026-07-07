// Temp diagnostic: connect to an OpenHuman owner and send a test DM.
// Uses the managed wallet (same identity as `pnpm cli:ts codex`).
import { makeContext } from "./src/cli/context.js";
import { publishKeys, resolveRecipientKey, sendMessage } from "./src/agent/index.js";

const owner = process.argv[2] ?? "";
const text = process.argv[3] ?? "hello from claude-code wrapper test";
if (!owner) {
  console.error("usage: oh-connect.mts <owner-address-or-handle> [text]");
  process.exit(2);
}

const ctx = await makeContext({});
if (!ctx.signer) {
  console.error("no signer (wallet locked/unconfigured)");
  process.exit(1);
}
console.log(`me:        ${ctx.signer.agentId}`);
console.log(`endpoint:  ${ctx.baseUrl}`);

await publishKeys(ctx.client, ctx.signer);
console.log("keys:      published");

const addr = await resolveRecipientKey(ctx.client, owner);
console.log(`owner:     ${addr}`);

// A fresh relationship 404s on status(), so request FIRST (idempotent;
// auto-accepts a reverse request), then poll — never pre-check status.
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const readStatus = async (): Promise<string> => {
  try {
    return (await ctx.client.contacts.status(addr)).status;
  } catch {
    return "none";
  }
};

try {
  await ctx.client.contacts.request(addr);
  console.log("requested: contact request sent — ACCEPT IT IN OPENHUMAN");
} catch (e) {
  console.log(`request:   ${e instanceof Error ? e.message : String(e)}`);
}

let status = await readStatus();
for (let i = 0; i < 30 && status !== "accepted"; i += 1) {
  process.stdout.write(`  waiting for accept… (${status})     \r`);
  await sleep(3000);
  status = await readStatus();
}
console.log("");

if (status !== "accepted") {
  console.log(`not accepted (${status}) — no DM sent. Accept the request in OpenHuman and re-run.`);
  process.exit(0);
}

const sent = await sendMessage(ctx.client, ctx.signer, addr, text);
console.log(`SENT:      id=${sent.id} to=${sent.to} type=${sent.type}`);
console.log(`text:      ${text}`);
