import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConfigStore } from "../src/server/store.ts";
import { createApp } from "../src/server/app.ts";
import { jobRoutes } from "../src/server/jobs.ts";
import { installedPiVersion } from "../src/server/pi-version.ts";
import { projectRegistry } from "../src/server/projects.ts";

const origin = "http://127.0.0.1:43123";
const json = { origin, "content-type": "application/json" };

async function agentFixture(t: import("node:test").TestContext) {
  const root = await mkdtemp(join(tmpdir(), "pi-settings-maintenance-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const agent = join(root, "agent");
  await mkdir(agent, { recursive: true });
  await writeFile(join(agent, "settings.json"), "{}");
  await writeFile(join(agent, "auth.json"), JSON.stringify({ anthropic: { type: "api_key", key: "fixture-check-key-123" } }));
  return { root, agent };
}

async function settle(request: (path: string) => Response | Promise<Response>, id: string) {
  for (let i = 0; i < 300; i++) {
    const job = await (await request(`/api/jobs/${id}`)).json();
    if (job.status !== "running") return job;
    await Bun.sleep(100);
  }
  throw new Error("job did not settle");
}

test("Check credential runs pi auth check and reports Pi's verdict, never the key", async (t) => {
  const { agent } = await agentFixture(t);
  const app = createApp({ store: new ConfigStore({ global: agent }), agentDir: agent, origins: [origin] });
  const request = (path: string, init: RequestInit = {}) => app.request(new Request(origin + path, { ...init, headers: { host: new URL(origin).host, ...init.headers } }));
  const check = async (provider: string) => {
    const started = await request("/api/jobs", { method: "POST", headers: json, body: JSON.stringify({ action: "provider-check", provider }) });
    return settle(request, (await started.json()).id);
  };
  const ready = await check("anthropic");
  assert.equal(ready.status, "done");
  assert.deepEqual(ready.check, { status: "ready", provider: "anthropic", authType: "api_key" });
  assert.doesNotMatch(JSON.stringify(ready), /fixture-check-key-123/);
  const missing = await check("no-such-provider");
  assert.deepEqual([missing.status, missing.check.status, missing.check.reason], ["done", "not_ready", "provider_not_found"]);
  const option = await request("/api/jobs", { method: "POST", headers: json, body: JSON.stringify({ action: "provider-check", provider: "--credentials" }) });
  assert.equal(option.status, 422);
});

test("Update Pi runs pi update --self", async (t) => {
  const { agent } = await agentFixture(t);
  // echo stands in for pi, so the test never updates the real Pi.
  const routes = jobRoutes(new ConfigStore({ global: agent }), projectRegistry(agent), agent, [Bun.which("echo")!]);
  const request = (path: string, init: RequestInit = {}) => routes.request(path.replace("/api/jobs", "") || "/", init);
  const started = await request("/api/jobs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "pi-update" }) });
  const job = await settle(request, (await started.json()).id);
  assert.deepEqual([job.status, job.title, job.output.trim()], ["done", "Update Pi", "update --self"]);
});

test("the installed Pi version is read from the package the pi command links to, without running it", async (t) => {
  const { root } = await agentFixture(t);
  const pkg = join(root, "global", "node_modules", "@earendil-works", "pi-coding-agent");
  await mkdir(join(pkg, "dist"), { recursive: true });
  await writeFile(join(pkg, "package.json"), JSON.stringify({ name: "@earendil-works/pi-coding-agent", version: "9.8.7" }));
  await writeFile(join(pkg, "dist", "cli.js"), "#!/usr/bin/env node\nthrow new Error('must not run');\n");
  await mkdir(join(root, "bin"));
  await symlink(join(pkg, "dist", "cli.js"), join(root, "bin", "pi"));
  assert.equal(await installedPiVersion(join(root, "bin", "pi")), "9.8.7");
  assert.equal(await installedPiVersion(join(root, "bin", "missing")), undefined);
});
