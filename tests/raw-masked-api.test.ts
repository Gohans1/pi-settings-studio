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
  const root = await mkdtemp(join(tmpdir(), "pi-settings-raw-masked-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const agent = join(root, "agent"), project = join(root, "webapp");
  await mkdir(agent, { recursive: true });
  await mkdir(join(project, ".pi"), { recursive: true });
  await writeFile(join(agent, "mcp.json"), JSON.stringify({ mcpServers: { ctx: { command: "npx", env: { KEY: "fixture-env-secret" } } } }));
  await writeFile(join(project, ".pi", "mcp.json"), JSON.stringify({ mcpServers: { local: { url: "https://example.com/mcp?token=fixture-q" } } }));
  await writeFile(join(agent, "models.json"), JSON.stringify({ providers: { o: { baseUrl: "http://localhost:1/v1", api: "openai-completions", apiKey: "fixture-model-key", models: [{ id: "m" }] } } }));
  const app = createApp({ store: new ConfigStore({ global: agent }), agentDir: agent, projects: [project], origins: [origin] });
  const request = (path: string, init: RequestInit = {}) =>
    app.request(new Request(origin + path, { ...init, headers: { host: new URL(origin).host, ...init.headers } }));
  return { agent, project, request, q: `?project=${encodeURIComponent(project)}` };
}

test("mcp.json raw text hides secrets and saves edits with them restored", async (t) => {
  const { agent, request } = await fixture(t);
  const raw = await (await request("/api/mcp/global/raw")).json();
  assert.doesNotMatch(raw.text, /fixture-/);
  const edited = JSON.parse(raw.text);
  edited.mcpServers.ctx.toolExposure = { "get_*": "direct" };
  const saved = await request("/api/mcp/global/raw", { method: "PUT", headers: json, body: JSON.stringify({ revision: raw.revision, text: JSON.stringify(edited) }) });
  assert.equal(saved.status, 200);
  assert.doesNotMatch(await saved.text(), /fixture-/);
  assert.deepEqual(JSON.parse(await readFile(join(agent, "mcp.json"), "utf8")).mcpServers.ctx, { command: "npx", env: { KEY: "fixture-env-secret" }, toolExposure: { "get_*": "direct" } });
});

test("the project's mcp.json has its own raw editor", async (t) => {
  const { project, request, q } = await fixture(t);
  const raw = await (await request(`/api/mcp/project/raw${q}`)).json();
  assert.match(raw.text, /token=‹hidden 1›/);
  const text = raw.text.replace('"local"', '"renamed"');
  assert.equal((await request(`/api/mcp/project/raw${q}`, { method: "PUT", headers: json, body: JSON.stringify({ revision: raw.revision, text }) })).status, 200);
  assert.equal(JSON.parse(await readFile(join(project, ".pi", "mcp.json"), "utf8")).mcpServers.renamed.url, "https://example.com/mcp?token=fixture-q");
});

test("models.json raw text hides keys and is refused when Pi would reject the file", async (t) => {
  const { agent, request } = await fixture(t);
  const raw = await (await request("/api/models/custom/raw")).json();
  assert.doesNotMatch(raw.text, /fixture-/);
  const put = (text: string, revision = raw.revision) => request("/api/models/custom/raw", { method: "PUT", headers: json, body: JSON.stringify({ revision, text }) });
  const broken = JSON.parse(raw.text);
  broken.providers.o.baseUrl = 5;
  const refused = await put(JSON.stringify(broken));
  assert.equal(refused.status, 422);
  assert.match((await refused.json()).error, /baseUrl/);
  const edited = JSON.parse(raw.text);
  edited.providers.o.modelOverrides = { "x/y": { name: "Y" } };
  assert.equal((await put(JSON.stringify(edited))).status, 200);
  const file = JSON.parse(await readFile(join(agent, "models.json"), "utf8"));
  assert.deepEqual([file.providers.o.apiKey, file.providers.o.modelOverrides], ["fixture-model-key", { "x/y": { name: "Y" } }]);
});
