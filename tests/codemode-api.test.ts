import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConfigStore } from "../src/server/store.ts";
import { createApp } from "../src/server/app.ts";

const origin = "http://127.0.0.1:43123";
const json = { origin, "content-type": "application/json" };
async function fixture(t: import("node:test").TestContext, settings: object, mcp?: object) {
  const root = await mkdtemp(join(tmpdir(), "pi-settings-codemode-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const agent = join(root, "agent");
  await mkdir(agent, { recursive: true });
  await writeFile(join(agent, "settings.json"), JSON.stringify(settings));
  if (mcp) await writeFile(join(agent, "mcp.json"), JSON.stringify(mcp));
  const app = createApp({ store: new ConfigStore({ global: agent, project: join(root, "project", ".pi") }), agentDir: agent, origins: [origin] });
  const request = (path: string, init: RequestInit = {}) =>
    app.request(new Request(origin + path, { ...init, headers: { host: new URL(origin).host, ...init.headers } }));
  const settings_ = async () => JSON.parse(await readFile(join(agent, "settings.json"), "utf8"));
  return { request, settings: settings_, mcp: async () => JSON.parse(await readFile(join(agent, "mcp.json"), "utf8")) };
}

test("Code mode reads the global choices with Pi's defaults", async (t) => {
  const { request } = await fixture(t, { defaultTools: ["+codemode"], extensions: ["-builtin:codemode"] }, { mcpServers: {}, autoEnableCodemode: false });
  const view = await (await request("/api/codemode")).json();
  assert.deepEqual([view.preference, view.mode, view.inlineBudget, view.autoEnableCodemode, view.disabledByExtensions], ["always", "on", undefined, false, true]);
});

test("switching to Automatic removes the codemode entry without leaving an empty tool list", async (t) => {
  const { request, settings } = await fixture(t, { defaultTools: ["+codemode"], theme: "dark" });
  const { revision } = await (await request("/api/codemode")).json();
  const response = await request("/api/codemode", { method: "PATCH", headers: json, body: JSON.stringify({ revision, preference: "automatic" }) });
  assert.equal(response.status, 200);
  assert.deepEqual(await settings(), { theme: "dark" });
});

test("mode and budget write the codemode object; on and an empty budget mean Pi's default", async (t) => {
  const { request, settings } = await fixture(t, { codemode: { mode: "only", inlineBudget: 10 } });
  const patch = async (body: object) => {
    const { revision } = await (await request("/api/codemode")).json();
    return request("/api/codemode", { method: "PATCH", headers: json, body: JSON.stringify({ revision, ...body }) });
  };
  assert.equal((await patch({ inlineBudget: -1 })).status, 422);
  assert.equal((await patch({ inlineBudget: 1.5 })).status, 422);
  assert.equal((await patch({ inlineBudget: 0 })).status, 200);
  assert.deepEqual(await settings(), { codemode: { mode: "only", inlineBudget: 0 } });
  assert.equal((await patch({ mode: "on", inlineBudget: null })).status, 200);
  assert.deepEqual(await settings(), {});
});

test("automatic activation is a top-level mcp.json switch", async (t) => {
  const { request, mcp } = await fixture(t, {}, { mcpServers: { a: { command: "x" } } });
  const { revision } = await (await request("/api/mcp/global")).json();
  const off = await request("/api/mcp/global/settings", { method: "PATCH", headers: json, body: JSON.stringify({ revision, autoEnableCodemode: false }) });
  assert.equal(off.status, 200);
  assert.equal((await mcp()).autoEnableCodemode, false);
  const after = await off.json();
  await request("/api/mcp/global/settings", { method: "PATCH", headers: json, body: JSON.stringify({ revision: after.revision, autoEnableCodemode: true }) });
  assert.deepEqual(await mcp(), { mcpServers: { a: { command: "x" } } });
});
