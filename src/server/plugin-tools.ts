import { fileURLToPath } from "node:url";
import { z } from "zod";
import type { Api, Model } from "@earendil-works/pi-ai";
import { pluginToolsSchema, sessionToolsSchema, type PluginToolsView, type SessionTools } from "../shared/plugin-tools.ts";
import { ConfigError } from "./store.ts";
import type { ExtensionProviders, ToolProbeInput } from "./plugin-tools-probe.ts";

/** One extension's tools in a session started with the given settings. */
export function runToolProbe(input: ToolProbeInput & { path: string; enabled: boolean }, signal?: AbortSignal, timeoutMs?: number): Promise<PluginToolsView> {
  return probe(input, pluginToolsSchema, signal, timeoutMs);
}

/** Every tool such a session registers. */
export function runToolsProbe(input: Omit<ToolProbeInput, "path" | "enabled">, signal?: AbortSignal, timeoutMs?: number): Promise<SessionTools> {
  return probe(input, sessionToolsSchema, signal, timeoutMs);
}

const providersSchema: z.ZodType<ExtensionProviders> = z.object({
  checkedAt: z.string(), issues: z.array(z.string()),
  providers: z.array(z.object({ id: z.string(), name: z.string(), configured: z.boolean(),
    models: z.array(z.custom<Model<Api>>(value => typeof value === "object" && value !== null && typeof (value as Model<Api>).id === "string" && typeof (value as Model<Api>).provider === "string")) })),
});

/** The providers the extensions register, without starting a session. */
export function runProvidersProbe(input: Omit<ToolProbeInput, "path" | "enabled" | "providers">, signal?: AbortSignal, timeoutMs?: number): Promise<ExtensionProviders> {
  return probe({ ...input, providers: true }, providersSchema, signal, timeoutMs);
}

/** Separate process for extension globals, crashes and cleanup; this is not a security sandbox. */
async function probe<T>(input: ToolProbeInput, schema: z.ZodType<T>, signal?: AbortSignal, timeoutMs = 30_000): Promise<T> {
  if (signal?.aborted) throw new ConfigError("Tool inspection cancelled.", 408);
  const timeout = AbortSignal.timeout(timeoutMs);
  let message: { result?: unknown; error?: string } | undefined;
  const child = Bun.spawn([process.execPath, fileURLToPath(new URL("./plugin-tools-probe.ts", import.meta.url))], {
    cwd: input.cwd, env: { ...process.env, PI_CODING_AGENT_DIR: input.agentDir },
    stdin: new Blob([JSON.stringify(input)]), stdout: "ignore", stderr: "ignore",
    ipc(value) { message = value; },
    detached: process.platform !== "win32",
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout, killSignal: "SIGKILL",
  });
  try {
    const exit = await child.exited;
    if (timeout.aborted) throw new ConfigError("Tool inspection timed out. An extension or MCP server did not finish starting. Try Refresh tools.", 504);
    if (signal?.aborted) throw new ConfigError("Tool inspection cancelled.", 408);
    if (exit !== 0 || !message) throw new ConfigError("An extension stopped the inspection process. Try Refresh tools after checking the extension.", 502);
    if (message.error) throw new ConfigError(message.error, 502);
    const parsed = schema.safeParse(message.result);
    if (!parsed.success) throw new ConfigError("Pi returned an unreadable tool inspection result.", 502);
    return parsed.data;
  } finally {
    // Kill only this subprocess's process group, including MCP stdio children left after a crash.
    if (process.platform !== "win32") {
      try { process.kill(-child.pid, "SIGKILL"); } catch { /* group has already exited */ }
    } else if (child.exitCode === null) child.kill("SIGKILL");
    child.disconnect();
  }
}
