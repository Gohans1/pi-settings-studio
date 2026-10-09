import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConfigStore } from "../src/server/store.ts";
import { createApp } from "../src/server/app.ts";

const origin = "http://127.0.0.1:43123";
const json = { origin, "content-type": "application/json" };
const skill = (name: string, description: string, extra = "") => `---\nname: ${name}\ndescription: ${description}\n${extra}---\n# ${name}\n`;

async function fixture(t: import("node:test").TestContext) {
  const root = await mkdtemp(join(tmpdir(), "pi-settings-skills-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const agent = join(root, "agent");
  for (const [dir, body] of <[string, string][]>[
    ["skills/alpha", skill("alpha", "Alpha does things.")],
    ["skills/beta", skill("beta", "Beta only by command.", "disable-model-invocation: true\n")],
    ["pkgs/my-pack/skills/gamma", skill("gamma", "Gamma from a package.")],
  ]) {
    await mkdir(join(agent, dir), { recursive: true });
    await writeFile(join(agent, dir, "SKILL.md"), body);
  }
  await writeFile(join(agent, "pkgs/my-pack/package.json"), JSON.stringify({ name: "my-pack" }));
  await writeFile(join(agent, "settings.json"), JSON.stringify({ packages: ["./pkgs/my-pack"], theme: "dark" }));
  const app = createApp({ store: new ConfigStore({ global: agent, project: join(root, "p", ".pi") }), agentDir: agent, origins: [origin] });
  const request = (path: string, init: RequestInit = {}) =>
    app.request(new Request(origin + path, { ...init, headers: { host: new URL(origin).host, ...init.headers } }));
  const settings = async () => JSON.parse(await readFile(join(agent, "settings.json"), "utf8"));
  const skills = async () => (await (await request("/api/skills")).json()) as { revision: string; skills: Array<Record<string, unknown>> };
  const toggle = async (name: string, enabled: boolean) => {
    const view = await skills();
    const target = view.skills.find(entry => entry.name === name)!;
    return request("/api/skills", { method: "PATCH", headers: json, body: JSON.stringify({ revision: view.revision, paths: [target.path], enabled }) });
  };
  return { agent, request, settings, skills, toggle };
}

test("skills in the Agent Skills folder of the home Pi reads are listed under ~/.agents, as pi config labels them", async (t) => {
  // Pi takes the home folder from HOME when it runs; the app labels it from the same one.
  const home = await mkdtemp(join(tmpdir(), "pi-settings-skills-home-")), before = process.env.HOME;
  process.env.HOME = home;
  t.after(async () => { process.env.HOME = before; await rm(home, { recursive: true, force: true }); });
  await mkdir(join(home, ".agents/skills/delta"), { recursive: true });
  await writeFile(join(home, ".agents/skills/delta/SKILL.md"), skill("delta", "Delta from the Agent Skills folder."));
  const { skills } = await fixture(t);
  assert.equal((await skills()).skills.find(entry => entry.name === "delta")?.group, "User (~/.agents/)");
});

test("user and package skills are listed as Pi resolves them, without installing or writing anything", async (t) => {
  const { agent, skills } = await fixture(t);
  const before = (await readdir(agent, { recursive: true })).sort();
  const view = await skills();
  const byName = Object.fromEntries(view.skills.map(entry => [entry.name, entry]));
  assert.deepEqual(Object.keys(byName).sort(), ["alpha", "beta", "gamma"]);
  assert.deepEqual([byName.alpha!.description, byName.alpha!.enabled, byName.alpha!.origin], ["Alpha does things.", true, "top-level"]);
  assert.equal(byName.beta!.disableModelInvocation, true);
  assert.deepEqual([byName.gamma!.origin, byName.gamma!.group], ["package", "./pkgs/my-pack (user)"]);
  assert.deepEqual((await readdir(agent, { recursive: true })).sort(), before);
});

test("turning a user skill off and on writes pi config's patterns, and Pi's resolver agrees", async (t) => {
  const { settings, skills, toggle } = await fixture(t);
  assert.equal((await toggle("alpha", false)).status, 200);
  assert.deepEqual((await settings()).skills, ["-skills/alpha/SKILL.md"]);
  assert.equal((await settings()).theme, "dark");
  assert.equal((await skills()).skills.find(entry => entry.name === "alpha")!.enabled, false);
  assert.equal((await toggle("alpha", true)).status, 200);
  assert.deepEqual((await settings()).skills, ["+skills/alpha/SKILL.md"]);
  assert.equal((await skills()).skills.find(entry => entry.name === "alpha")!.enabled, true);
});

test("a package skill is turned off inside the package's own filter", async (t) => {
  const { settings, skills, toggle } = await fixture(t);
  assert.equal((await toggle("gamma", false)).status, 200);
  assert.deepEqual((await settings()).packages, [{ source: "./pkgs/my-pack", skills: ["-skills/gamma/SKILL.md"] }]);
  assert.equal((await skills()).skills.find(entry => entry.name === "gamma")!.enabled, false);
});

test("unknown skills and stale revisions change nothing", async (t) => {
  const { request, settings, skills } = await fixture(t);
  const before = await settings();
  const { revision } = await skills();
  const patch = (body: object) => request("/api/skills", { method: "PATCH", headers: json, body: JSON.stringify(body) });
  assert.equal((await patch({ revision, paths: ["/etc/passwd"], enabled: false })).status, 422);
  assert.equal((await patch({ revision: "stale", paths: ["/x"], enabled: false })).status, 409);
  assert.deepEqual(await settings(), before);
});

test("a whole group is switched in one write", async (t) => {
  const { request, settings, skills } = await fixture(t);
  const view = await skills();
  const paths = view.skills.filter(entry => entry.origin === "top-level").map(entry => entry.path);
  const response = await request("/api/skills", { method: "PATCH", headers: json, body: JSON.stringify({ revision: view.revision, paths, enabled: false }) });
  assert.equal(response.status, 200);
  // Discovery order follows the filesystem (tmpfs lists newest first); the order of distinct exclusions does not matter to Pi.
  assert.deepEqual([...(await settings()).skills].sort(), ["-skills/alpha/SKILL.md", "-skills/beta/SKILL.md"]);
});

test("when two skills share a name, the copy Pi skips says which one Pi loads instead", async (t) => {
  const { agent, request, skills } = await fixture(t);
  const other = join(agent, "..", "other-tool", "skills");
  await mkdir(join(other, "alpha"), { recursive: true });
  await writeFile(join(other, "alpha", "SKILL.md"), skill("alpha", "Another alpha."));
  await writeFile(join(agent, "settings.json"), JSON.stringify({ packages: ["./pkgs/my-pack"], skills: [other] }));
  const copies = (await skills()).skills.filter(entry => entry.name === "alpha");
  assert.equal(copies.length, 2);
  // Pi reads settings paths before its own folders, so the added folder's copy wins.
  const winner = copies.find(entry => !entry.shadowedBy)!, loser = copies.find(entry => entry.shadowedBy)!;
  assert.ok(String(winner.path).startsWith(other));
  assert.equal(loser.shadowedBy, winner.path);
  // A skill that is off takes no part: then the other copy loads.
  await request("/api/skills", { method: "PATCH", headers: json, body: JSON.stringify({ revision: (await skills()).revision, paths: [winner.path], enabled: false }) });
  assert.ok((await skills()).skills.filter(entry => entry.name === "alpha").every(entry => !entry.shadowedBy));
});

test("whether the model may load a skill is one frontmatter line, and nothing else in the file changes", async (t) => {
  const { agent, request, skills } = await fixture(t);
  const file = join(agent, "skills/alpha/SKILL.md");
  const before = await readFile(file, "utf8");
  const set = async (name: string, modelInvocation: boolean) => {
    const target = (await skills()).skills.find(entry => entry.name === name)!;
    return request("/api/resource-files/invocation", { method: "PATCH", headers: json, body: JSON.stringify({ paths: [target.path], modelInvocation }) });
  };
  assert.equal((await set("alpha", false)).status, 200);
  assert.equal(await readFile(file, "utf8"), before.replace("---\n# alpha", "disable-model-invocation: true\n---\n# alpha"));
  assert.equal((await skills()).skills.find(entry => entry.name === "alpha")!.disableModelInvocation, true);
  assert.equal((await set("alpha", true)).status, 200);
  assert.equal(await readFile(file, "utf8"), before);
  // beta was written with the key already; turning it on removes that line.
  assert.equal((await set("beta", true)).status, 200);
  assert.doesNotMatch(await readFile(join(agent, "skills/beta/SKILL.md"), "utf8"), /disable-model-invocation/);
  // A package skill is changed at its source.
  const gamma = join(agent, "pkgs/my-pack/skills/gamma/SKILL.md"), packaged = await readFile(gamma, "utf8");
  assert.equal((await set("gamma", false)).status, 422);
  assert.equal(await readFile(gamma, "utf8"), packaged);
});

test("many skills change how the model reaches them in one request, which names the files it changed", async (t) => {
  const { agent, request, skills } = await fixture(t);
  await mkdir(join(agent, "skills/delta"), { recursive: true });
  await writeFile(join(agent, "skills/delta/SKILL.md"), skill("delta", "Delta does more."));
  const read = (name: string) => readFile(join(agent, "skills", name, "SKILL.md"), "utf8");
  const before = { alpha: await read("alpha"), beta: await read("beta"), delta: await read("delta") };
  const paths = (await skills()).skills.filter(entry => entry.origin === "top-level").map(entry => String(entry.path));
  const set = (list: string[], modelInvocation: boolean) =>
    request("/api/resource-files/invocation", { method: "PATCH", headers: json, body: JSON.stringify({ paths: list, modelInvocation }) });

  const response = await set(paths, false);
  assert.equal(response.status, 200);
  const { changed } = await response.json() as { changed: string[] };
  // beta was command-only already: its file is not touched, and it is not named.
  assert.deepEqual([...changed].sort(), [join(agent, "skills/alpha/SKILL.md"), join(agent, "skills/delta/SKILL.md")]);
  assert.equal(await read("beta"), before.beta);
  assert.ok((await skills()).skills.filter(entry => entry.origin === "top-level").every(entry => entry.disableModelInvocation === true));
  // Sending the named files back restores exactly the earlier state.
  assert.equal((await set(changed, true)).status, 200);
  assert.deepEqual({ alpha: await read("alpha"), beta: await read("beta"), delta: await read("delta") }, before);
});

test("one skill that cannot change stops the whole batch before any file is written", async (t) => {
  const { agent, request, skills } = await fixture(t);
  const alpha = join(agent, "skills/alpha/SKILL.md"), original = await readFile(alpha, "utf8");
  const view = await skills();
  const path = (name: string) => String(view.skills.find(entry => entry.name === name)!.path);
  const set = (paths: string[]) => request("/api/resource-files/invocation", { method: "PATCH", headers: json, body: JSON.stringify({ paths, modelInvocation: false }) });
  // A package skill, a file Pi does not discover, a SKILL.md without frontmatter.
  const refused = await set([path("alpha"), path("gamma")]);
  assert.equal(refused.status, 422);
  assert.match((await refused.json() as { error: string }).error, /gamma/);
  assert.equal((await set([path("alpha"), "/etc/passwd"])).status, 404);
  await mkdir(join(agent, "skills/plain"), { recursive: true });
  await writeFile(join(agent, "skills/plain/SKILL.md"), "# No frontmatter\n");
  const plain = String((await skills()).skills.find(entry => String(entry.path).includes("plain"))!.path);
  const bare = await set([path("alpha"), plain]);
  assert.equal(bare.status, 422);
  assert.match((await bare.json() as { error: string }).error, /plain/);
  assert.equal(await readFile(alpha, "utf8"), original);
});

const remove = (request: (path: string, init?: RequestInit) => Response | Promise<Response>, path: string, action: "skill" | "skill/restore" = "skill", query = "") =>
  request(`/api/resource-files/${action}${query}`, { method: action === "skill" ? "DELETE" : "POST", headers: json, body: JSON.stringify({ path }) });

test("removing a user skill takes its whole folder out of every place Pi looks, and restoring puts it back as it was", async (t) => {
  const { agent, request, skills } = await fixture(t);
  await mkdir(join(agent, "skills/alpha/references"), { recursive: true });
  await writeFile(join(agent, "skills/alpha/references/notes.md"), "Notes.\n");
  const path = join(agent, "skills/alpha/SKILL.md"), original = await readFile(path, "utf8");
  assert.equal((await remove(request, path)).status, 204);
  assert.deepEqual((await skills()).skills.map(entry => entry.name).sort(), ["beta", "gamma"]);
  // Nothing is left beside the other skills, not even a hidden copy another agent could pick up.
  assert.deepEqual(await readdir(join(agent, "skills")), ["beta"]);
  assert.equal((await remove(request, path, "skill/restore")).status, 204);
  assert.equal(await readFile(path, "utf8"), original);
  assert.equal(await readFile(join(agent, "skills/alpha/references/notes.md"), "utf8"), "Notes.\n");
  assert.ok((await skills()).skills.some(entry => entry.name === "alpha"));
  // The kept copy went back: a second restore has nothing to bring.
  assert.equal((await remove(request, path, "skill/restore")).status, 404);
});

test("a skill that is one Markdown file is removed alone, and only the newest removed copy is kept", async (t) => {
  const { agent, request, skills } = await fixture(t);
  const solo = join(agent, "skills/solo.md");
  await writeFile(solo, skill("solo", "First solo."));
  assert.equal((await remove(request, solo)).status, 204);
  await writeFile(solo, skill("solo", "Second solo."));
  assert.equal((await remove(request, solo)).status, 204);
  assert.deepEqual((await readdir(join(agent, "skills"))).sort(), ["alpha", "beta"]);
  assert.equal((await remove(request, solo, "skill/restore")).status, 204);
  assert.equal(await readFile(solo, "utf8"), skill("solo", "Second solo."));
  assert.ok((await skills()).skills.some(entry => entry.name === "solo"));
});

test("only a skill inside a skills folder is removed: packages, settings paths, links and Pi's own folders are refused", async (t) => {
  const { agent, request, skills } = await fixture(t);
  const root = join(agent, "..");
  // A settings path that is itself one skill, and a skill reached through a symbolic link.
  await mkdir(join(root, "single"), { recursive: true });
  await writeFile(join(root, "single/SKILL.md"), skill("single", "Added by path."));
  await mkdir(join(root, "elsewhere/linked"), { recursive: true });
  await writeFile(join(root, "elsewhere/linked/SKILL.md"), skill("linked", "Through a link."));
  await symlink(join(root, "elsewhere/linked"), join(agent, "skills/linked"));
  await writeFile(join(agent, "settings.json"), JSON.stringify({ packages: ["./pkgs/my-pack"], skills: [join(root, "single")] }));
  const path = async (name: string) => String((await skills()).skills.find(entry => entry.name === name)!.path);
  for (const [name, reason] of <[string, RegExp][]>[["gamma", /From the package/], ["single", /place to find skills.*Folders/], ["linked", /symbolic link/]]) {
    const response = await remove(request, await path(name));
    assert.equal(response.status, 422, name);
    assert.match((await response.json() as { error: string }).error, reason);
  }
  assert.equal((await remove(request, "/etc/passwd")).status, 404);
  // SKILL.md straight in Pi's skills folder makes Pi read the folder as one skill; removing it would take every skill with it.
  await writeFile(join(agent, "skills/SKILL.md"), skill("everything", "The whole folder."));
  const everything = await remove(request, await path("everything"));
  assert.equal(everything.status, 422);
  assert.match((await everything.json() as { error: string }).error, /place to find skills/);
  // Restore only brings back what this app removed, and needs an absolute path.
  assert.equal((await remove(request, join(agent, "skills/never/SKILL.md"), "skill/restore")).status, 404);
  assert.equal((await remove(request, "skills/alpha/SKILL.md", "skill/restore")).status, 400);
  assert.deepEqual((await readdir(join(agent, "skills"))).sort(), ["SKILL.md", "alpha", "beta", "linked"]);
  assert.equal(await readFile(join(root, "single/SKILL.md"), "utf8"), skill("single", "Added by path."));
  assert.equal(await readFile(join(root, "elsewhere/linked/SKILL.md"), "utf8"), skill("linked", "Through a link."));
  assert.equal(await readFile(join(agent, "pkgs/my-pack/skills/gamma/SKILL.md"), "utf8"), skill("gamma", "Gamma from a package."));
});

test("a project's own skills are removed the same way, and the project's skill places are refused", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "pi-settings-skills-project-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const agent = join(root, "agent"), project = join(root, "webapp");
  await mkdir(agent, { recursive: true });
  for (const [dir, body] of <[string, string][]>[[".pi/skills/local", skill("local", "Project skill.")], ["tools/kit", skill("kit", "Added by the project's settings.")]]) {
    await mkdir(join(project, dir), { recursive: true });
    await writeFile(join(project, dir, "SKILL.md"), body);
  }
  await writeFile(join(project, ".pi/settings.json"), JSON.stringify({ skills: ["../tools/kit"] }));
  const app = createApp({ store: new ConfigStore({ global: agent }), agentDir: agent, projects: [project], origins: [origin] });
  const request = (path: string, init: RequestInit = {}) => app.request(new Request(origin + path, { ...init, headers: { host: new URL(origin).host, ...init.headers } }));
  const q = `?project=${encodeURIComponent(project)}`;
  const path = async (name: string) => String(((await (await request(`/api/skills${q}`)).json()) as { skills: Array<Record<string, unknown>> }).skills.find(entry => entry.name === name)!.path);

  const kit = await remove(request, await path("kit"), "skill", q);
  assert.equal(kit.status, 422);
  assert.match((await kit.json() as { error: string }).error, /place to find skills/);
  const local = await path("local");
  assert.equal((await remove(request, local, "skill", q)).status, 204);
  assert.deepEqual(await readdir(join(project, ".pi/skills")), []);
  assert.equal((await remove(request, local, "skill/restore", q)).status, 204);
  assert.equal(await readFile(local, "utf8"), skill("local", "Project skill."));
  await writeFile(join(project, ".pi/skills/SKILL.md"), skill("everything", "The project's whole folder."));
  const everything = await remove(request, await path("everything"), "skill", q);
  assert.equal(everything.status, 422);
  assert.match((await everything.json() as { error: string }).error, /place to find skills/);
  assert.equal(await readFile(join(project, "tools/kit/SKILL.md"), "utf8"), skill("kit", "Added by the project's settings."));
});

test("a SKILL.md with Windows line endings keeps them, and its invocation line can be taken out again", async (t) => {
  const { agent, request, skills } = await fixture(t);
  const file = join(agent, "skills/alpha/SKILL.md");
  const crlf = skill("alpha", "Alpha does things.").replaceAll("\n", "\r\n");
  await writeFile(file, crlf);
  const path = String((await skills()).skills.find(entry => entry.name === "alpha")!.path);
  const set = (modelInvocation: boolean) => request("/api/resource-files/invocation", { method: "PATCH", headers: json, body: JSON.stringify({ paths: [path], modelInvocation }) });
  assert.equal((await set(false)).status, 200);
  assert.equal(await readFile(file, "utf8"), crlf.replace("---\r\n# alpha", "disable-model-invocation: true\r\n---\r\n# alpha"));
  assert.equal((await set(true)).status, 200);
  assert.equal(await readFile(file, "utf8"), crlf);
});
