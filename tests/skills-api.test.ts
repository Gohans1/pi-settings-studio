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
  assert.deepEqual((await settings()).skills, ["-skills/alpha/SKILL.md", "-skills/beta/SKILL.md"]);
});
