import type { DefaultText, Field } from "../shared/settings";
import { Button } from "./components/ui/button";
import { Field as FieldRow, FieldContent, FieldDescription, FieldError, FieldLabel } from "./components/ui/field";
import { Input } from "./components/ui/input";
import { Switch } from "./components/ui/switch";
import { Textarea } from "./components/ui/textarea";
import { OptionSelect } from "./OptionSelect";
import { ModelMapField } from "./ModelMapField";
import type { Suggestion } from "./SuggestInput";
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

const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * One setting: its control and, under it, where its value comes from. Globally a value is Pi's default or
 * custom, and only a custom one offers "Use default"; in a project it is inherited or set there.
 */
export function SettingField({ field, value, inherited, overridden, invalid, scope = "global", disabled = false, project, models = [], piDefault, isDefault, unsaved, onChange, onReset }: {
  field: Field; value: unknown; inherited?: unknown; overridden: boolean; invalid: boolean; scope?: "global" | "project"; disabled?: boolean; project?: string;
  /** Models to suggest in per-model maps. */
  models?: readonly Suggestion[];
  /** Pi's real default in words; isDefault: the value Pi ends up with is that default. */
  piDefault: DefaultText; isDefault: boolean; unsaved: boolean;
  onChange: (value: unknown) => void; onReset: () => void;
}) {
  const id = "setting-" + field.key;
  const described = [id + "-help", id + "-state", invalid ? id + "-error" : ""].filter(Boolean).join(" ");
  const common = { id, disabled, "aria-describedby": described, "aria-invalid": invalid || undefined };
  let control;
  if (field.kind === "boolean") {
    control = <Switch aria-labelledby={id + "-label"} aria-describedby={described} checked={value === true} disabled={disabled} onCheckedChange={onChange} />;
  } else if (field.kind === "select") {
    // Options can be strings, numbers or booleans; the Select keeps their type.
    control = <OptionSelect {...common} className="w-full" options={field.options ?? []} value={value === undefined ? null : value as string | number | boolean}
      placeholder="Select a value" onChange={onChange} />;
  } else if (field.kind === "theme") {
    control = <ThemeField value={value} project={project} disabled={disabled} onChange={onChange} />;
  } else if (field.kind === "tools") {
    const list = (list: unknown) => Array.isArray(list) ? list as string[] : undefined;
    control = <ToolsField label={field.label} list={overridden ? list(value) : undefined} global={scope === "project" ? list(inherited) : undefined}
      scope={scope} disabled={disabled} onChange={next => next === undefined ? onReset() : onChange(next)} />;
  } else if (field.kind === "thinkingMap" || field.kind === "compactionMap") {
    control = <ModelMapField kind={field.kind} label={field.label} value={value} disabled={disabled} suggestions={models} onChange={onChange} />;
  } else if (field.kind === "lines") {
    control = <Textarea {...common} rows={3} value={Array.isArray(value) ? value.join("\n") : ""} spellCheck={false}
      placeholder={Array.isArray(field.defaultValue) ? field.defaultValue.join("\n") : sentence(piDefault.value)} onChange={e => onChange(e.target.value.split("\n"))} />;
  } else {
    control = <Input {...common} type={field.kind === "number" ? "number" : "text"}
      min={field.kind === "number" ? 0 : undefined} step={field.kind === "number" ? 1 : undefined}
      inputMode={field.kind === "number" ? "numeric" : undefined}
      value={typeof value === "number" && Number.isNaN(value) ? "" : String(value ?? "")}
      placeholder={field.defaultValue === undefined ? sentence(piDefault.value) : String(field.defaultValue)}
      autoComplete="off" spellCheck={false}
      // An emptied number field means Pi's default, as its help text says.
      onChange={e => field.kind === "number" && e.target.value === "" && !e.target.validity.badInput ? onReset() : onChange(field.kind === "number" ? e.target.valueAsNumber : e.target.value)} />;
  }
  // The control shows the value; the words name it only where the control is empty.
  const empty = field.kind !== "tools" && (value === undefined || value === "" ||
    (typeof value === "object" && value !== null && !Array.isArray(value) && !Object.keys(value).length));
  const fallback = empty && <>: <span className="state-value">{piDefault.value}</span>{piDefault.note && <> · {piDefault.note}</>}</>;
  const reset = disabled ? undefined : scope === "project" ? (overridden ? "Use inherited" : undefined) : isDefault ? undefined : "Use default";
  const source = disabled ? "Global only: Pi ignores it in a project"
    : scope === "project" ? (overridden ? "Set in this project" : <>Inherited{fallback}</>)
    : isDefault ? <>Default{fallback}</> : <>Custom · Pi's default is <span className="state-value">{piDefault.value}</span></>;
  // A shadcn settings row: label and help beside the control, stacked when the group is narrow; the startup
  // tools checklist takes the whole row.
  return <FieldRow orientation={field.kind === "tools" ? "vertical" : "responsive"} id={"row-" + field.key} data-invalid={invalid || undefined}>
    <FieldContent>
      <FieldLabel id={id + "-label"} htmlFor={["boolean", "thinkingMap", "compactionMap", "theme", "tools"].includes(field.kind) ? undefined : id}>{field.label}</FieldLabel>
      <code className="setting-key" translate="no">{field.key}</code>
      <FieldDescription id={id + "-help"} className="max-w-[62ch]">{field.help}</FieldDescription>
    </FieldContent>
    <div className="setting-control @md/field-group:shrink-0 @md/field-group:basis-[min(22rem,45%)]">
      {control}
      <div className="field-meta" id={id + "-state"} data-custom={!!reset || undefined}>
        {unsaved && <span className="setting-unsaved"><span className="nav-dot" aria-hidden="true" />Unsaved</span>}
        <span>{source}</span>
        {reset && <Button type="button" variant="ghost" size="xs" onClick={onReset} aria-label={`${reset} for ${field.label}`}>{reset}</Button>}
      </div>
      {invalid && <FieldError id={id + "-error"}>{fixes[field.kind]}</FieldError>}
    </div>
  </FieldRow>;
}
