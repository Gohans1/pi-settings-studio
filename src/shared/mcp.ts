import type { McpExposure } from "@earendil-works/pi-coding-agent";

export type { McpExposure };

/** One `mcpServers` entry as the browser may see it: secret values are never included. */
export type McpServerView = {
  name: string;
  /** Pi's reason for refusing the entry; Pi skips refused entries. */
  error?: string;
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
  toolExposureRules: number;
  authProvider?: string;
};

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
};
