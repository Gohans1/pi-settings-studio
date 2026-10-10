import { z } from "zod";

const tool = z.object({
  name: z.string(),
  description: z.string(),
  exposure: z.enum(["direct", "model-only", "codemode", "deferred", "hidden"]),
  visibility: z.enum(["model", "callable", "inactive", "hidden", "disabled", "shadowed", "unknown"]),
});
const inspection = { checkedAt: z.string(), complete: z.boolean(), issues: z.array(z.string()) };

export const pluginToolsSchema = z.object({ path: z.string(), enabled: z.boolean(), ...inspection, tools: z.array(tool) });
export type PluginToolsView = z.infer<typeof pluginToolsSchema>;

/** Every tool a session registers, with the `builtin:` or file path that registered it and its namespace. */
export const sessionToolsSchema = z.object({ ...inspection, tools: z.array(tool.extend({ path: z.string(), namespace: z.string().optional() })) });
export type SessionTools = z.infer<typeof sessionToolsSchema>;

/** Where a tool comes from: Pi itself, an extension (built-in ones included), or an MCP server. */
export type ToolSource = { kind: "pi" } | { kind: "extension"; name: string; group?: string } | { kind: "mcp"; server: string };
export type ToolsView = Omit<SessionTools, "tools"> & {
  tools: (PluginToolsView["tools"][number] & { source: ToolSource })[];
  /** Sources a new session takes no tools from: turned off in settings, or on and registering none. */
  idleSources: { source: ToolSource; status: "off" | "empty" }[];
};
