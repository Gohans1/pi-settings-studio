import type { Field } from "../shared/settings";
import { Button } from "./components/ui/button";

export function SettingField({ field, value, inherited, overridden, invalid, onChange, onReset }: {
  field: Field; value: unknown; inherited: unknown; overridden: boolean; invalid: boolean;
  onChange: (value: unknown) => void; onReset: () => void;
}) {
  const id = "setting-" + field.key;
  const common = { id, "aria-describedby": id + "-help", "aria-invalid": invalid || undefined };
  return <section className="setting-row">
    <div className="setting-label">
      <label htmlFor={id}>{field.label}</label>
      <p id={id + "-help"}>{field.help}</p>
      <details><summary>Setting key & source</summary><code>{field.key}</code><p>{overridden ? "Set in this file" : "Inherited — not written to this file"}</p><p>Inherited value: {inherited === undefined ? "Automatic" : JSON.stringify(inherited)}</p></details>
    </div>
    <div className="setting-control">
      {field.kind === "select" ? <select {...common} value={String(value ?? "")} onChange={e => onChange(e.target.value)}>
        <option value="" disabled>Select a value</option>
        {field.options?.map(option => <option key={option} value={option}>{option}</option>)}
      </select> : field.kind === "lines" ? <textarea {...common} rows={3}
        value={Array.isArray(value) ? value.join("\n") : ""}
        placeholder={field.key === "defaultTools" ? "+codemode" : "All available models"}
        onChange={e => onChange(e.target.value.split("\n"))} />
        : <input {...common} type={field.kind === "number" ? "number" : "text"}
          min={field.kind === "number" ? 0 : undefined} step={field.kind === "number" ? 1 : undefined}
          value={typeof value === "number" && Number.isNaN(value) ? "" : String(value ?? "")}
          placeholder={field.kind === "text" ? "Automatic" : undefined}
          autoComplete="off" spellCheck={false}
          onChange={e => onChange(field.kind === "number" ? e.target.valueAsNumber : e.target.value)} />}
      <div className="field-meta"><span>{overridden ? "Custom value" : "Inherited"}</span>
        {overridden && <Button type="button" variant="ghost" size="sm" onClick={onReset} aria-label={"Use inherited " + field.label}>Use inherited</Button>}
      </div>
      {invalid && <p className="field-error">Enter a valid value.</p>}
    </div>
  </section>;
}
