import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createApp } from "../src/server/app.ts";
import { ConfigStore } from "../src/server/store.ts";

const origin = "http://127.0.0.1:43123";
const ECHO = resolve("tests/fixtures/echo-mcp.ts");
const extension = `export default function (pi) {
  const tool = (name, exposure = "direct") => pi.registerTool({
    name, label: name, description: "Purpose of " + name, exposure,
    parameters: { type: "object", properties: {} },
    execute: async () => ({ content: [], details: undefined }),
  });
  tool("visible_tool"); tool("script_tool", "codemode"); tool("hidden_tool", "hidden");
}`;

async function fixture(t: import("node:test").TestContext, servers: Record<string, unknown> = { "echo-server": { command: "bun", args: [ECHO] } }) {
  const root = await mkdtemp(join(tmpdir(), "pi-settings-all-tools-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const agent = join(root, "agent"), project = join(root, "project");
  await mkdir(join(agent, "extensions"), { recursive: true });
  await mkdir(join(project, ".pi"), { recursive: true });
  await writeFile(join(agent, "extensions", "tools.ts"), extension);
  await writeFile(join(agent, "settings.json"), JSON.stringify({ defaultProjectTrust: "always" }));
  await writeFile(join(agent, "mcp.json"), JSON.stringify({ mcpServers: servers }));
  // Pi creates auth.json on its first run; agent folders in use have one.
  await writeFile(join(agent, "auth.json"), "{}");
  const app = createApp({ store: new ConfigStore({ global: agent }), agentDir: agent, projects: [project], origins: [origin] });
  const request = (scope?: string, body: object = {}, signal?: AbortSignal) => app.request(origin + "/api/tools" + (scope ? `?project=${encodeURIComponent(scope)}` : ""), {
    method: "POST", headers: { host: new URL(origin).host, origin, "content-type": "application/json" }, body: JSON.stringify(body), signal,
  });
  async function inspect(scope?: string, body?: object) {
    const response = await request(scope, body);
    assert.equal(response.status, 200, await response.clone().text());
    return response.json();
  }
  return { root, agent, project, request, inspect };
}

type Tool = { name: string; description: string; visibility: string; source: Record<string, string> };
const named = (view: { tools: Tool[] }, name: string) => view.tools.find(tool => tool.name === name);

test("lists Pi's own tools, extension tools and MCP server tools, each with its source", async t => {
  const f = await fixture(t);
  const view = await f.inspect();
  assert.equal(view.complete, true, view.issues.join("\n"));
  assert.deepEqual(named(view, "read")?.source, { kind: "pi" });
  assert.equal(named(view, "visible_tool")?.source.kind, "extension");
  assert.equal(named(view, "visible_tool")?.source.name, "tools.ts");
  assert.deepEqual(named(view, "codemode")?.source, { kind: "extension", name: "codemode", group: "Built-in" });
  // The server's name as configured, not the sanitized namespace in the tool name.
  assert.deepEqual(named(view, "mcp__echo_server__echo")?.source, { kind: "mcp", server: "echo-server" });
});

test("each tool says whether the model sees it directly, only indirectly, or not at all", async t => {
  const f = await fixture(t);
  const view = await f.inspect();
  const names = ["read", "grep", "visible_tool", "script_tool", "hidden_tool", "mcp__echo_server__echo", "codemode"];
  assert.deepEqual(Object.fromEntries(names.map(name => [name, named(view, name)?.visibility])), {
    read: "model", grep: "inactive", visible_tool: "model", script_tool: "callable", hidden_tool: "hidden",
    // MCP's default codemode exposure: the server's tools are reached through codemode, which Pi turns on for them.
    mcp__echo_server__echo: "callable", codemode: "model",
  });
});

test("the chosen project's settings decide what a session there starts with; global stays independent", async t => {
  const f = await fixture(t);
  await writeFile(join(f.project, ".pi", "settings.json"), JSON.stringify({ defaultTools: ["+grep"] }));
  assert.equal(named(await f.inspect(f.project), "grep")?.visibility, "model");
  assert.equal(named(await f.inspect(), "grep")?.visibility, "inactive");
});

test("sources Pi takes no tools from are listed: turned off in settings, or on without any", async t => {
  const f = await fixture(t, { "echo-server": { command: "bun", args: [ECHO] }, "off-server": { command: "bun", args: [ECHO], enabled: false } });
  await writeFile(join(f.agent, "extensions", "quiet.ts"), "export default () => {};");
  await writeFile(join(f.agent, "extensions", "off.ts"), extension);
  await writeFile(join(f.agent, "settings.json"), JSON.stringify({ defaultProjectTrust: "always", extensions: ["-extensions/off.ts"] }));
  const view = await f.inspect();
  const idle = (name: string) => view.idleSources.find((entry: { source: Record<string, string> }) => (entry.source.name ?? entry.source.server) === name);
  assert.equal(idle("off.ts")?.status, "off");
  assert.equal(idle("quiet.ts")?.status, "empty");
  assert.deepEqual(idle("off-server"), { source: { kind: "mcp", server: "off-server" }, status: "off" });
  // Sources that gave tools are not idle, and the MCP extension's tools belong to their servers.
  assert.equal(idle("tools.ts"), undefined);
  assert.equal(idle("echo-server"), undefined);
  assert.equal(idle("mcp"), undefined);
});

test("a project's mcp.json can turn a global server off there", async t => {
  const f = await fixture(t);
  await writeFile(join(f.project, ".pi", "mcp.json"), JSON.stringify({ mcpServers: { "echo-server": { enabled: false } } }));
  const view = await f.inspect(f.project);
  assert.equal(named(view, "mcp__echo_server__echo"), undefined);
  assert.deepEqual(view.idleSources.find((entry: { source: Record<string, string> }) => entry.source.server === "echo-server"), { source: { kind: "mcp", server: "echo-server" }, status: "off" });
});

test("a second inspection with nothing changed answers with the stored result", async t => {
  const f = await fixture(t);
  const first = await f.inspect();
  assert.equal((await f.inspect()).checkedAt, first.checkedAt);
});

test("a change to what Pi reads, or asking for a fresh result, inspects again", async t => {
  const f = await fixture(t);
  await f.inspect();
  await writeFile(join(f.agent, "settings.json"), JSON.stringify({ defaultProjectTrust: "always", defaultTools: ["+grep"] }));
  assert.equal(named(await f.inspect(), "grep")?.visibility, "model");
  await writeFile(join(f.agent, "extensions", "tools.ts"), extension.replace('tool("visible_tool");', 'tool("visible_tool"); tool("new_tool");'));
  assert.ok(named(await f.inspect(), "new_tool"));
  await writeFile(join(f.agent, "mcp.json"), JSON.stringify({ mcpServers: {} }));
  const settled = await f.inspect();
  assert.equal(named(settled, "mcp__echo_server__echo"), undefined);
  assert.notEqual((await f.inspect(undefined, { fresh: true })).checkedAt, settled.checkedAt);
});

test("an inspection outlives a request that leaves early, and the next request joins it", async t => {
  const root = await mkdtemp(join(tmpdir(), "pi-settings-leave-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const log = join(root, "starts.log");
  const f = await fixture(t, { "echo-server": { command: "bun", args: [ECHO], env: { ECHO_LOG: log, ECHO_DELAY_MS: "1500" } } });
  const starts = async () => (await readFile(log, "utf8").catch(() => "")).split("\n").filter(Boolean).length;
  const reader = new AbortController();
  const left = Promise.resolve(f.request(undefined, {}, reader.signal)).catch(() => undefined);
  // Leave once the inspection has started the server.
  for (let i = 0; i < 100 && !(await starts()); i++) await Bun.sleep(50);
  reader.abort();
  await left;
  const view = await f.inspect();
  assert.ok(named(view, "mcp__echo_server__echo"));
  assert.equal(await starts(), 1);
});

test("an incomplete inspection is not kept: the next request tries again", async t => {
  const f = await fixture(t, { broken: { command: "/nonexistent/pi-settings-fixture-mcp" } });
  const first = await f.inspect();
  assert.equal(first.complete, false);
  assert.notEqual((await f.inspect()).checkedAt, first.checkedAt);
});

test("only known projects can be inspected", async t => {
  const f = await fixture(t);
  assert.equal((await f.request(join(f.root, "unknown"))).status, 400);
});

test("an MCP server that fails to start makes the list incomplete instead of silently shorter", async t => {
  const f = await fixture(t, { broken: { command: "/nonexistent/pi-settings-fixture-mcp" } });
  const view = await f.inspect();
  assert.equal(view.complete, false);
  assert.match(view.issues.join("\n"), /broken/);
});

test("known credentials are redacted from tool descriptions", async t => {
  const f = await fixture(t);
  await writeFile(join(f.agent, "extensions", "tools.ts"), extension.replace('"Purpose of " + name', '"secret-fixture-token " + name'));
  await writeFile(join(f.agent, "auth.json"), JSON.stringify({ fixture: { type: "api_key", key: "secret-fixture-token" } }));
  const view = await f.inspect();
  assert.ok(!JSON.stringify(view).includes("secret-fixture-token"));
  assert.match(named(view, "visible_tool")?.description ?? "", /hidden/);
});

type Part = { name: string; text: string; tokens: number };
const section = (view: { context: { sections: Part[] } }, name: string) => view.context.sections.find(part => part.name === name)?.text;

test("a new session's prompt is built as Pi builds it: its sections, AGENTS.md files, skills and MCP servers", async t => {
  const f = await fixture(t);
  await writeFile(join(f.agent, "AGENTS.md"), "Global rules.");
  await writeFile(join(f.project, "AGENTS.md"), "Project rules.");
  await mkdir(join(f.agent, "skills", "demo"), { recursive: true });
  await writeFile(join(f.agent, "skills", "demo", "SKILL.md"), "---\nname: demo\ndescription: Demo skill for tests.\n---\nBody");
  const view = await f.inspect(f.project);
  assert.deepEqual(view.context.sections.map((part: Part) => part.name), ["preamble", "tools", "rules", "docs", "project_context", "skills", "cwd", "mcp_servers"]);
  assert.match(section(view, "project_context")!, /Global rules\.[\s\S]*Project rules\./);
  assert.deepEqual(view.context.files.contextFiles.map((file: { path: string }) => file.path), [join(f.agent, "AGENTS.md"), join(f.project, "AGENTS.md")]);
  assert.match(section(view, "skills")!, /Demo skill for tests\./);
  assert.match(section(view, "cwd")!, new RegExp(f.project));
  // Pi's MCP extension adds its servers when a turn starts; the preview runs Pi's own handlers.
  assert.match(section(view, "mcp_servers")!, /echo_server/);
});

test("SYSTEM.md replaces Pi's base prompt and APPEND_SYSTEM.md adds to it, each named with its file", async t => {
  const f = await fixture(t);
  await writeFile(join(f.agent, "APPEND_SYSTEM.md"), "Appended rules.");
  let view = await f.inspect();
  assert.match(section(view, "addendum")!, /Appended rules\./);
  assert.deepEqual(view.context.files.appendSystemPrompt, [join(f.agent, "APPEND_SYSTEM.md")]);
  assert.equal(view.context.files.systemPrompt, undefined);
  await writeFile(join(f.agent, "SYSTEM.md"), "Custom base prompt.");
  view = await f.inspect();
  assert.equal(section(view, "preamble"), "Custom base prompt.");
  assert.equal(section(view, "tools"), undefined);
  assert.equal(view.context.files.systemPrompt, join(f.agent, "SYSTEM.md"));
});

test("the first request declares only the tools Pi does not hide: with code mode only, code mode alone", async t => {
  const f = await fixture(t);
  const declared = (view: { context: { declarations: Part[] } }) => view.context.declarations.map(part => part.name);
  assert.deepEqual(declared(await f.inspect()), ["read", "bash", "edit", "write", "visible_tool", "codemode"]);
  await writeFile(join(f.agent, "settings.json"), JSON.stringify({ defaultProjectTrust: "always", codemode: { mode: "only" } }));
  const view = await f.inspect();
  assert.deepEqual(declared(view), ["codemode"]);
  assert.doesNotMatch(section(view, "tools")!, /- read:/);
  // A declaration as the model reads it: name, description and parameters.
  assert.deepEqual(Object.keys(JSON.parse(view.context.declarations[0].text)), ["name", "description", "parameters"]);
});

test("the prompt's parts carry Pi's token estimate, and the whole is the first request's", async t => {
  const f = await fixture(t);
  const { context } = await f.inspect();
  const cwd = context.sections.find((part: Part) => part.name === "cwd");
  assert.equal(cwd.tokens, Math.ceil(cwd.text.length / 4));
  const chars = context.sections.reduce((sum: number, part: Part) => sum + part.text.length, 0)
    + JSON.stringify(context.declarations.map((part: Part) => JSON.parse(part.text))).length;
  assert.equal(context.tokens, Math.ceil(chars / 4));
});

test("an edited AGENTS.md or a new skill inspects again", async t => {
  const f = await fixture(t);
  await writeFile(join(f.agent, "AGENTS.md"), "First rules.");
  assert.match(section(await f.inspect(), "project_context")!, /First rules\./);
  await writeFile(join(f.agent, "AGENTS.md"), "Second rules.");
  assert.match(section(await f.inspect(), "project_context")!, /Second rules\./);
  await mkdir(join(f.agent, "skills", "late"), { recursive: true });
  await writeFile(join(f.agent, "skills", "late", "SKILL.md"), "---\nname: late\ndescription: Added later.\n---\nBody");
  assert.match(section(await f.inspect(), "skills")!, /Added later\./);
});

test("an extension that changes the prompt when a turn starts is named, and the preview does not run it", async t => {
  const f = await fixture(t);
  const marker = join(f.root, "turn-started");
  await writeFile(join(f.agent, "extensions", "turn.ts"), `import { writeFileSync } from "node:fs";
export default pi => pi.on("before_agent_start", event => {
  writeFileSync(${JSON.stringify(marker)}, "ran");
  event.systemPromptOptions.sections.turn = "Added when a turn starts.";
});`);
  const view = await f.inspect();
  assert.deepEqual(view.context.unrun.map((source: { name: string }) => source.name), ["turn.ts"]);
  assert.equal(section(view, "turn"), undefined);
  assert.equal(await readFile(marker, "utf8").catch(() => "not run"), "not run");
});
