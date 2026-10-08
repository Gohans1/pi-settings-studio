import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from "node:fs/promises";
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
