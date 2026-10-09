import { Fragment } from "react";
import type { PluginToolsView } from "../shared/plugin-tools";
import { Badge } from "./components/ui/badge";
import { Item, ItemActions, ItemContent, ItemGroup, ItemSeparator } from "./components/ui/item";
import { Disclosure } from "./Disclosure";

type Tool = PluginToolsView["tools"][number];

const states: Record<Tool["visibility"], string> = {
  model: "Model declaration", callable: "Indirect only", inactive: "Inactive", hidden: "Hidden",
  disabled: "Extension off", shadowed: "Another extension takes precedence", unknown: "Unverified",
};

/** Tools with their full descriptions and how the model reaches each one. */
export function ToolList({ label, tools }: { label: string; tools: Tool[] }) {
  return <ItemGroup aria-label={label}>{tools.map((tool, index) => <Fragment key={tool.name}>{index > 0 && <ItemSeparator aria-hidden="true" />}<Item size="sm" role="listitem" className="items-start">
    {/* Not ItemTitle and ItemDescription: they clamp to one and two lines, and names and descriptions are read in full. */}
    <ItemContent className="min-w-0">
      <code translate="no" className="break-all">{tool.name}</code>
      {tool.description.length > 240 ? <Disclosure label={`Description of ${tool.name}`}><p className="muted whitespace-pre-wrap break-words">{tool.description}</p></Disclosure>
        : <p className="muted whitespace-pre-wrap break-words">{tool.description}</p>}
      {tool.visibility === "callable" && <span className="muted">Callable by other tools{tool.exposure === "deferred" ? "; discoverable with tool search" : ""}.</span>}
    </ItemContent>
    <ItemActions><Badge variant="outline">{states[tool.visibility]}</Badge></ItemActions>
  </Item></Fragment>)}</ItemGroup>;
}
