import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConfigStore } from "../src/server/store.ts";
import { createApp } from "../src/server/app.ts";

const origin = "http://127.0.0.1:43123";
const json = { origin, "content-type": "application/json" };

async function fixture(t: import("node:test").TestContext) {
  const root = await mkdtemp(join(tmpdir(), "pi-settings-agents-project-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const agent = join(root, "agent"), project = join(root, "webapp");
  await mkdir(join(agent, "agents"), { recursive: true });
  await mkdir(join(project, ".pi", "agents"), { recursive: true });
  await writeFile(join(agent, "agents", "scout.md"), "---\nname: scout\ndescription: User scout\n---\nUser.\n");
  await writeFile(join(project, ".pi", "agents", "scout.md"), "---\nname: scout\ndescription: Project scout\n---\nProject.\n");
  const app = createApp({ store: new ConfigStore({ global: agent }), agentDir: agent, projects: [project], origins: [origin] });
  const request = (path: string, init: RequestInit = {}) =>
    app.request(new Request(origin + path, { ...init, headers: { host: new URL(origin).host, ...init.headers } }));
  return { agent, project, request, q: `project=${encodeURIComponent(project)}` };
}

test("project profiles are listed next to the user's; the project one wins on a name clash", async (t) => {
  const { request, q } = await fixture(t);
  const view = await (await request(`/api/agents?${q}`)).json();
  const scouts = view.agents.filter((entry: { name: string }) => entry.name === "scout").map((entry: { scope: string; description: string; shadowed?: boolean }) => [entry.scope, entry.description, !!entry.shadowed]);
  assert.deepEqual(scouts, [["user", "User scout", true], ["project", "Project scout", false]]);
});

test("profiles are created, edited and removed in the project's .pi/agents", async (t) => {
  const { agent, project, request, q } = await fixture(t);
  const profile = { name: "reviewer", description: "Reviews", tools: [], prompt: "Review." };
  assert.equal((await request(`/api/agents?scope=project&${q}`, { method: "POST", headers: json, body: JSON.stringify(profile) })).status, 200);
  assert.match(await readFile(join(project, ".pi", "agents", "reviewer.md"), "utf8"), /description: Reviews/);
  await assert.rejects(stat(join(agent, "agents", "reviewer.md")), { code: "ENOENT" });
  const view = await (await request(`/api/agents?${q}`)).json();
  const reviewer = view.agents.find((entry: { name: string }) => entry.name === "reviewer");
  assert.equal((await request(`/api/agents/reviewer.md?scope=project&${q}`, { method: "PUT", headers: json,
    body: JSON.stringify({ ...profile, description: "Reviews diffs", revision: reviewer.revision }) })).status, 200);
  assert.match(await readFile(join(project, ".pi", "agents", "reviewer.md"), "utf8"), /description: Reviews diffs/);
  const again = (await (await request(`/api/agents?${q}`)).json()).agents.find((entry: { name: string }) => entry.name === "reviewer");
  assert.equal((await request(`/api/agents/reviewer.md?scope=project&${q}`, { method: "DELETE", headers: json, body: JSON.stringify({ revision: again.revision }) })).status, 200);
  await assert.rejects(stat(join(project, ".pi", "agents", "reviewer.md")), { code: "ENOENT" });
  assert.equal((await request(`/api/agents?scope=project`, { method: "POST", headers: json, body: JSON.stringify(profile) })).status, 400);
});
