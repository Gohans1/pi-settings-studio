export type JobAction = "mcp-test" | "mcp-login" | "mcp-logout" | "package-install" | "package-remove" | "package-update" | "packages-update" | "models-refresh" | "provider-login" | "provider-check" | "pi-update";

export type JobEvent =
  | { type: "link"; url: string; label: string }
  | { type: "code"; code: string; url: string }
  | { type: "info"; message: string };

export type JobPrompt = {
  id: string;
  type: "text" | "secret" | "select" | "manual_code";
  message: string;
  placeholder?: string;
  options?: { id: string; label: string; description?: string }[];
};

/** One run of a Pi command or sign-in, started by a click. Output has known secrets replaced. */
export type JobView = {
  id: string;
  action: JobAction;
  title: string;
  status: "running" | "done" | "failed" | "cancelled";
  output: string;
  events: JobEvent[];
  prompt?: JobPrompt;
  exitCode?: number;
  error?: string;
  /** `pi mcp list --json` for mcp-test. */
  /** `pi auth check --json` for provider-check. */
  check?: { status: "ready" | "not_ready" | "invalid"; provider: string; reason?: string; authType?: string };
  result?: { servers: { name: string; scope?: string; enabled?: boolean; state: string; tools: string[]; transport?: string; error?: string }[]; errors: string[] };
};
