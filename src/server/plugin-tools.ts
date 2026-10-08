import { fileURLToPath } from "node:url";
import { pluginToolsSchema, type PluginToolsView } from "../shared/plugin-tools.ts";
import { ConfigError } from "./store.ts";
import type { ToolProbeInput } from "./plugin-tools-probe.ts";

/** Separate process for extension globals, crashes and cleanup; this is not a security sandbox. */
export async function runToolProbe(input: ToolProbeInput, signal?: AbortSignal, timeoutMs = 30_000): Promise<PluginToolsView> {
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
    const parsed = pluginToolsSchema.safeParse(message.result);
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
