import { Hono } from "hono";
import { z } from "zod";
import type { McpFileView, McpServerInput, McpServerView, NamedValue } from "../shared/mcp.ts";
import { isRecord, MCP_EXPOSURES, readMcpServers, updateMcpServer, type McpEntry } from "./mcp-config.ts";
import { maskArgs, maskUrl, unmaskArgs, unmaskUrl } from "./mcp-secrets.ts";
import { maskJson, mcpSecrets, unmaskJson } from "./json-secrets.ts";
import { ConfigError, type ConfigStore, type Scope } from "./store.ts";
import type { ProjectRegistry } from "./projects.ts";
import type { McpServerConfig } from "@earendil-works/pi-coding-agent";

function strings(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every(entry => typeof entry === "string") ? value : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** Env and header values: an arg that repeats one is hidden too. */
function secretValues(entry: Record<string, unknown>): string[] {
  return [entry.env, entry.headers].flatMap(group => isRecord(group) ? Object.values(group).filter((value): value is string => typeof value === "string") : []);
}

function toView({ name, raw, config, error, override }: McpEntry): McpServerView {
  // An override shows the merged server: the global entry with the project's switches.
  const entry = override && config ? config as unknown as Record<string, unknown> : isRecord(raw) ? raw : {};
  const args = strings(entry.args);
  const url = text(entry.url);
  const exposure = (config ?? entry).exposure;
  return {
    name,
    ...(error ? { error } : {}),
    ...(override ? { override } : {}),
    enabled: entry.enabled !== false,
    exposure: typeof exposure === "string" ? exposure : "codemode",
    ...(typeof entry.url === "string" ? { transport: "http" as const } : typeof entry.command === "string" ? { transport: "stdio" as const } : {}),
    description: text(entry.description),
    command: text(entry.command),
    args: args && maskArgs(args, secretValues(entry)).masked,
    cwd: text(entry.cwd),
    url: url && maskUrl(url),
    timeout: typeof entry.timeout === "number" ? entry.timeout : undefined,
    env: isRecord(entry.env) ? Object.keys(entry.env) : [],
    headers: isRecord(entry.headers) ? Object.keys(entry.headers) : [],
    toolExposureRules: isRecord(entry.toolExposure) ? Object.keys(entry.toolExposure).length : 0,
    authProvider: isRecord(entry.auth) ? text(entry.auth.provider) : undefined,
  };
}

export async function mcpView(store: ConfigStore, scope: Scope = "global", base?: Map<string, McpServerConfig>): Promise<McpFileView> {
  const path = store.path(scope, "mcp.json");
  const hasBackup = await store.hasBackup(scope, "mcp.json");
  let document;
  try { document = await store.read(scope, "mcp.json"); }
  catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    return { path, revision: "invalid", exists: true, hasBackup, error: error.message, servers: [] };
  }
  const { servers, error, autoEnableCodemode } = readMcpServers(document.value, base);
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
export function withValues(list: NamedValue[] | undefined, stored: unknown): Record<string, string> | undefined {
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
    const args = input.args?.length ? unmaskArgs(input.args, strings(previous.args) ?? [], secretValues(previous)) : [];
    if (args.length) entry.args = args;
    if (input.cwd) entry.cwd = input.cwd;
    const env = withValues(input.env, previous.env);
    if (env) entry.env = env;
  } else {
    entry.url = unmaskUrl(input.url ?? "", text(previous.url));
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
function assertAccepted(file: Record<string, unknown>, name: string, base?: Map<string, McpServerConfig>): Record<string, unknown> {
  const { servers: entries, error } = readMcpServers(file, base);
  const entry = entries.find(server => server.name === name);
  if (error ?? entry?.error) throw new ConfigError((error ?? entry?.error)!);
  return file;
}

const SCOPE = z.enum(["global", "project"]);
type Context = { scope: Scope; store: ConfigStore; base?: Map<string, McpServerConfig> };

export function mcpRoutes(store: ConfigStore, registry: ProjectRegistry) {
  /** Global servers, which a project file can override or replace. */
  async function globalServers(): Promise<Map<string, McpServerConfig>> {
    try {
      const { servers } = readMcpServers((await store.read("global", "mcp.json")).value);
      return new Map(servers.flatMap(server => server.config ? [[server.name, server.config] as const] : []));
    } catch (error) { if (error instanceof ConfigError) return new Map(); throw error; }
  }
  async function context(scopeParam: string, project: string | undefined): Promise<Context> {
    const scope = SCOPE.parse(scopeParam);
    if (scope === "global") return { scope, store };
    return { scope, store: registry.storeFor(await registry.require(project)), base: await globalServers() };
  }
  const ctx = (c: { req: { param: (name: "scope") => string; query: (name: string) => string | undefined } }) => context(c.req.param("scope"), c.req.query("project"));
  const view = ({ scope, store, base }: Context) => mcpView(store, scope, base);

  /** Raw text with secrets as ‹hidden N› placeholders; the revision is of the file on disk. */
  async function raw({ scope, store }: Context) {
    const { text, revision } = await store.readText(scope, "mcp.json");
    let value: Record<string, unknown>;
    try { value = JSON.parse(text); } catch { throw new ConfigError(`${store.path(scope, "mcp.json")} is not valid JSON, so its secrets cannot be hidden. Repair it in a text editor.`); }
    if (!isRecord(value)) throw new ConfigError("mcp.json must contain a JSON object.");
    return { path: store.path(scope, "mcp.json"), revision, text: maskJson(value, mcpSecrets(value)) };
  }

  return new Hono()
    .get("/:scope/raw", async c => c.json(await raw(await ctx(c))))
    .put("/:scope/raw", async c => {
      const context = await ctx(c);
      const { revision, text } = z.object({ revision: z.string().min(1).max(100), text: z.string().max(60_000) }).strict().parse(await c.req.json());
      // Pi skips entries it refuses; the view lists them after saving.
      await context.store.transform(context.scope, revision, current => unmaskJson(text, mcpSecrets(current)), "mcp.json");
      return c.json(await raw(context));
    })
    .get("/:scope", async c => c.json(await view(await ctx(c))))
    .patch("/:scope/servers/:name", async c => {
      const context = await ctx(c);
      const { revision, ...patch } = serverPatch.parse(await c.req.json());
      const name = c.req.param("name");
      await context.store.transform(context.scope, revision, value => {
        // In a project, a global server without a project entry gets an override, as /mcp does.
        const override = !!context.base?.has(name);
        try { return updateMcpServer(value, name, patch as Parameters<typeof updateMcpServer>[2], { override }); }
        catch (error) { throw new ConfigError(error instanceof Error ? error.message : "Cannot change this server."); }
      }, "mcp.json");
      return c.json(await view(context));
    })
    .post("/:scope/servers", async c => {
      const context = await ctx(c);
      const { revision, name, server } = z.object({ revision: z.string().min(1).max(100), name: z.string().max(200), server: serverInput }).strict().parse(await c.req.json());
      await context.store.transform(context.scope, revision, file => {
        const entries = servers(file);
        if (Object.hasOwn(entries, name)) throw new ConfigError(`A server named "${name}" already exists in this file.`);
        entries[name] = buildEntry(server);
        return assertAccepted(file, name, context.base);
      }, "mcp.json");
      return c.json(await view(context));
    })
    .put("/:scope/servers/:name", async c => {
      const context = await ctx(c);
      const { revision, server } = z.object({ revision: z.string().min(1).max(100), server: serverInput }).strict().parse(await c.req.json());
      const name = c.req.param("name");
      await context.store.transform(context.scope, revision, file => {
        const entries = servers(file);
        const previous = entries[name];
        if (!isRecord(previous)) throw new ConfigError(`mcp.json does not define MCP server "${name}"`);
        entries[name] = buildEntry(server, previous);
        return assertAccepted(file, name, context.base);
      }, "mcp.json");
      return c.json(await view(context));
    })
    .delete("/:scope/servers/:name", async c => {
      const context = await ctx(c);
      const { revision } = revisionOnly.parse(await c.req.json());
      const name = c.req.param("name");
      await context.store.transform(context.scope, revision, file => {
        const entries = servers(file);
        if (!Object.hasOwn(entries, name)) throw new ConfigError(`mcp.json does not define MCP server "${name}"`);
        delete entries[name];
        return file;
      }, "mcp.json");
      return c.json(await view(context));
    })
    .patch("/:scope/settings", async c => {
      const context = await ctx(c);
      const { revision, autoEnableCodemode } = z.object({ revision: z.string().min(1).max(100), autoEnableCodemode: z.boolean().nullable() }).strict().parse(await c.req.json());
      await context.store.transform(context.scope, revision, file => {
        // Globally true is Pi's default; in a project, null inherits and a value overrides.
        if (autoEnableCodemode === null || (autoEnableCodemode && context.scope === "global")) delete file.autoEnableCodemode;
        else file.autoEnableCodemode = autoEnableCodemode;
        return file;
      }, "mcp.json");
      return c.json(await view(context));
    })
    .post("/:scope/restore", async c => {
      const context = await ctx(c);
      const { revision } = revisionOnly.parse(await c.req.json());
      await context.store.restore(context.scope, revision, "mcp.json");
      return c.json(await view(context));
    });
}
