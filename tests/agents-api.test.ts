import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseFrontmatter } from "@earendil-works/pi-coding-agent";
import { ConfigStore } from "../src/server/store.ts";
import { createApp } from "../src/server/app.ts";

const origin = "http://127.0.0.1:43123";
const json = { origin, "content-type": "application/json" };

async function fixture(t: import("node:test").TestContext) {
  const root = await mkdtemp(join(tmpdir(), "pi-settings-agents-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const agent = join(root, "agent");
  const dir = join(agent, "agents");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "scout.md"), "---\nname: scout\ndescription: Fast recon\ntools: read, grep\nthinking: high\n---\nYou are a scout.\n");
  await writeFile(join(dir, "planner.md"), "---\nname: planner\ndescription: Plans work\ntools: [read]\nmodel: claude-sonnet\n---\nPlan it.\n");
  await writeFile(join(dir, "broken.md"), "---\nname: broken\n---\nNo description.\n");
  await writeFile(join(dir, "notes.txt"), "not an agent");
  const app = createApp({ store: new ConfigStore({ global: agent, project: join(root, "p", ".pi") }), agentDir: agent, origins: [origin] });
  const request = (path: string, init: RequestInit = {}) =>
    app.request(new Request(origin + path, { ...init, headers: { host: new URL(origin).host, ...init.headers } }));
  const list = async () => (await (await request("/api/agents")).json()) as { agents: Array<Record<string, unknown>> };
  return { dir, request, list };
}

test("profiles are read the way Pi's example subagent extension reads them (body trimmed, as Pi parses it)", async (t) => {
  const { list } = await fixture(t);
  const agents = Object.fromEntries((await list()).agents.map(entry => [entry.file, entry]));
  assert.deepEqual(Object.keys(agents).sort(), ["broken.md", "planner.md", "scout.md"]);
  assert.deepEqual([agents["scout.md"]!.tools, agents["scout.md"]!.prompt, agents["scout.md"]!.extraKeys], [["read", "grep"], "You are a scout.", ["thinking"]]);
  assert.deepEqual([agents["planner.md"]!.tools, agents["planner.md"]!.model], [["read"], "claude-sonnet"]);
  assert.match(String(agents["broken.md"]!.error), /description/);
});

test("a new profile is written as <name>.md in Pi's format; bad or taken names are refused", async (t) => {
  const { dir, request } = await fixture(t);
  const create = (body: object) => request("/api/agents", { method: "POST", headers: json, body: JSON.stringify(body) });
  const profile = { name: "reviewer", description: "Reviews diffs", tools: ["read", "bash"], model: "gpt-x", prompt: "Review carefully.\n" };
  assert.equal((await create(profile)).status, 200);
  const { frontmatter, body } = parseFrontmatter<Record<string, unknown>>(await readFile(join(dir, "reviewer.md"), "utf8"));
  assert.deepEqual([frontmatter.name, frontmatter.description, frontmatter.tools, frontmatter.model, body], ["reviewer", "Reviews diffs", "read, bash", "gpt-x", "Review carefully."]);
  assert.equal((await create(profile)).status, 422);
  assert.equal((await create({ ...profile, name: "../escape" })).status, 422);
  await assert.rejects(stat(join(dir, "..", "escape.md")), { code: "ENOENT" });
});

test("editing keeps the file name and frontmatter keys this form does not manage; stale edits are refused", async (t) => {
  const { dir, request, list } = await fixture(t);
  const scout = (await list()).agents.find(entry => entry.file === "scout.md")!;
  const edit = (revision: unknown) => request("/api/agents/scout.md", { method: "PUT", headers: json,
    body: JSON.stringify({ revision, name: "scout", description: "Recon", tools: [], prompt: "Look around.\n" }) });
  assert.equal((await edit("stale")).status, 409);
  assert.equal((await edit(scout.revision)).status, 200);
  const { frontmatter, body } = parseFrontmatter<Record<string, unknown>>(await readFile(join(dir, "scout.md"), "utf8"));
  assert.deepEqual([frontmatter.name, frontmatter.description, frontmatter.tools, frontmatter.thinking, body], ["scout", "Recon", undefined, "high", "Look around."]);
});

test("a removed profile can be restored exactly", async (t) => {
  const { dir, request, list } = await fixture(t);
  const original = await readFile(join(dir, "planner.md"), "utf8");
  const planner = (await list()).agents.find(entry => entry.file === "planner.md")!;
  assert.equal((await request("/api/agents/planner.md", { method: "DELETE", headers: json, body: JSON.stringify({ revision: planner.revision }) })).status, 200);
  await assert.rejects(stat(join(dir, "planner.md")), { code: "ENOENT" });
  assert.equal((await list()).agents.some(entry => entry.file === "planner.md"), false);
  assert.equal((await request("/api/agents/planner.md/restore", { method: "POST", headers: json, body: "{}" })).status, 200);
  assert.equal(await readFile(join(dir, "planner.md"), "utf8"), original);
});
