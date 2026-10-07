import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PI_PORT_VERSION, readMcpServers, updateMcpServer } from "../src/server/mcp-config.ts";

test("valid entries keep their config; refused entries carry Pi's reason instead of disappearing", () => {
  const { servers } = readMcpServers({
    mcpServers: {
      files: { command: "npx", args: ["-y", "server-filesystem"] },
      docs: { url: "https://example.com/mcp", exposure: "deferred" },
      legacy: { url: "https://example.com/sse", type: "sse" },
      "bad name!": { command: "x" },
      empty: {},
    },
  });
  assert.deepEqual(servers.map(server => [server.name, server.error ?? "ok"]), [
    ["files", "ok"],
    ["docs", "ok"],
    ["legacy", 'server "legacy": legacy SSE transport is not supported; use the streamable HTTP URL'],
    ["bad name!", 'invalid server name "bad name!" (use letters, digits, "_" and "-")'],
    ["empty", 'server "empty" needs either "command" (stdio) or "url" (streamable HTTP)'],
  ]);
  assert.equal(servers[1]!.config?.exposure, "deferred");
});

test("exposure aliases resolve like Pi and names that differ only in - and _ conflict", () => {
  const { servers } = readMcpServers({
    mcpServers: {
      "dev-tools": { command: "a", exposure: "codemode-deferred" },
      dev_tools: { command: "b" },
    },
  });
  assert.equal(servers[0]!.config?.exposure, "codemode");
  assert.equal(servers[1]!.error, 'server "dev_tools" conflicts with "dev-tools"');
});

test("a file without an mcpServers object is reported as a whole-file problem", () => {
  assert.equal(readMcpServers({ mcpServers: [] }).error, 'expected an object with an "mcpServers" object');
  assert.equal(readMcpServers({ autoEnableCodemode: "yes" }).error, "autoEnableCodemode must be a boolean");
  assert.deepEqual(readMcpServers({}).servers, []);
});

test("turning a server on or back to codemode removes the key, as Pi's /mcp does", () => {
  const file = { mcpServers: { a: { command: "x", enabled: false, exposure: "direct", env: { K: "v" } } }, other: 1 };
  const enabled = updateMcpServer(file, "a", { enabled: true, exposure: "codemode" });
  assert.deepEqual(enabled, { mcpServers: { a: { command: "x", env: { K: "v" } } }, other: 1 });
  assert.deepEqual(updateMcpServer(enabled, "a", { enabled: false, exposure: "hidden" }).mcpServers, {
    a: { command: "x", env: { K: "v" }, enabled: false, exposure: "hidden" },
  });
  assert.equal(file.mcpServers.a.enabled, false, "the input object is not mutated");
  assert.throws(() => updateMcpServer(file, "missing", { enabled: true }), /does not define MCP server "missing"/);
});

test("the MCP port matches the Pi SDK in node_modules; re-check Pi's source when this fails", () => {
  const sdk = JSON.parse(readFileSync("node_modules/@earendil-works/pi-coding-agent/package.json", "utf8"));
  assert.equal(sdk.version, PI_PORT_VERSION);
});
