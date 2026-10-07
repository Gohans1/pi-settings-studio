import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConfigStore } from "../src/server/store.ts";
import { createApp } from "../src/server/app.ts";

const origin = "http://127.0.0.1:43123";
const localhostOrigin = "http://localhost:43123";
async function fixture(t: import("node:test").TestContext) {
  const root = await mkdtemp(join(tmpdir(), "pi-settings-api-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const roots = { global: join(root, "agent"), project: join(root, "project", ".pi") };
  await mkdir(roots.global, { recursive: true });
  await mkdir(roots.project, { recursive: true });
  const file = join(roots.global, "settings.json");
  await writeFile(file, JSON.stringify({ defaultModel: "global-model", defaultThinkingLevel: "high", privateExtension: { apiKey: "fixture-secret" } }));
  const app = createApp({ store: new ConfigStore(roots), agentDir: roots.global, projects: [join(root, "project")], origins: [origin, localhostOrigin] });
  async function request(path: string, options: RequestInit = {}, base = origin) {
    return app.request(new Request(base + path, { ...options, headers: { host: new URL(base).host, ...options.headers } }));
  }
  return { request, file, roots };
}

test("the local origins use the API without a login", async (t) => {
  const { request } = await fixture(t);
  assert.equal((await request("/api/settings/global")).status, 200);
  const headers = { origin: localhostOrigin, "content-type": "application/json" };
  const before = await (await request("/api/settings/global", {}, localhostOrigin)).json();
  const body = JSON.stringify({ revision: before.revision, changes: [{ key: "defaultModel", value: "from-localhost" }] });
  assert.equal((await request("/api/settings/global", { method: "PATCH", headers, body }, localhostOrigin)).status, 200);
});

test("Host, Origin, Fetch Metadata and JSON checks prevent cross-site mutation", async (t) => {
  const { request } = await fixture(t);
  for (const headers of [
    { host: "attacker.example" },
    { origin: "https://attacker.example" },
    { "sec-fetch-site": "cross-site" },
  ] as Record<string, string>[]) {
    const response = await request("/api/settings/global", { headers });
    assert.equal(response.status, 403);
  }
  assert.equal((await request("/api/settings/global", { method: "PATCH", body: "{}" })).status, 403);
  assert.equal((await request("/api/settings/global", { method: "PATCH", headers: { origin, "content-type": "text/plain" }, body: "{}" })).status, 415);
});

test("project reads distinguish local and inherited values without leaking unknown settings", async (t) => {
  const { request, roots } = await fixture(t);
  await writeFile(join(roots.project, "settings.json"), '{"defaultModel":"project-model"}');
  const response = await request(`/api/settings/project?project=${encodeURIComponent(join(roots.project, ".."))}`, {});
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.values.defaultModel, "project-model");
  assert.equal(data.inherited.defaultModel, "global-model");
  assert.equal(data.inherited.defaultThinkingLevel, "high");
  assert.doesNotMatch(JSON.stringify(data), /fixture-secret|privateExtension/);
  assert.match(response.headers.get("content-security-policy")!, /frame-ancestors 'none'/);
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("validated patches preserve secrets, reject unsupported keys, and return conflicts", async (t) => {
  const { request, file } = await fixture(t);
  const before = await (await request("/api/settings/global", {})).json();
  const headers = { origin, "content-type": "application/json" };
  for (const changes of [
    [{ key: "codemode.inlineBudget", value: -1 }],
    [{ key: "__proto__.polluted", value: true }],
    [{ key: "unknown", value: "guess" }],
    [{ key: "defaultThinkingLevel", value: "imaginary" }],
    [{ key: "defaultModel" }],
  ]) {
    assert.equal((await request("/api/settings/global", { method: "PATCH", headers, body: JSON.stringify({ revision: before.revision, changes }) })).status, 422);
  }
  const body = JSON.stringify({ revision: before.revision, changes: [{ key: "defaultModel", value: "chosen" }] });
  assert.equal((await request("/api/settings/global", { method: "PATCH", headers, body })).status, 200);
  assert.equal((await request("/api/settings/global", { method: "PATCH", headers, body })).status, 409);
  assert.equal(JSON.parse(await readFile(file, "utf8")).privateExtension.apiKey, "fixture-secret");
  assert.equal((await request("/api/settings/../../auth.json", {})).status, 404);
});

test("oversized JSON is rejected before any file write", async (t) => {
  const { request, file } = await fixture(t);
  const original = await readFile(file, "utf8");
  const response = await request("/api/settings/global", { method: "PATCH", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ junk: "x".repeat(70_000) }) });
  assert.equal(response.status, 413);
  assert.equal(await readFile(file, "utf8"), original);
});

test("backup recovery requires confirmation and a current revision", async (t) => {
  const { request } = await fixture(t);
  const headers = { origin, "content-type": "application/json" };
  const before = await (await request("/api/settings/global", { headers })).json();
  const saved = await (await request("/api/settings/global", { method: "PATCH", headers, body: JSON.stringify({ revision: before.revision, changes: [{ key: "defaultModel", value: "temporary" }] }) })).json();
  assert.equal((await request("/api/settings/global/restore", { method: "POST", headers, body: JSON.stringify({ revision: saved.revision }) })).status, 422);
  const restored = await request("/api/settings/global/restore", { method: "POST", headers, body: JSON.stringify({ revision: saved.revision, confirm: true }) });
  assert.equal(restored.status, 200);
  assert.equal((await restored.json()).values.defaultModel, "global-model");
});

test("booleans, nested numbers and typed choices are saved with their JSON types", async (t) => {
  const { request, file } = await fixture(t);
  const headers = { origin, "content-type": "application/json" };
  const patch = async (changes: object[]) => {
    const { revision } = await (await request("/api/settings/global")).json();
    return request("/api/settings/global", { method: "PATCH", headers, body: JSON.stringify({ revision, changes }) });
  };
  for (const changes of [[{ key: "editorPaddingX", value: 5 }], [{ key: "terminal.images", value: "png" }], [{ key: "fullscreenWheelScrollLines", value: "500" }]]) {
    assert.equal((await patch(changes)).status, 422);
  }
  assert.equal((await patch([
    { key: "compaction.enabled", value: false }, { key: "retry.provider.maxRetries", value: 2 },
    { key: "terminal.images", value: false }, { key: "quietStartup", value: "header" }, { key: "fullscreenWheelScrollLines", value: "6" },
  ])).status, 200);
  const saved = JSON.parse(await readFile(file, "utf8"));
  assert.deepEqual([saved.compaction, saved.retry, saved.terminal, saved.quietStartup, saved.fullscreenWheelScrollLines],
    [{ enabled: false }, { provider: { maxRetries: 2 } }, { images: false }, "header", 6]);
});

test("raw JSON round-trips exactly; invalid or non-object JSON and stale revisions change nothing", async (t) => {
  const { request, file } = await fixture(t);
  const headers = { origin, "content-type": "application/json" };
  const raw = await (await request("/api/settings/global/raw")).json();
  assert.equal(raw.text, await readFile(file, "utf8"));
  const put = (body: object) => request("/api/settings/global/raw", { method: "PUT", headers, body: JSON.stringify(body) });
  const before = await readFile(file, "utf8");
  for (const text of ["{ broken", "[1, 2]", "null"]) {
    const response = await put({ revision: raw.revision, text });
    assert.equal(response.status, 422);
    assert.match((await response.json()).error, /JSON object|valid JSON/);
  }
  assert.equal((await put({ revision: "stale", text: "{}" })).status, 409);
  assert.equal(await readFile(file, "utf8"), before);
  const text = '{\n\t"modelThinkingLevels": { "anthropic/claude": "high" },\n\t"defaultModel": "x"\n}\n';
  const saved = await put({ revision: raw.revision, text });
  assert.equal(saved.status, 200);
  assert.equal(await readFile(file, "utf8"), text);
  assert.equal(await readFile(file + ".pi-settings-backup", "utf8"), before);
});

test("a settings file with broken JSON can be repaired through the raw editor", async (t) => {
  const { request, file } = await fixture(t);
  await writeFile(file, '{ "defaultModel": "x", }');
  const raw = await (await request("/api/settings/global/raw")).json();
  assert.equal(raw.text, '{ "defaultModel": "x", }');
  const response = await request("/api/settings/global/raw", { method: "PUT", headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ revision: raw.revision, text: '{ "defaultModel": "x" }\n' }) });
  assert.equal(response.status, 200);
  assert.equal(await readFile(file, "utf8"), '{ "defaultModel": "x" }\n');
});
