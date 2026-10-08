import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConfigStore } from "../src/server/store.ts";
import { createApp } from "../src/server/app.ts";
import { resolveTemplate } from "../src/server/model-discovery.ts";

const origin = "http://127.0.0.1:43123";
const json = { origin, "content-type": "application/json" };

test("resolveTemplate interpolates like Pi's internal resolver, without running commands", async () => {
  // Not a public export: imported by path to catch drift.
  const pi = await import(new URL("../node_modules/@earendil-works/pi-coding-agent/dist/core/resolve-config-value.js", import.meta.url).href);
  const env = { PSS_A: "alpha", PSS_B: "beta" };
  for (const sample of ["plain", "$PSS_A", "${PSS_A}-x", "Bearer ${PSS_B}", "$$PSS_A", "$!x", "${not valid}", "${PSS_A", "$PSS_MISSING", "a$", "$PSS_A$PSS_B"]) {
    assert.equal(resolveTemplate(sample, env), pi.resolveConfigValueUncached(sample, env), sample);
  }
});

type Seen = { path: string; headers: Headers };
function fakeEndpoint(t: import("node:test").TestContext, bodies: Record<string, unknown>) {
  const seen: Seen[] = [];
  const server = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch(request) {
    const url = new URL(request.url);
    seen.push({ path: url.pathname, headers: request.headers });
    return bodies[url.pathname] ? Response.json(bodies[url.pathname]) : new Response("nope", { status: 404 });
  } });
  t.after(() => server.stop(true));
  return { url: `http://127.0.0.1:${server.port}`, seen };
}

async function fixture(t: import("node:test").TestContext, providers: Record<string, unknown>) {
  const root = await mkdtemp(join(tmpdir(), "pi-settings-discovery-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const agent = join(root, "agent");
  await mkdir(agent, { recursive: true });
  await writeFile(join(agent, "models.json"), JSON.stringify({ providers }));
  const app = createApp({ store: new ConfigStore({ global: agent }), agentDir: agent, origins: [origin] });
  return (body: object) => app.request(new Request(origin + "/api/models/custom/discover",
    { method: "POST", headers: { host: new URL(origin).host, ...json }, body: JSON.stringify(body) }));
}

test("OpenAI-compatible endpoints are listed from /models with the stored key", async (t) => {
  process.env.PSS_DISCOVERY_KEY = "fixture-discovery-key";
  t.after(() => { delete process.env.PSS_DISCOVERY_KEY; });
  const endpoint = fakeEndpoint(t, { "/v1/models": { data: [
    { id: "b-model", context_length: 32000, architecture: { input_modalities: ["text", "image"] }, supported_parameters: ["reasoning"] },
    { id: "a-model", name: "A model" },
  ] } });
  const discover = await fixture(t, { local: { baseUrl: endpoint.url + "/v1", api: "openai-completions", apiKey: "$PSS_DISCOVERY_KEY", headers: { "X-Team": "core" } } });
  const response = await discover({ provider: "local", baseUrl: endpoint.url + "/v1", api: "openai-completions" });
  const body = await response.text();
  assert.equal(response.status, 200);
  assert.doesNotMatch(body, /fixture-discovery-key/);
  assert.deepEqual(JSON.parse(body), [
    { id: "a-model", name: "A model" },
    { id: "b-model", contextWindow: 32000, image: true, reasoning: true },
  ]);
  assert.equal(endpoint.seen[0]!.headers.get("authorization"), "Bearer fixture-discovery-key");
  assert.equal(endpoint.seen[0]!.headers.get("x-team"), "core");
});

test("Anthropic and Google endpoints use their own paths and key headers", async (t) => {
  const endpoint = fakeEndpoint(t, {
    "/v1/models": { data: [{ id: "claude-x", display_name: "Claude X" }] },
    "/v1beta/models": { models: [
      { name: "models/gemini-x", displayName: "Gemini X", inputTokenLimit: 1048576, outputTokenLimit: 65536, supportedGenerationMethods: ["generateContent"] },
      { name: "models/embedder", supportedGenerationMethods: ["embedContent"] },
    ] },
  });
  const discover = await fixture(t, {});
  assert.deepEqual(await (await discover({ baseUrl: endpoint.url, api: "anthropic-messages", apiKey: "typed-anthropic" })).json(), [{ id: "claude-x", name: "Claude X" }]);
  assert.equal(endpoint.seen[0]!.headers.get("x-api-key"), "typed-anthropic");
  assert.equal(endpoint.seen[0]!.headers.get("anthropic-version"), "2023-06-01");
  assert.deepEqual(await (await discover({ baseUrl: endpoint.url + "/v1beta", api: "google-generative-ai", apiKey: "typed-google" })).json(),
    [{ id: "gemini-x", name: "Gemini X", contextWindow: 1048576, maxTokens: 65536 }]);
  assert.equal(endpoint.seen[1]!.headers.get("x-goog-api-key"), "typed-google");
});

test("the stored key only goes to the stored URL, and key commands are never run", async (t) => {
  const endpoint = fakeEndpoint(t, { "/v1/models": { data: [{ id: "m" }] } });
  const discover = await fixture(t, {
    moved: { baseUrl: "https://stored.example.com/v1", api: "openai-completions", apiKey: "fixture-stored-key" },
    cmd: { baseUrl: endpoint.url + "/v1", api: "openai-completions", apiKey: "!touch /tmp/pss-should-not-exist" },
  });
  assert.equal((await discover({ provider: "moved", baseUrl: endpoint.url + "/v1", api: "openai-completions" })).status, 200);
  assert.equal(endpoint.seen[0]!.headers.get("authorization"), null);
  const refused = await discover({ provider: "cmd", baseUrl: endpoint.url + "/v1", api: "openai-completions" });
  assert.equal(refused.status, 422);
  assert.match((await refused.json()).error, /command/);
  assert.equal(endpoint.seen.length, 1);
  const unsupported = await discover({ baseUrl: endpoint.url, api: "bedrock-converse-stream" });
  assert.equal(unsupported.status, 422);
});
