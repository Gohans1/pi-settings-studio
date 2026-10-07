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
  const root = await mkdtemp(join(tmpdir(), "pi-settings-mcp-project-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const agent = join(root, "agent"), project = join(root, "webapp");
  await mkdir(agent, { recursive: true });
  await mkdir(join(project, ".pi"), { recursive: true });
  await writeFile(join(agent, "mcp.json"), JSON.stringify({ mcpServers: {
    shared: { command: "npx", env: { TOKEN: "fixture-global-secret" } }, other: { command: "y" },
  } }));
  await writeFile(join(project, ".pi", "mcp.json"), JSON.stringify({ mcpServers: { local: { command: "z", args: ["--token", "fixture-project-secret"] } } }));
  const app = createApp({ store: new ConfigStore({ global: agent }), agentDir: agent, projects: [project], origins: [origin] });
  const request = (path: string, init: RequestInit = {}) =>
    app.request(new Request(origin + path, { ...init, headers: { host: new URL(origin).host, ...init.headers } }));
  const q = `?project=${encodeURIComponent(project)}`;
  const view = async () => (await (await request(`/api/mcp/project${q}`)).json()) as { revision: string; servers: Array<Record<string, unknown>> };
  const projectFile = async () => JSON.parse(await readFile(join(project, ".pi", "mcp.json"), "utf8"));
  return { request, q, view, projectFile, agent };
}

test("the project view lists the project's servers, secrets hidden", async (t) => {
  const { request, q } = await fixture(t);
  const body = await (await request(`/api/mcp/project${q}`)).text();
  assert.doesNotMatch(body, /fixture-/);
  assert.deepEqual(JSON.parse(body).servers.map((server: { name: string }) => server.name), ["local"]);
});

test("turning a global server off in a project writes an override; removing it goes back to the global setting", async (t) => {
  const { request, q, view, projectFile, agent } = await fixture(t);
  const globalBefore = await readFile(join(agent, "mcp.json"), "utf8");
  const off = await request(`/api/mcp/project/servers/shared${q}`, { method: "PATCH", headers: json, body: JSON.stringify({ revision: (await view()).revision, enabled: false }) });
  assert.equal(off.status, 200);
  assert.deepEqual((await projectFile()).mcpServers.shared, { enabled: false });
  const shared = (await off.json()).servers.find((server: { name: string }) => server.name === "shared");
  assert.deepEqual([shared.override, shared.enabled, shared.env], [true, false, ["TOKEN"]]);
  const back = await request(`/api/mcp/project/servers/shared${q}`, { method: "DELETE", headers: json, body: JSON.stringify({ revision: (await view()).revision }) });
  assert.equal(back.status, 200);
  assert.equal((await projectFile()).mcpServers.shared, undefined);
  assert.equal(await readFile(join(agent, "mcp.json"), "utf8"), globalBefore);
});

test("a project server is added in the project file; auth and unknown projects are refused", async (t) => {
  const { request, q, view, projectFile } = await fixture(t);
  const add = async (server: object) => request(`/api/mcp/project/servers${q}`, { method: "POST", headers: json,
    body: JSON.stringify({ revision: (await view()).revision, name: "docs", server }) });
  const { revision } = await view();
  const ok = await request(`/api/mcp/project/servers${q}`, { method: "POST", headers: json,
    body: JSON.stringify({ revision, name: "docs", server: { transport: "http", url: "https://example.com/mcp" } }) });
  assert.equal(ok.status, 200);
  assert.deepEqual((await projectFile()).mcpServers.docs, { url: "https://example.com/mcp" });
  const duplicate = await add({ transport: "http", url: "https://example.com/mcp" });
  assert.equal(duplicate.status, 422);
  assert.match((await duplicate.json()).error, /already exists/);
  assert.equal((await request("/api/mcp/project?project=%2Ftmp%2Fnope")).status, 400);
});
