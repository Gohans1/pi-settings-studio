import { useEffect, useRef, useState } from "react";
import type { CodemodeView } from "../shared/codemode";
import { Button } from "./components/ui/button";
import { Switch } from "./components/ui/switch";

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
  const radio = (name: string, value: string, current: string, label: string, help: string, patch: CodemodePatch, done: string) =>
    <label className="choice"><input type="radio" name={name} value={value} checked={current === value} disabled={busy || view.disabledByExtensions}
      onChange={() => { setPending(patch); onChange(patch, done); }} /><span><strong>{label}</strong><span className="muted">{help}</span></span></label>;
  const effective = view.effective;
  return <section className="detail codemode" aria-labelledby="codemode-title">
    <header><h2 id="codemode-title">Code mode</h2>
      <p className="muted">The model calls tools from a short script; MCP tools use it by default.</p></header>
    {project && <fieldset className="scope-choice"><legend>Edit</legend>
      <label><input type="radio" name="codemode-scope" checked={scope === "global"} disabled={busy} onChange={() => onScope("global")} />Global settings</label>
      <label><input type="radio" name="codemode-scope" checked={scope === "project"} disabled={busy} onChange={() => onScope("project")} />This project</label>
    </fieldset>}
    {view.disabledByExtensions && <p className="notice">-builtin:codemode in the extensions setting turns Code mode off.</p>}
    {effective && <p className="notice">This project's sessions get: {preferenceLabel[effective.preference]}, built-in tools {modeLabel[effective.mode].toLowerCase()}, budget {effective.inlineBudget}, automatic start {effective.autoEnableCodemode ? "on" : "off"}.</p>}
    <fieldset><legend>Code mode</legend>
      {inProject && radio("preference", "inherit", preference, "Same as global", "No codemode entry in this project's defaultTools.", { preference: "inherit" }, "Code mode follows the global choice in this project.")}
      {radio("preference", "automatic", preference, "Automatic", inProject ? "Turns on when a code-mode server connects (adds -codemode to the project's defaultTools)." : "Turns on when an MCP server that uses code mode connects.", { preference: "automatic" }, `Code mode is automatic${where}.`)}
      {radio("preference", "always", preference, "Always on", "Sessions start with Code mode on (adds +codemode to defaultTools).", { preference: "always" }, `Code mode is always on${where}.`)}
    </fieldset>
    <fieldset><legend>Built-in tools</legend>
      {inProject && radio("mode", "inherit", mode, "Same as global", "No codemode.mode in this project.", { mode: null }, "Built-in tools follow the global choice in this project.")}
      {radio("mode", "on", mode, "Direct", "The model calls read, bash and the other tools directly.", { mode: "on" }, `Built-in tools are called directly${where}.`)}
      {radio("mode", "only", mode, "In scripts", "While Code mode is on, the model calls them only from scripts.", { mode: "only" }, `Built-in tools are called from scripts${where}.`)}
    </fieldset>
    <form className="budget" noValidate onSubmit={event => {
      event.preventDefault();
      if (!validBudget) { budgetField.current?.focus(); return; }
      onChange({ inlineBudget: parsed }, `Tool list budget saved${where}.`);
    }}>
      <label>Tool list budget<input ref={budgetField} type="number" min={0} max={1_000_000} step={1} value={budget} placeholder={String(effective?.inlineBudget ?? view.defaultInlineBudget)}
        aria-invalid={!validBudget || undefined} aria-describedby="budget-help" onChange={event => setBudget(event.target.value)} /></label>
      <Button type="submit" disabled={busy}>Save budget</Button>
      <p id="budget-help" className={validBudget ? "muted" : "field-error"}>{validBudget ? `Tokens the codemode description may spend listing tools; scripts find the rest with searchTools(). Empty means ${inProject ? "the global value" : `Pi's default, ${view.defaultInlineBudget}`}.` : "Enter a whole number from 0 to 1000000, or leave it empty."}</p>
    </form>
    {inProject ? <label className="switch-row">Turn Code mode on automatically
      <select aria-label="Turn Code mode on automatically" value={view.ownAutoEnable === undefined ? "inherit" : view.ownAutoEnable ? "on" : "off"} disabled={busy}
        onChange={event => onAutoEnable(event.target.value === "inherit" ? null : event.target.value === "on")}>
        <option value="inherit">Same as global</option><option value="on">On</option><option value="off">Off</option>
      </select><span className="muted">(autoEnableCodemode in the project's mcp.json)</span></label>
    : <div className="switch-row"><Switch aria-label="Turn Code mode on automatically" checked={autoEnable} disabled={busy} onCheckedChange={onAutoEnable} />
      <span>Turn Code mode on automatically when a code-mode server connects <span className="muted">(autoEnableCodemode in mcp.json)</span></span></div>}
  </section>;
}
