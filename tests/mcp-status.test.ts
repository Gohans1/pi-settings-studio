import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConfigStore } from "../src/server/store.ts";
import { createApp } from "../src/server/app.ts";

const origin = "http://127.0.0.1:43123";

async function fixture(t: import("node:test").TestContext) {
  const root = await mkdtemp(join(tmpdir(), "pi-settings-mcp-status-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const agent = join(root, "agent");
  await mkdir(agent, { recursive: true });
  await writeFile(join(agent, "mcp.json"), JSON.stringify({ mcpServers: {
    "signed-in": { url: "https://a.example.com/mcp" },
    legacy: { url: "https://b.example.com/mcp" },
    pending: { url: "https://c.example.com/mcp" },
    keyed: { url: "https://d.example.com/mcp", headers: { Authorization: "Bearer fixture-header-secret" } },
    local: { command: "uvx", args: ["tools"], env: { TOOL_KEY: "fixture-env-secret" } },
  } }));
  await writeFile(join(agent, "mcp-auth.json"), JSON.stringify({
    "mcp__signed_in|https://a.example.com/mcp": { tokens: { access_token: "fixture-oauth-token" } },
    "https://b.example.com/mcp": { tokens: { access_token: "fixture-legacy-token" } },
    "mcp__pending|https://c.example.com/mcp": { clientInformation: { client_id: "registered" } },
  }));
  const app = createApp({ store: new ConfigStore({ global: agent }), agentDir: agent, origins: [origin] });
  const request = (path: string) => app.request(new Request(origin + path, { headers: { host: new URL(origin).host } }));
  return { agent, request };
}

test("each OAuth server shows whether mcp-auth.json holds tokens for it, never the tokens", async (t) => {
  const { request } = await fixture(t);
  const body = await (await request("/api/mcp/global")).text();
  assert.doesNotMatch(body, /fixture-oauth-token|fixture-legacy-token/);
  const signedIn = Object.fromEntries(JSON.parse(body).servers.map((server: { name: string; signedIn?: boolean }) => [server.name, server.signedIn]));
  assert.deepEqual(signedIn, { "signed-in": true, legacy: true, pending: false, keyed: undefined, local: undefined });
});

test("the tail of mcp.log is shown with known secrets hidden", async (t) => {
  const { agent, request } = await fixture(t);
  assert.deepEqual(await (await request("/api/mcp/log")).json(), { path: join(agent, "mcp.log"), exists: false, text: "" });
  const lines = Array.from({ length: 450 }, (_, i) => `2026-10-08T06:00:${String(i % 60).padStart(2, "0")}.000Z [local] info line ${i}`);
  lines.push("2026-10-08T06:01:00.000Z [local] error using fixture-env-secret and fixture-header-secret");
  await writeFile(join(agent, "mcp.log"), lines.join("\n") + "\n");
  const log = await (await request("/api/mcp/log")).json();
  assert.equal(log.exists, true);
  const shown = log.text.trimEnd().split("\n");
  assert.equal(shown.length, 300);
  assert.equal(shown.at(-1), "2026-10-08T06:01:00.000Z [local] error using ‹hidden› and ‹hidden›");
  assert.match(shown[0], /info line 151$/);
});
