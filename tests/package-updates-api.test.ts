import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProjectTrustStore } from "@earendil-works/pi-coding-agent";
import { ConfigStore } from "../src/server/store.ts";
import { createApp } from "../src/server/app.ts";
import { packageRegistry } from "./fixtures/package-registry.ts";

const origin = "http://127.0.0.1:43123";
const headers = { host: new URL(origin).host, origin, "content-type": "application/json" };
async function fixture(t: import("node:test").TestContext) {
  const root = await mkdtemp(join(tmpdir(), "pss-package-updates-"));
  const agent = join(root, "agent"), project = join(root, "project");
  const registry = await packageRegistry(root);
  t.after(async () => { registry.close(); await rm(root, { recursive: true, force: true }); });
  await registry.configure(agent); await registry.configure(project);
  await mkdir(join(project, ".pi"));
  await registry.installed(agent, "old-package");
  await registry.installed(agent, "pinned-package");
  await registry.installed(agent, "current-package", "2.0.0");
  const settings = { packages: ["npm:old-package", "npm:current-package", "npm:pinned-package@1.0.0", "./local-package", "npm:missing-package"],
    npmCommand: ["bun", "-e", `await Bun.write(${JSON.stringify(join(root, "executed"))}, 'bad')`] };
  await writeFile(join(agent, "settings.json"), JSON.stringify(settings));
  await mkdir(join(agent, "local-package"));
  await writeFile(join(agent, "local-package", "index.ts"), `throw new Error('Extension code must not run');`);
  await writeFile(join(project, ".pi", "settings.json"), "{}");
  const app = createApp({ store: new ConfigStore({ global: agent }), agentDir: agent, origins: [origin], projects: [project] });
  const request = (path: string, init: RequestInit = {}) => app.request(origin + path, { ...init, headers: { ...headers, ...init.headers } });
  const plugins = async (suffix = "") => (await request("/api/plugins" + suffix)).json();
  const check = (suffix = "") => request("/api/plugins/updates" + suffix, { method: "POST", body: "{}" });
  return { root, agent, project, registry, request, plugins, check, settings };
}

test("checking uses Pi's npm update rules only on request, stores scoped notices, and writes nothing", async t => {
  const { root, agent, registry, plugins, check, settings } = await fixture(t);
  assert.equal((await plugins()).updateCheck, undefined);
  assert.equal(registry.requests.length, 0);
  const response = await check();
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.deepEqual(result.updates, [{ source: "npm:old-package", scope: "global" }]);
  assert.equal(result.offline, false);
  assert.ok(Number.isFinite(Date.parse(result.checkedAt)));
  assert.ok(registry.requests.includes("old-package"));
  assert.ok(!registry.requests.some(name => /pinned|missing|local/.test(name)));
  assert.deepEqual((await plugins()).updateCheck, result);
  assert.deepEqual(JSON.parse(await readFile(join(agent, "settings.json"), "utf8")), settings);
  assert.equal(JSON.parse(await readFile(join(agent, "npm/node_modules/old-package/package.json"), "utf8")).version, "1.0.0");
  await assert.rejects(access(join(root, "executed")));
});

test("a check in progress shows in the plugins view, and asking again joins it", async t => {
  const { registry, plugins, check } = await fixture(t);
  const release = registry.hold();
  const first = check();
  for (let i = 0; i < 100 && !registry.requests.length; i++) await Bun.sleep(50);
  assert.equal((await plugins()).updateChecking, true);
  const again = check();
  release();
  const [a, b] = await Promise.all([(await first).json(), (await again).json()]);
  assert.equal(b.checkedAt, a.checkedAt);
  const after = await plugins();
  assert.equal(after.updateChecking, undefined);
  assert.equal(after.updateCheck.checkedAt, a.checkedAt);
});

test("rechecking replaces notices, and a changed settings revision invalidates previous results", async t => {
  const { agent, registry, plugins, check } = await fixture(t);
  assert.equal((await (await check()).json()).updates.length, 1);
  await registry.installed(agent, "old-package", "2.0.0");
  assert.deepEqual((await (await check()).json()).updates, []);
  await writeFile(join(agent, "settings.json"), JSON.stringify({ packages: ["npm:old-package"] }));
  assert.equal((await plugins()).updateCheck, undefined);
});

test("a selected trusted project uses Pi's project precedence without leaking notices to global scope", async t => {
  const { agent, project, registry, plugins, check } = await fixture(t);
  const suffix = "?project=" + encodeURIComponent(project);
  await writeFile(join(project, ".pi", "settings.json"), JSON.stringify({ packages: ["npm:old-package"] }));
  await registry.installed(join(project, ".pi"), "old-package", "2.0.0");
  assert.equal((await check(suffix)).status, 403);
  new ProjectTrustStore(agent).set(project, true);
  const result = await (await check(suffix)).json();
  assert.deepEqual(result.updates, []);
  assert.equal((await plugins()).updateCheck, undefined);
  await registry.installed(join(project, ".pi"), "old-package", "1.0.0");
  assert.deepEqual((await (await check(suffix)).json()).updates, [{ source: "npm:old-package", scope: "project" }]);
  assert.equal((await plugins()).updateCheck, undefined);
});

test("a failed registry lookup is not an API failure and does not invent an update", async t => {
  const { registry, check } = await fixture(t);
  registry.fail();
  const response = await check();
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).updates, []); // Pi does not expose per-package lookup failures.
});

test("offline checks explicitly report that they skipped the network", async t => {
  const { registry, check } = await fixture(t);
  const before = process.env.PI_OFFLINE;
  process.env.PI_OFFLINE = "1";
  t.after(() => { if (before === undefined) delete process.env.PI_OFFLINE; else process.env.PI_OFFLINE = before; });
  const response = await check();
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.offline, true);
  assert.deepEqual(result.updates, []);
  assert.deepEqual(registry.requests, []);
});

test("the checking boundary refuses arbitrary input and cross-origin requests", async t => {
  const { check, request } = await fixture(t);
  assert.equal((await check("?project=/not-registered")).status, 400);
  assert.equal((await request("/api/plugins/updates", { method: "POST", body: JSON.stringify({ source: "npm:not-configured" }) })).status, 422);
  assert.equal((await request("/api/plugins/updates", { method: "POST", body: "{}", headers: { origin: "https://attacker.invalid" } })).status, 403);
  assert.equal((await request("/api/plugins/updates", { method: "GET" })).status, 404);
});
