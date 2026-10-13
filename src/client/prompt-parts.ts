// The Context tab's reading of a system prompt: what each of Pi's sections is, and where it is changed.

/** The tabs a part of the prompt is changed in. */
export type PartTab = "instructions" | "skills" | "mcp" | "tools";
export const PART_TABS: Record<PartTab, string> = { instructions: "Instructions", skills: "Skills", mcp: "MCP", tools: "Tools" };
export type PartInfo = { label: string; about: string; tab?: PartTab };

// Pi 1.2.0's section names (dist/core/system-prompt.js buildSystemPromptSections), and its MCP extension's.
const SECTIONS: Record<string, PartInfo> = {
  preamble: { label: "Base prompt", about: "Pi's opening instructions. A SYSTEM.md takes their place, and then the tool list, rules and docs pointer are left out.", tab: "instructions" },
  tools: { label: "Tool list", about: "The declared tools that have a one-line summary. Tools Pi hides from requests are left out.", tab: "tools" },
  rules: { label: "Rules", about: "Pi's rules, with the guidelines of the declared tools.", tab: "tools" },
  docs: { label: "Pi documentation", about: "Where Pi's own documentation is, read when you ask about Pi." },
  addendum: { label: "APPEND_SYSTEM.md", about: "Added after Pi's base prompt.", tab: "instructions" },
  project_context: { label: "Instructions (AGENTS.md)", about: "Context files: the global one, then each one from the filesystem root down to the project.", tab: "instructions" },
  skills: { label: "Skills", about: "Each skill the model may load, by name and description. A skill's file is read only when a task needs it.", tab: "skills" },
  cwd: { label: "Working directory", about: "The folder the session runs in." },
  mcp_servers: { label: "MCP servers", about: "The servers whose tools are not declared, and how the model reaches them.", tab: "mcp" },
  content: { label: "Prompt text", about: "The prompt as one text: an extension replaced it, or the session is older than Pi's sections." },
};

export const sectionInfo = (name: string): PartInfo => SECTIONS[name] ?? { label: name, about: "Added by an extension." };

/**
 * The tools whose declarations code mode's description carries, by the name they are called. Pi 1.2.0 heads each
 * with `### \`id\``, adding `(\`name\`)` when the script identifier differs (dist/extensions/codemode/tool.js).
 */
export function codemodeListed(description: string): string[] {
  return [...description.matchAll(/^### `([^`]+)`(?: \(`([^`]+)`\))?$/gm)].map(([, id, name]) => name ?? id!);
}

/** Pi's estimate, read short: exact below a thousand, then in thousands. */
export function tokens(count: number): string {
  if (count < 1000) return `${count} ${count === 1 ? "token" : "tokens"}`;
  return `${(count / 1000).toFixed(1).replace(/\.0$/, "")}k tokens`;
}
