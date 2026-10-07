import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConfigStore } from "../src/server/store.ts";
import { createApp } from "../src/server/app.ts";
import { projectCodemodePreference, withProjectCodemodePreference, effectiveTools } from "../src/server/codemode.ts";

test("project preference: +codemode is always, -codemode is automatic, no entry inherits", () => {
  assert.equal(projectCodemodePreference(undefined), "inherit");
  assert.equal(projectCodemodePreference(["+grep"]), "inherit");
  assert.equal(projectCodemodePreference(["+codemode"]), "always");
  assert.equal(projectCodemodePreference(["-codemode"]), "automatic");
  assert.equal(projectCodemodePreference(["read", "bash"]), "automatic");
  assert.equal(projectCodemodePreference(["read", "codemode"]), "always");
});

test("project edits keep other entries and never leave an empty modifier list", () => {
  assert.deepEqual(withProjectCodemodePreference(["+grep", "+codemode"], "automatic"), ["+grep", "-codemode"]);
  assert.deepEqual(withProjectCodemodePreference(["-codemode"], "inherit"), undefined);
  assert.deepEqual(withProjectCodemodePreference(undefined, "always"), ["+codemode"]);
  assert.deepEqual(withProjectCodemodePreference(["read", "codemode"], "automatic"), ["read"]);
});

test("effective tools apply project modifiers on the user's selection, and a plain project list replaces it", () => {
  assert.deepEqual(effectiveTools(["+codemode"], ["-codemode"]), ["read", "bash", "edit", "write"]);
  assert.deepEqual(effectiveTools(undefined, ["+codemode"]), ["read", "bash", "edit", "write", "codemode"]);
  assert.deepEqual(effectiveTools(["+codemode"], ["read"]), ["read"]);
});

const origin = "http://127.0.0.1:43123";
const json = { origin, "content-type": "application/json" };

test("the project's Code mode choices write .pi/settings.json and .pi/mcp.json; inherit removes them", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "pi-settings-codemode-project-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const agent = join(root, "agent"), project = join(root, "webapp");
  await mkdir(agent, { recursive: true });
  await mkdir(project, { recursive: true });
  await writeFile(join(agent, "settings.json"), JSON.stringify({ defaultTools: ["+codemode"], codemode: { inlineBudget: 100 } }));
  await writeFile(join(agent, "mcp.json"), JSON.stringify({ mcpServers: {}, autoEnableCodemode: false }));
  const app = createApp({ store: new ConfigStore({ global: agent }), agentDir: agent, projects: [project], origins: [origin] });
  const request = (path: string, init: RequestInit = {}) =>
    app.request(new Request(origin + path, { ...init, headers: { host: new URL(origin).host, ...init.headers } }));
  const q = `?project=${encodeURIComponent(project)}`;
  const view = async () => (await (await request(`/api/codemode${q}`)).json()) as Record<string, any>;
  const first = await view();
  assert.deepEqual([first.scope, first.preference, first.effective.preference, first.effective.inlineBudget, first.effective.autoEnableCodemode], ["project", "inherit", "always", 100, false]);
  const patch = async (body: object) => request(`/api/codemode${q}`, { method: "PATCH", headers: json, body: JSON.stringify({ revision: (await view()).revision, ...body }) });
  assert.equal((await patch({ preference: "automatic", mode: "only", inlineBudget: 0 })).status, 200);
  assert.deepEqual(JSON.parse(await readFile(join(project, ".pi", "settings.json"), "utf8")), { defaultTools: ["-codemode"], codemode: { mode: "only", inlineBudget: 0 } });
  assert.equal((await view()).effective.preference, "automatic");
  const mcp = await (await request(`/api/mcp/project${q}`)).json();
  assert.equal((await request(`/api/mcp/project/settings${q}`, { method: "PATCH", headers: json, body: JSON.stringify({ revision: mcp.revision, autoEnableCodemode: true }) })).status, 200);
  assert.equal(JSON.parse(await readFile(join(project, ".pi", "mcp.json"), "utf8")).autoEnableCodemode, true);
  assert.equal((await view()).effective.autoEnableCodemode, true);
  assert.equal((await patch({ preference: "inherit", mode: null, inlineBudget: null })).status, 200);
  assert.deepEqual(JSON.parse(await readFile(join(project, ".pi", "settings.json"), "utf8")), {});
  const mcp2 = await (await request(`/api/mcp/project${q}`)).json();
  await request(`/api/mcp/project/settings${q}`, { method: "PATCH", headers: json, body: JSON.stringify({ revision: mcp2.revision, autoEnableCodemode: null }) });
  assert.equal(JSON.parse(await readFile(join(project, ".pi", "mcp.json"), "utf8")).autoEnableCodemode, undefined);
});
