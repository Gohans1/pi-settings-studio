import { effectiveTools, toggleTool, TOOLS } from "../shared/tools";
import { Checkbox } from "./components/ui/checkbox";
import { Field, FieldContent, FieldDescription, FieldLabel, FieldSet } from "./components/ui/field";

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
  const changed = (name: string) => active.includes(name) === inherited.includes(name) ? ""
    : `${active.includes(name) ? "On" : "Off"} here; ${scope === "project" ? "the global settings have it" : "Pi's default is"} ${inherited.includes(name) ? "on" : "off"}.`;
  return <FieldSet className="grid grid-cols-[repeat(auto-fill,minmax(17rem,1fr))]" aria-label={label} disabled={disabled}>
    {groups.map(group => <div key={group.title} className="tool-group">
      <p className="tool-group-title">{group.title}</p>
      {group.tools.map(({ name, help }) => <Field key={name} orientation="horizontal">
        <Checkbox id={`tool-${name}`} checked={active.includes(name)} disabled={disabled} aria-describedby={`tool-${name}-help`}
          onCheckedChange={checked => onChange(toggleTool(list, name, checked, resolve))} />
        <FieldContent>
          <FieldLabel htmlFor={`tool-${name}`}><code translate="no" className="tool-name" data-changed={!!changed(name) || undefined}>{name}</code></FieldLabel>
          <FieldDescription id={`tool-${name}-help`}>{help}{changed(name) && <><br /><span className="tool-changed">{changed(name)}</span></>}</FieldDescription>
        </FieldContent>
      </Field>)}
    </div>)}
  </FieldSet>;
}
