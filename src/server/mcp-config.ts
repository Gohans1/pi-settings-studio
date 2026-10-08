// Ported from @earendil-works/pi-coding-agent 1.0.3, re-checked against 1.1.0 (MIT, Copyright Mario Zechner):
// dist/core/mcp-servers.js (validation) and dist/extensions/mcp/config.js (file rules, edits).
// Pi does not export these functions. When PI_PORT_VERSION stops matching the SDK, a test
// fails: diff Pi's two source files between versions and update this port.
import type { McpExposure, McpServerConfig } from "@earendil-works/pi-coding-agent";

export const PI_PORT_VERSION = "1.1.0";
export const MCP_EXPOSURES: readonly McpExposure[] = ["codemode", "deferred", "direct", "hidden"];
const MCP_EXPOSURE_ALIASES: Record<string, McpExposure> = { "codemode-deferred": "codemode" };
const LOOPBACK_HOSTS = ["localhost", "127.0.0.1", "[::1]"];
const SERVER_NAME = /^[A-Za-z0-9_-]+$/;

type Json = Record<string, unknown>;
export type McpEntry = { name: string; raw: unknown; config?: McpServerConfig; error?: string; override?: boolean };

const OVERRIDE_KEYS = ["enabled", "exposure", "toolExposure"];
/** An entry without command, url or type overrides the global server of the same name. */
export const isOverride = (value: Json) => value.command === undefined && value.url === undefined && value.type === undefined;

export function isRecord(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every(entry => typeof entry === "string");
}

function isLoopbackRedirectUri(value: string): boolean {
  if (!URL.canParse(value)) return false;
  const url = new URL(value);
  return url.protocol === "http:" && LOOPBACK_HOSTS.includes(url.hostname) && url.search === "" && url.hash === "";
}

/** Namespace of a server's tools: `mcp__<server>` with `-` replaced by `_`. */
export function mcpNamespace(server: string): string {
  return `mcp__${server.replace(/-/g, "_")}`;
}

function validateOAuth(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return "oauth must be an object";
  if (value.clientId !== undefined && typeof value.clientId !== "string") return "oauth.clientId must be a string";
  if (value.clientSecret !== undefined && typeof value.clientSecret !== "string") return "oauth.clientSecret must be a string";
  const port = value.callbackPort;
  if (port !== undefined && (typeof port !== "number" || !Number.isInteger(port) || port < 1 || port > 65535)) {
    return "oauth.callbackPort must be a port number";
  }
  if (value.callbackUrl !== undefined) {
    if (typeof value.callbackUrl !== "string" || !isLoopbackRedirectUri(value.callbackUrl)) {
      return "oauth.callbackUrl must be an http URI on localhost, 127.0.0.1, or [::1] without query or fragment";
    }
    const urlPort = new URL(value.callbackUrl).port;
    if (urlPort && port !== undefined && Number(urlPort) !== port) return "oauth.callbackUrl and oauth.callbackPort name different ports";
  }
  if (value.scope !== undefined && typeof value.scope !== "string") return "oauth.scope must be a string";
  if (value.clientName !== undefined && (typeof value.clientName !== "string" || !value.clientName.trim())) {
    return "oauth.clientName must be a non-empty string";
  }
  if (value.clientRegistration !== undefined && value.clientRegistration !== "dcr") {
    if (value.clientRegistration !== "cimd") return 'oauth.clientRegistration must be "dcr" or "cimd"';
    if (value.clientId !== undefined || value.clientName !== undefined) {
      return 'oauth.clientRegistration "cimd" cannot be combined with oauth.clientId or oauth.clientName';
    }
    const callback = typeof value.callbackUrl === "string" ? new URL(value.callbackUrl) : undefined;
    if (callback && (callback.hostname === "[::1]" || callback.pathname !== "/callback")) {
      return 'oauth.clientRegistration "cimd" requires oauth.callbackUrl on localhost or 127.0.0.1 with path /callback';
    }
  }
  const metadataUrl = value.authServerMetadataUrl;
  if (metadataUrl !== undefined) {
    const url = typeof metadataUrl === "string" && URL.canParse(metadataUrl) ? new URL(metadataUrl) : undefined;
    if (!url || !(url.protocol === "https:" || (url.protocol === "http:" && LOOPBACK_HOSTS.includes(url.hostname)))) {
      return "oauth.authServerMetadataUrl must be an https URL, or http on localhost, 127.0.0.1, or [::1]";
    }
  }
  return undefined;
}

function isExposure(value: unknown): value is McpExposure {
  return typeof value === "string" && (MCP_EXPOSURES as readonly string[]).includes(value);
}

function resolveExposureAlias(value: unknown): unknown {
  return typeof value === "string" ? (MCP_EXPOSURE_ALIASES[value] ?? value) : value;
}

function resolveExposureAliases(value: Json): Json {
  const resolved = { ...value };
  if (value.exposure !== undefined) resolved.exposure = resolveExposureAlias(value.exposure);
  if (isRecord(value.toolExposure)) {
    resolved.toolExposure = Object.fromEntries(Object.entries(value.toolExposure).map(([tool, entry]) => [tool, resolveExposureAlias(entry)]));
  }
  return resolved;
}

/** Validate one `mcpServers` entry. Returns the config with aliases resolved, or Pi's error message. */
export function validateMcpServerConfig(name: string, raw: unknown): McpServerConfig | string {
  if (!SERVER_NAME.test(name)) return `invalid server name "${name}" (use letters, digits, "_" and "-")`;
  if (!isRecord(raw)) return `server "${name}" must be an object`;
  const value = resolveExposureAliases(raw);
  const { type, exposure, enabled, timeout, toolExposure, description } = value;
  const exposures = MCP_EXPOSURES.map(entry => `"${entry}"`).join(", ");
  if (exposure !== undefined && !isExposure(exposure)) return `server "${name}": exposure must be one of ${exposures}`;
  if (toolExposure !== undefined) {
    if (!isRecord(toolExposure)) return `server "${name}": toolExposure must map tool names to exposures`;
    for (const [tool, entry] of Object.entries(toolExposure)) {
      if (!isExposure(entry)) return `server "${name}": toolExposure "${tool}" must be one of ${exposures}`;
    }
  }
  if (enabled !== undefined && typeof enabled !== "boolean") return `server "${name}": enabled must be a boolean`;
  if (description !== undefined && typeof description !== "string") return `server "${name}": description must be a string`;
  if (timeout !== undefined && (typeof timeout !== "number" || !(timeout > 0))) {
    return `server "${name}": timeout must be a positive number of seconds`;
  }
  if (type === "sse") return `server "${name}": legacy SSE transport is not supported; use the streamable HTTP URL`;
  if (typeof value.url === "string" && (type === undefined || type === "http" || type === "streamable-http")) {
    if (!URL.canParse(value.url) || !/^https?:$/.test(new URL(value.url).protocol)) return `server "${name}": url must be an http or https URL`;
    if (value.headers !== undefined && !isStringRecord(value.headers)) return `server "${name}": headers must map names to strings`;
    const oauthError = validateOAuth(value.oauth);
    if (oauthError) return `server "${name}": ${oauthError}`;
    if (value.auth !== undefined) {
      if (!isRecord(value.auth) || typeof value.auth.provider !== "string" || !value.auth.provider) {
        return `server "${name}": auth.provider must be a provider name`;
      }
      const url = new URL(value.url);
      if (url.protocol !== "https:" && !LOOPBACK_HOSTS.includes(url.hostname)) {
        return `server "${name}": auth requires an https URL, or http on localhost, 127.0.0.1, or [::1]`;
      }
    }
    return value as unknown as McpServerConfig;
  }
  if (typeof value.command === "string" && (type === undefined || type === "stdio")) {
    if (value.args !== undefined && !(Array.isArray(value.args) && value.args.every(arg => typeof arg === "string"))) {
      return `server "${name}": args must be an array of strings`;
    }
    if (value.env !== undefined && !isStringRecord(value.env)) return `server "${name}": env must map names to strings`;
    if (value.cwd !== undefined && typeof value.cwd !== "string") return `server "${name}": cwd must be a string`;
    return value as unknown as McpServerConfig;
  }
  return `server "${name}" needs either "command" (stdio) or "url" (streamable HTTP)`;
}

/**
 * Read an `mcp.json` the way Pi does, but keep refused entries (with Pi's reason) so the UI can
 * show and fix them. With `base` (the global servers), the file is read as a project file.
 */
export function readMcpServers(file: Json, base?: Map<string, McpServerConfig>): { servers: McpEntry[]; autoEnableCodemode?: boolean; error?: string } {
  if (file.mcpServers !== undefined && !isRecord(file.mcpServers)) return { servers: [], error: 'expected an object with an "mcpServers" object' };
  if (file.autoEnableCodemode !== undefined && typeof file.autoEnableCodemode !== "boolean") {
    return { servers: [], error: "autoEnableCodemode must be a boolean" };
  }
  const servers: McpEntry[] = [];
  const accepted: string[] = [...(base?.keys() ?? [])];
  for (const [name, raw] of Object.entries(file.mcpServers ?? {})) {
    if (base && isRecord(raw) && isOverride(raw)) {
      const global = base.get(name);
      const extra = Object.keys(raw).filter(key => !OVERRIDE_KEYS.includes(key));
      if (!global) servers.push({ name, raw, error: `server "${name}" needs "command" or "url", or a global server to override` });
      else if (extra.length) servers.push({ name, raw, error: `server "${name}": an override can only set ${OVERRIDE_KEYS.join(", ")}` });
      else {
        const config = validateMcpServerConfig(name, { ...global, ...raw });
        servers.push(typeof config === "string" ? { name, raw, error: config } : { name, raw, config, override: true });
      }
      continue;
    }
    const config = validateMcpServerConfig(name, raw);
    if (typeof config === "string") { servers.push({ name, raw, error: config }); continue; }
    // Names that differ only in `-` and `_` would share a namespace.
    const clash = accepted.find(other => other !== name && mcpNamespace(other) === mcpNamespace(name));
    if (clash) { servers.push({ name, raw, error: `server "${name}" conflicts with "${clash}"` }); continue; }
    if (base && "url" in config && config.auth) { servers.push({ name, raw, error: `server "${name}": auth is only allowed in the global mcp.json` }); continue; }
    accepted.push(name);
    servers.push({ name, raw, config });
  }
  return { servers, ...(typeof file.autoEnableCodemode === "boolean" ? { autoEnableCodemode: file.autoEnableCodemode } : {}) };
}

/**
 * Pi's `updateMcpServerConfig`: `enabled: true` and `exposure: "codemode"` are defaults and remove
 * the key, except in an override, which replaces the global values. With `override`, a missing
 * entry is added as an override.
 */
export function updateMcpServer(file: Json, name: string, patch: { enabled?: boolean; exposure?: McpExposure }, options: { override?: boolean } = {}): Json {
  const next = structuredClone(file);
  if (next.mcpServers !== undefined && !isRecord(next.mcpServers)) throw new Error('mcp.json needs an "mcpServers" object');
  const servers = (next.mcpServers ??= {}) as Json;
  if (servers[name] === undefined && options.override) servers[name] = {};
  const server = servers[name];
  if (!isRecord(server)) throw new Error(`mcp.json does not define MCP server "${name}"`);
  const keepDefaults = isOverride(server);
  if (patch.enabled !== undefined) {
    if (patch.enabled && !keepDefaults) delete server.enabled;
    else server.enabled = patch.enabled;
  }
  if (patch.exposure !== undefined) {
    if (patch.exposure === "codemode" && !keepDefaults) delete server.exposure;
    else server.exposure = patch.exposure;
  }
  return next;
}
