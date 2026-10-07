import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConfigStore } from "../src/server/store.ts";
import { createApp } from "../src/server/app.ts";

const origin = "http://127.0.0.1:43123";
const json = { origin, "content-type": "application/json" };

async function fixture(t: import("node:test").TestContext) {
  const root = await mkdtemp(join(tmpdir(), "pi-settings-models-json-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const agent = join(root, "agent");
  await mkdir(agent, { recursive: true });
  await writeFile(join(agent, "models.json"), JSON.stringify({ providers: {
    ollama: { baseUrl: "http://localhost:11434/v1", api: "openai-completions", apiKey: "fixture-ollama-key", compat: { supportsStore: false },
      headers: { "X-Team": "fixture-header" }, models: [{ id: "qwen", cost: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0 } }] },
    openrouter: { modelOverrides: { "x/y": { name: "Y" } } },
  } }, null, 2));
  const app = createApp({ store: new ConfigStore({ global: agent }), agentDir: agent, origins: [origin] });
  const request = (path: string, init: RequestInit = {}) =>
    app.request(new Request(origin + path, { ...init, headers: { host: new URL(origin).host, ...init.headers } }));
  const view = async () => (await (await request("/api/models/custom")).json()) as { revision: string; providers: Array<Record<string, any>> };
  const file = async () => JSON.parse(await readFile(join(agent, "models.json"), "utf8"));
  return { agent, request, view, file };
}

test("custom providers are listed without secret values", async (t) => {
  const { request } = await fixture(t);
  const body = await (await request("/api/models/custom")).text();
  assert.doesNotMatch(body, /fixture-/);
  const [ollama, openrouter] = JSON.parse(body).providers;
  assert.deepEqual([ollama.id, ollama.apiKey, ollama.headers, ollama.models, ollama.otherKeys], ["ollama", "literal", ["X-Team"], [{ id: "qwen" }], ["compat"]]);
  assert.deepEqual([openrouter.id, openrouter.models, openrouter.otherKeys], ["openrouter", [], ["modelOverrides"]]);
});

test("a provider is added after Pi accepts it, and its models become available", async (t) => {
  const { request, view, file } = await fixture(t);
  const add = async (provider: object) => request("/api/models/custom", { method: "POST", headers: json,
    body: JSON.stringify({ revision: (await view()).revision, id: "lmstudio", provider }) });
  const refused = await add({ baseUrl: "http://localhost:1234/v1", models: [{ id: "llama" }] });
  assert.equal(refused.status, 422);
  assert.match((await refused.json()).error, /no "api" specified/);
  assert.equal((await add({ baseUrl: "http://localhost:1234/v1", api: "openai-completions", apiKey: "fixture-lm", models: [{ id: "llama", contextWindow: 8192, reasoning: true }] })).status, 200);
  assert.deepEqual((await file()).providers.lmstudio, { baseUrl: "http://localhost:1234/v1", api: "openai-completions", apiKey: "fixture-lm", models: [{ id: "llama", reasoning: true, contextWindow: 8192 }] });
  const models = await (await request("/api/models/providers/lmstudio/models")).json();
  assert.deepEqual(models.map((model: { id: string }) => model.id), ["llama"]);
});

test("editing keeps hidden values and keys the form does not manage, per model too", async (t) => {
  const { request, view, file } = await fixture(t);
  const response = await request("/api/models/custom/ollama", { method: "PUT", headers: json, body: JSON.stringify({ revision: (await view()).revision, provider: {
    baseUrl: "http://localhost:11434/v1", api: "openai-completions", headers: [{ name: "X-Team" }], models: [{ id: "qwen", name: "Qwen" }, { id: "llama" }],
  } }) });
  assert.equal(response.status, 200);
  assert.deepEqual((await file()).providers.ollama, {
    baseUrl: "http://localhost:11434/v1", api: "openai-completions", apiKey: "fixture-ollama-key", headers: { "X-Team": "fixture-header" },
    models: [{ id: "qwen", name: "Qwen", cost: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0 } }, { id: "llama" }], compat: { supportsStore: false },
  });
});

test("an API key can be cleared on purpose, a provider removed and restored, and no temporary file is left behind", async (t) => {
  const { agent, request, view, file } = await fixture(t);
  const before = (await readdir(tmpdir())).filter(name => name.startsWith("pi-settings-validate-")).length;
  await request("/api/models/custom/ollama", { method: "PUT", headers: json, body: JSON.stringify({ revision: (await view()).revision, provider: {
    baseUrl: "http://localhost:11434/v1", api: "openai-completions", clearApiKey: true, models: [{ id: "qwen" }] } }) });
  assert.equal((await file()).providers.ollama.apiKey, undefined);
  assert.equal((await request("/api/models/custom/ollama", { method: "DELETE", headers: json, body: JSON.stringify({ revision: (await view()).revision }) })).status, 200);
  assert.equal((await file()).providers.ollama, undefined);
  assert.equal((await request("/api/models/custom/restore", { method: "POST", headers: json, body: JSON.stringify({ revision: (await view()).revision }) })).status, 200);
  assert.equal((await file()).providers.ollama.baseUrl, "http://localhost:11434/v1");
  assert.equal((await readdir(tmpdir())).filter(name => name.startsWith("pi-settings-validate-")).length, before);
  assert.ok(agent);
});
