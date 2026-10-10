// The Tools tab's reading of one inspection: how the model reaches each tool, and which source gave it.
import type { ToolSource, ToolsView } from "../shared/plugin-tools";

/** Declared to the model, reached on demand through code mode or tool search, or not at all. */
export type Reach = "sees" | "demand" | "off" | "hidden";
export const REACHES: Reach[] = ["sees", "demand", "off", "hidden"];
export type Family = "pi" | "extension" | "mcp";
export type Tool = ToolsView["tools"][number] & { reach: Reach; short: string; sourceKey: string };
export type Source = {
  key: string; family: Family; title: string; detail?: string;
  /** off: turned off in settings, so Pi loads none of its tools; empty: on, but registering none. */
  status: "on" | "off" | "empty";
  /** Where the source is changed: a tab, or Tools' own Startup tools. */
  tab: "tools/startup" | "plugins" | "mcp";
  tools: Tool[]; counts: Record<Reach, number>;
};
export type Catalog = { tools: Tool[]; sources: Source[]; byKey: Map<string, Source>; gateways: { codemode: boolean; toolSearch: boolean } };

export const FAMILIES: { family: Family; title: string }[] = [
  { family: "pi", title: "Built into Pi" }, { family: "extension", title: "Extensions" }, { family: "mcp", title: "MCP servers" },
];
const BUILT_IN: Record<string, string> = { codemode: "Code mode", "tool-search": "Tool search", mcp: "MCP resources", "llama.cpp": "llama.cpp" };

const reachOf = (visibility: string): Reach => visibility === "model" ? "sees" : visibility === "callable" ? "demand" : visibility === "hidden" ? "hidden" : "off";
const zero = (): Record<Reach, number> => ({ sees: 0, demand: 0, off: 0, hidden: 0 });
export const isOff = (tool: Tool) => tool.reach === "off" || tool.reach === "hidden";

function describe(source: ToolSource): Pick<Source, "key" | "family" | "title" | "detail" | "tab"> {
  if (source.kind === "pi") return { key: "pi", family: "pi", title: "Core tools", detail: "Pi's own tools", tab: "tools/startup" };
  if (source.kind === "mcp") return { key: `mcp:${source.server}`, family: "mcp", title: source.server, tab: "mcp" };
  // Built-in extensions (code mode, tool search) belong with Pi's own tools.
  const builtIn = source.group === "Built-in";
  return { key: `extension:${source.group ?? ""}:${source.name}`, family: builtIn ? "pi" : "extension",
    title: builtIn ? BUILT_IN[source.name] ?? source.name : source.name, detail: builtIn ? "Built-in extension" : source.group, tab: builtIn ? "tools/startup" : "plugins" };
}

export function buildCatalog(view: ToolsView): Catalog {
  const byKey = new Map<string, Source>();
  const tools = view.tools.map(tool => {
    const base = describe(tool.source);
    const source = byKey.get(base.key) ?? { ...base, status: "on" as const, tools: [], counts: zero() };
    byKey.set(base.key, source);
    // MCP tool names repeat their server's namespace (mcp__<server>__<tool>), which the source already says.
    const prefix = tool.source.kind === "mcp" ? `mcp__${tool.source.server.replace(/-/g, "_")}__` : "";
    const entry: Tool = { ...tool, reach: reachOf(tool.visibility), short: prefix && tool.name.startsWith(prefix) ? tool.name.slice(prefix.length) : tool.name, sourceKey: base.key };
    source.tools.push(entry);
    source.counts[entry.reach]++;
    return entry;
  });
  for (const { source, status } of view.idleSources) {
    const base = describe(source);
    // An extension that is turned off, built-in or not, is switched back on in Plugins.
    const tab = status === "off" && source.kind === "extension" ? "plugins" : base.tab;
    if (!byKey.has(base.key)) byKey.set(base.key, { ...base, tab, status, tools: [], counts: zero() });
  }
  // By family, sources with tools before those without, then Pi's load order. Servers register as they
  // connect, which differs between inspections, so they go by name.
  const rank = (source: Source) => FAMILIES.findIndex(entry => entry.family === source.family) * 2 + (source.status === "on" ? 0 : 1);
  const order = (a: Source, b: Source) => rank(a) - rank(b) || (a.family === "mcp" ? a.title.localeCompare(b.title) : 0);
  const declared = (name: string) => tools.some(tool => tool.name === name && tool.reach === "sees");
  return { tools, byKey, sources: [...byKey.values()].sort(order), gateways: { codemode: declared("codemode"), toolSearch: declared("tool_search") } };
}

/** Tools under their sources, in the catalog's order. */
export function bySource(catalog: Catalog, tools: Tool[]) {
  return catalog.sources.flatMap(source => {
    const own = tools.filter(tool => tool.sourceKey === source.key);
    return own.length ? [{ source, tools: own }] : [];
  });
}
