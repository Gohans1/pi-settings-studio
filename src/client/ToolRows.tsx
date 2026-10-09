import type { ReactNode } from "react";
import { Braces, ChevronRight, CircleOff, Eye, EyeOff, Puzzle, Server, SquareTerminal, type LucideIcon } from "lucide-react";
import { Badge } from "./components/ui/badge";
import { buttonVariants } from "./components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./components/ui/collapsible";
import { REACHES, type Catalog, type Family, type Reach, type Source, type Tool } from "./tool-catalog";

export const REACH: Record<Reach, { label: string; short: string; icon: LucideIcon; variant: "secondary" | "outline" | "ghost" }> = {
  sees: { label: "Model sees", short: "seen", icon: Eye, variant: "secondary" },
  demand: { label: "On demand", short: "on demand", icon: Braces, variant: "outline" },
  off: { label: "Off", short: "off", icon: CircleOff, variant: "ghost" },
  hidden: { label: "Hidden", short: "hidden", icon: EyeOff, variant: "ghost" },
};
export const FAMILY_ICON: Record<Family, LucideIcon> = { pi: SquareTerminal, extension: Puzzle, mcp: Server };
export const TAB_NAMES: Record<Source["tab"], string> = { general: "General", plugins: "Plugins", mcp: "MCP" };
const EXPOSURE: Record<string, string> = {
  direct: "Direct: declared while on", "model-only": "Model only: declared while on, never called by other tools",
  codemode: "Code mode: called from code mode scripts", deferred: "Deferred: loaded by tool search or called from code mode", hidden: "Hidden: nothing reaches it",
};

/** The first sentence of a description, past any Markdown headings. */
function firstSentence(text: string) {
  const prose = text.split("\n").filter(line => !line.trimStart().startsWith("#")).join(" ").replace(/\s+/g, " ").trim();
  return prose.split(/(?<=[.!?])\s/)[0] ?? prose;
}

export function reachNote(tool: Tool, catalog: Catalog) {
  if (tool.reach === "sees") return "Declared to the model in every new session.";
  if (tool.reach === "hidden") return "Hidden by its exposure: nothing can reach it.";
  if (tool.reach === "off") return "Registered, but not in the startup tools.";
  const ways = [catalog.gateways.codemode && "code mode", catalog.gateways.toolSearch && "tool search"].filter(Boolean);
  return ways.length ? `Not declared. The model reaches it through ${ways.join(" or ")}.` : "Not declared, and code mode and tool search are both off: the model cannot reach it.";
}

export function ReachBadge({ reach }: { reach: Reach }) {
  const { label, icon: Icon, variant } = REACH[reach];
  return <Badge variant={variant}><Icon aria-hidden="true" data-icon="inline-start" />{label}</Badge>;
}

export function SourceTag({ source }: { source: Source }) {
  const Icon = FAMILY_ICON[source.family];
  return <span className="source-tag"><Icon aria-hidden="true" />{source.title}</span>;
}

export function ChangeLink({ source, children }: { source: Source; children?: ReactNode }) {
  return <a className={buttonVariants({ variant: "link", size: "xs" })} href={"#" + source.tab}>{children ?? `Change in ${TAB_NAMES[source.tab]}`}</a>;
}

/**
 * A tool on one line (its name, what it does) that opens to the full description. Where the group
 * already says how the model reaches it, the row leaves the badge out.
 */
export function ToolRow({ tool, catalog, showReach = true }: { tool: Tool; catalog: Catalog; showReach?: boolean }) {
  const source = catalog.byKey.get(tool.sourceKey)!;
  return <Collapsible render={<li className="tool-row" data-reach={tool.reach} />}>
    <CollapsibleTrigger render={<button type="button" className="tool-row-trigger" />}>
      <span className="tool-row-text"><span className="tool-row-name" translate="no">{tool.short}</span><span className="tool-row-summary">{firstSentence(tool.description)}</span></span>
      {showReach && <ReachBadge reach={tool.reach} />}
      <ChevronRight aria-hidden="true" className="tool-row-chevron" />
    </CollapsibleTrigger>
    <CollapsibleContent render={<div className="tool-row-detail" />}>
      <p className="tool-row-description">{tool.description}</p>
      <dl className="tool-row-facts">
        <dt>Model</dt><dd>{reachNote(tool, catalog)}</dd>
        <dt>Called as</dt><dd><code translate="no">{tool.name}</code></dd>
        <dt>Exposure</dt><dd>{EXPOSURE[tool.exposure] ?? tool.exposure}</dd>
        <dt>From</dt><dd>{source.title}{source.detail ? ` · ${source.detail}` : ""} <ChangeLink source={source} /></dd>
      </dl>
    </CollapsibleContent>
  </Collapsible>;
}

export function ToolRows({ tools, catalog, showReach }: { tools: Tool[]; catalog: Catalog; showReach?: boolean }) {
  return <ul className="tool-rows">{tools.map(tool => <ToolRow key={tool.name} tool={tool} catalog={catalog} showReach={showReach} />)}</ul>;
}

/** Every reach a source's tools have, each with its icon and a word: "4 seen · 1 on demand · 2 off". */
export function Tally({ source }: { source: Source }) {
  return <p className="source-tally">{REACHES.filter(reach => source.counts[reach]).map(reach => {
    const { icon: Icon, short } = REACH[reach];
    return <span key={reach} data-reach={reach}><Icon aria-hidden="true" />{source.counts[reach]} {short}</span>;
  })}</p>;
}

/** A source Pi takes no tools from, with where to change that. */
export function SourceLine({ source }: { source: Source }) {
  return <li className="source-line">
    <SourceTag source={source} /><span className="source-state">{source.status === "off" ? "Turned off" : "On, registers no tools"}</span>
    <ChangeLink source={source}>{source.status === "off" ? `Turn on in ${TAB_NAMES[source.tab]}` : undefined}</ChangeLink>
  </li>;
}
