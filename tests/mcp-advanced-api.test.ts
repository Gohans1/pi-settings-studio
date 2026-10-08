import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConfigStore } from "../src/server/store.ts";
import { createApp } from "../src/server/app.ts";

const origin = "http://127.0.0.1:43123";
const json = { origin, "content-type": "application/json" };

async function fixture(t: import("node:test").TestContext) {
  const root = await mkdtemp(join(tmpdir(), "pi-settings-mcp-advanced-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const agent = join(root, "agent");
  await mkdir(agent, { recursive: true });
  const file = join(agent, "mcp.json");
  await writeFile(file, JSON.stringify({ mcpServers: { gh: {
    url: "https://api.example.com/mcp", exposure: "deferred", toolExposure: { search_code: "direct", "delete_*": "hidden" },
    oauth: { clientId: "public-client", clientSecret: "fixture-client-secret", callbackPort: 8765, scope: "repo" },
  } } }));
  const app = createApp({ store: new ConfigStore({ global: agent }), agentDir: agent, origins: [origin] });
  const request = (path: string, init: RequestInit = {}) =>
    app.request(new Request(origin + path, { ...init, headers: { host: new URL(origin).host, ...init.headers } }));
  const view = async () => (await (await request("/api/mcp/global")).json()) as { revision: string; servers: Array<Record<string, any>> };
  const put = async (server: object) => request("/api/mcp/global/servers/gh", { method: "PUT", headers: json, body: JSON.stringify({ revision: (await view()).revision, server }) });
  return { file, request, view, put };
}

test("tool exposure rules and OAuth settings are shown, the client secret only as set", async (t) => {
  const { request } = await fixture(t);
  const body = await (await request("/api/mcp/global")).text();
  assert.doesNotMatch(body, /fixture-client-secret/);
  const gh = JSON.parse(body).servers[0];
  assert.deepEqual(gh.toolExposure, { search_code: "direct", "delete_*": "hidden" });
  assert.deepEqual(gh.oauth, { clientId: "public-client", hasClientSecret: true, callbackPort: 8765, scope: "repo" });
});

test("the form edits rules, OAuth and provider auth; the secret is kept unless replaced or cleared", async (t) => {
  const { file, put } = await fixture(t);
  const saved = async () => JSON.parse(await readFile(file, "utf8")).mcpServers.gh;
  assert.equal((await put({ transport: "http", url: "https://api.example.com/mcp",
    toolExposure: [{ tool: "search_*", exposure: "direct" }], oauth: { clientId: "other", callbackPort: 9000, clientName: "Claude Code" } })).status, 200);
  assert.deepEqual([(await saved()).toolExposure, (await saved()).oauth, (await saved()).exposure],
    [{ "search_*": "direct" }, { clientId: "other", clientSecret: "fixture-client-secret", callbackPort: 9000, clientName: "Claude Code" }, "deferred"]);
  assert.equal((await put({ transport: "http", url: "https://api.example.com/mcp", toolExposure: [], oauth: { clientRegistration: "cimd", clearClientSecret: true }, authProvider: "anthropic" })).status, 200);
  const last = await saved();
  assert.deepEqual([last.toolExposure, last.oauth, last.auth], [undefined, { clientRegistration: "cimd" }, { provider: "anthropic" }]);
  const refused = await put({ transport: "http", url: "https://api.example.com/mcp", oauth: { clientRegistration: "cimd", clientId: "x" } });
  assert.equal(refused.status, 422);
  assert.match((await refused.json()).error, /cimd/);
});
