import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConfigStore } from "../src/server/store.ts";
import { createApp } from "../src/server/app.ts";

const origin = "http://127.0.0.1:43123";
async function fixture(t: import("node:test").TestContext, mcp?: string) {
  const root = await mkdtemp(join(tmpdir(), "pi-settings-mcp-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const roots = { global: join(root, "agent"), project: join(root, "project", ".pi") };
  await mkdir(roots.global, { recursive: true });
  const file = join(roots.global, "mcp.json");
  if (mcp !== undefined) await writeFile(file, mcp);
  const app = createApp({ store: new ConfigStore(roots), origins: [origin] });
  const request = (path: string, init: RequestInit = {}) =>
    app.request(new Request(origin + path, { ...init, headers: { host: new URL(origin).host, ...init.headers } }));
  return { request, file };
}

test("servers are listed with env and header names, never their values", async (t) => {
  const { request } = await fixture(t, JSON.stringify({ mcpServers: {
    search: { command: "uvx", args: ["search-mcp"], env: { SEARCH_API_KEY: "fixture-secret-value" }, enabled: false },
    docs: { url: "https://example.com/mcp", headers: { Authorization: "Bearer fixture-token" }, exposure: "deferred", description: "Docs" },
    broken: { url: "ftp://nope" },
  } }));
  const response = await request("/api/mcp/global");
  assert.equal(response.status, 200);
  const text = await response.text();
  assert.doesNotMatch(text, /fixture-secret-value|fixture-token|Bearer/);
  const view = JSON.parse(text);
  assert.deepEqual(view.servers.map((s: { name: string }) => s.name), ["search", "docs", "broken"]);
  const [search, docs, broken] = view.servers;
  assert.deepEqual([search.transport, search.enabled, search.env, search.command, search.args], ["stdio", false, ["SEARCH_API_KEY"], "uvx", ["search-mcp"]]);
  assert.deepEqual([docs.transport, docs.exposure, docs.headers, docs.url, docs.description], ["http", "deferred", ["Authorization"], "https://example.com/mcp", "Docs"]);
  assert.equal(broken.error, 'server "broken": url must be an http or https URL');
});

test("an unparsable mcp.json is reported as a file problem and left untouched", async (t) => {
  const { request, file } = await fixture(t, "{ broken");
  const view = await (await request("/api/mcp/global")).json();
  assert.match(view.error, /valid JSON/);
  assert.deepEqual(view.servers, []);
  assert.equal(await readFile(file, "utf8"), "{ broken");
});

test("a missing mcp.json lists no servers and creates nothing", async (t) => {
  const { request, file } = await fixture(t);
  const view = await (await request("/api/mcp/global")).json();
  assert.deepEqual([view.exists, view.servers], [false, []]);
  await assert.rejects(stat(file), { code: "ENOENT" });
});
