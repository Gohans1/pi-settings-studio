import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConfigStore } from "../src/server/store.ts";
import { createApp } from "../src/server/app.ts";

const origin = "http://127.0.0.1:43123";
const json = { origin, "content-type": "application/json" };
const line = (entry: object) => JSON.stringify(entry) + "\n";

async function fixture(t: import("node:test").TestContext, settings: object = {}) {
  const root = await mkdtemp(join(tmpdir(), "pi-settings-projects-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const agent = join(root, "agent");
  const alpha = join(root, "alpha"), gone = join(root, "gone"), extra = join(root, "extra");
  await mkdir(alpha, { recursive: true });
  await mkdir(extra, { recursive: true });
  for (const [cwd, id, iso] of [[alpha, "aaaa", "2026-10-01T10:00:00.000Z"], [gone, "gggg", "2026-10-02T10:00:00.000Z"]] as const) {
    const dir = join(agent, "sessions", `--${id}--`);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `${id}.jsonl`), line({ type: "session", version: 3, id, timestamp: iso, cwd })
      + line({ type: "message", id: "m1", parentId: null, timestamp: iso, message: { role: "user", content: "hi", timestamp: Date.parse(iso) } }));
  }
  await writeFile(join(agent, "settings.json"), JSON.stringify({ defaultModel: "global-model", ...settings }));
  const app = createApp({ store: new ConfigStore({ global: agent, project: join(root, "unused", ".pi") }), agentDir: agent, projects: [extra], origins: [origin] });
  const request = (path: string, init: RequestInit = {}) =>
    app.request(new Request(origin + path, { ...init, headers: { host: new URL(origin).host, ...init.headers } }));
  return { root, agent, alpha, gone, extra, request };
}

test("projects come from session folders that still exist, plus the --project folder", async (t) => {
  const { alpha, extra, request } = await fixture(t);
  const projects = await (await request("/api/projects")).json();
  assert.deepEqual(projects.map((project: { path: string }) => project.path).sort(), [alpha, extra].sort());
});

test("trust follows defaultProjectTrust until a decision is saved with Pi's trust store", async (t) => {
  const { agent, alpha, gone, request } = await fixture(t);
  const trustOf = async () => (await (await request("/api/projects")).json()).find((project: { path: string }) => project.path === alpha).trust;
  assert.deepEqual(await trustOf(), { defaultTrust: "ask", loadsWithoutPrompt: false });
  const save = (project: string, decision: boolean | null) =>
    request("/api/projects/trust", { method: "POST", headers: json, body: JSON.stringify({ project, decision }) });
  assert.equal((await save(alpha, true)).status, 200);
  assert.deepEqual(await trustOf(), { defaultTrust: "ask", decision: true, savedFor: alpha, loadsWithoutPrompt: true });
  assert.equal(JSON.parse(await readFile(join(agent, "trust.json"), "utf8"))[alpha], true);
  assert.equal((await save(alpha, null)).status, 200);
  assert.deepEqual(await trustOf(), { defaultTrust: "ask", loadsWithoutPrompt: false });
  assert.equal((await save(gone, true)).status, 400);
});

test("defaultProjectTrust always lets project configuration load without a trust prompt", async (t) => {
  const { alpha, request } = await fixture(t, { defaultProjectTrust: "always" });
  const project = (await (await request("/api/projects")).json()).find((entry: { path: string }) => entry.path === alpha);
  assert.deepEqual(project.trust, { defaultTrust: "always", loadsWithoutPrompt: true });
});

test("project settings are read and written only for known projects, with global-only keys refused", async (t) => {
  const { root, alpha, request } = await fixture(t);
  const url = `/api/settings/project?project=${encodeURIComponent(alpha)}`;
  const view = await (await request(url)).json();
  assert.equal(view.path, join(alpha, ".pi", "settings.json"));
  assert.equal(view.inherited.defaultModel, "global-model");
  const patch = (changes: object[]) => request(url, { method: "PATCH", headers: json, body: JSON.stringify({ revision: view.revision, changes }) });
  const refused = await patch([{ key: "httpProxy", value: "http://proxy" }]);
  assert.equal(refused.status, 422);
  assert.match((await refused.json()).error, /global/i);
  assert.equal((await patch([{ key: "retry.maxRetries", value: 5 }])).status, 200);
  assert.deepEqual(JSON.parse(await readFile(join(alpha, ".pi", "settings.json"), "utf8")), { retry: { maxRetries: 5 } });
  const outside = join(root, "elsewhere");
  assert.equal((await request(`/api/settings/project?project=${encodeURIComponent(outside)}`)).status, 400);
  assert.equal((await request("/api/settings/project")).status, 400);
  await assert.rejects(stat(join(outside, ".pi")), { code: "ENOENT" });
});

test("a project's settings.json can be edited as raw JSON", async (t) => {
  const { alpha, request } = await fixture(t);
  const url = `/api/settings/project/raw?project=${encodeURIComponent(alpha)}`;
  const raw = await (await request(url)).json();
  assert.equal(raw.text, "{}\n");
  const text = '{ "packages": [{ "source": "npm:x", "skills": [] }] }\n';
  assert.equal((await request(url, { method: "PUT", headers: json, body: JSON.stringify({ revision: raw.revision, text }) })).status, 200);
  assert.equal(await readFile(join(alpha, ".pi", "settings.json"), "utf8"), text);
});
