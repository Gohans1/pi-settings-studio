import { effectiveTools, toggleTool, TOOLS } from "../shared/tools";

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
  return <fieldset className="tool-field" aria-label={label} disabled={disabled}>
    {groups.map(group => <div key={group.title} className="tool-group">
      <p className="tool-group-title">{group.title}</p>
      {group.tools.map(({ name, help }) => <div key={name} className="tool-option" data-changed={!!changed(name) || undefined}>
        <label><input type="checkbox" checked={active.includes(name)} aria-describedby={`tool-${name}-help`}
          onChange={event => onChange(toggleTool(list, name, event.target.checked, resolve))} /><code translate="no">{name}</code></label>
        <span id={`tool-${name}-help`} className="muted">{help}{changed(name) && <><br /><span className="tool-changed">{changed(name)}</span></>}</span>
      </div>)}
    </div>)}
  </fieldset>;
}
