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

async function fixture(t: import("node:test").TestContext, settings: object = {}) {
  const root = await mkdtemp(join(tmpdir(), "pi-settings-resource-paths-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const agent = join(root, "agent"), project = join(root, "webapp"), other = join(root, "other-tool", "skills");
  for (const [file, body] of <[string, string][]>[
    ["agent/skills/alpha/SKILL.md", skill("alpha")],
    ["agent/extra/beta/SKILL.md", skill("beta")],
    ["other-tool/skills/delta/SKILL.md", skill("delta")],
    ["other-tool/skills/epsilon/SKILL.md", skill("epsilon")],
    ["webapp/shared-skills/zeta/SKILL.md", skill("zeta")],
  ]) {
    await mkdir(join(root, file, ".."), { recursive: true });
    await writeFile(join(root, file), body);
  }
  await writeFile(join(agent, "settings.json"), JSON.stringify(settings));
  const app = createApp({ store: new ConfigStore({ global: agent }), agentDir: agent, projects: [project], origins: [origin] });
  const request = (path: string, init: RequestInit = {}) =>
    app.request(new Request(origin + path, { ...init, headers: { host: new URL(origin).host, ...init.headers } }));
  const read = async (file: string) => JSON.parse(await readFile(join(root, file), "utf8"));
  const paths = async (query = "") => (await (await request(`/api/resource-paths?type=skills${query}`)).json()) as {
    revision: string; projectRevision?: string;
    paths: { scope: string; entry: string; resolved: string; exists: boolean; found: number }[];
    standard: { scope: string; path: string; exists: boolean }[];
  };
  const send = (method: string, body: object, query = "") =>
    request(`/api/resource-paths${query}`, { method, headers: json, body: JSON.stringify({ type: "skills", ...body }) });
  const names = async (query = "") => ((await (await request(`/api/skills${query}`)).json()).skills as { name: string }[]).map(entry => entry.name).sort();
  return { root, agent, project, other, read, paths, send, names };
}

test("a folder Pi does not look in is added to settings.json, and Pi finds its skills", async (t) => {
  const { other, read, paths, send, names } = await fixture(t);
  const before = await paths();
  assert.deepEqual(before.paths, []);
  assert.ok(before.standard.some(place => place.path.endsWith(join("agent", "skills")) && place.exists));
  assert.deepEqual(await names(), ["alpha"]);
  const added = await send("POST", { scope: "global", revision: before.revision, path: other });
  assert.equal(added.status, 200);
  assert.deepEqual((await read("agent/settings.json")).skills, [other]);
  assert.deepEqual((await added.json()).paths, [{ scope: "global", entry: other, resolved: other, exists: true, kind: "folder", found: 2, replaces: 0, skipped: 0 }]);
  assert.deepEqual(await names(), ["alpha", "delta", "epsilon"]);
});

test("~ and the Agent Skills folder are those of the home Pi reads", async (t) => {
  const { paths, send } = await fixture(t);
  const home = process.env.HOME!;
  assert.ok((await paths()).standard.some(place => place.path === join(home, ".agents", "skills")));
  const { revision } = await paths();
  assert.equal((await send("POST", { scope: "global", revision, path: "~/shared-skills" })).status, 200);
  assert.equal((await paths()).paths.find(entry => entry.entry === "~/shared-skills")?.resolved, join(home, "shared-skills"));
});

test("a relative path resolves from the agent directory, as Pi resolves it", async (t) => {
  const { agent, paths, send } = await fixture(t);
  const response = await send("POST", { scope: "global", revision: (await paths()).revision, path: "extra" });
  const [entry] = (await response.json()).paths;
  assert.deepEqual([entry.entry, entry.resolved, entry.found], ["extra", join(agent, "extra"), 1]);
});

test("a path that does not exist yet is kept and reported as missing", async (t) => {
  const { root, paths, send } = await fixture(t);
  const response = await send("POST", { scope: "global", revision: (await paths()).revision, path: join(root, "later") });
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).paths.map((entry: { exists: boolean; found: number }) => [entry.exists, entry.found]), [[false, 0]]);
});

test("filters and patterns are refused, and removing a path keeps the filters", async (t) => {
  const { agent, other, read, paths, send } = await fixture(t);
  await writeFile(join(agent, "settings.json"), JSON.stringify({ skills: ["-skills/alpha/SKILL.md", other] }));
  const { revision } = await paths();
  for (const path of ["+skills/x", "-skills/x", "!skills/x", "skills/*", "line\nbreak", ""]) {
    assert.equal((await send("POST", { scope: "global", revision, path })).status, 422, path);
  }
  assert.equal((await send("DELETE", { scope: "global", revision, path: "-skills/alpha/SKILL.md" })).status, 422);
  assert.equal((await send("DELETE", { scope: "global", revision, path: "never-added" })).status, 404);
  const removed = await send("DELETE", { scope: "global", revision, path: other });
  assert.equal(removed.status, 200);
  assert.deepEqual((await read("agent/settings.json")).skills, ["-skills/alpha/SKILL.md"]);
});

test("adding a path twice changes nothing, and a stale revision writes nothing", async (t) => {
  const { other, read, paths, send } = await fixture(t, { skills: [] });
  const { revision } = await paths();
  assert.equal((await send("POST", { scope: "global", revision: "stale", path: other })).status, 409);
  assert.deepEqual((await read("agent/settings.json")).skills, []);
  const first = await (await send("POST", { scope: "global", revision, path: other })).json();
  assert.equal((await send("POST", { scope: "global", revision: first.revision, path: other })).status, 200);
  assert.deepEqual((await read("agent/settings.json")).skills, [other]);
});

test("in a project, paths go to its .pi/settings.json and resolve from .pi", async (t) => {
  const { project, read, paths, send, names } = await fixture(t);
  const q = `&project=${encodeURIComponent(project)}`;
  const view = await paths(q);
  assert.ok(view.standard.some(place => place.scope === "project" && place.path === join(project, ".pi", "skills")));
  const response = await send("POST", { scope: "project", revision: view.projectRevision, path: "../shared-skills" }, `?project=${encodeURIComponent(project)}`);
  assert.equal(response.status, 200);
  assert.deepEqual(await read("webapp/.pi/settings.json"), { skills: ["../shared-skills"] });
  assert.deepEqual(await read("agent/settings.json"), {});
  const [entry] = (await response.json()).paths;
  assert.deepEqual([entry.scope, entry.resolved, entry.found], ["project", join(project, "shared-skills"), 1]);
  assert.ok((await names(`?project=${encodeURIComponent(project)}`)).includes("zeta"));
});

test("a skill folder says how many of its skills replace a skill of the same name", async (t) => {
  const { other, paths, send } = await fixture(t);
  await mkdir(join(other, "alpha"), { recursive: true });
  await writeFile(join(other, "alpha", "SKILL.md"), skill("alpha"));
  const response = await send("POST", { scope: "global", revision: (await paths()).revision, path: other });
  const [entry] = (await response.json()).paths;
  // Pi reads settings paths before its own folder, so this folder's alpha replaces the agent's.
  assert.deepEqual([entry.found, entry.replaces, entry.skipped], [3, 1, 0]);
});
