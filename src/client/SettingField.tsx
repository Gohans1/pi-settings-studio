import type { Field } from "../shared/settings";
import { Button } from "./components/ui/button";
import { Switch } from "./components/ui/switch";
import { ModelMapField } from "./ModelMapField";
import { ThemeField } from "./ThemeField";
import { ToolsField } from "./ToolsField";

/** How to fix a value Pi would reject, by the kind of field. */
const fixes: Record<Field["kind"], string> = {
  number: "Enter a whole number, 0 or more. Leave it empty for Pi's default.",
  thinkingMap: "Name each model as provider/modelId.",
  compactionMap: "Name each model as provider/modelId; token counts are whole numbers.",
  text: "Remove control characters and keep it under 2,000 characters.",
  lines: "Remove control characters and keep each line under 2,000 characters.",
  select: "Choose one of the listed values.",
  boolean: "Turn it on or off.",
  theme: "Choose a theme Pi has.",
  tools: "Remove control characters from the tool names in the file.",
};

/** Pi's default in words: switches read on/off, lists one per line. */
function shown(value: unknown): string {
  if (typeof value === "boolean") return value ? "on" : "off";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.join(", ");
  return JSON.stringify(value);
}

export function SettingField({ field, value, inherited, overridden, invalid, scope = "global", disabled = false, project, onChange, onReset }: {
  field: Field; value: unknown; inherited?: unknown; overridden: boolean; invalid: boolean; scope?: "global" | "project"; disabled?: boolean; project?: string;
  onChange: (value: unknown) => void; onReset: () => void;
}) {
  const id = "setting-" + field.key;
  const described = [id + "-help", invalid ? id + "-error" : ""].filter(Boolean).join(" ");
  const common = { id, disabled, "aria-describedby": described, "aria-invalid": invalid || undefined };
  let control;
  if (field.kind === "boolean") {
    control = <Switch aria-labelledby={id + "-label"} aria-describedby={described} checked={value === true} disabled={disabled} onCheckedChange={onChange} />;
  } else if (field.kind === "select") {
    // Options can be strings, numbers or booleans; JSON keeps their type through <select>.
    control = <select {...common} value={value === undefined ? "" : JSON.stringify(value)} onChange={e => onChange(JSON.parse(e.target.value))}>
      {value === undefined && <option value="" disabled>Select a value</option>}
      {field.options?.map(option => <option key={option.label} value={JSON.stringify(option.value)}>{option.label}</option>)}
    </select>;
  } else if (field.kind === "theme") {
    control = <ThemeField value={value} project={project} disabled={disabled} onChange={onChange} />;
  } else if (field.kind === "tools") {
    const list = (list: unknown) => Array.isArray(list) ? list as string[] : undefined;
    control = <ToolsField label={field.label} list={overridden ? list(value) : undefined} global={scope === "project" ? list(inherited) : undefined}
      scope={scope} disabled={disabled} onChange={next => next === undefined ? onReset() : onChange(next)} />;
  } else if (field.kind === "thinkingMap" || field.kind === "compactionMap") {
    control = <ModelMapField kind={field.kind} label={field.label} value={value} disabled={disabled} onChange={onChange} />;
  } else if (field.kind === "lines") {
    control = <textarea {...common} rows={3} value={Array.isArray(value) ? value.join("\n") : ""} spellCheck={false}
      placeholder={Array.isArray(field.defaultValue) ? field.defaultValue.join("\n") : "Empty"} onChange={e => onChange(e.target.value.split("\n"))} />;
  } else {
    control = <input {...common} type={field.kind === "number" ? "number" : "text"}
      min={field.kind === "number" ? 0 : undefined} step={field.kind === "number" ? 1 : undefined}
      inputMode={field.kind === "number" ? "numeric" : undefined}
      value={typeof value === "number" && Number.isNaN(value) ? "" : String(value ?? "")}
      placeholder={field.defaultValue === undefined ? "Pi's default" : String(field.defaultValue)}
      autoComplete="off" spellCheck={false}
      // An emptied number field means Pi's default, as its help text says.
      onChange={e => field.kind === "number" && e.target.value === "" && !e.target.validity.badInput ? onReset() : onChange(field.kind === "number" ? e.target.valueAsNumber : e.target.value)} />;
  }
  // Rows at Pi's default stay quiet; the line appears when the value is set, inherited or not editable here.
  const source = disabled ? "Global only: Pi ignores it in a project"
    : overridden ? (scope === "project" ? "Set in this project" : `Set in settings.json${field.defaultValue === undefined ? "" : ` · Pi's default is ${shown(field.defaultValue)}`}`)
    : scope === "project" ? "Inherited" : "";
  return <div className="setting-row" id={"row-" + field.key}>
    <div className="setting-label">
      <label id={id + "-label"} htmlFor={["boolean", "thinkingMap", "compactionMap", "theme", "tools"].includes(field.kind) ? undefined : id}>{field.label}</label>
      <code className="setting-key" translate="no">{field.key}</code>
      <p id={id + "-help"}>{field.help}</p>
    </div>
    <div className="setting-control">
      {control}
      {source && <div className="field-meta"><span data-set={overridden && !disabled}>{source}</span>
        {overridden && !disabled && <Button type="button" variant="ghost" size="xs" onClick={onReset} aria-label={`${scope === "project" ? "Use inherited" : "Use default"} for ${field.label}`}>{scope === "project" ? "Use inherited" : "Use default"}</Button>}
      </div>}
      {invalid && <p className="field-error" id={id + "-error"}>{fixes[field.kind]}</p>}
    </div>
  </div>;
}
