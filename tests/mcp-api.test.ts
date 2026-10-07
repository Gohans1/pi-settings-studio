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
  const app = createApp({ store: new ConfigStore(roots), agentDir: roots.global, origins: [origin] });
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

test("switching a server edits only its keys and keeps secrets and the file's indentation", async (t) => {
  const original = JSON.stringify({ mcpServers: { search: { command: "uvx", env: { KEY: "fixture-secret-value" }, enabled: false } }, extra: true }, null, 4) + "\n";
  const { request, file } = await fixture(t, original);
  const headers = { origin, "content-type": "application/json" };
  const before = await (await request("/api/mcp/global")).json();
  const on = await request("/api/mcp/global/servers/search", { method: "PATCH", headers, body: JSON.stringify({ revision: before.revision, enabled: true, exposure: "direct" }) });
  assert.equal(on.status, 200);
  assert.equal((await on.json()).servers[0].enabled, true);
  const saved = await readFile(file, "utf8");
  assert.deepEqual(JSON.parse(saved), { mcpServers: { search: { command: "uvx", env: { KEY: "fixture-secret-value" }, exposure: "direct" } }, extra: true });
  assert.match(saved, /^ {4}"mcpServers"/m);
});

test("invalid exposures, unknown servers and stale revisions change nothing", async (t) => {
  const original = JSON.stringify({ mcpServers: { a: { command: "x" } } });
  const { request, file } = await fixture(t, original);
  const headers = { origin, "content-type": "application/json" };
  const { revision } = await (await request("/api/mcp/global")).json();
  const patch = (name: string, body: object) => request(`/api/mcp/global/servers/${name}`, { method: "PATCH", headers, body: JSON.stringify(body) });
  assert.equal((await patch("a", { revision, exposure: "everything" })).status, 422);
  assert.equal((await patch("a", { revision })).status, 422);
  assert.equal((await patch("missing", { revision, enabled: false })).status, 422);
  assert.equal((await patch("a", { revision: "stale", enabled: false })).status, 409);
  assert.equal(await readFile(file, "utf8"), original);
});

const json = { origin, "content-type": "application/json" };

test("adding a server writes a Pi-valid entry; duplicates and entries Pi would refuse are rejected", async (t) => {
  const { request, file } = await fixture(t, JSON.stringify({ mcpServers: { "dev-tools": { command: "x" } } }));
  const { revision } = await (await request("/api/mcp/global")).json();
  const add = (body: object) => request("/api/mcp/global/servers", { method: "POST", headers: json, body: JSON.stringify({ revision, ...body }) });
  for (const [body, message] of [
    [{ name: "dev-tools", server: { transport: "stdio", command: "y" } }, /already exists/],
    [{ name: "dev_tools", server: { transport: "stdio", command: "y" } }, /conflicts with "dev-tools"/],
    [{ name: "web", server: { transport: "http", url: "ftp://nope" } }, /url must be an http or https URL/],
  ] as const) {
    const response = await add(body);
    assert.equal(response.status, 422);
    assert.match((await response.json()).error, message);
  }
  const ok = await add({ name: "files", server: { transport: "stdio", command: "npx", args: ["-y", "fs"], env: [{ name: "TOKEN", value: "fixture-secret" }], description: "Files" } });
  assert.equal(ok.status, 200);
  assert.doesNotMatch(JSON.stringify(await ok.json()), /fixture-secret/);
  assert.deepEqual(JSON.parse(await readFile(file, "utf8")).mcpServers.files, { command: "npx", args: ["-y", "fs"], env: { TOKEN: "fixture-secret" }, description: "Files" });
});

test("editing keeps hidden values unless replaced and keeps keys the form does not manage", async (t) => {
  const { request, file } = await fixture(t, JSON.stringify({ mcpServers: { search: {
    command: "uvx", env: { KEEP: "fixture-keep", DROP: "fixture-drop" }, enabled: false, exposure: "direct", toolExposure: { "a*": "hidden" },
  } } }));
  const { revision } = await (await request("/api/mcp/global")).json();
  const edit = (server: object) => request("/api/mcp/global/servers/search", { method: "PUT", headers: json, body: JSON.stringify({ revision, server }) });
  const missing = await edit({ transport: "stdio", command: "uvx", env: [{ name: "NEW" }] });
  assert.equal(missing.status, 422);
  assert.match((await missing.json()).error, /Enter a value for NEW/);
  assert.equal((await edit({ transport: "stdio", command: "uvx2", env: [{ name: "KEEP" }, { name: "NEW", value: "fixture-new" }] })).status, 200);
  assert.deepEqual(JSON.parse(await readFile(file, "utf8")).mcpServers.search, {
    command: "uvx2", env: { KEEP: "fixture-keep", NEW: "fixture-new" }, enabled: false, exposure: "direct", toolExposure: { "a*": "hidden" },
  });
});

test("removing a server can be undone from the backup", async (t) => {
  const original = JSON.stringify({ mcpServers: { a: { command: "x" }, b: { url: "https://example.com/mcp" } } }, null, 2) + "\n";
  const { request, file } = await fixture(t, original);
  const { revision } = await (await request("/api/mcp/global")).json();
  const removed = await request("/api/mcp/global/servers/a", { method: "DELETE", headers: json, body: JSON.stringify({ revision }) });
  assert.equal(removed.status, 200);
  const after = await removed.json();
  assert.deepEqual(after.servers.map((s: { name: string }) => s.name), ["b"]);
  assert.equal(after.hasBackup, true);
  const undo = await request("/api/mcp/global/restore", { method: "POST", headers: json, body: JSON.stringify({ revision: after.revision }) });
  assert.equal(undo.status, 200);
  assert.equal(await readFile(file, "utf8"), original);
});
