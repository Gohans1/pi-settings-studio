import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConfigStore } from "../src/server/store.ts";
import { createApp } from "../src/server/app.ts";

const origin = "http://127.0.0.1:43123";
const json = { origin, "content-type": "application/json" };

async function fixture(t: import("node:test").TestContext) {
  const root = await mkdtemp(join(tmpdir(), "pi-settings-package-filters-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const agent = join(root, "agent"), project = join(root, "webapp");
  await mkdir(agent, { recursive: true });
  await mkdir(join(project, ".pi"), { recursive: true });
  await writeFile(join(agent, "settings.json"), JSON.stringify({ packages: ["npm:a", { source: "npm:b", skills: [] }] }));
  await writeFile(join(project, ".pi", "settings.json"), JSON.stringify({ packages: ["npm:c"] }));
  const app = createApp({ store: new ConfigStore({ global: agent }), agentDir: agent, projects: [project], origins: [origin] });
  const request = (path: string, init: RequestInit = {}) =>
    app.request(new Request(origin + path, { ...init, headers: { host: new URL(origin).host, ...init.headers } }));
  const q = `?project=${encodeURIComponent(project)}`;
  return { agent, project, request, q };
}

test("packages of both scopes are listed with their filters", async (t) => {
  const { request, q } = await fixture(t);
  const view = await (await request(`/api/plugins${q}`)).json();
  assert.deepEqual(view.packages.map((pkg: { scope: string; source: string; filters: object }) => [pkg.scope, pkg.source, pkg.filters]),
    [["global", "npm:a", {}], ["global", "npm:b", { skills: [] }], ["project", "npm:c", {}]]);
});

test("filters are written to the package entry, and an entry without filters goes back to a plain string", async (t) => {
  const { agent, project, request, q } = await fixture(t);
  const put = async (body: object) => {
    const view = await (await request(`/api/plugins${q}`)).json();
    const revision = (body as { scope: string }).scope === "project" ? view.projectRevision : view.revision;
    return request(`/api/plugins/packages${q}`, { method: "PUT", headers: json, body: JSON.stringify({ revision, ...body }) });
  };
  assert.equal((await put({ scope: "global", source: "npm:a", filters: { extensions: ["extensions/*.ts", "!extensions/legacy.ts"], prompts: [] } })).status, 200);
  assert.equal((await put({ scope: "global", source: "npm:b", filters: { skills: null } })).status, 200);
  assert.deepEqual(JSON.parse(await readFile(join(agent, "settings.json"), "utf8")).packages,
    [{ source: "npm:a", extensions: ["extensions/*.ts", "!extensions/legacy.ts"], prompts: [] }, "npm:b"]);
  assert.equal((await put({ scope: "project", source: "npm:c", filters: { autoload: false, themes: ["themes/dark.json"] } })).status, 200);
  assert.deepEqual(JSON.parse(await readFile(join(project, ".pi", "settings.json"), "utf8")).packages, [{ source: "npm:c", autoload: false, themes: ["themes/dark.json"] }]);
  assert.equal((await put({ scope: "global", source: "npm:missing", filters: {} })).status, 422);
});
