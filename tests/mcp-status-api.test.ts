import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createApp } from "../src/server/app.ts";
import { ConfigStore } from "../src/server/store.ts";

const origin = "http://127.0.0.1:43123";
const ECHO = resolve("tests/fixtures/echo-mcp.ts");

async function fixture(t: import("node:test").TestContext) {
  const root = await mkdtemp(join(tmpdir(), "pss-mcp-status-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const agent = join(root, "agent"), log = join(root, "starts.log");
  await mkdir(agent, { recursive: true });
  await writeFile(join(agent, "settings.json"), "{}");
  const servers = {
    // A tool named with characters Pi replaces in its own tool names.
    echo: { command: "bun", args: [ECHO, "say-it.v2"], env: { ECHO_LOG: log } },
    dead: { command: "definitely-not-a-command-xyz", args: ["--api-key", "fixture-arg-secret"] },
    off: { command: "bun", args: [ECHO], enabled: false },
  };
  await writeFile(join(agent, "mcp.json"), JSON.stringify({ mcpServers: servers }));
  const app = createApp({ store: new ConfigStore({ global: agent }), agentDir: agent, origins: [origin] });
  async function status(body: object = {}) {
    const response = await app.request(origin + "/api/mcp/status", { method: "POST", body: JSON.stringify(body),
      headers: { host: new URL(origin).host, origin, "content-type": "application/json" } });
    assert.equal(response.status, 200, await response.clone().text());
    return response.json();
  }
  const starts = async () => (await readFile(log, "utf8").catch(() => "")).split("\n").filter(Boolean).length;
  return { agent, servers, status, starts };
}

test("each server's state, and its tools by their names on the server, come from pi mcp list with secrets hidden", async t => {
  const f = await fixture(t);
  const view = await f.status();
  const byName = Object.fromEntries(view.servers.map((server: { name: string }) => [server.name, server]));
  assert.deepEqual([byName.echo.state, byName.echo.tools], ["connected", ["say-it.v2"]]);
  assert.equal(byName.dead.state, "failed");
  assert.ok(byName.dead.error);
  assert.equal(byName.off.state, "disabled");
  assert.doesNotMatch(JSON.stringify(view), /fixture-arg-secret/);
});

test("a status is kept while the MCP files are unchanged; asking for a fresh one, or a change, checks again", async t => {
  const f = await fixture(t);
  const first = await f.status();
  assert.equal((await f.status()).checkedAt, first.checkedAt);
  assert.equal(await f.starts(), 1);
  await f.status({ fresh: true });
  assert.equal(await f.starts(), 2);
  await writeFile(join(f.agent, "mcp.json"), JSON.stringify({ mcpServers: { echo: f.servers.echo } }));
  assert.deepEqual((await f.status()).servers.map((server: { name: string }) => server.name), ["echo"]);
  assert.equal(await f.starts(), 3);
});
