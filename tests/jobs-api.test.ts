import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { ConfigStore } from "../src/server/store.ts";
import { createApp } from "../src/server/app.ts";

const origin = "http://127.0.0.1:43123";
const json = { origin, "content-type": "application/json" };
const ECHO = resolve("tests/fixtures/echo-mcp.ts");

async function fixture(t: import("node:test").TestContext) {
  const root = await mkdtemp(join(tmpdir(), "pi-settings-jobs-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const agent = join(root, "agent");
  await mkdir(agent, { recursive: true });
  await writeFile(join(agent, "settings.json"), "{}");
  await writeFile(join(agent, "mcp.json"), JSON.stringify({ mcpServers: {
    echo: { command: "bun", args: [ECHO], env: { TOKEN: "fixture-env-secret" } },
    dead: { command: "definitely-not-a-command-xyz", args: ["--api-key", "fixture-arg-secret"] },
  } }));
  const app = createApp({ store: new ConfigStore({ global: agent }), agentDir: agent, origins: [origin] });
  const request = (path: string, init: RequestInit = {}) =>
    app.request(new Request(origin + path, { ...init, headers: { host: new URL(origin).host, ...init.headers } }));
  const start = (body: object) => request("/api/jobs", { method: "POST", headers: json, body: JSON.stringify(body) });
  async function settle(id: string, until = (job: Record<string, any>) => job.status !== "running") {
    for (let i = 0; i < 300; i++) {
      const job = await (await request(`/api/jobs/${id}`)).json();
      if (until(job)) return job;
      await Bun.sleep(100);
    }
    throw new Error("job did not settle");
  }
  return { root, agent, request, start, settle };
}

test("Test connections runs `pi mcp list` and reports each server, with secrets hidden", async (t) => {
  const { start, settle } = await fixture(t);
  const started = await start({ action: "mcp-test" });
  assert.equal(started.status, 200);
  const job = await settle((await started.json()).id);
  assert.doesNotMatch(JSON.stringify(job), /fixture-(env|arg)-secret/);
  const byName = Object.fromEntries(job.result.servers.map((server: { name: string }) => [server.name, server]));
  assert.deepEqual([byName.echo.state, byName.echo.tools], ["connected", ["echo"]]);
  assert.equal(byName.dead.state, "failed");
  assert.match(byName.dead.transport, /‹hidden›/);
});

test("a job asked for again while it runs is the same job; running jobs are listed with what started them", async (t) => {
  const { agent, request, start, settle } = await fixture(t);
  await writeFile(join(agent, "mcp.json"), JSON.stringify({ mcpServers: { echo: { command: "bun", args: [ECHO], env: { ECHO_DELAY_MS: "2000" } } } }));
  const first = await (await start({ action: "mcp-test" })).json();
  assert.equal((await (await start({ action: "mcp-test" })).json()).id, first.id);
  // A different request is a different job.
  const other = await (await start({ action: "provider-check", provider: "anthropic" })).json();
  assert.notEqual(other.id, first.id);
  const listed = await (await request("/api/jobs")).json();
  assert.deepEqual(listed.find((job: { id: string }) => job.id === first.id), { id: first.id, status: "running", input: { action: "mcp-test" } });
  assert.equal("output" in listed[0], false);
  await settle(first.id);
  // A finished job does not stand in for a new run.
  assert.notEqual((await (await start({ action: "mcp-test" })).json()).id, first.id);
  await settle(other.id);
});

test("a local package is installed and removed through the pi CLI; option-like sources are refused", async (t) => {
  const { root, agent, start, settle } = await fixture(t);
  const pkg = join(root, "pkg");
  await mkdir(join(pkg, "prompts"), { recursive: true });
  await writeFile(join(pkg, "package.json"), JSON.stringify({ name: "local-pkg", version: "1.0.0" }));
  await writeFile(join(pkg, "prompts", "hi.md"), "hi\n");
  const installed = await settle((await (await start({ action: "package-install", source: pkg })).json()).id);
  assert.deepEqual([installed.status, installed.exitCode], ["done", 0]);
  assert.equal(JSON.parse(await readFile(join(agent, "settings.json"), "utf8")).packages.length, 1);
  const removed = await settle((await (await start({ action: "package-remove", source: pkg })).json()).id);
  assert.equal(removed.status, "done");
  assert.deepEqual(JSON.parse(await readFile(join(agent, "settings.json"), "utf8")).packages, []);
  for (const source of ["--local", "-l", "npm:x\nnpm:y", ""]) assert.equal((await start({ action: "package-install", source })).status, 422, source);
});

test("a provider sign-in relays Pi's prompts to the browser and can be cancelled", async (t) => {
  const { request, start, settle } = await fixture(t);
  assert.equal((await start({ action: "provider-login", provider: "groq" })).status, 422);
  assert.equal((await start({ action: "provider-login", provider: "nope" })).status, 422);
  const { id } = await (await start({ action: "provider-login", provider: "anthropic" })).json();
  const waiting = await settle(id, job => !!job.prompt);
  assert.equal(waiting.prompt.type, "select");
  assert.ok(waiting.prompt.options.length > 0);
  assert.equal((await request(`/api/jobs/${id}/cancel`, { method: "POST", headers: json, body: "{}" })).status, 200);
  const cancelled = await settle(id);
  assert.equal(cancelled.status, "cancelled");
  assert.equal((await request("/api/jobs/unknown")).status, 404);
});

test("a provider's own key setup asks Pi's questions, stores every field, and never shows the key", async (t) => {
  const { agent, request, start, settle } = await fixture(t);
  assert.equal((await start({ action: "provider-setup", provider: "openai-codex" })).status, 422);
  const { id } = await (await start({ action: "provider-setup", provider: "cloudflare-workers-ai" })).json();
  const answer = async (value: string) => {
    const waiting = await settle(id, job => !!job.prompt || job.status !== "running");
    assert.equal(waiting.status, "running");
    const response = await request(`/api/jobs/${id}/answer`, { method: "POST", headers: json, body: JSON.stringify({ promptId: waiting.prompt.id, value }) });
    assert.equal(response.status, 200);
    return waiting.prompt;
  };
  assert.equal((await answer("fixture-cloudflare-key")).type, "secret");
  assert.match((await answer("acct-123")).message, /account ID/);
  const done = await settle(id);
  assert.equal(done.status, "done");
  assert.deepEqual(JSON.parse(await readFile(join(agent, "auth.json"), "utf8"))["cloudflare-workers-ai"],
    { type: "api_key", key: "fixture-cloudflare-key", env: { CLOUDFLARE_ACCOUNT_ID: "acct-123" } });
  assert.doesNotMatch(JSON.stringify(await (await request(`/api/jobs/${id}`)).json()), /fixture-cloudflare-key/);
});
