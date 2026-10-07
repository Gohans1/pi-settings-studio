import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConfigStore } from "../src/server/store.ts";
import { createApp } from "../src/server/app.ts";

const origin = "http://127.0.0.1:43123";
const json = { origin, "content-type": "application/json" };
const skill = (name: string) => `---\nname: ${name}\ndescription: ${name} skill.\n---\n# ${name}\n`;

async function fixture(t: import("node:test").TestContext) {
  const root = await mkdtemp(join(tmpdir(), "pi-settings-resources-project-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const agent = join(root, "agent"), project = join(root, "webapp");
  for (const [file, body] of <[string, string][]>[
    ["agent/skills/alpha/SKILL.md", skill("alpha")],
    ["webapp/.pi/skills/delta/SKILL.md", skill("delta")],
    ["webapp/.pi/prompts/ship.md", "---\ndescription: Ship it\n---\nShip.\n"],
  ]) {
    await mkdir(join(root, file, ".."), { recursive: true });
    await writeFile(join(root, file), body);
  }
  await writeFile(join(agent, "settings.json"), "{}");
  const app = createApp({ store: new ConfigStore({ global: agent }), agentDir: agent, projects: [project], origins: [origin] });
  const request = (path: string, init: RequestInit = {}) =>
    app.request(new Request(origin + path, { ...init, headers: { host: new URL(origin).host, ...init.headers } }));
  const q = `?project=${encodeURIComponent(project)}`;
  const read = async (file: string) => JSON.parse(await readFile(join(root, file), "utf8"));
  return { request, q, read };
}

test("with a project, its .pi skills are listed next to the user's and switched in the project file", async (t) => {
  const { request, q, read } = await fixture(t);
  const view = await (await request(`/api/skills${q}`)).json();
  const delta = view.skills.find((entry: { name: string }) => entry.name === "delta");
  assert.deepEqual([delta.scope, view.skills.find((entry: { name: string }) => entry.name === "alpha").scope], ["project", "user"]);
  const off = await request(`/api/skills${q}`, { method: "PATCH", headers: json,
    body: JSON.stringify({ scope: "project", revision: view.projectRevision, paths: [delta.path], enabled: false }) });
  assert.equal(off.status, 200);
  assert.deepEqual(await read("webapp/.pi/settings.json"), { skills: ["-skills/delta/SKILL.md"] });
  assert.deepEqual(await read("agent/settings.json"), {});
  assert.equal((await off.json()).skills.find((entry: { name: string }) => entry.name === "delta").enabled, false);
});

test("a resource is only switched in the file of its own scope", async (t) => {
  const { request, q, read } = await fixture(t);
  const view = await (await request(`/api/skills${q}`)).json();
  const alpha = view.skills.find((entry: { name: string }) => entry.name === "alpha");
  const wrong = await request(`/api/skills${q}`, { method: "PATCH", headers: json,
    body: JSON.stringify({ scope: "project", revision: view.projectRevision, paths: [alpha.path], enabled: false }) });
  assert.equal(wrong.status, 422);
  assert.deepEqual(await read("agent/settings.json"), {});
});

test("project prompts appear in Plugins and switch in the project file", async (t) => {
  const { request, q, read } = await fixture(t);
  const view = await (await request(`/api/plugins${q}`)).json();
  const ship = view.resources.find((entry: { name: string }) => entry.name === "ship");
  assert.equal(ship.scope, "project");
  const off = await request(`/api/plugins${q}`, { method: "PATCH", headers: json,
    body: JSON.stringify({ scope: "project", revision: view.projectRevision, items: [{ type: "prompts", path: ship.path }], enabled: false }) });
  assert.equal(off.status, 200);
  assert.deepEqual(await read("webapp/.pi/settings.json"), { prompts: ["-prompts/ship.md"] });
});
