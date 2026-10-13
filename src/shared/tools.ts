// Startup tools (`defaultTools`). The resolution is ported from @earendil-works/pi-coding-agent 1.1.0, re-checked against 1.2.0
// (MIT, Copyright Mario Zechner): dist/core/settings-manager.js `applyToolModifiers`,
// `resolveDefaultTools` and `mergeDefaultTools`, which Pi does not export. tests/tools.test.ts compares
// it with Pi's own SettingsManager, so a change in Pi fails the test.

export const DEFAULT_TOOLS: readonly string[] = ["read", "bash", "edit", "write"];

/** The tools `defaultTools` can name, from Pi's docs/cli.md. The last two come from built-in extensions. */
export const TOOLS: { name: string; help: string; extension?: true }[] = [
  { name: "read", help: "Read text files and supported images" },
  { name: "bash", help: "Run shell commands" },
  { name: "edit", help: "Apply exact text replacements to an existing file" },
  { name: "write", help: "Create or overwrite a file" },
  { name: "grep", help: "Search file contents" },
  { name: "find", help: "Find paths using glob patterns" },
  { name: "ls", help: "List directory contents" },
  { name: "powershell", help: "Run PowerShell commands (Windows)" },
  { name: "codemode", help: "Run JavaScript that calls the other tools; MCP servers turn it on when they need it", extension: true },
  { name: "tool_search", help: "Find tools that are not declared to the model and declare them for the next call", extension: true },
];

const isModifier = (entry: string) => entry.startsWith("+") || entry.startsWith("-");

function applyModifiers(base: readonly string[], entries: readonly string[]): string[] {
  const tools = [...base];
  for (const entry of entries) {
    if (!isModifier(entry)) continue;
    const name = entry.slice(1), index = tools.indexOf(name);
    if (entry.startsWith("+") && index === -1 && name) tools.push(name);
    else if (entry.startsWith("-") && index !== -1) tools.splice(index, 1);
  }
  return tools;
}

/** A list with a tool name (or an empty one) starts from those names; otherwise from Pi's defaults. */
function resolveList(entries: readonly string[]): string[] {
  const plain = entries.filter(entry => !isModifier(entry));
  return applyModifiers(plain.length > 0 || entries.length === 0 ? plain : DEFAULT_TOOLS, entries);
}

/** A project list of only +/- entries (an empty one included) is added to the global list; any other replaces it. */
function mergeLists(global: readonly string[] | undefined, project: readonly string[] | undefined) {
  if (project === undefined) return global;
  return global !== undefined && project.every(isModifier) ? [...global, ...project] : project;
}

/** The tools a session starts with, from the global `defaultTools` and, in a project, the project's. */
export function effectiveTools(global?: readonly string[], project?: readonly string[]): string[] {
  const merged = mergeLists(global, project);
  return merged === undefined ? [...DEFAULT_TOOLS] : resolveList(merged);
}

const sameTools = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every(name => b.includes(name));

/**
 * One scope's new `defaultTools` after turning a tool on or off; `resolve` gives the tools a list
 * yields in that scope. The smallest edit that Pi resolves to the wanted tools wins: drop this tool's
 * entries, then add one entry, and only then write the whole selection out. Undefined means "no list",
 * since an empty list can turn every built-in tool off.
 */
export function toggleTool(list: readonly string[] | undefined, tool: string, on: boolean,
  resolve: (list?: readonly string[]) => string[]): string[] | undefined {
  const wanted = [...resolve(list).filter(name => name !== tool), ...(on ? [tool] : [])];
  const others = (list ?? []).filter(entry => (isModifier(entry) ? entry.slice(1) : entry) !== tool);
  const plain = others.some(entry => !isModifier(entry));
  const modifier = `${on ? "+" : "-"}${tool}`;
  const candidates: (string[] | undefined)[] = [
    others.length ? others : undefined,
    ...(plain && on ? [[...others, tool], [...others, modifier]] : [[...others, modifier]]),
    wanted.length ? wanted : [],
    resolve(undefined).map(name => `-${name}`).concat(wanted.map(name => `+${name}`)),
  ];
  return candidates.find(candidate => sameTools(resolve(candidate), wanted));
}
