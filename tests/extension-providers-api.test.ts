import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { getSupportedThinkingLevels, InMemoryCredentialStore } from "@earendil-works/pi-ai";
import { ConfigStore } from "../src/server/store.ts";
import { createApp } from "../src/server/app.ts";

const origin = "http://127.0.0.1:43123";
const model = (id: string, name: string, reasoning: boolean) =>
  `{ id: "${id}", name: "${name}", reasoning: ${reasoning}, input: ["text"], cost: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0 }, contextWindow: 100000, maxTokens: 8000 }`;
// One provider whose key Pi has (a fixed value, as claude-bridge gives), one that needs a sign-in first.
const bridge = `export default function (pi) {
  pi.registerProvider("bridge", { name: "Bridge Fixture", baseUrl: "http://localhost:9/v1", apiKey: "not-used", api: "openai-completions",
    models: [${model("bridge-large", "Bridge Large", true)}, ${model("bridge-small", "Bridge Small", false)}] });
  pi.registerProvider("needs-login", { name: "Needs Login", baseUrl: "http://localhost:9/v1", api: "openai-completions",
    oauth: { name: "Fixture SSO", async login() { throw new Error("not here"); }, async refreshToken(credentials) { return credentials; }, getApiKey(credentials) { return credentials.access; } },
    models: [${model("locked", "Locked", false)}] });
}`;

async function fixture(t: import("node:test").TestContext, files: Record<string, string> = { "extensions/bridge.ts": bridge }) {
  const root = await mkdtemp(join(tmpdir(), "pi-settings-extension-providers-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const agent = join(root, "agent"), project = join(root, "project");
  await mkdir(agent, { recursive: true });
  await mkdir(join(project, ".pi", "extensions"), { recursive: true });
  for (const [path, text] of Object.entries(files)) {
    await mkdir(join(path.startsWith("project/") ? root : agent, path, ".."), { recursive: true });
    await writeFile(join(path.startsWith("project/") ? root : agent, path), text);
  }
  await writeFile(join(agent, "settings.json"), JSON.stringify({ defaultProjectTrust: "always" }));
  await writeFile(join(agent, "auth.json"), JSON.stringify({ anthropic: { type: "api_key", key: "fixture-secret-anthropic" } }));
  const app = createApp({ store: new ConfigStore({ global: agent }), agentDir: agent, projects: [project], origins: [origin] });
  const request = async (path: string, body?: object) => {
    const response = await app.request(origin + path, { method: body ? "POST" : "GET", headers: { host: new URL(origin).host, origin, "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
    assert.equal(response.status, 200, await response.clone().text());
    return response.json();
  };
  return { agent, project, request };
}

test("providers that extensions register are listed with Pi's auth status and model count; Pi's own and models.json providers are not", async t => {
  const f = await fixture(t);
  await writeFile(join(f.agent, "models.json"), JSON.stringify({ providers: { ollama: { baseUrl: "http://localhost:11434/v1", api: "openai-completions", apiKey: "ollama", models: [{ id: "qwen" }] } } }));
  const view = await f.request("/api/models/extensions");
  assert.deepEqual(view.issues, []);
  const byId = Object.fromEntries(view.providers.map((provider: { id: string }) => [provider.id, provider]));
  assert.deepEqual(byId.bridge, { id: "bridge", name: "Bridge Fixture", auth: { configured: true }, models: 2 });
  assert.deepEqual(byId["needs-login"], { id: "needs-login", name: "Needs Login", auth: { configured: false }, models: 1 });
  assert.equal(byId.anthropic, undefined);
  assert.equal(byId.ollama, undefined);
});

test("a set-up extension provider's models are available, listed and matched by patterns, with what Pi knows of each", async t => {
  const f = await fixture(t);
  const available = await f.request("/api/models/available") as Array<{ provider: string; id: string; thinkingLevels: string[] }>;
  const refs = available.map(entry => `${entry.provider}/${entry.id}`);
  assert.ok(refs.includes("bridge/bridge-large") && refs.includes("bridge/bridge-small"));
  // Pi has no key for needs-login, so a session would not offer its models.
  assert.equal(refs.includes("needs-login/locked"), false);
  const listed = await f.request("/api/models/providers/bridge/models") as Array<{ id: string; name: string; thinkingLevels: string[] }>;
  assert.deepEqual(listed.map(entry => [entry.id, entry.name]), [["bridge-large", "Bridge Large"], ["bridge-small", "Bridge Small"]]);
  const pi = await ModelRuntime.create({ credentials: new InMemoryCredentialStore(), modelsPath: null, modelsStorePath: join(f.agent, "models-store.json"), allowModelNetwork: false, refreshOnCreate: false });
  pi.registerProvider("bridge", { baseUrl: "http://localhost:9/v1", apiKey: "x", api: "openai-completions",
    models: [{ id: "bridge-large", name: "Bridge Large", reasoning: true, input: ["text"], cost: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0 }, contextWindow: 100000, maxTokens: 8000 }] });
  assert.deepEqual(listed[0]!.thinkingLevels, getSupportedThinkingLevels(pi.getModel("bridge", "bridge-large")!));
  const scope = await f.request("/api/models/scope", { patterns: ["bridge/*", "needs-login/*", "ghost/*"], default: "bridge/bridge-small" });
  assert.deepEqual(scope.patterns.map((entry: { matches: number; reason?: string }) => [entry.matches, entry.reason]),
    [[2, undefined], [0, "no-credential"], [0, "unknown-provider"]]);
  assert.equal(scope.defaultInScope, true);
});

test("an extension that fails to load is named, and the catalog still answers", async t => {
  const f = await fixture(t, { "extensions/broken.ts": `throw new Error("fixture extension broke");` });
  const view = await f.request("/api/models/extensions");
  assert.match(view.issues.join("\n"), /fixture extension broke/);
  const available = await f.request("/api/models/available") as Array<{ provider: string }>;
  assert.ok(available.some(entry => entry.provider === "anthropic"));
});

test("a project's extensions count in that project only", async t => {
  const f = await fixture(t, { "project/.pi/extensions/local.ts": `export default function (pi) {
    pi.registerProvider("project-only", { baseUrl: "http://localhost:9/v1", apiKey: "not-used", api: "openai-completions", models: [${model("here", "Here", false)}] });
  }` });
  const ids = (view: { providers: { id: string }[] }) => view.providers.map(provider => provider.id);
  assert.ok(ids(await f.request(`/api/models/extensions?project=${encodeURIComponent(f.project)}`)).includes("project-only"));
  assert.equal(ids(await f.request("/api/models/extensions")).includes("project-only"), false);
  const available = await f.request(`/api/models/available?project=${encodeURIComponent(f.project)}`) as Array<{ provider: string }>;
  assert.ok(available.some(entry => entry.provider === "project-only"));
});

test("listing extension providers runs no credential command and starts no session", async t => {
  const f = await fixture(t);
  const marker = join(f.agent, "..", "command-ran");
  await writeFile(join(f.agent, "models.json"), JSON.stringify({ providers: { ollama: {
    baseUrl: "http://localhost:11434/v1", api: "openai-completions", apiKey: `!touch ${marker}`, models: [{ id: "qwen" }],
  } } }));
  await writeFile(join(f.agent, "settings.json"), JSON.stringify({ defaultProjectTrust: "always", defaultProvider: "ollama", defaultModel: "qwen" }));
  await f.request("/api/models/extensions");
  await f.request("/api/models/available");
  await assert.rejects(stat(marker));
  await assert.rejects(stat(join(f.agent, "sessions")));
});
