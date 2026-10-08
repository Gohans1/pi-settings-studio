import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConfigStore } from "../src/server/store.ts";
import { createApp } from "../src/server/app.ts";

const origin = "http://127.0.0.1:43123";
const json = { origin, "content-type": "application/json" };

async function fixture(t: import("node:test").TestContext) {
  const root = await mkdtemp(join(tmpdir(), "pi-settings-resource-files-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const agent = join(root, "agent"), project = join(root, "webapp");
  for (const [file, body] of <[string, string][]>[
    ["skills/demo/SKILL.md", "---\nname: demo\ndescription: Demo skill\n---\nDo the demo.\n"],
    ["skills/demo/scripts/run.sh", "echo demo\n"],
    ["prompts/review.md", "---\ndescription: Review\n---\nReview it.\n"],
    ["pkgs/my-pack/package.json", JSON.stringify({ name: "my-pack" })],
    ["pkgs/my-pack/prompts/packed.md", "Packed prompt.\n"],
    ["outside.txt", "not a skill file\n"],
  ]) {
    await mkdir(join(agent, file, ".."), { recursive: true });
    await writeFile(join(agent, file), body);
  }
  await symlink(join(agent, "outside.txt"), join(agent, "skills/demo/escape.txt"));
  await symlink(join(agent, "outside.txt"), join(agent, "prompts/linked.md"));
  await writeFile(join(agent, "settings.json"), JSON.stringify({ packages: ["./pkgs/my-pack"] }));
  await mkdir(project, { recursive: true });
  const app = createApp({ store: new ConfigStore({ global: agent }), agentDir: agent, projects: [project], origins: [origin] });
  const request = (path: string, init: RequestInit = {}) =>
    app.request(new Request(origin + path, { ...init, headers: { host: new URL(origin).host, ...init.headers } }));
  const get = (type: string, path: string, file?: string) =>
    request(`/api/resource-files?type=${type}&path=${encodeURIComponent(path)}${file ? `&file=${encodeURIComponent(file)}` : ""}`);
  const put = (body: object) => request("/api/resource-files", { method: "PUT", headers: json, body: JSON.stringify(body) });
  const create = (body: object, query = "") => request(`/api/resource-files${query}`, { method: "POST", headers: json, body: JSON.stringify(body) });
  return { agent, project, request, get, put, create };
}

test("a discovered skill is read with the other files of its folder, and saved", async (t) => {
  const { agent, get, put } = await fixture(t);
  const skill = join(agent, "skills/demo/SKILL.md");
  const view = await (await get("skills", skill)).json();
  assert.equal(view.editable, true);
  assert.match(view.text, /Do the demo/);
  assert.deepEqual(view.files, ["SKILL.md", "scripts/run.sh"]);
  const script = await (await get("skills", skill, "scripts/run.sh")).json();
  assert.equal(script.text, "echo demo\n");
  assert.equal((await put({ type: "skills", path: skill, file: "scripts/run.sh", revision: script.revision, text: "echo changed\n" })).status, 200);
  assert.equal(await readFile(join(agent, "skills/demo/scripts/run.sh"), "utf8"), "echo changed\n");
  assert.equal((await put({ type: "skills", path: skill, file: "scripts/run.sh", revision: script.revision, text: "stale\n" })).status, 409);
  // The private backup of the previous version is not one of the skill's files.
  assert.deepEqual((await (await get("skills", skill)).json()).files, ["SKILL.md", "scripts/run.sh"]);
});

test("only files Pi discovers are opened: no traversal, no symlink escape, no package edits", async (t) => {
  const { agent, get, put } = await fixture(t);
  const skill = join(agent, "skills/demo/SKILL.md");
  assert.equal((await get("skills", join(agent, "settings.json"))).status, 404);
  assert.equal((await get("skills", skill, "../../settings.json")).status, 400);
  assert.equal((await get("skills", skill, "escape.txt")).status, 400);
  const packed = join(agent, "pkgs/my-pack/prompts/packed.md");
  const view = await (await get("prompts", packed)).json();
  assert.deepEqual([view.editable, view.text], [false, "Packed prompt.\n"]);
  assert.match(view.readOnly, /package/);
  const linked = await (await get("prompts", join(agent, "prompts/linked.md"))).json();
  assert.deepEqual([linked.editable, linked.text], [false, "not a skill file\n"]);
  assert.match(linked.readOnly, /symbolic link to .*outside\.txt/);
  const refused = await put({ type: "prompts", path: packed, revision: view.revision, text: "changed" });
  assert.equal(refused.status, 422);
  assert.equal(await readFile(packed, "utf8"), "Packed prompt.\n");
});

test("new resources are created where Pi looks for them, globally or in the project", async (t) => {
  const { agent, project, request, create } = await fixture(t);
  assert.equal((await create({ scope: "global", type: "skills", name: "my-skill", description: "Does my thing" })).status, 200);
  assert.equal(await readFile(join(agent, "skills/my-skill/SKILL.md"), "utf8"), "---\nname: my-skill\ndescription: Does my thing\n---\n\n");
  const skills = await (await request("/api/skills")).json();
  assert.ok(skills.skills.some((skill: { name: string }) => skill.name === "my-skill"));
  assert.equal((await create({ scope: "global", type: "prompts", name: "fix", description: "Fix it" })).status, 200);
  assert.equal(await readFile(join(agent, "prompts/fix.md"), "utf8"), "---\ndescription: Fix it\n---\n\n");
  assert.equal((await create({ scope: "global", type: "themes", name: "sea" })).status, 200);
  const theme = JSON.parse(await readFile(join(agent, "themes/sea.json"), "utf8"));
  assert.equal(theme.name, "sea");
  assert.ok(theme.colors.accent !== undefined);
  const themePath = join(agent, "themes/sea.json");
  const opened = await (await request(`/api/resource-files?type=themes&path=${encodeURIComponent(themePath)}`)).json();
  const broken = await request("/api/resource-files", { method: "PUT", headers: json, body: JSON.stringify({ type: "themes", path: themePath, revision: opened.revision, text: "{ nope" }) });
  assert.equal(broken.status, 422);
  assert.match((await broken.json()).error, /JSON/);
  assert.equal((await create({ scope: "global", type: "extensions", name: "hello" })).status, 200);
  assert.match(await readFile(join(agent, "extensions/hello.ts"), "utf8"), /export default function \(pi: ExtensionAPI\)/);
  const q = `?project=${encodeURIComponent(project)}`;
  assert.equal((await create({ scope: "project", type: "skills", name: "team-skill", description: "Team" }, q)).status, 200);
  assert.match(await readFile(join(project, ".pi/skills/team-skill/SKILL.md"), "utf8"), /name: team-skill/);
  assert.equal((await create({ scope: "global", type: "skills", name: "Bad Name", description: "x" })).status, 422);
  assert.equal((await create({ scope: "global", type: "prompts", name: "fix", description: "again" })).status, 409);
});
