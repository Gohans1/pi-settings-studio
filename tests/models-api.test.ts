import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConfigStore } from "../src/server/store.ts";
import { createApp } from "../src/server/app.ts";

const origin = "http://127.0.0.1:43123";
const json = { origin, "content-type": "application/json" };

async function fixture(t: import("node:test").TestContext) {
  const root = await mkdtemp(join(tmpdir(), "pi-settings-models-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const agent = join(root, "agent");
  await mkdir(agent, { recursive: true });
  await writeFile(join(agent, "auth.json"), JSON.stringify({
    anthropic: { type: "api_key", key: "fixture-secret-anthropic" },
    "github-copilot": { type: "oauth", refresh: "fixture-refresh", access: "fixture-access", expires: 1 },
  }, null, 2));
  await writeFile(join(agent, "models.json"), JSON.stringify({ providers: { ollama: {
    baseUrl: "http://localhost:11434/v1", api: "openai-completions", apiKey: "fixture-ollama-key", models: [{ id: "qwen" }],
  } } }));
  const app = createApp({ store: new ConfigStore({ global: agent, project: join(root, "p", ".pi") }), agentDir: agent, origins: [origin] });
  const request = (path: string, init: RequestInit = {}) =>
    app.request(new Request(origin + path, { ...init, headers: { host: new URL(origin).host, ...init.headers } }));
  const providers = async () => (await (await request("/api/models/providers")).json()) as { revision: string; providers: Array<Record<string, any>> };
  const auth = async () => JSON.parse(await readFile(join(agent, "auth.json"), "utf8"));
  return { agent, request, providers, auth };
}

test("providers come from Pi's model runtime with their auth status, never a secret, and nothing is written", async (t) => {
  const { agent, request, providers } = await fixture(t);
  const before = (await readdir(agent)).sort();
  const response = await request("/api/models/providers");
  const text = await response.text();
  assert.doesNotMatch(text, /fixture-/);
  const byId = Object.fromEntries((JSON.parse(text).providers as Array<Record<string, any>>).map(provider => [provider.id, provider]));
  assert.deepEqual([byId.anthropic.auth.configured, byId.anthropic.auth.source, byId.anthropic.stored, byId.anthropic.apiKey], [true, "stored", "api_key", true]);
  assert.equal(byId["github-copilot"].stored, "oauth");
  assert.deepEqual([byId.ollama.custom, byId.ollama.models, byId.ollama.auth.configured], [true, 1, true]);
  assert.equal(byId.openai.auth.configured, false);
  assert.ok((await providers()).providers.length > 10);
  assert.deepEqual((await readdir(agent)).sort(), before);
});

test("an API key is stored in auth.json without touching other credentials, and never echoed", async (t) => {
  const { request, providers, auth } = await fixture(t);
  const { revision } = await providers();
  const response = await request("/api/models/providers/openai/key", { method: "PUT", headers: json, body: JSON.stringify({ revision, key: "fixture-new-key" }) });
  assert.equal(response.status, 200);
  assert.doesNotMatch(await response.text(), /fixture-/);
  const saved = await auth();
  assert.deepEqual(saved.openai, { type: "api_key", key: "fixture-new-key" });
  assert.equal(saved.anthropic.key, "fixture-secret-anthropic");
  assert.equal(saved["github-copilot"].type, "oauth");
  assert.equal((await providers()).providers.find(provider => provider.id === "openai")!.auth.configured, true);
});

test("removing a stored credential is limited to known providers with a stored credential", async (t) => {
  const { agent, request, providers, auth } = await fixture(t);
  const remove = async (id: string) => {
    const { revision } = await providers();
    return request(`/api/models/providers/${id}/key`, { method: "DELETE", headers: json, body: JSON.stringify({ revision }) });
  };
  assert.equal((await remove("openai")).status, 422);
  assert.equal((await remove("no-such-provider")).status, 422);
  assert.equal((await remove("anthropic")).status, 200);
  assert.equal((await auth()).anthropic, undefined);
  assert.equal(((await stat(join(agent, "auth.json"))).mode & 0o777), 0o600);
});
