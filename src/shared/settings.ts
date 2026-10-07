import { z } from "zod";

export type Field = {
  key: string;
  label: string;
  section: "models" | "tools";
  kind: "text" | "select" | "number" | "lines";
  help: string;
  options?: readonly string[];
  defaultValue?: unknown;
  schema: z.ZodType;
};

const text = z.string().max(500).refine(v => !/[\u0000-\u001f]/.test(v), "Control characters are not allowed.");
const lines = z.array(text.min(1)).max(200);
export const fields: Field[] = [
  { key: "defaultProvider", label: "Default provider", section: "models", kind: "text", help: "Provider ID to use when Pi starts. Leave inherited for automatic selection.", schema: text },
  { key: "defaultModel", label: "Default model", section: "models", kind: "text", help: "Exact model ID, not its display name. Availability and credentials are checked by Pi at startup.", schema: text },
  { key: "defaultThinkingLevel", label: "Thinking level", section: "models", kind: "select", help: "Preferred reasoning effort. Support depends on the selected model.", options: ["off", "minimal", "low", "medium", "high", "xhigh", "max"], defaultValue: "medium", schema: z.enum(["off", "minimal", "low", "medium", "high", "xhigh", "max"]) },
  { key: "enabledModels", label: "Enabled models", section: "models", kind: "lines", help: "One model pattern per line, using Pi's --models format. An inherited value allows all available models.", schema: lines },
  { key: "defaultTools", label: "Startup tools", section: "tools", kind: "lines", help: "One tool per line. +codemode adds codemode to inherited tools. Plain names replace the selection; an empty list disables built-in tools, not SDK or extension tools.", defaultValue: ["read", "bash", "edit", "write"], schema: lines },
  { key: "codemode.mode", label: "Codemode exposure", section: "tools", kind: "select", help: "on keeps declared tools visible; only routes eligible tools through codemode. Applies when codemode is enabled.", options: ["on", "only"], defaultValue: "on", schema: z.enum(["on", "only"]) },
  { key: "codemode.inlineBudget", label: "Inline tool budget", section: "tools", kind: "number", help: "Estimated tokens allowed for tool declarations. Zero lists namespaces only; remaining tools are discovered with searchTools().", defaultValue: 3000, schema: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER) },
];
export const changeSchema = z.object({
  revision: z.string().min(1).max(100),
  changes: z.array(z.union([
    z.object({ key: z.string(), value: z.unknown().refine(v => v !== undefined, "A value is required.") }).strict(),
    z.object({ key: z.string(), remove: z.literal(true) }).strict(),
  ])).min(1).max(100),
}).strict();
export type SettingsChange = { key: string; value: unknown } | { key: string; remove: true };
export type SettingsView = {
  scope: "global" | "project";
  path: string;
  revision: string;
  values: Record<string, unknown>;
  inherited: Record<string, unknown>;
  invalid: string[];
  exists: boolean;
  hasBackup: boolean;
};

export function readSetting(data: Record<string, unknown>, key: string): unknown {
  let value: unknown = data;
  for (const part of key.split(".")) {
    if (value === null || typeof value !== "object" || !Object.hasOwn(value, part)) return undefined;
    value = (value as Record<string, unknown>)[part];
  }
  return value;
}
