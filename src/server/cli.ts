#!/usr/bin/env node
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { startServer } from "./server.js";

try {
  const { values } = parseArgs({ options: {
    "agent-dir": { type: "string" }, project: { type: "string" },
    port: { type: "string", default: "0" }, help: { type: "boolean" },
  } });
  if (values.help) {
    process.stdout.write("Pi Settings Studio (development preview)\nUsage: pi-settings-studio [--agent-dir PATH] [--project PATH] [--port 0]\nThe browser must run on the same machine or use local WSL forwarding.\n");
  } else {
    const port = Number(values.port);
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("Port must be an integer between 0 and 65535.");
    const rawAgentDir = values["agent-dir"] ?? process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent");
    const agentDir = resolve(rawAgentDir.replace(/^~(?=[/\\]|$)/, homedir()));
    const running = await startServer({ agentDir, projectDir: resolve(values.project ?? process.cwd()), port });
    // CLI only. The Pi extension receives the URL directly and never prints it.
    process.stderr.write(`Open this private local link (valid for 10 minutes):\n${running.url}\n`);
    const stop = () => { void running.close().catch(() => { process.exitCode = 1; }); };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : "Unable to start settings."}\n`);
  process.exitCode = 1;
}
