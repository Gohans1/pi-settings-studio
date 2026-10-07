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
