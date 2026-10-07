import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConfigStore } from "../src/server/store.ts";
import { createApp } from "../src/server/app.ts";

const origin = "http://127.0.0.1:43123";
const token = "fixture-launch-capability-not-a-real-secret";
async function fixture(t: import("node:test").TestContext) {
  const root = await mkdtemp(join(tmpdir(), "pi-settings-api-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const roots = { global: join(root, "agent"), project: join(root, "project", ".pi") };
  await mkdir(roots.global, { recursive: true });
  await mkdir(roots.project, { recursive: true });
  const file = join(roots.global, "settings.json");
  await writeFile(file, JSON.stringify({ defaultModel: "global-model", codemode: { mode: "only" }, privateExtension: { apiKey: "fixture-secret" } }));
  const app = createApp({ store: new ConfigStore(roots), origin, token });
  async function request(path: string, options: RequestInit = {}) {
    return app.request(new Request(origin + path, { ...options, headers: { host: new URL(origin).host, ...options.headers } }));
  }
  const login = await request("/api/session", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ token }) });
  const cookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";
  return { request, cookie, file, roots };
}

test("authentication protects settings; launch exchange uses HttpOnly Strict cookies", async (t) => {
  const { request } = await fixture(t);
  assert.equal((await request("/api/settings/global")).status, 401);
  const bad = await request("/api/session", { method: "POST", headers: { origin, "content-type": "application/json" }, body: '{"token":"wrong"}' });
  assert.equal(bad.status, 401);
  const good = await request("/api/session", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ token }) });
  assert.equal(good.status, 204);
  assert.match(good.headers.get("set-cookie")!, /HttpOnly/);
  assert.match(good.headers.get("set-cookie")!, /SameSite=Strict/);
});

test("two settings servers on different ports do not overwrite each other's browser session cookie", async (t) => {
  const { request, cookie, roots } = await fixture(t);
  const otherOrigin = "http://127.0.0.1:43124";
  const other = createApp({ store: new ConfigStore(roots), origin: otherOrigin, token });
  const login = await other.request(new Request(otherOrigin + "/api/session", {
    method: "POST", headers: { host: new URL(otherOrigin).host, origin: otherOrigin, "content-type": "application/json" },
    body: JSON.stringify({ token }),
  }));
  const otherCookie = login.headers.get("set-cookie")!.split(";")[0]!;
  assert.notEqual(cookie.split("=")[0], otherCookie.split("=")[0]);
  assert.equal((await request("/api/settings/global", { headers: { cookie: cookie + "; " + otherCookie } })).status, 200);
});

test("Host, Origin, Fetch Metadata and JSON checks prevent cross-site mutation", async (t) => {
  const { request, cookie } = await fixture(t);
  for (const headers of [
    { host: "attacker.example" },
    { origin: "https://attacker.example" },
    { "sec-fetch-site": "cross-site" },
  ] as Record<string, string>[]) {
    const response = await request("/api/settings/global", { headers: { cookie, ...headers } });
    assert.equal(response.status, 403);
  }
  assert.equal((await request("/api/settings/global", { method: "PATCH", headers: { cookie }, body: "{}" })).status, 403);
  assert.equal((await request("/api/settings/global", { method: "PATCH", headers: { cookie, origin, "content-type": "text/plain" }, body: "{}" })).status, 415);
});

test("project reads distinguish local and inherited values without leaking unknown settings", async (t) => {
  const { request, cookie, roots } = await fixture(t);
  await writeFile(join(roots.project, "settings.json"), '{"defaultModel":"project-model"}');
  const response = await request("/api/settings/project", { headers: { cookie } });
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.values.defaultModel, "project-model");
  assert.equal(data.inherited.defaultModel, "global-model");
  assert.equal(data.inherited["codemode.mode"], "only");
  assert.doesNotMatch(JSON.stringify(data), /fixture-secret|privateExtension/);
  assert.match(response.headers.get("content-security-policy")!, /frame-ancestors 'none'/);
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("validated patches preserve secrets, reject unsupported keys, and return conflicts", async (t) => {
  const { request, cookie, file } = await fixture(t);
  const before = await (await request("/api/settings/global", { headers: { cookie } })).json();
  const headers = { cookie, origin, "content-type": "application/json" };
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
  assert.equal((await request("/api/settings/../../auth.json", { headers: { cookie } })).status, 404);
});

test("oversized JSON is rejected before any file write", async (t) => {
  const { request, cookie, file } = await fixture(t);
  const original = await readFile(file, "utf8");
  const response = await request("/api/settings/global", { method: "PATCH", headers: { cookie, origin, "content-type": "application/json" }, body: JSON.stringify({ junk: "x".repeat(70_000) }) });
  assert.equal(response.status, 413);
  assert.equal(await readFile(file, "utf8"), original);
});

test("backup recovery requires confirmation and a current revision", async (t) => {
  const { request, cookie } = await fixture(t);
  const headers = { cookie, origin, "content-type": "application/json" };
  const before = await (await request("/api/settings/global", { headers })).json();
  const saved = await (await request("/api/settings/global", { method: "PATCH", headers, body: JSON.stringify({ revision: before.revision, changes: [{ key: "defaultModel", value: "temporary" }] }) })).json();
  assert.equal((await request("/api/settings/global/restore", { method: "POST", headers, body: JSON.stringify({ revision: saved.revision }) })).status, 422);
  const restored = await request("/api/settings/global/restore", { method: "POST", headers, body: JSON.stringify({ revision: saved.revision, confirm: true }) });
  assert.equal(restored.status, 200);
  assert.equal((await restored.json()).values.defaultModel, "global-model");
});
