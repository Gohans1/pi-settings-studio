import { test } from "node:test";
import assert from "node:assert/strict";
import { mcpSecrets, modelsSecrets, maskJson, unmaskJson } from "../src/server/json-secrets.ts";

const mcp = { mcpServers: {
  ctx: { command: "npx", args: ["-y", "ctx", "--api-key", "fixture-arg-secret"], env: { KEY: "fixture-env-secret" } },
  web: { url: "https://u:fixture-url-pass@example.com/mcp?token=fixture-query-secret", headers: { Authorization: "Bearer fixture-header-secret" },
    oauth: { clientId: "public-id", clientSecret: "fixture-client-secret" } },
}, autoEnableCodemode: false };

test("MCP secrets are found in env, headers, OAuth, secret-looking args and URLs", () => {
  assert.deepEqual(mcpSecrets(mcp).sort(), ["Bearer fixture-header-secret", "fixture-arg-secret", "fixture-client-secret", "fixture-env-secret", "fixture-query-secret", "fixture-url-pass"].sort());
});

test("models.json secrets are the API keys and header values of providers, models and overrides", () => {
  const models = { providers: { o: { apiKey: "fixture-key", headers: { "X-A": "fixture-h1" }, models: [{ id: "m", headers: { "X-B": "fixture-h2" } }],
    modelOverrides: { "x/y": { headers: { "X-C": "fixture-h3" } } } } } };
  assert.deepEqual(modelsSecrets(models).sort(), ["fixture-h1", "fixture-h2", "fixture-h3", "fixture-key"]);
});

test("masking replaces every occurrence, even inside a longer string, and unmasking restores the exact document", () => {
  const secrets = mcpSecrets(mcp);
  const text = maskJson(mcp, secrets);
  assert.doesNotMatch(text, /fixture-/);
  assert.match(text, /‹hidden \d+›/);
  assert.match(text, /"https:\/\/u:‹hidden \d+›@example.com\/mcp\?token=‹hidden \d+›"/);
  assert.deepEqual(unmaskJson(text, secrets), mcp);
});

test("an edited document keeps placeholders it did not touch; a mangled placeholder is refused", () => {
  const secrets = mcpSecrets(mcp);
  const edited = JSON.parse(maskJson(mcp, secrets));
  edited.mcpServers.ctx.description = "Docs";
  edited.mcpServers.web.oauth.clientSecret = "fixture-new-secret";
  const restored = unmaskJson(JSON.stringify(edited), secrets) as typeof mcp & { mcpServers: { ctx: { description: string } } };
  assert.equal(restored.mcpServers.ctx.env.KEY, "fixture-env-secret");
  assert.equal(restored.mcpServers.web.oauth.clientSecret, "fixture-new-secret");
  assert.equal(restored.mcpServers.ctx.description, "Docs");
  assert.throws(() => unmaskJson(JSON.stringify({ a: "‹hidden 99›" }), secrets), /placeholder/);
  assert.throws(() => unmaskJson("{ broken", secrets), /valid JSON/);
  assert.throws(() => unmaskJson("[1]", secrets), /JSON object/);
});
