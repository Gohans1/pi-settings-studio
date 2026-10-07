import { Hono } from "hono";
import type { McpFileView, McpServerView } from "../shared/mcp.ts";
import { isRecord, readMcpServers, type McpEntry } from "./mcp-config.ts";
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

export function mcpRoutes(store: ConfigStore) {
  return new Hono().get("/global", async c => c.json(await mcpView(store)));
}
