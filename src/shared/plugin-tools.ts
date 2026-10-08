import { z } from "zod";

export const pluginToolsSchema = z.object({
  path: z.string(),
  enabled: z.boolean(),
  checkedAt: z.string(),
  complete: z.boolean(),
  issues: z.array(z.string()),
  tools: z.array(z.object({
    name: z.string(),
    description: z.string(),
    exposure: z.enum(["direct", "model-only", "codemode", "deferred", "hidden"]),
    visibility: z.enum(["model", "callable", "inactive", "hidden", "disabled", "shadowed", "unknown"]),
  })),
});
export type PluginToolsView = z.infer<typeof pluginToolsSchema>;
