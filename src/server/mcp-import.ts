// Converts MCP configuration from other clients to Pi's mcpServers entries, following the table in
// Pi's docs/mcp.md ("Migrate configuration from another client"). Pi validates the result.
import { isRecord } from "./mcp-config.ts";
import { ConfigError } from "./store.ts";

type Json = Record<string, unknown>;
export type McpImport = { format: string; servers: Record<string, Json>; notes: string[] };

function parse(text: string): unknown {
  const trimmed = text.trim();
  // A single `"name": { … }` entry copied without its braces is accepted too. Bun.JSONC.parse
  // returns the first value and ignores what follows, so only an object counts.
  for (const candidate of [trimmed, `{${trimmed.replace(/,\s*$/, "")}}`]) {
    try {
      const value = Bun.JSONC.parse(candidate);
      if (isRecord(value)) return value;
    } catch { /* try the next form */ }
  }
  try { return Bun.TOML.parse(trimmed); } catch { /* not TOML either */ }
  throw new ConfigError("Paste JSON from Claude, Cursor, VS Code or OpenCode, or Codex TOML.");
}

const strings = (value: unknown, map: (text: string) => string = text => text): Record<string, string> | undefined => {
  if (!isRecord(value)) return undefined;
  const entries = Object.entries(value).filter(([, item]) => typeof item === "string" || typeof item === "number").map(([key, item]) => [key, map(String(item))]);
  return entries.length ? Object.fromEntries(entries) : undefined;
};
const set = (target: Json, key: string, value: unknown) => { if (value !== undefined) target[key] = value; };
const dropped = (name: string, entry: Json, used: string[], notes: string[]) => {
  const keys = Object.keys(entry).filter(key => !used.includes(key));
  if (keys.length) notes.push(`${name}: dropped ${keys.join(", ")}, which Pi does not support.`);
};

function fromVsCode(servers: Json, notes: string[]) {
  const out: Record<string, Json> = {};
  for (const [name, entry] of Object.entries(servers)) {
    if (!isRecord(entry)) continue;
    const inputs = new Map<string, string>();
    let workspace = false;
    const text = (value: string) => value
      .replace(/\$\{input:([^}]+)\}/g, (_, id: string) => {
        const variable = id.replace(/[^A-Za-z0-9]+/g, "_").toUpperCase();
        inputs.set(id, variable);
        return `\${${variable}}`;
      })
      .replace(/\$\{env:([^}]+)\}/g, "${$1}")
      .replace(/^\$\{userHome\}/, "~")
      .replace(/\$\{workspaceFolder\}/g, () => { workspace = true; return "."; });
    const server: Json = {};
    // command or url selects the transport; sse stays so Pi reports that it does not support it.
    if (entry.type === "sse") server.type = "sse";
    if (typeof entry.command === "string") server.command = text(entry.command);
    if (Array.isArray(entry.args)) server.args = entry.args.map(arg => text(String(arg)));
    if (typeof entry.cwd === "string" && text(entry.cwd) !== ".") server.cwd = text(entry.cwd);
    set(server, "env", strings(entry.env, text));
    if (typeof entry.url === "string") server.url = entry.url;
    set(server, "headers", strings(entry.headers, text));
    if (isRecord(entry.oauth)) server.oauth = entry.oauth;
    out[name] = server;
    for (const [id, variable] of inputs) notes.push(`${name}: the VS Code prompt \${input:${id}} became the environment variable \${${variable}}. Set it before starting Pi.`);
    dropped(name, entry, ["type", "command", "args", "cwd", "env", "url", "headers", "oauth"], notes);
    if (workspace) notes.push(`${name}: \${workspaceFolder} became ".", the session directory Pi starts servers in.`);
  }
  return out;
}

function fromOpenCode(servers: Json, notes: string[]) {
  const out: Record<string, Json> = {};
  const text = (value: string) => value.replace(/\{env:([^}]+)\}/g, "${$1}");
  for (const [name, entry] of Object.entries(servers)) {
    if (!isRecord(entry)) continue;
    const server: Json = {};
    const used = ["type", "enabled", "timeout", "oauth"];
    if (entry.type === "local" && Array.isArray(entry.command) && entry.command.length) {
      const [command, ...args] = entry.command.map(part => text(String(part)));
      server.command = command;
      if (args.length) server.args = args;
      if (typeof entry.cwd === "string") server.cwd = text(entry.cwd);
      set(server, "env", strings(entry.environment, text));
      used.push("command", "cwd", "environment");
    } else if (typeof entry.url === "string") {
      server.url = entry.url;
      set(server, "headers", strings(entry.headers, text));
      const oauth = strings(entry.oauth, text);
      if (oauth) server.oauth = oauth;
      used.push("url", "headers");
    }
    if (typeof entry.enabled === "boolean" && !entry.enabled) server.enabled = false;
    out[name] = server;
    dropped(name, entry, used, notes);
    if (entry.timeout !== undefined) notes.push(`${name}: OpenCode's timeout (milliseconds to list tools) was dropped; Pi's timeout is per request, in seconds.`);
    if (entry.oauth === false) notes.push(`${name}: dropped oauth: false; Pi signs in with OAuth only when the server asks for it.`);
  }
  return out;
}

function fromCodex(servers: Json, notes: string[]) {
  const out: Record<string, Json> = {};
  for (const [name, entry] of Object.entries(servers)) {
    if (!isRecord(entry)) continue;
    const server: Json = {};
    if (typeof entry.command === "string") {
      server.command = entry.command;
      if (Array.isArray(entry.args)) server.args = entry.args.map(String);
      if (typeof entry.cwd === "string") server.cwd = entry.cwd;
      // env_vars forwards variables by name, which ${NAME} values do in Pi.
      const forwarded = (Array.isArray(entry.env_vars) ? entry.env_vars : [])
        .map(item => typeof item === "string" ? item : isRecord(item) && typeof item.name === "string" ? item.name : undefined)
        .filter((item): item is string => !!item).map(variable => [variable, `\${${variable}}`]);
      const env = { ...strings(entry.env), ...Object.fromEntries(forwarded) };
      if (Object.keys(env).length) server.env = env;
    } else if (typeof entry.url === "string") {
      server.url = entry.url;
      const headers: Record<string, string> = {};
      if (typeof entry.bearer_token_env_var === "string") headers.Authorization = `Bearer \${${entry.bearer_token_env_var}}`;
      Object.assign(headers, strings(entry.http_headers), strings(entry.env_http_headers, variable => `\${${variable}}`));
      if (Object.keys(headers).length) server.headers = headers;
    }
    if (entry.enabled === false) server.enabled = false;
    if (typeof entry.tool_timeout_sec === "number") server.timeout = entry.tool_timeout_sec;
    // enabled_tools is an allow list; disabled_tools applies after it.
    const rules: Record<string, string> = {};
    if (Array.isArray(entry.enabled_tools)) {
      server.exposure = "hidden";
      for (const tool of entry.enabled_tools) rules[String(tool)] = "codemode";
    }
    if (Array.isArray(entry.disabled_tools)) for (const tool of entry.disabled_tools) rules[String(tool)] = "hidden";
    if (Object.keys(rules).length) server.toolExposure = rules;
    out[name] = server;
    dropped(name, entry, ["command", "args", "cwd", "env", "env_vars", "url", "bearer_token_env_var", "http_headers", "env_http_headers",
      "enabled", "tool_timeout_sec", "enabled_tools", "disabled_tools"], notes);
  }
  return out;
}

export function convertMcpConfig(text: string): McpImport {
  const value = parse(text);
  const notes: string[] = [];
  let result: Omit<McpImport, "notes"> | undefined;
  if (isRecord(value)) {
    if (isRecord(value.mcpServers)) result = { format: "Claude Desktop, Claude Code or Cursor", servers: structuredClone(value.mcpServers) as Record<string, Json> };
    else if (isRecord(value.servers)) result = { format: "VS Code", servers: fromVsCode(value.servers, notes) };
    else if (isRecord(value.mcp)) result = { format: "OpenCode", servers: fromOpenCode(value.mcp, notes) };
    else if (isRecord(value.mcp_servers)) result = { format: "Codex", servers: fromCodex(value.mcp_servers, notes) };
    else if (Object.values(value).length && Object.values(value).every(entry => isRecord(entry) && ("command" in entry || "url" in entry))) {
      result = { format: "Server entries", servers: structuredClone(value) as Record<string, Json> };
    }
  }
  if (!result || !Object.keys(result.servers).length) throw new ConfigError("No MCP servers found. Paste a whole configuration file or its servers object.");
  return { ...result, notes };
}
