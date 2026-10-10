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

const part = z.object({ name: z.string(), text: z.string(), tokens: z.number() });
/** The system message of a new session's first request, as Pi builds it when a turn starts. Tokens are Pi's estimate. */
const sessionContext = z.object({
  tokens: z.number(),
  /** A prompt replaced whole, which has no sections. */
  content: part.optional(),
  sections: z.array(part),
  /** The active tools Pi does not hide from requests, as the model reads them. */
  declarations: z.array(part),
  files: z.object({ systemPrompt: z.string().optional(), appendSystemPrompt: z.array(z.string()), contextFiles: z.array(z.object({ path: z.string(), tokens: z.number() })) }),
  /** Extensions whose before_agent_start handlers the preview does not run, by path. */
  unrun: z.array(z.string()),
});
export type SessionContext = z.infer<typeof sessionContext>;

/** Every tool a session registers, with the `builtin:` or file path that registered it and its namespace, and what its first request carries. */
export const sessionToolsSchema = z.object({ ...inspection, tools: z.array(tool.extend({ path: z.string(), namespace: z.string().optional() })), context: sessionContext });
export type SessionTools = z.infer<typeof sessionToolsSchema>;

/** Where a tool comes from: Pi itself, an extension (built-in ones included), or an MCP server. */
export type ToolSource = { kind: "pi" } | { kind: "extension"; name: string; group?: string } | { kind: "mcp"; server: string };
export type ToolsView = Omit<SessionTools, "tools" | "context"> & {
  tools: (PluginToolsView["tools"][number] & { source: ToolSource })[];
  /** Extensions it does not run are named by source. */
  context: Omit<SessionContext, "unrun"> & { unrun: ToolSource[] };
  /** Sources a new session takes no tools from: turned off in settings, or on and registering none. */
  idleSources: { source: ToolSource; status: "off" | "empty" }[];
};
