import type { Field } from "../shared/settings";
import { Button } from "./components/ui/button";
import { Switch } from "./components/ui/switch";

export function SettingField({ field, value, overridden, invalid, scope = "global", disabled = false, onChange, onReset }: {
  field: Field; value: unknown; overridden: boolean; invalid: boolean; scope?: "global" | "project"; disabled?: boolean;
  onChange: (value: unknown) => void; onReset: () => void;
}) {
  const id = "setting-" + field.key;
  const common = { id, disabled, "aria-describedby": id + "-help", "aria-invalid": invalid || undefined };
  const fallback = scope === "project" ? "the inherited value" : "Pi's default";
  let control;
  if (field.kind === "boolean") {
    control = <Switch aria-labelledby={id + "-label"} aria-describedby={id + "-help"} checked={value === true} disabled={disabled} onCheckedChange={onChange} />;
  } else if (field.kind === "select") {
    // Options can be strings, numbers or booleans; JSON keeps their type through <select>.
    control = <select {...common} value={value === undefined ? "" : JSON.stringify(value)} onChange={e => onChange(JSON.parse(e.target.value))}>
      {value === undefined && <option value="" disabled>Select a value</option>}
      {field.options?.map(option => <option key={option.label} value={JSON.stringify(option.value)}>{option.label}</option>)}
    </select>;
  } else if (field.kind === "lines") {
    control = <textarea {...common} rows={3} value={Array.isArray(value) ? value.join("\n") : ""} spellCheck={false}
      placeholder={Array.isArray(field.defaultValue) ? field.defaultValue.join("\n") : "Empty"} onChange={e => onChange(e.target.value.split("\n"))} />;
  } else {
    control = <input {...common} type={field.kind === "number" ? "number" : "text"}
      min={field.kind === "number" ? 0 : undefined} step={field.kind === "number" ? 1 : undefined}
      value={typeof value === "number" && Number.isNaN(value) ? "" : String(value ?? "")}
      placeholder={field.defaultValue === undefined ? "Pi's default" : String(field.defaultValue)}
      autoComplete="off" spellCheck={false}
      onChange={e => onChange(field.kind === "number" ? e.target.valueAsNumber : e.target.value)} />;
  }
  return <section className="setting-row">
    <div className="setting-label">
      <label id={id + "-label"} htmlFor={field.kind === "boolean" ? undefined : id}>{field.label}</label>
      <p id={id + "-help"}>{field.help}</p>
      <details><summary>Setting key</summary><code>{field.key}</code>
        <p>Pi's default: {field.defaultValue === undefined ? "automatic" : JSON.stringify(field.defaultValue)}</p></details>
    </div>
    <div className="setting-control">
      {control}
      <div className="field-meta"><span>{disabled ? "Global only: Pi ignores it in a project" : overridden ? (scope === "project" ? "Set in this project" : "Set in settings.json") : (scope === "project" ? "Inherited" : "Pi's default")}</span>
        {overridden && !disabled && <Button type="button" variant="ghost" size="sm" onClick={onReset} aria-label={`Reset ${field.label} to ${fallback}`}>{scope === "project" ? "Use inherited" : "Use default"}</Button>}
      </div>
      {invalid && <p className="field-error">Enter a valid value.</p>}
    </div>
  </section>;
}
