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
  const root = await mkdtemp(join(tmpdir(), "pi-settings-instructions-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const agent = join(root, "agent"), project = join(root, "repo", "webapp");
  await mkdir(agent, { recursive: true });
  await mkdir(project, { recursive: true });
  await writeFile(join(agent, "AGENTS.md"), "# Global rules\n");
  await writeFile(join(agent, "CLAUDE.md"), "# Ignored: AGENTS.md comes first\n");
  await writeFile(join(root, "repo", "AGENTS.md"), "# Repo rules\n");
  const app = createApp({ store: new ConfigStore({ global: agent }), agentDir: agent, projects: [project], origins: [origin] });
  const request = (path: string, init: RequestInit = {}) =>
    app.request(new Request(origin + path, { ...init, headers: { host: new URL(origin).host, ...init.headers } }));
  const q = `?project=${encodeURIComponent(project)}`;
  const view = async (suffix = q) => (await (await request(`/api/instructions${suffix}`)).json()) as { files: Array<Record<string, any>>; loaded: string[] };
  return { root, agent, project, request, q, view };
}

test("files are listed the way Pi picks them: the first context candidate per folder, ancestors included", async (t) => {
  const { root, agent, project, view } = await fixture(t);
  const { files, loaded } = await view();
  const byId = Object.fromEntries(files.map(file => [file.id, file]));
  assert.deepEqual([byId["global:context"].path, byId["global:context"].text, byId["global:context"].others], [join(agent, "AGENTS.md"), "# Global rules\n", ["CLAUDE.md"]]);
  assert.deepEqual([byId["global:system"].exists, byId["project:context"].path, byId["project:context"].exists], [false, join(project, "AGENTS.md"), false]);
  assert.deepEqual([byId["project:system"].path], [join(project, ".pi", "SYSTEM.md")]);
  assert.deepEqual(loaded, [join(agent, "AGENTS.md"), join(root, "repo", "AGENTS.md")]);
  assert.equal((await view("")).files.some(file => file.scope === "project"), false);
});

test("a file is created, edited with a revision check, removed and restored", async (t) => {
  const { project, request, q, view } = await fixture(t);
  const put = (id: string, revision: string, text: string) =>
    request(`/api/instructions/${id}${q}`, { method: "PUT", headers: json, body: JSON.stringify({ revision, text }) });
  const system = (await view()).files.find(file => file.id === "project:system")!;
  assert.equal((await put("project:system", system.revision, "You are a careful reviewer.\n")).status, 200);
  assert.equal(await readFile(join(project, ".pi", "SYSTEM.md"), "utf8"), "You are a careful reviewer.\n");
  assert.equal((await put("project:system", system.revision, "stale")).status, 409);
  const saved = (await view()).files.find(file => file.id === "project:system")!;
  assert.equal((await request(`/api/instructions/project:system${q}`, { method: "DELETE", headers: json, body: JSON.stringify({ revision: saved.revision }) })).status, 200);
  await assert.rejects(stat(join(project, ".pi", "SYSTEM.md")), { code: "ENOENT" });
  assert.equal((await request(`/api/instructions/project:system/restore${q}`, { method: "POST", headers: json, body: "{}" })).status, 200);
  assert.equal(await readFile(join(project, ".pi", "SYSTEM.md"), "utf8"), "You are a careful reviewer.\n");
});

test("unknown file ids and project ids without a project are refused", async (t) => {
  const { request } = await fixture(t);
  assert.equal((await request("/api/instructions/global:passwd", { method: "PUT", headers: json, body: JSON.stringify({ revision: "missing", text: "x" }) })).status, 400);
  assert.equal((await request("/api/instructions/project:system", { method: "PUT", headers: json, body: JSON.stringify({ revision: "missing", text: "x" }) })).status, 400);
});

test("long instruction files fit in a request", async (t) => {
  const { agent, request, view } = await fixture(t);
  const context = (await view("")).files.find(file => file.id === "global:context")!;
  const text = "rule\n".repeat(30_000);
  assert.equal((await request("/api/instructions/global:context", { method: "PUT", headers: json, body: JSON.stringify({ revision: context.revision, text }) })).status, 200);
  assert.equal((await readFile(join(agent, "AGENTS.md"), "utf8")).length, text.length);
});

test("a symlinked instruction file is reported on its own, without hiding the others", async (t) => {
  const { root, agent, view } = await fixture(t);
  const { symlink } = await import("node:fs/promises");
  await writeFile(join(root, "elsewhere.md"), "outside");
  await symlink(join(root, "elsewhere.md"), join(agent, "SYSTEM.md"));
  const files = (await view("")).files;
  assert.match(files.find(file => file.id === "global:system")!.error, /Symbolic link/);
  assert.equal(files.find(file => file.id === "global:context")!.text, "# Global rules\n");
});
