import { Braces } from "lucide-react";
import { effectiveTools, toggleTool, TOOLS } from "../shared/tools";
import { Checkbox } from "./components/ui/checkbox";
import { Field, FieldContent, FieldDescription, FieldLabel, FieldSet, FieldTitle } from "./components/ui/field";

/**
 * defaultTools as a checklist. It shows what a session starts with in this scope and writes only how
 * the scope differs from what it inherits: Pi's defaults globally, the global list in a project.
 */
export function ToolsField({ label, list, global, scope, disabled, onChange }: {
  label: string; list?: string[]; global?: string[]; scope: "global" | "project"; disabled?: boolean;
  onChange: (list: string[] | undefined) => void;
}) {
  const resolve = (candidate?: readonly string[]) => scope === "project" ? effectiveTools(global, candidate) : effectiveTools(candidate);
  const active = resolve(list), inherited = resolve(undefined);
  // Tool names in the file that Pi does not ship, such as extension tools registered inactive.
  const others = [...new Set([...active, ...(list ?? []).map(entry => entry.replace(/^[+-]/, ""))])].filter(name => name && !TOOLS.some(tool => tool.name === name));
  const groups = [
    { title: "Built-in", tools: TOOLS.filter(tool => !tool.extension) },
    { title: "From built-in extensions", tools: TOOLS.filter(tool => tool.extension) },
    ...(others.length ? [{ title: "Named in the file", tools: others.map(name => ({ name, help: "Not a Pi tool; an extension may provide it" })) }] : []),
  ];
  // codemode is never off: without +codemode, MCP servers turn it on when they need it.
  const state = (name: string, on: boolean) => name === "codemode" ? (on ? "Always on" : "Automatic") : on ? "On" : "Off";
  const changed = (name: string) => active.includes(name) === inherited.includes(name) ? ""
    : `${state(name, active.includes(name))} here; ${scope === "project" ? "the global settings have it" : "Pi's default is"} ${state(name, inherited.includes(name)).toLowerCase()}.`;
  const toolName = (name: string) => <code translate="no" className="tool-name" data-changed={!!changed(name) || undefined}>{name}</code>;
  return <FieldSet className="grid grid-cols-[repeat(auto-fill,minmax(17rem,1fr))]" aria-label={label} disabled={disabled}>
    {groups.map(group => <div key={group.title} className="tool-group">
      <p className="tool-group-title">{group.title}</p>
      {group.tools.map(({ name, help }) => name === "codemode" ? <Field key={name} orientation="horizontal">
        {/* One place edits Code mode: MCP › Code mode, which also chooses whether built-in tools stay declared. */}
        <Braces aria-hidden="true" className="mt-px size-4 shrink-0 text-muted-foreground" />
        <FieldContent>
          <FieldTitle>{toolName(name)}</FieldTitle>
          <FieldDescription>{help}<br />
            <span className={changed(name) ? "tool-changed" : undefined}>{changed(name) || `${state(name, active.includes(name))}.`}</span>{" "}
            <a href="#mcp/codemode">MCP › Code mode</a> sets this and whether built-in tools run only from scripts.</FieldDescription>
        </FieldContent>
      </Field> : <Field key={name} orientation="horizontal">
        <Checkbox id={`tool-${name}`} checked={active.includes(name)} disabled={disabled} aria-describedby={`tool-${name}-help`}
          onCheckedChange={checked => onChange(toggleTool(list, name, checked, resolve))} />
        <FieldContent>
          <FieldLabel htmlFor={`tool-${name}`}>{toolName(name)}</FieldLabel>
          <FieldDescription id={`tool-${name}-help`}>{help}{changed(name) && <><br /><span className="tool-changed">{changed(name)}</span></>}</FieldDescription>
        </FieldContent>
      </Field>)}
    </div>)}
  </FieldSet>;
}
