import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { getSupportedThinkingLevels, InMemoryCredentialStore } from "@earendil-works/pi-ai";
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
  assert.deepEqual([byId.anthropic.auth.configured, byId.anthropic.auth.source, byId.anthropic.stored, byId.anthropic.keySetup], [true, "stored", "api_key", true]);
  assert.equal(byId["github-copilot"].stored, "oauth");
  assert.deepEqual([byId.ollama.custom, byId.ollama.models, byId.ollama.auth.configured], [true, 1, true]);
  assert.equal(byId.openai.auth.configured, false);
  assert.ok((await providers()).providers.length > 10);
  assert.deepEqual((await readdir(agent)).sort(), before);
});

test("each provider says what Pi calls its key, where it sends requests, whether Pi ships it, and its models that do not chat", async (t) => {
  const { agent, providers } = await fixture(t);
  await writeFile(join(agent, "models.json"), JSON.stringify({ providers: {
    ollama: { baseUrl: "http://localhost:11434/v1", api: "openai-completions", apiKey: "ollama", models: [{ id: "qwen" }] },
    anthropic: { baseUrl: "http://localhost:9/proxy" },
  } }));
  const pi = await ModelRuntime.create({ credentials: new InMemoryCredentialStore(), modelsPath: null, modelsStorePath: join(agent, "models-store.json"), allowModelNetwork: false, refreshOnCreate: false });
  const byId = Object.fromEntries((await providers()).providers.map(provider => [provider.id, provider]));
  assert.equal(byId["amazon-bedrock"].keyName, pi.getProvider("amazon-bedrock")!.auth.apiKey!.name);
  assert.equal(byId["openai-codex"].keyName, undefined);
  assert.deepEqual([byId.ollama.builtIn, byId.ollama.custom], [false, true]);
  // models.json may change a provider Pi ships; it stays Pi's provider.
  assert.deepEqual([byId.anthropic.builtIn, byId.anthropic.custom, byId.anthropic.baseUrl], [true, true, "http://localhost:9/proxy"]);
  assert.equal(byId.openai.baseUrl, pi.getProvider("openai")!.baseUrl);
  const kinds = (id: string) => pi.getAllModels(id).filter(model => model.type && model.type !== "chat");
  assert.deepEqual(byId.openrouter.otherModels, {
    image: kinds("openrouter").filter(model => model.type === "image").length,
    classifier: kinds("openrouter").filter(model => model.type === "classifier").length,
  });
  assert.ok(byId.openrouter.otherModels.image > 0);
  assert.equal(byId.anthropic.otherModels, undefined);
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

test("a provider's models come from Pi's catalog with what Pi knows of each; unknown providers are 404", async (t) => {
  const { agent, request } = await fixture(t);
  const pi = await ModelRuntime.create({ credentials: new InMemoryCredentialStore(), modelsPath: join(agent, "models.json"), modelsStorePath: join(agent, "models-store.json"), allowModelNetwork: false, refreshOnCreate: false });
  // A models.json entry without limits gets the ones Pi fills in, which are what Pi works with.
  const ollama = pi.getModel("ollama", "qwen")!;
  assert.deepEqual(await (await request("/api/models/providers/ollama/models")).json(),
    [{ id: "qwen", name: "qwen", reasoning: false, contextWindow: ollama.contextWindow, maxTokens: ollama.maxTokens, thinkingLevels: ["off"] }]);
  const anthropic = await (await request("/api/models/providers/anthropic/models")).json() as Array<Record<string, any>>;
  assert.deepEqual(anthropic.map(model => model.id), pi.getModels("anthropic").map(model => model.id));
  for (const model of pi.getModels("anthropic")) {
    const ours = anthropic.find(entry => entry.id === model.id)!;
    assert.deepEqual([ours.name, ours.reasoning, ours.contextWindow, ours.maxTokens, !!ours.image, ours.thinkingLevels, ours.cost],
      [model.name, model.reasoning, model.contextWindow, model.maxTokens, model.input.includes("image"), getSupportedThinkingLevels(model), { input: model.cost.input, output: model.cost.output }]);
  }
  assert.equal((await request("/api/models/providers/nope/models")).status, 404);
});

test("available models are those of providers that are set up, each with its provider and thinking levels", async (t) => {
  const { request } = await fixture(t);
  const models = await (await request("/api/models/available")).json() as Array<{ provider: string; id: string; thinkingLevels: string[] }>;
  const refs = models.map(model => `${model.provider}/${model.id}`);
  assert.ok(refs.includes("ollama/qwen"));
  assert.ok(refs.some(ref => ref.startsWith("anthropic/")));
  assert.equal(refs.some(ref => ref.startsWith("openai/")), false);
  assert.deepEqual(models.find(model => model.id === "qwen")!.thinkingLevels, ["off"]);
});

test("enabled model patterns are matched as Pi matches them, over providers that are set up, and no key command runs", async (t) => {
  const { agent, request } = await fixture(t);
  const marker = join(agent, "..", "command-ran");
  await writeFile(join(agent, "models.json"), JSON.stringify({ providers: { ollama: {
    baseUrl: "http://localhost:11434/v1", api: "openai-completions", apiKey: `!touch ${marker}`, models: [{ id: "qwen" }, { id: "llama" }],
  } } }));
  const scope = async (body: object) => (await request("/api/models/scope", { method: "POST", headers: json, body: JSON.stringify(body) })).json();
  const view = await scope({ patterns: ["ollama/*", "claude-bridge/*", "anthropic/*"], default: "ollama/llama" });
  assert.deepEqual(view.patterns.map((entry: { pattern: string; matches: number }) => [entry.pattern, entry.matches > 0]),
    [["ollama/*", true], ["claude-bridge/*", false], ["anthropic/*", true]]);
  assert.equal(view.patterns[0].matches, 2);
  // Every model a pattern selects, so the checklist can tick them.
  assert.deepEqual(view.patterns[0].models, ["ollama/qwen", "ollama/llama"]);
  assert.deepEqual(view.patterns[1].models, []);
  assert.equal(view.first, "ollama/qwen");
  assert.equal(view.defaultInScope, true);
  assert.equal((await scope({ patterns: ["anthropic/*"], default: "ollama/llama" })).defaultInScope, false);
  // A model outside the catalog (from an extension, say) cannot be checked.
  assert.equal((await scope({ patterns: ["anthropic/*"], default: "claude-bridge/opus" })).defaultInScope, undefined);
  // openai has no credential here, so Pi would not scope its models either; each miss says why.
  const misses = await scope({ patterns: ["openai/*", "claude-bridge/*", "anthropic/no-such-model"] });
  assert.deepEqual(misses.patterns.map((entry: { matches: number; reason?: string }) => [entry.matches, entry.reason]),
    [[0, "no-credential"], [0, "unknown-provider"], [0, "no-match"]]);
  await assert.rejects(stat(marker));
});
