import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConfigStore } from "../src/server/store.ts";
import { createApp } from "../src/server/app.ts";

const origin = "http://127.0.0.1:43123";
const json = { origin, "content-type": "application/json" };
const pasted = JSON.stringify({ mcpServers: {
  fs: { command: "npx", args: ["-y", "fs-mcp"], env: { FS_TOKEN: "fixture-pasted-secret" } },
  docs: { url: "https://new.example.com/mcp" },
  old: { type: "sse", url: "https://old.example.com/sse" },
} });

async function fixture(t: import("node:test").TestContext) {
  const root = await mkdtemp(join(tmpdir(), "pi-settings-mcp-import-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const agent = join(root, "agent");
  await mkdir(agent, { recursive: true });
  const file = join(agent, "mcp.json");
  await writeFile(file, JSON.stringify({ mcpServers: { docs: { url: "https://docs.example.com/mcp", exposure: "direct" } } }));
  const app = createApp({ store: new ConfigStore({ global: agent }), agentDir: agent, origins: [origin] });
  const request = (path: string, init: RequestInit = {}) =>
    app.request(new Request(origin + path, { ...init, headers: { host: new URL(origin).host, ...init.headers } }));
  const revision = async () => (await (await request("/api/mcp/global")).json()).revision as string;
  return { file, request, revision };
}

test("a preview lists what would be imported, with Pi's verdict, and never echoes values", async (t) => {
  const { request } = await fixture(t);
  const response = await request("/api/mcp/global/import/preview", { method: "POST", headers: json, body: JSON.stringify({ text: pasted }) });
  const body = await response.text();
  assert.equal(response.status, 200);
  assert.doesNotMatch(body, /fixture-pasted-secret/);
  const preview = JSON.parse(body);
  assert.equal(preview.format, "Claude Desktop, Claude Code or Cursor");
  assert.deepEqual(preview.servers.map((entry: { server: { name: string; env: string[]; error?: string }; exists: boolean }) =>
    [entry.server.name, entry.exists, entry.server.env, !!entry.server.error]), [["fs", false, ["FS_TOKEN"], false], ["docs", true, [], false], ["old", false, [], true]]);
  const bad = await request("/api/mcp/global/import/preview", { method: "POST", headers: json, body: JSON.stringify({ text: "hello there" }) });
  assert.equal(bad.status, 422);
});

test("importing writes only the chosen servers, replacing one of the same name", async (t) => {
  const { file, request, revision } = await fixture(t);
  const response = await request("/api/mcp/global/import", { method: "POST", headers: json,
    body: JSON.stringify({ revision: await revision(), text: pasted, names: ["fs", "docs"] }) });
  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(await readFile(file, "utf8")).mcpServers, {
    docs: { url: "https://new.example.com/mcp" },
    fs: { command: "npx", args: ["-y", "fs-mcp"], env: { FS_TOKEN: "fixture-pasted-secret" } },
  });
  const refused = await request("/api/mcp/global/import", { method: "POST", headers: json,
    body: JSON.stringify({ revision: await revision(), text: pasted, names: ["old"] }) });
  assert.equal(refused.status, 422);
  assert.match((await refused.json()).error, /SSE/);
});
