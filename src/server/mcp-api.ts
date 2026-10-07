import { Hono } from "hono";
import { z } from "zod";
import type { McpFileView, McpServerView } from "../shared/mcp.ts";
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
    });
}
