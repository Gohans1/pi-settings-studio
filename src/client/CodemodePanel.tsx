import { useEffect, useState } from "react";
import type { CodemodeView } from "../shared/codemode";
import { Button } from "./components/ui/button";
import { Switch } from "./components/ui/switch";

type Patch = { preference?: "automatic" | "always"; mode?: "on" | "only"; inlineBudget?: number | null };

export function CodemodePanel({ view, autoEnable, busy, onChange, onAutoEnable }: {
  view: CodemodeView; autoEnable: boolean; busy: boolean;
  onChange: (patch: Patch, done: string) => void; onAutoEnable: (enabled: boolean) => void;
}) {
  const [budget, setBudget] = useState(view.inlineBudget === undefined ? "" : String(view.inlineBudget));
  // Show the clicked choice at once; the saved view takes over when the request settles.
  const [pending, setPending] = useState<Patch>({});
  useEffect(() => { if (!busy) setPending({}); }, [busy]);
  const preference = pending.preference ?? view.preference;
  const mode = pending.mode ?? view.mode;
  const parsed = budget === "" ? null : Number(budget);
  const validBudget = parsed === null || (Number.isInteger(parsed) && parsed >= 0 && parsed <= 1_000_000);
  const radio = <T extends string>(name: string, value: T, current: T, label: string, help: string, patch: Patch, done: string) =>
    <label className="choice"><input type="radio" name={name} value={value} checked={current === value} disabled={busy || view.disabledByExtensions}
      onChange={() => { setPending(patch); onChange(patch, done); }} /><span><strong>{label}</strong><span className="muted">{help}</span></span></label>;
  return <section className="detail codemode" aria-labelledby="codemode-title">
    <h2 id="codemode-title">Code mode</h2>
    <p className="muted">The model calls tools from a short script; MCP tools use it by default.</p>
    {view.disabledByExtensions && <p className="notice">-builtin:codemode in the global extensions setting turns Code mode off.</p>}
    <fieldset><legend>Code mode</legend>
      {radio("preference", "automatic", preference, "Automatic", "Turns on when an MCP server that uses code mode connects.", { preference: "automatic" }, "Code mode is automatic.")}
      {radio("preference", "always", preference, "Always on", "Sessions start with Code mode on (adds +codemode to defaultTools).", { preference: "always" }, "Code mode is always on.")}
    </fieldset>
    <fieldset><legend>Built-in tools</legend>
      {radio("mode", "on", mode, "Direct", "The model calls read, bash and the other tools directly.", { mode: "on" }, "Built-in tools are called directly.")}
      {radio("mode", "only", mode, "In scripts", "While Code mode is on, the model calls them only from scripts.", { mode: "only" }, "Built-in tools are called from scripts.")}
    </fieldset>
    <form className="budget" onSubmit={event => { event.preventDefault(); onChange({ inlineBudget: parsed }, "Tool list budget saved."); }}>
      <label>Tool list budget<input type="number" min={0} max={1_000_000} step={1} value={budget} placeholder={String(view.defaultInlineBudget)}
        aria-invalid={!validBudget || undefined} aria-describedby="budget-help" onChange={event => setBudget(event.target.value)} /></label>
      <Button type="submit" disabled={busy || !validBudget}>Save budget</Button>
      <p id="budget-help" className="muted">{validBudget ? `Tokens the codemode description may spend listing tools; scripts find the rest with searchTools(). Empty means Pi's default, ${view.defaultInlineBudget}.` : "Enter a whole number from 0 to 1000000, or leave it empty."}</p>
    </form>
    <div className="switch-row"><Switch aria-label="Turn Code mode on automatically" checked={autoEnable} disabled={busy} onCheckedChange={onAutoEnable} />
      <span>Turn Code mode on automatically when a code-mode server connects <span className="muted">(autoEnableCodemode in mcp.json)</span></span></div>
  </section>;
}
