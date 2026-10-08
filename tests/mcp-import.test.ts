import { test } from "node:test";
import assert from "node:assert/strict";
import { convertMcpConfig } from "../src/server/mcp-import.ts";

test("Claude Desktop, Claude Code and Cursor entries are copied as they are", () => {
  const result = convertMcpConfig(JSON.stringify({ mcpServers: { fs: { type: "stdio", command: "npx", args: ["-y", "fs-mcp"], env: { KEY: "v" } } } }));
  assert.equal(result.format, "Claude Desktop, Claude Code or Cursor");
  assert.deepEqual(result.servers, { fs: { type: "stdio", command: "npx", args: ["-y", "fs-mcp"], env: { KEY: "v" } } });
  assert.deepEqual(result.notes, []);
});

test("VS Code servers: comments allowed, ${input:…} prompts become environment variables", () => {
  const result = convertMcpConfig(`{
    // VS Code allows comments
    "inputs": [{ "id": "gh-token", "type": "promptString", "password": true }],
    "servers": {
      "github": { "type": "http", "url": "https://api.example.com/mcp/", "headers": { "Authorization": "Bearer \${input:gh-token}" } },
      "fs": { "type": "stdio", "command": "npx", "args": ["\${workspaceFolder}"], "env": { "DIR": "\${env:HOME}" }, "envFile": ".env" },
      "old": { "type": "sse", "url": "https://old.example.com/sse" },
    },
  }`);
  assert.equal(result.format, "VS Code");
  assert.deepEqual(result.servers, {
    github: { url: "https://api.example.com/mcp/", headers: { Authorization: "Bearer ${GH_TOKEN}" } },
    fs: { command: "npx", args: ["."], env: { DIR: "${HOME}" } },
    old: { type: "sse", url: "https://old.example.com/sse" },
  });
  assert.deepEqual(result.notes, [
    "github: the VS Code prompt ${input:gh-token} became the environment variable ${GH_TOKEN}. Set it before starting Pi.",
    "fs: dropped envFile, which Pi does not support.",
    'fs: ${workspaceFolder} became ".", the session directory Pi starts servers in.',
  ]);
});

test("OpenCode local and remote entries are converted", () => {
  const result = convertMcpConfig(JSON.stringify({ $schema: "https://opencode.ai/config.json", mcp: {
    tools: { type: "local", command: ["bunx", "my-mcp", "--fast"], environment: { KEY: "{env:MY_KEY}" }, enabled: false, timeout: 5000 },
    remote: { type: "remote", url: "https://r.example.com/mcp", headers: { Authorization: "Bearer {env:TOK}" }, oauth: { clientId: "c", scope: "read" } },
    plain: { type: "remote", url: "https://p.example.com/mcp", oauth: false },
  } }));
  assert.equal(result.format, "OpenCode");
  assert.deepEqual(result.servers, {
    tools: { command: "bunx", args: ["my-mcp", "--fast"], env: { KEY: "${MY_KEY}" }, enabled: false },
    remote: { url: "https://r.example.com/mcp", headers: { Authorization: "Bearer ${TOK}" }, oauth: { clientId: "c", scope: "read" } },
    plain: { url: "https://p.example.com/mcp" },
  });
  assert.deepEqual(result.notes, [
    "tools: OpenCode's timeout (milliseconds to list tools) was dropped; Pi's timeout is per request, in seconds.",
    "plain: dropped oauth: false; Pi signs in with OAuth only when the server asks for it.",
  ]);
});

test("Codex [mcp_servers] TOML tables are converted, tool lists become exposure rules", () => {
  const result = convertMcpConfig(`
model = "gpt-5"

[mcp_servers.docs]
command = "npx"
args = ["-y", "docs-mcp"]
env = { API_KEY = "x" }
env_vars = ["HOME_TOKEN", { name = "REMOTE_ONLY", source = "remote" }]
tool_timeout_sec = 30
startup_timeout_sec = 20
disabled_tools = ["delete"]

[mcp_servers.remote]
url = "https://r.example.com/mcp"
bearer_token_env_var = "R_TOKEN"
http_headers = { "X-Team" = "a" }
env_http_headers = { "X-Key" = "R_KEY" }
enabled_tools = ["search"]
enabled = false
`);
  assert.equal(result.format, "Codex");
  assert.deepEqual(result.servers, {
    docs: { command: "npx", args: ["-y", "docs-mcp"], env: { API_KEY: "x", HOME_TOKEN: "${HOME_TOKEN}", REMOTE_ONLY: "${REMOTE_ONLY}" }, timeout: 30, toolExposure: { delete: "hidden" } },
    remote: { url: "https://r.example.com/mcp", headers: { Authorization: "Bearer ${R_TOKEN}", "X-Team": "a", "X-Key": "${R_KEY}" },
      enabled: false, exposure: "hidden", toolExposure: { search: "codemode" } },
  });
  assert.deepEqual(result.notes, ["docs: dropped startup_timeout_sec, which Pi does not support."]);
});

test("a bare server map or a single entry without braces is accepted", () => {
  assert.deepEqual(convertMcpConfig(`{ "fs": { "command": "npx" } }`).servers, { fs: { command: "npx" } });
  assert.deepEqual(convertMcpConfig(`"fs": { "command": "npx" },`).servers, { fs: { command: "npx" } });
});

test("text that is not an MCP configuration is refused with a reason", () => {
  assert.throws(() => convertMcpConfig("hello there"), /Paste JSON from Claude, Cursor, VS Code or OpenCode, or Codex TOML/);
  assert.throws(() => convertMcpConfig(`{ "theme": "dark" }`), /No MCP servers found/);
});
