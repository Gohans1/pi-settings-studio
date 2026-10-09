import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../src/server/app.ts";
import { ConfigStore } from "../src/server/store.ts";
import { runToolProbe } from "../src/server/plugin-tools.ts";

const origin = "http://127.0.0.1:43123";
const extension = `export default function (pi) {
  const tool = (name, exposure = "direct") => pi.registerTool({
    name, label: name, description: "Purpose of " + name, exposure,
    parameters: { type: "object", properties: {} },
    execute: async () => ({ content: [], details: undefined }),
  });
  tool("visible_tool"); tool("script_tool", "codemode");
  tool("searchable_tool", "deferred"); tool("hidden_tool", "hidden");
  pi.on("session_start", () => { tool("late_tool", "model-only"); });
}`;

async function fixture(t: import("node:test").TestContext, source = extension) {
  const root = await mkdtemp(join(tmpdir(), "pi-settings-tools-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const agent = join(root, "agent"), project = join(root, "project");
  await mkdir(join(agent, "extensions"), { recursive: true });
  await mkdir(join(project, ".pi", "extensions"), { recursive: true });
  const path = join(agent, "extensions", "tools.ts");
  await writeFile(path, source);
  const settings = join(agent, "settings.json");
  await writeFile(settings, JSON.stringify({ defaultProjectTrust: "always" }));
  // Pi creates auth.json on its first run; agent folders in use have one.
  await writeFile(join(agent, "auth.json"), "{}");
  const app = createApp({ store: new ConfigStore({ global: agent }), agentDir: agent, projects: [project], origins: [origin] });
  const request = (target = path, scope?: string, extra: object = {}) => app.request(origin + "/api/plugins/tools" + (scope ? `?project=${encodeURIComponent(scope)}` : ""), {
    method: "POST", headers: { host: new URL(origin).host, origin, "content-type": "application/json" }, body: JSON.stringify({ path: target, ...extra }),
  });
  async function inspect(target = path, scope?: string, extra?: object) {
    const response = await request(target, scope, extra);
    assert.equal(response.status, 200, await response.clone().text());
    return response.json();
  }
  return { root, agent, project, path, settings, request, inspect };
}

test("inspection uses Pi registration, including session_start, and separates declarations from indirect tools", async t => {
  const f = await fixture(t);
  const before = await readFile(f.settings, "utf8");
  const view = await f.inspect();
  assert.equal(view.complete, true);
  assert.deepEqual(Object.fromEntries(view.tools.map((tool: { name: string; visibility: string }) => [tool.name, tool.visibility])), {
    visible_tool: "model", script_tool: "callable", searchable_tool: "callable", hidden_tool: "hidden", late_tool: "model",
  });
  assert.equal(view.tools.find((tool: { name: string }) => tool.name === "visible_tool").description, "Purpose of visible_tool");
  assert.equal(await readFile(f.settings, "utf8"), before);
});

test("project codemode-only hides direct declarations but keeps model-only tools; global inspection stays independent", async t => {
  const f = await fixture(t);
  await writeFile(join(f.project, ".pi", "settings.json"), JSON.stringify({ defaultTools: ["+codemode"], codemode: { mode: "only" } }));
  const project = await f.inspect(f.path, f.project);
  assert.equal(project.tools.find((tool: { name: string }) => tool.name === "visible_tool").visibility, "callable");
  assert.equal(project.tools.find((tool: { name: string }) => tool.name === "late_tool").visibility, "model");
  const global = await f.inspect();
  assert.equal(global.tools.find((tool: { name: string }) => tool.name === "visible_tool").visibility, "model");
});

test("an extension's inspection is kept until its file or the settings change, or a fresh one is asked for", async t => {
  const f = await fixture(t);
  const first = await f.inspect();
  assert.equal((await f.inspect()).checkedAt, first.checkedAt);
  await writeFile(f.path, extension.replace('tool("visible_tool");', 'tool("visible_tool"); tool("new_tool");'));
  const edited = await f.inspect();
  assert.ok(edited.tools.some((tool: { name: string }) => tool.name === "new_tool"));
  assert.notEqual((await f.inspect(f.path, undefined, { fresh: true })).checkedAt, edited.checkedAt);
});

test("a disabled extension is inspected for its catalogue without enabling it in settings", async t => {
  const f = await fixture(t);
  const text = JSON.stringify({ extensions: ["-extensions/tools.ts"] });
  await writeFile(f.settings, text);
  const view = await f.inspect();
  assert.equal(view.enabled, false);
  assert.equal(view.tools.length, 5);
  assert.ok(view.tools.every((tool: { visibility: string }) => tool.visibility === "disabled"));
  assert.equal(await readFile(f.settings, "utf8"), text);
});

test("tool ownership comes from Pi, not matching names in extension source", async t => {
  const f = await fixture(t, `export default pi => {
    pi.registerTool({ name: ["computed", "name"].join("_"), description: "Computed", parameters: { type: "object", properties: {} }, execute: async () => ({ content: [], details: undefined }) });
    // pi.registerTool({ name: "not_a_tool" });
  }`);
  const view = await f.inspect();
  assert.deepEqual(view.tools.map((tool: { name: string }) => tool.name), ["computed_name"]);
});

test("load and lifecycle failures are reported as incomplete, not an empty successful catalogue", async t => {
  const f = await fixture(t, `export default pi => { pi.on("session_start", () => { throw new Error("fixture startup failed"); }); }`);
  const view = await f.inspect();
  assert.equal(view.complete, false);
  assert.match(view.issues.join("\n"), /fixture startup failed/);
  await writeFile(f.path, `throw new Error("fixture import failed"); export default () => {};`);
  const broken = await f.inspect();
  assert.equal(broken.complete, false);
  assert.match(broken.issues.join("\n"), /fixture import failed/);
});

test("known credentials are redacted from tool descriptions and inspection errors", async t => {
  const f = await fixture(t, extension.replace('"Purpose of " + name', '"secret-fixture-token " + name'));
  await writeFile(join(f.agent, "auth.json"), JSON.stringify({ fixture: { type: "api_key", key: "secret-fixture-token" } }));
  const view = await f.inspect();
  assert.ok(!JSON.stringify(view).includes("secret-fixture-token"));
  assert.match(view.tools[0].description, /hidden/);
});

test("only discovered extensions and known projects can be inspected", async t => {
  const f = await fixture(t);
  assert.equal((await f.request(join(f.root, "outside.ts"))).status, 400);
  assert.equal((await f.request(f.path, join(f.root, "unknown"))).status, 400);
  const local = join(f.project, ".pi", "extensions", "local.ts");
  await writeFile(local, extension);
  assert.equal((await f.request(local)).status, 400);
  assert.equal((await f.request(local, f.project)).status, 200);
});

test("MCP startup failures stay visible instead of claiming a complete empty catalogue", async t => {
  const f = await fixture(t);
  await writeFile(join(f.agent, "mcp.json"), JSON.stringify({ mcpServers: {
    broken: { command: "/nonexistent/pi-settings-fixture-mcp", exposure: "direct" },
  } }));
  const view = await f.inspect("builtin:mcp");
  assert.equal(view.complete, false);
  assert.match(view.issues.join("\n"), /broken/);
});

test("a stuck inspector is bounded and a cancelled request can be stopped", async t => {
  const f = await fixture(t, `export default async () => { await new Promise(() => {}); };`);
  const input = { agentDir: f.agent, cwd: f.agent, project: false, path: f.path, enabled: true, paths: [f.path], globalSettings: {} };
  await assert.rejects(runToolProbe(input, undefined, 700), /timed out/);
  await assert.rejects(runToolProbe(input, AbortSignal.abort()), /cancelled/);
});

test("a crashing extension cannot terminate the settings server", async t => {
  const f = await fixture(t, `process.exit(17); export default () => {};`);
  assert.equal((await f.request()).status, 502);
  await writeFile(f.path, "export default () => {};");
  const view = await f.inspect();
  assert.equal(view.complete, true);
  assert.deepEqual(view.tools, []);
});
