import { useEffect, useId, useRef, useState } from "react";
import type { CodemodeView } from "../shared/codemode";
import { Alert, AlertDescription } from "./components/ui/alert";
import { Button } from "./components/ui/button";
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel, FieldLegend, FieldSet } from "./components/ui/field";
import { Input } from "./components/ui/input";
import { RadioGroup, RadioGroupItem } from "./components/ui/radio-group";
import { Switch } from "./components/ui/switch";
import { OptionSelect } from "./OptionSelect";
import { ScopeChoice } from "./ScopeChoice";

export type CodemodePatch = { preference?: "automatic" | "always" | "inherit"; mode?: "on" | "only" | null; inlineBudget?: number | null };

const preferenceLabel = { automatic: "Automatic", always: "Always on" };
const modeLabel = { on: "Direct", only: "In scripts" };

export function CodemodePanel({ view, autoEnable, busy, project, scope, onScope, onChange, onAutoEnable }: {
  view: CodemodeView; autoEnable: boolean; busy: boolean; project?: string; scope: "global" | "project";
  onScope: (scope: "global" | "project") => void;
  onChange: (patch: CodemodePatch, done: string) => void; onAutoEnable: (enabled: boolean | null) => void;
}) {
  const inProject = view.scope === "project";
  const [budget, setBudget] = useState(view.inlineBudget === undefined ? "" : String(view.inlineBudget));
  // Show the clicked choice at once; the saved view takes over when the request settles.
  const [pending, setPending] = useState<CodemodePatch>({});
  useEffect(() => { if (!busy) setPending({}); }, [busy]);
  const preference = pending.preference ?? view.preference;
  const mode = pending.mode !== undefined ? pending.mode ?? "inherit" : inProject ? view.ownMode ?? "inherit" : view.mode;
  const budgetField = useRef<HTMLInputElement>(null);
  const parsed = budget === "" ? null : Number(budget);
  const validBudget = parsed === null || (Number.isInteger(parsed) && parsed >= 0 && parsed <= 1_000_000);
  const where = inProject ? " in this project" : "";
  const id = useId();
  type Choice = { value: string; label: string; help: string; patch: CodemodePatch; done: string };
  // One choice saves at once: a RadioGroup whose items carry their label, help and the change they write.
  const choices = (name: string, legend: string, current: string, items: (Choice | false)[]) => {
    const shown = items.filter((item): item is Choice => !!item);
    return <FieldSet>
      <FieldLegend id={id + name} variant="label">{legend}</FieldLegend>
      <RadioGroup aria-labelledby={id + name} value={current} disabled={busy || view.disabledByExtensions}
        onValueChange={value => { const item = shown.find(entry => entry.value === value); if (item) { setPending(item.patch); onChange(item.patch, item.done); } }}>
        {shown.map(item => <Field key={item.value} orientation="horizontal">
          <RadioGroupItem id={id + name + item.value} value={item.value} />
          <FieldContent><FieldLabel htmlFor={id + name + item.value}>{item.label}</FieldLabel><FieldDescription>{item.help}</FieldDescription></FieldContent>
        </Field>)}
      </RadioGroup>
    </FieldSet>;
  };
  const effective = view.effective;
  return <section className="detail codemode" aria-labelledby="codemode-title">
    <header><h2 id="codemode-title">Code mode</h2>
      <p className="muted">The model calls tools from a short script; MCP tools use it by default.</p></header>
    {project && <ScopeChoice value={scope} globalLabel="Global settings" disabled={busy} onChange={onScope} />}
    {view.disabledByExtensions && <Alert role="note"><AlertDescription>-builtin:codemode in the extensions setting turns Code mode off.</AlertDescription></Alert>}
    {effective && <Alert role="note"><AlertDescription>This project's sessions get: {preferenceLabel[effective.preference]}, built-in tools {modeLabel[effective.mode].toLowerCase()}, budget {effective.inlineBudget}, automatic start {effective.autoEnableCodemode ? "on" : "off"}.</AlertDescription></Alert>}
    {choices("preference", "When Code mode is on", preference, [
      inProject && { value: "inherit", label: "Same as global", help: "No codemode entry in this project's defaultTools.", patch: { preference: "inherit" }, done: "Code mode follows the global choice in this project." },
      { value: "automatic", label: "Automatic", help: inProject ? "Turns on when a code-mode server connects (adds -codemode to the project's defaultTools)." : "Turns on when an MCP server that uses code mode connects.", patch: { preference: "automatic" }, done: `Code mode is automatic${where}.` },
      { value: "always", label: "Always on", help: "Sessions start with Code mode on (adds +codemode to defaultTools).", patch: { preference: "always" }, done: `Code mode is always on${where}.` },
    ])}
    {choices("mode", "Built-in tools", mode, [
      inProject && { value: "inherit", label: "Same as global", help: "No codemode.mode in this project.", patch: { mode: null }, done: "Built-in tools follow the global choice in this project." },
      { value: "on", label: "Direct", help: "The model calls read, bash and the other tools directly.", patch: { mode: "on" }, done: `Built-in tools are called directly${where}.` },
      { value: "only", label: "In scripts", help: "While Code mode is on, the model calls them only from scripts.", patch: { mode: "only" }, done: `Built-in tools are called from scripts${where}.` },
    ])}
    <form className="budget" noValidate onSubmit={event => {
      event.preventDefault();
      if (!validBudget) { budgetField.current?.focus(); return; }
      onChange({ inlineBudget: parsed }, `Tool list budget saved${where}.`);
    }}>
      <Field className="w-[min(14rem,100%)]" data-invalid={!validBudget || undefined}><FieldLabel htmlFor={id + "budget"}>Tool list budget</FieldLabel>
        <Input id={id + "budget"} ref={budgetField} type="number" min={0} max={1_000_000} step={1} value={budget} placeholder={String(effective?.inlineBudget ?? view.defaultInlineBudget)}
          aria-invalid={!validBudget || undefined} aria-describedby={id + "budget-help"} onChange={event => setBudget(event.target.value)} /></Field>
      <Button type="submit" disabled={busy}>Save budget</Button>
      {validBudget ? <FieldDescription id={id + "budget-help"} className="basis-full">Tokens the codemode description may spend listing tools; scripts find the rest with searchTools(). Empty means {inProject ? "the global value" : `Pi's default, ${view.defaultInlineBudget}`}.</FieldDescription>
        : <FieldError id={id + "budget-help"} className="basis-full">Enter a whole number from 0 to 1000000, or leave it empty.</FieldError>}
    </form>
    {inProject ? <Field><FieldLabel htmlFor={id + "auto"}>Turn Code mode on automatically</FieldLabel>
      <OptionSelect id={id + "auto"} className="w-52" value={view.ownAutoEnable === undefined ? "inherit" : view.ownAutoEnable ? "on" : "off"} disabled={busy} aria-describedby={id + "auto-hint"}
        options={[{ value: "inherit", label: "Same as global" }, { value: "on", label: "On" }, { value: "off", label: "Off" }]}
        onChange={value => onAutoEnable(value === "inherit" ? null : value === "on")} />
      <FieldDescription id={id + "auto-hint"}>autoEnableCodemode in the project's mcp.json</FieldDescription></Field>
    : <div className="switch-row"><Switch aria-label="Turn Code mode on automatically" checked={autoEnable} disabled={busy} onCheckedChange={onAutoEnable} />
      <span>Turn Code mode on automatically when a code-mode server connects <span className="muted">(autoEnableCodemode in mcp.json)</span></span></div>}
  </section>;
}
