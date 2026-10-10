// A minimal stdio MCP server for tests: one "echo" tool, newline-delimited JSON-RPC.
// ECHO_LOG names a file that gets a line each time the server starts; ECHO_DELAY_MS slows tools/list;
// an argument renames the tool.
import { appendFileSync } from "node:fs";
import { createInterface } from "node:readline";
if (process.env.ECHO_LOG) appendFileSync(process.env.ECHO_LOG, "started\n");
const delay = Number(process.env.ECHO_DELAY_MS ?? 0);
const send = (message: object) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", ...message }) + "\n");
for await (const line of createInterface({ input: process.stdin })) {
  if (!line.trim()) continue;
  const { id, method, params } = JSON.parse(line);
  if (id === undefined) continue;
  if (method === "initialize") send({ id, result: { protocolVersion: params?.protocolVersion ?? "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "echo", version: "1.0.0" } } });
  else if (method === "tools/list") {
    const tools = { id, result: { tools: [{ name: process.argv[2] ?? "echo", description: "Echo text", inputSchema: { type: "object", properties: { text: { type: "string" } } } }] } };
    if (delay) setTimeout(() => send(tools), delay); else send(tools);
  }
  else if (method === "ping") send({ id, result: {} });
  else send({ id, error: { code: -32601, message: `Unknown method ${method}` } });
}
