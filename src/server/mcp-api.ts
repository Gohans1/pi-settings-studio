import { Hono } from "hono";
import { z } from "zod";
import type { McpFileView, McpServerInput, McpServerView, NamedValue } from "../shared/mcp.ts";
import { isRecord, MCP_EXPOSURES, readMcpServers, updateMcpServer, type McpEntry } from "./mcp-config.ts";
import { ConfigError, type ConfigStore } from "./store.ts";

function strings(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every(entry => typeof entry === "string") ? value : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function toView({ name, raw, config, error }: McpEntry): McpServerView {
  const entry = isRecord(raw) ? raw : {};
  const exposure = (config ?? entry).exposure;
  return {
    name,
    ...(error ? { error } : {}),
    enabled: entry.enabled !== false,
    exposure: typeof exposure === "string" ? exposure : "codemode",
    ...(typeof entry.url === "string" ? { transport: "http" as const } : typeof entry.command === "string" ? { transport: "stdio" as const } : {}),
    description: text(entry.description),
    command: text(entry.command),
    args: strings(entry.args),
    cwd: text(entry.cwd),
    url: text(entry.url),
    timeout: typeof entry.timeout === "number" ? entry.timeout : undefined,
    env: isRecord(entry.env) ? Object.keys(entry.env) : [],
    headers: isRecord(entry.headers) ? Object.keys(entry.headers) : [],
    toolExposureRules: isRecord(entry.toolExposure) ? Object.keys(entry.toolExposure).length : 0,
    authProvider: isRecord(entry.auth) ? text(entry.auth.provider) : undefined,
  };
}

export async function mcpView(store: ConfigStore): Promise<McpFileView> {
  const path = store.path("global", "mcp.json");
  const hasBackup = await store.hasBackup("global", "mcp.json");
  let document;
  try { document = await store.read("global", "mcp.json"); }
  catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    return { path, revision: "invalid", exists: true, hasBackup, error: error.message, servers: [] };
  }
  const { servers, error, autoEnableCodemode } = readMcpServers(document.value);
  return { path, revision: document.revision, exists: document.exists, hasBackup, ...(error ? { error } : {}), autoEnableCodemode, servers: servers.map(toView) };
}

const serverPatch = z.object({
  revision: z.string().min(1).max(100),
  enabled: z.boolean().optional(),
  exposure: z.enum(MCP_EXPOSURES as [string, ...string[]]).optional(),
}).strict().refine(patch => patch.enabled !== undefined || patch.exposure !== undefined, "Nothing to change.");

const revisionOnly = z.object({ revision: z.string().min(1).max(100) }).strict();
const named = z.array(z.object({ name: z.string().min(1).max(200), value: z.string().max(10_000).optional() }).strict()).max(100);
const serverInput = z.object({
  transport: z.enum(["stdio", "http"]),
  description: z.string().max(2_000).optional(),
  command: z.string().max(2_000).optional(),
  args: z.array(z.string().max(2_000)).max(200).optional(),
  cwd: z.string().max(2_000).optional(),
  env: named.optional(),
  url: z.string().max(2_000).optional(),
  headers: named.optional(),
  timeout: z.number().positive().max(86_400).optional(),
}).strict();
const MANAGED_KEYS = ["type", "command", "args", "cwd", "env", "url", "headers", "description", "timeout"];

function servers(file: Record<string, unknown>): Record<string, unknown> {
  if (file.mcpServers === undefined) file.mcpServers = {};
  if (!isRecord(file.mcpServers)) throw new ConfigError('mcp.json needs an "mcpServers" object. Repair the file first.');
  return file.mcpServers;
}

/** Secret values never reach the browser; an entry without a value keeps the stored one. */
function withValues(list: NamedValue[] | undefined, stored: unknown): Record<string, string> | undefined {
  if (!list?.length) return undefined;
  const result: Record<string, string> = {};
  for (const { name, value } of list) {
    const previous = isRecord(stored) ? stored[name] : undefined;
    if (value) result[name] = value;
    else if (typeof previous === "string") result[name] = previous;
    else throw new ConfigError(`Enter a value for ${name}.`);
  }
  return result;
}

function buildEntry(input: McpServerInput, previous: Record<string, unknown> = {}): Record<string, unknown> {
  const entry: Record<string, unknown> = {};
  if (input.transport === "stdio") {
    entry.command = input.command ?? "";
    if (input.args?.length) entry.args = input.args;
    if (input.cwd) entry.cwd = input.cwd;
    const env = withValues(input.env, previous.env);
    if (env) entry.env = env;
  } else {
    entry.url = input.url ?? "";
    const headers = withValues(input.headers, previous.headers);
    if (headers) entry.headers = headers;
  }
  if (input.description) entry.description = input.description;
  if (input.timeout) entry.timeout = input.timeout;
  for (const [key, value] of Object.entries(previous)) {
    // OAuth and provider auth only apply to HTTP servers.
    if (MANAGED_KEYS.includes(key) || (input.transport === "stdio" && (key === "oauth" || key === "auth"))) continue;
    entry[key] = value;
  }
  return entry;
}

/** Never write an entry Pi would refuse. */
function assertAccepted(file: Record<string, unknown>, name: string): Record<string, unknown> {
  const { servers: entries, error } = readMcpServers(file);
  const entry = entries.find(server => server.name === name);
  if (error ?? entry?.error) throw new ConfigError((error ?? entry?.error)!);
  return file;
}

export function mcpRoutes(store: ConfigStore) {
  return new Hono()
    .get("/global", async c => c.json(await mcpView(store)))
    .patch("/global/servers/:name", async c => {
      const { revision, ...patch } = serverPatch.parse(await c.req.json());
      const name = c.req.param("name");
      await store.transform("global", revision, value => {
        try { return updateMcpServer(value, name, patch as Parameters<typeof updateMcpServer>[2]); }
        catch (error) { throw new ConfigError(error instanceof Error ? error.message : "Cannot change this server."); }
      }, "mcp.json");
      return c.json(await mcpView(store));
    })
    .post("/global/servers", async c => {
      const { revision, name, server } = z.object({ revision: z.string().min(1).max(100), name: z.string().max(200), server: serverInput }).strict().parse(await c.req.json());
      await store.transform("global", revision, file => {
        const entries = servers(file);
        if (Object.hasOwn(entries, name)) throw new ConfigError(`A server named "${name}" already exists.`);
        entries[name] = buildEntry(server);
        return assertAccepted(file, name);
      }, "mcp.json");
      return c.json(await mcpView(store));
    })
    .put("/global/servers/:name", async c => {
      const { revision, server } = z.object({ revision: z.string().min(1).max(100), server: serverInput }).strict().parse(await c.req.json());
      const name = c.req.param("name");
      await store.transform("global", revision, file => {
        const entries = servers(file);
        const previous = entries[name];
        if (!isRecord(previous)) throw new ConfigError(`mcp.json does not define MCP server "${name}"`);
        entries[name] = buildEntry(server, previous);
        return assertAccepted(file, name);
      }, "mcp.json");
      return c.json(await mcpView(store));
    })
    .delete("/global/servers/:name", async c => {
      const { revision } = revisionOnly.parse(await c.req.json());
      const name = c.req.param("name");
      await store.transform("global", revision, file => {
        const entries = servers(file);
        if (!Object.hasOwn(entries, name)) throw new ConfigError(`mcp.json does not define MCP server "${name}"`);
        delete entries[name];
        return file;
      }, "mcp.json");
      return c.json(await mcpView(store));
    })
    .patch("/global/settings", async c => {
      const { revision, autoEnableCodemode } = z.object({ revision: z.string().min(1).max(100), autoEnableCodemode: z.boolean() }).strict().parse(await c.req.json());
      await store.transform("global", revision, file => {
        // true is Pi's default: remove the key.
        if (autoEnableCodemode) delete file.autoEnableCodemode;
        else file.autoEnableCodemode = false;
        return file;
      }, "mcp.json");
      return c.json(await mcpView(store));
    })
    .post("/global/restore", async c => {
      const { revision } = revisionOnly.parse(await c.req.json());
      await store.restore("global", revision, "mcp.json");
      return c.json(await mcpView(store));
    });
}
