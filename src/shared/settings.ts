import { z } from "zod";
import { DEFAULT_TOOLS, effectiveTools } from "./tools";

// Field catalogue for the General tab, from Pi 1.1.0 docs/settings.md. tests/settings-drift.test.ts
// fails when Pi's Settings interface gains or loses a key that has no home here.

// In page order: the groups people change most come first; terminal-only ones last.
export const sections = [
  { id: "tools", title: "Tools" },
  { id: "interaction", title: "Messages & interaction" },
  { id: "models", title: "Models & thinking" },
  { id: "context", title: "Sessions & context" },
  { id: "shell", title: "Shell & packages" },
  { id: "images", title: "Images" },
  { id: "updates", title: "Updates, telemetry & warnings" },
  { id: "network", title: "Network & retries" },
  { id: "terminal", title: "Terminal UI", note: "Only affects Pi in a terminal." },
] as const;
// "modelDefaults" fields are edited in the Models tab; General does not list that section.
export type SectionId = typeof sections[number]["id"] | "modelDefaults";

export type Option = { label: string; value: string | number | boolean };
/** Pi's default in words, and what it depends on. */
export type DefaultText = { value: string; note?: string };
export type Field = {
  key: string;
  label: string;
  section: SectionId;
  kind: "text" | "select" | "number" | "lines" | "boolean" | "thinkingMap" | "compactionMap" | "theme" | "tools";
  help: string;
  options?: readonly Option[];
  /** Pi's default, shown when the file has no value. */
  defaultValue?: unknown;
  /** Pi's default in words where it is no single value; machine-dependent ones come from the server. */
  defaultText?: DefaultText;
  /** The setting whose value is this one's default. */
  defaultFrom?: string;
  /** Pi reads it only from the global settings.json. */
  globalOnly?: boolean;
  /** Tuning most people never change: behind the group's advanced toggle. */
  advanced?: boolean;
  schema: z.ZodType;
};

const text = z.string().max(2000).refine(v => [...v].every(char => char.charCodeAt(0) >= 32), "Control characters are not allowed.");
const lines = z.array(text).max(200).transform(entries => entries.filter(entry => entry.length > 0));
const int = (min = 0, max = Number.MAX_SAFE_INTEGER) => z.number().int().min(min).max(max);
const choices = (...values: (string | number | boolean)[]): Option[] => values.map(value => ({ label: String(value), value }));
const select = (options: Option[]) => ({ kind: "select" as const, options, schema: z.union(options.map(option => z.literal(option.value)) as unknown as [z.ZodLiteral, z.ZodLiteral]) });
const bool = { kind: "boolean" as const, schema: z.boolean() };
const number = (min?: number, max?: number) => ({ kind: "number" as const, schema: int(min, max) });
const thinking = choices("off", "minimal", "low", "medium", "high", "xhigh", "max");
const THINKING = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;
/** Keys of per-model settings are exact provider/modelId. */
const modelKey = z.string().max(300).regex(/^[^/\s]+\/\S+$/, "Use provider/modelId.");
const tokens = int().optional();

// Within a section, rows show in this order: everyday settings first, then the advanced ones.
export const fields: Field[] = [
  // Models & thinking
  { key: "defaultProvider", label: "Default provider", section: "modelDefaults", kind: "text", help: "Provider ID Pi starts with. Empty means automatic.", schema: text },
  { key: "defaultModel", label: "Default model", section: "modelDefaults", kind: "text", help: "Exact model ID, not its display name. Pi checks availability and credentials at startup.", schema: text },
  { key: "defaultThinkingLevel", label: "Thinking level", section: "modelDefaults", help: "Startup reasoning effort. Support depends on the model.", defaultValue: "medium", ...select(thinking) },
  { key: "enabledModels", label: "Enabled models", section: "modelDefaults", kind: "lines", help: "One model pattern per line, in Pi's --models format. Used for startup selection and model cycling. Empty means all available models.", schema: lines },
  { key: "modelThinkingLevels", label: "Thinking level per model", section: "models", kind: "thinkingMap", help: "Startup thinking level for specific models, keyed by exact provider/modelId. Overrides the default thinking level.",
    defaultText: { value: "none", note: "every model starts at the default thinking level" }, schema: z.record(modelKey, z.enum(THINKING)) },
  { key: "showCacheMissNotices", label: "Cache notices", section: "models", help: "Show notices for significant cache misses, cache warming, compaction usage and provider recovery.", defaultValue: false, ...bool },
  { key: "cacheWarming", globalOnly: true, label: "Prompt cache warming", section: "models", advanced: true, help: "Keep provider prompt caches warm during runs (streaming) or also between runs (idle). Only when it saves at least $0.05.", defaultValue: "streaming", ...select(choices("off", "streaming", "idle")) },
    // Pi's built-in budgets: pi-ai dist/api/simple-options.js DEFAULT_THINKING_BUDGETS.
  { key: "thinkingBudgets.minimal", label: "Thinking budget: minimal", section: "models", advanced: true, help: "Token budget for the minimal thinking level, for models that think within a token budget. Gemini 2.5 models have their own defaults.", defaultValue: 1024, ...number() },
  { key: "thinkingBudgets.low", label: "Thinking budget: low", section: "models", advanced: true, help: "Token budget for the low thinking level.", defaultValue: 2048, ...number() },
  { key: "thinkingBudgets.medium", label: "Thinking budget: medium", section: "models", advanced: true, help: "Token budget for the medium thinking level.", defaultValue: 8192, ...number() },
  { key: "thinkingBudgets.high", label: "Thinking budget: high", section: "models", advanced: true, help: "Token budget for the high thinking level.", defaultValue: 16384, ...number() },
  // Messages & interaction
  { key: "enableSkillCommands", label: "Skill commands", section: "interaction", help: "Register skills as /skill:name commands. Typed /skill:name commands work either way.", defaultValue: true, ...bool },
  { key: "steeringMode", label: "Steering delivery", section: "interaction", help: "How queued steering messages are delivered.", defaultValue: "one-at-a-time", ...select(choices("one-at-a-time", "all")) },
  { key: "followUpMode", label: "Follow-up delivery", section: "interaction", help: "How queued follow-up messages are delivered.", defaultValue: "one-at-a-time", ...select(choices("one-at-a-time", "all")) },
  { key: "defaultProjectTrust", globalOnly: true, label: "Default project trust", section: "interaction", help: "Fallback when a project has no saved trust decision. Global setting only.", defaultValue: "ask", ...select(choices("ask", "always", "never")) },
  // Tools
  // No defaultValue: in a project, "inherited" must be the global list itself, or nothing (shared/tools.ts).
  { key: "defaultTools", label: "Startup tools", section: "tools", kind: "tools", help: "Tools a session starts with. Pi's defaults are read, bash, edit and write. The file records only what differs from what this scope inherits (+grep, -write); extension and MCP tools are not affected.", defaultText: { value: DEFAULT_TOOLS.join(", ") }, schema: lines },
  // Sessions & context
  { key: "compaction.enabled", label: "Automatic compaction", section: "context", help: "Summarize older context automatically when it fills up.", defaultValue: true, ...bool },
  { key: "branchSummary.skipPrompt", label: "Skip branch summary prompt", section: "context", help: "Skip the branch-summary prompt and default to no summary.", defaultValue: false, ...bool },
  { key: "sessionDir", label: "Session directory", section: "context", advanced: true, kind: "text", help: "Where sessions are stored. Relative paths resolve from the working directory. PI_CODING_AGENT_SESSION_DIR and --session-dir override it.", schema: text },
  { key: "compaction.reserveTokens", label: "Compaction: reserved tokens", section: "context", advanced: true, help: "Tokens reserved for the model response.", defaultValue: 16384, ...number() },
  { key: "compaction.keepRecentTokens", label: "Compaction: recent tokens kept", section: "context", advanced: true, help: "Recent tokens kept without summarizing.", defaultValue: 20000, ...number() },
  { key: "compaction.modelOverrides", label: "Compaction per model", section: "context", advanced: true, kind: "compactionMap", help: "Reserved and recent tokens for specific models, keyed by exact provider/modelId. Empty values use the compaction settings above.",
    defaultText: { value: "none", note: "every model uses the compaction settings above" }, schema: z.record(modelKey, z.object({ reserveTokens: tokens, keepRecentTokens: tokens }).passthrough()) },
  { key: "branchSummary.reserveTokens", label: "Branch summary: reserved tokens", section: "context", advanced: true, help: "Tokens reserved when summarizing branch history.", defaultValue: 16384, ...number() },
  // Network & retries
  { key: "retry.enabled", label: "Automatic retry", section: "network", help: "Retry transient failures at the agent level.", defaultValue: true, ...bool },
  { key: "retry.maxRetries", label: "Retry attempts", section: "network", help: "Maximum agent-level retry attempts.", defaultValue: 3, ...number() },
  { key: "httpProxy", globalOnly: true, label: "HTTP proxy", section: "network", kind: "text", help: "Proxy URL applied as HTTP_PROXY and HTTPS_PROXY for Pi's HTTP clients. Global setting only.", defaultText: { value: "none" }, schema: text },
  { key: "transport", label: "Transport", section: "network", advanced: true, help: "Preferred transport for providers that support several.", defaultValue: "auto", ...select(choices("auto", "sse", "websocket", "websocket-cached")) },
  { key: "httpIdleTimeoutMs", label: "HTTP idle timeout (ms)", section: "network", advanced: true, help: "Header and body idle timeout. 0 disables it.", defaultValue: 300000, ...number() },
  { key: "websocketConnectTimeoutMs", label: "WebSocket connect timeout (ms)", section: "network", advanced: true, help: "0 disables it.", defaultValue: 15000, ...number() },
  { key: "retry.baseDelayMs", label: "Retry base delay (ms)", section: "network", advanced: true, help: "Initial exponential-backoff delay.", defaultValue: 2000, ...number() },
  { key: "retry.maxAgentDelayMs", label: "Retry maximum delay (ms)", section: "network", advanced: true, help: "Maximum agent-level retry delay.", defaultValue: 60000, ...number() },
  { key: "retry.provider.timeoutMs", label: "Provider request timeout (ms)", section: "network", advanced: true, help: "Provider request timeout. Empty uses the HTTP idle timeout.",
    defaultFrom: "httpIdleTimeoutMs", defaultText: { value: "the HTTP idle timeout", note: "same as the HTTP idle timeout" }, ...number() },
  { key: "retry.provider.maxRetries", label: "Provider retry attempts", section: "network", advanced: true, help: "Provider-level retries. Keep 0 unless needed: they can delay Pi's own handling of quota errors.", defaultValue: 0, ...number() },
  { key: "retry.provider.maxRetryDelayMs", label: "Provider maximum retry delay (ms)", section: "network", advanced: true, help: "Maximum server-requested delay. 0 removes the limit.", defaultValue: 60000, ...number() },
  // Shell & packages
  { key: "shellPath", label: "Shell", section: "shell", kind: "text", help: "Custom shell executable. A leading ~ is supported. Empty means the platform default.", schema: text },
  { key: "npmCommand", label: "npm command", section: "shell", kind: "lines", help: "Command and arguments for package lookup and installation, one per line.", defaultValue: ["npm"], schema: lines },
  { key: "shellCommandPrefix", label: "Shell command prefix", section: "shell", advanced: true, kind: "text", help: "Prefix prepended to every shell command.", defaultText: { value: "none" }, schema: text },
  // Images
  { key: "images.autoResize", label: "Resize images", section: "images", help: "Resize images to at most 2000×2000 pixels before sending them to a model.", defaultValue: true, ...bool },
  { key: "images.blockImages", label: "Block images", section: "images", help: "Never send images to models.", defaultValue: false, ...bool },
  // Updates, telemetry & warnings
  { key: "enableInstallTelemetry", label: "Install telemetry", section: "updates", help: "Anonymous install/update reporting and selected provider attribution headers. Does not control update checks.", defaultValue: true, ...bool },
  { key: "enableAnalytics", label: "Analytics", section: "updates", help: "Opt in to analytics data sharing (currently only the experimental first-run setup).", defaultValue: false, ...bool },
  { key: "warnings.anthropicExtraUsage", label: "Anthropic extra-usage warning", section: "updates", help: "Warn when Anthropic subscription authentication may use paid extra usage.", defaultValue: true, ...bool },
  { key: "collapseChangelog", label: "Condensed changelog", section: "updates", help: "Show a condensed changelog after an update.", defaultValue: false, ...bool },
  // Terminal UI
  { key: "theme", label: "Theme", section: "terminal", kind: "theme", help: "Built-in or custom theme. system follows the terminal; a light/dark pair switches with the terminal's appearance.", defaultValue: "system",
    schema: text.refine(value => value === "system" || /^[^/]+(\/[^/]+)?$/.test(value), "Use a theme name, or light/dark names.") },
  { key: "tuiMode", label: "Interface mode", section: "terminal", help: "Interactive terminal UI mode.", defaultValue: "fullscreen", ...select(choices("fullscreen", "regular")) },
  { key: "hideThinkingBlock", label: "Hide thinking", section: "terminal", help: "Hide thinking blocks in the transcript.", defaultValue: false, ...bool },
  { key: "quietStartup", label: "Quiet startup", section: "terminal", help: "true hides the header and loaded-resource listing; header keeps only the header.", defaultValue: false, ...select([{ label: "false", value: false }, { label: "true", value: true }, { label: "header", value: "header" }]) },
  { key: "doubleEscapeAction", label: "Double Escape", section: "terminal", help: "Action for double Escape with an empty editor.", defaultValue: "tree", ...select(choices("tree", "fork", "none")) },
  { key: "externalEditor", label: "External editor", section: "terminal", kind: "text", help: "Command for the external-editor key. Empty means $VISUAL, $EDITOR, then the platform default.", schema: text },
  { key: "fullscreenCopyOnSelect", label: "Copy on select", section: "terminal", help: "Copy selected text automatically in fullscreen mode.", defaultValue: true, ...bool },
  { key: "terminal.showImages", label: "Inline images", section: "terminal", help: "Display inline images when supported.", defaultValue: true, ...bool },
  { key: "fullscreenExitOutput", label: "Fullscreen exit output", section: "terminal", advanced: true, help: "What is printed when fullscreen mode exits.", defaultValue: "transcript", ...select(choices("transcript", "resume-hint")) },
  { key: "fullscreenScrollbar", label: "Fullscreen scrollbar", section: "terminal", advanced: true, help: "Transcript scrollbar in fullscreen mode.", defaultValue: "auto", ...select(choices("auto", "always", "hidden")) },
  { key: "fullscreenWheelScrollLines", label: "Wheel scroll lines", section: "terminal", advanced: true, kind: "text", help: "auto, or 1 to 100 lines per mouse-wheel event.", defaultValue: "auto",
    schema: z.preprocess(value => value === "auto" || value === undefined ? value : Number(value), z.union([z.literal("auto"), int(1, 100)])) },
  { key: "editorPaddingX", label: "Editor padding", section: "terminal", advanced: true, help: "Horizontal editor padding, 0 to 3 cells.", defaultValue: 0, ...number(0, 3) },
  { key: "outputPad", label: "Transcript padding", section: "terminal", advanced: true, help: "Horizontal padding for messages, tool output, ! command output and summary blocks.", defaultValue: 1, ...select(choices(1, 0)) },
  { key: "autocompleteMaxVisible", label: "Autocomplete entries", section: "terminal", advanced: true, help: "Visible autocomplete entries, 3 to 20.", defaultValue: 5, ...number(3, 20) },
  { key: "showHardwareCursor", label: "Hardware cursor", section: "terminal", advanced: true, help: "Show the terminal cursor while Pi positions it for input methods.", defaultValue: false, ...bool },
  { key: "treeFilterMode", label: "/tree filter", section: "terminal", advanced: true, help: "Initial filter used by /tree.", defaultValue: "default", ...select(choices("default", "no-tools", "user-only", "labeled-only", "all")) },
  { key: "terminal.imageWidthCells", label: "Image width (cells)", section: "terminal", advanced: true, help: "Preferred inline image width.", defaultValue: 60, ...number(1) },
  { key: "terminal.clearOnShrink", label: "Clear on shrink", section: "terminal", advanced: true, help: "Clear empty rows when rendered content shrinks.", defaultValue: false, ...bool },
  { key: "terminal.showTerminalProgress", label: "Tab progress", section: "terminal", advanced: true, help: "Show OSC 9;4 progress in the terminal tab.", defaultValue: false, ...bool },
  { key: "terminal.hyperlinks", label: "Hyperlinks", section: "terminal", advanced: true, help: "Override OSC 8 hyperlink detection.", defaultValue: "auto", ...select([{ label: "auto", value: "auto" }, { label: "true", value: true }, { label: "false", value: false }]) },
  { key: "terminal.images", label: "Image protocol", section: "terminal", advanced: true, help: "Override inline-image protocol detection.", defaultValue: "auto", ...select([...choices("auto", "kitty", "iterm2"), { label: "false", value: false }]) },
  { key: "terminal.trueColor", label: "True colour", section: "terminal", advanced: true, help: "Override true-colour detection.", defaultValue: "auto", ...select([{ label: "auto", value: "auto" }, { label: "true", value: true }, { label: "false", value: false }]) },
  { key: "markdown.codeBlockIndent", label: "Code block indent", section: "terminal", advanced: true, kind: "text", help: "Prefix used to indent rendered code blocks.", defaultValue: "  ", schema: text },
  { key: "markdown.mermaid", label: "Mermaid diagrams", section: "terminal", advanced: true, help: "Mermaid rendering mode.", defaultValue: "streaming", ...select(choices("streaming", "final", "off")) },
];

/** Settings Pi has that the General tab deliberately does not edit, and where they live instead. */
export const settingHomes: Record<string, string> = {
  "codemode.mode": "MCP tab",
  "codemode.inlineBudget": "MCP tab",
  skills: "Skills tab",
  packages: "Plugins tab",
  extensions: "Plugins tab (filters and paths: raw JSON)",
  prompts: "Plugins tab (filters and paths: raw JSON)",
  themes: "Plugins tab (filters and paths: raw JSON)",
  lastChangelogVersion: "Internal, written by Pi",
  trackingId: "Internal, written by Pi",
  deviceId: "Internal, written by Pi",
};

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
  /** Pi's defaults that depend on this machine: the shell, the external editor, the session folder. */
  defaults: Record<string, DefaultText>;
};

export function readSetting(data: Record<string, unknown>, key: string): unknown {
  let value: unknown = data;
  for (const part of key.split(".")) {
    if (value === null || typeof value !== "object" || !Object.hasOwn(value, part)) return undefined;
    value = (value as Record<string, unknown>)[part];
  }
  return value;
}

/** A value as Pi's docs write it: switches on or off, numbers grouped, lists by commas. */
export function words(value: unknown): string {
  if (typeof value === "boolean") return value ? "on" : "off";
  if (typeof value === "number") return value.toLocaleString("en-US");
  if (typeof value === "string") return value.trim() === "" ? `${value.length} ${value.length === 1 ? "space" : "spaces"}` : value;
  if (Array.isArray(value)) return value.join(", ");
  return JSON.stringify(value);
}

/** Pi's default for a field in words; valueOf reads another setting where the default follows it. */
export function defaultText(field: Field, machine: Record<string, DefaultText>, valueOf: (key: string) => unknown): DefaultText {
  const known = machine[field.key];
  if (known) return known;
  const from = fields.find(entry => entry.key === field.defaultFrom);
  if (from) return { value: words(valueOf(from.key) ?? from.defaultValue), ...(field.defaultText?.note ? { note: field.defaultText.note } : {}) };
  if (field.defaultValue !== undefined) return { value: words(field.defaultValue) };
  return field.defaultText ?? { value: "none" };
}

/** Pi ends up with its default: the key is left out, empty where empty means the default, or equal to it as Pi reads it. */
export function isPiDefault(field: Field, value: unknown): boolean {
  if (value === undefined) return true;
  const parsed = field.schema.safeParse(value);
  if (!parsed.success) return false;
  const data: unknown = parsed.data;
  if (field.kind === "tools") return JSON.stringify(effectiveTools(data as string[]).sort()) === JSON.stringify([...DEFAULT_TOOLS].sort());
  if (field.defaultValue !== undefined) return JSON.stringify(data) === JSON.stringify(field.defaultValue);
  return data === "" || (typeof data === "object" && data !== null && !Array.isArray(data) && Object.keys(data).length === 0);
}

/**
 * What a draft edit writes, VS Code's way: in the global file a value equal to Pi's default removes the key,
 * so the file holds only what differs. A project file keeps it, since there it overrides the global value.
 * Undefined: nothing to write.
 */
export function fileChange(field: Field, change: SettingsChange, scope: "global" | "project", inFile: boolean): SettingsChange | undefined {
  if (!("value" in change)) return inFile ? change : undefined;
  if (scope === "global" && isPiDefault(field, change.value)) return inFile ? { key: change.key, remove: true } : undefined;
  return change;
}

