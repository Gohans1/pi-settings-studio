#!/usr/bin/env bun
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { DEFAULT_PORT, startServer } from "./server.ts";

try {
  const { values } = parseArgs({ options: {
    "agent-dir": { type: "string" }, project: { type: "string" },
    port: { type: "string", default: String(DEFAULT_PORT) }, help: { type: "boolean" },
  } });
  if (values.help) {
    process.stdout.write(`Pi Settings Studio\nUsage: bun src/server/cli.ts [--agent-dir PATH] [--project PATH] [--port ${DEFAULT_PORT}]\n`);
  } else {
    const port = Number(values.port);
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("Port must be an integer between 0 and 65535.");
    const rawAgentDir = values["agent-dir"] ?? process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent");
    const agentDir = resolve(rawAgentDir.replace(/^~(?=[/\\]|$)/, homedir()));
    // Projects come from Pi's sessions; --project adds one that has none yet.
    const running = await startServer({ agentDir, projectDir: values.project && resolve(values.project), port, checkUpdates: true });
    process.stderr.write(`Pi Settings Studio: ${running.url}\n`);
    const stop = () => { void running.close().catch(() => { process.exitCode = 1; }); };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : "Unable to start settings."}\n`);
  process.exitCode = 1;
}
