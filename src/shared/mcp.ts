import type { McpExposure } from "@earendil-works/pi-coding-agent";

export type { McpExposure };

/** One `mcpServers` entry as the browser may see it: secret values are never included. */
export type McpServerView = {
  name: string;
  /** Pi's reason for refusing the entry; Pi skips refused entries. */
  error?: string;
  /** A project entry that only switches the global server of the same name. */
  override?: boolean;
  enabled: boolean;
  exposure: string;
  transport?: "stdio" | "http";
  description?: string;
  command?: string;
  args?: string[];
  cwd?: string;
  url?: string;
  timeout?: number;
  /** Names only; values stay on the server. */
  env: string[];
  headers: string[];
  /** toolExposure: tool name or pattern → exposure. */
  toolExposure: Record<string, string>;
  /** OAuth settings without the client secret, which is only reported as set. */
  oauth?: McpOAuthView;
  authProvider?: string;
  /** For servers that sign in with OAuth: whether mcp-auth.json holds tokens. */
  signedIn?: boolean;
};

export type McpOAuthView = {
  clientId?: string; hasClientSecret?: boolean; callbackPort?: number; callbackUrl?: string; scope?: string;
  clientName?: string; clientRegistration?: "dcr" | "cimd"; authServerMetadataUrl?: string;
};

/** OAuth fields of the form. An empty clientSecret keeps the stored one unless clearClientSecret is set. */
export type McpOAuthInput = Omit<McpOAuthView, "hasClientSecret"> & { clientSecret?: string; clearClientSecret?: boolean };

export type McpFileView = {
  path: string;
  revision: string;
  exists: boolean;
  hasBackup: boolean;
  /** Whole-file problem: Pi loads none of its servers. */
  error?: string;
  autoEnableCodemode?: boolean;
  servers: McpServerView[];
};

/** A name with an optional new value. Without a value, an edit keeps the stored one. */
export type NamedValue = { name: string; value?: string };

/** What the server form edits. Keys it does not manage (enabled, exposure, oauth…) are kept. */
export type McpServerInput = {
  transport: "stdio" | "http";
  description?: string;
  command?: string;
  args?: string[];
  cwd?: string;
  env?: NamedValue[];
  url?: string;
  headers?: NamedValue[];
  timeout?: number;
  /** Undefined keeps the stored value; an empty list or null removes it. */
  toolExposure?: { tool: string; exposure: McpExposure }[];
  oauth?: McpOAuthInput | null;
  authProvider?: string | null;
};

/** What a pasted configuration would add: Pi's verdict per server, values never included. */
export type McpImportPreview = { format: string; notes: string[]; servers: { exists: boolean; server: McpServerView }[] };

/**
 * How one tool of a server reaches the model: an exact toolExposure rule, else the first `*` pattern
 * that matches, else the server's exposure. Ported from @earendil-works/pi-coding-agent 1.1.0
 * dist/core/mcp-servers.js `getMcpToolExposure` (MIT, Copyright Mario Zechner), which Pi does not export.
 */
export function toolExposure(server: { exposure?: string; toolExposure?: Record<string, string> }, tool: string): string {
  const rules = server.toolExposure ?? {};
  if (rules[tool] !== undefined) return rules[tool]!;
  for (const [pattern, exposure] of Object.entries(rules)) {
    if (!pattern.includes("*")) continue;
    const source = pattern.split("*").map(part => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*");
    if (new RegExp(`^${source}$`).test(tool)) return exposure;
  }
  return server.exposure ?? "codemode";
}
