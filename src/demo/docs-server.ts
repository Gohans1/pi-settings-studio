// The sample "docs" MCP server of the demo: two tools, newline-delimited JSON-RPC on stdio. It answers no calls.
import { createInterface } from "node:readline";
const send = (message: object) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", ...message }) + "\n");
const text = (description: string) => ({ type: "string", description });
const tools = [
  { name: "search_docs", description: "Search the product documentation and return the best matching pages.", inputSchema: { type: "object", properties: { query: text("What to look for") }, required: ["query"] } },
  { name: "read_page", description: "Read one documentation page as Markdown.", inputSchema: { type: "object", properties: { path: text("The page path, as search_docs returns it") }, required: ["path"] } },
];
for await (const line of createInterface({ input: process.stdin })) {
  const { id, method, params } = JSON.parse(line || "{}");
  if (id === undefined) continue;
  if (method === "initialize") send({ id, result: { protocolVersion: params?.protocolVersion ?? "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "docs", version: "1.0.0" } } });
  else if (method === "tools/list") send({ id, result: { tools } });
  else if (method === "ping") send({ id, result: {} });
  else send({ id, error: { code: -32601, message: `Unknown method ${method}` } });
}
