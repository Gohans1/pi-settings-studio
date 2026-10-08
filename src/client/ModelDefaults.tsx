import { useEffect, useState, type FormEvent } from "react";
import type { ModelSummary, ProviderView } from "../shared/models";
import type { SettingsChange, SettingsView } from "../shared/settings";
import { loadModels, loadSettings, saveSettings } from "./api";
import { Button } from "./components/ui/button";

const LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];

/** Startup provider, model, thinking level and model cycling, chosen from Pi's catalog. */
export function ModelDefaults({ providers, project, onSaved }: { providers: ProviderView[]; project?: string; onSaved: (message: string) => void }) {
  const [scopeChoice, setScopeChoice] = useState<"global" | "project">("global");
  const scope = project ? scopeChoice : "global";
  const target = scope === "project" ? project : undefined;
  const [view, setView] = useState<SettingsView>();
  const [provider, setProvider] = useState("");
  const [model, setModel] = useState("");
  const [thinking, setThinking] = useState("");
  const [enabled, setEnabled] = useState("");
  const [models, setModels] = useState<ModelSummary[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function fill(next: SettingsView) {
    setView(next);
    setProvider(String(next.values.defaultProvider ?? ""));
    setModel(String(next.values.defaultModel ?? ""));
    setThinking(String(next.values.defaultThinkingLevel ?? ""));
    setEnabled(Array.isArray(next.values.enabledModels) ? next.values.enabledModels.join("\n") : "");
  }
  useEffect(() => { setView(undefined); loadSettings(scope, target).then(fill).catch(cause => setError(cause instanceof Error ? cause.message : "Could not read settings.json.")); }, [scope, target]);
  useEffect(() => {
    setModels([]);
    if (provider) loadModels(provider).then(setModels).catch(() => setModels([]));
  }, [provider]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!view) return;
    const wanted: Record<string, unknown> = {
      defaultProvider: provider || undefined, defaultModel: model || undefined, defaultThinkingLevel: thinking || undefined,
      enabledModels: enabled.trim() ? enabled.split("\n").map(line => line.trim()).filter(Boolean) : undefined,
    };
    const changes: SettingsChange[] = Object.entries(wanted).flatMap(([key, value]): SettingsChange[] =>
      value === undefined ? (Object.hasOwn(view.values, key) ? [{ key, remove: true }] : [])
        : JSON.stringify(value) === JSON.stringify(view.values[key]) ? [] : [{ key, value }]);
    if (!changes.length) { onSaved("Defaults are unchanged."); return; }
    setBusy(true); setError("");
    try { fill(await saveSettings(scope, view.revision, changes, target)); onSaved("Defaults saved. Applies to new T3Code threads, or after /reload."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Not saved."); }
    finally { setBusy(false); }
  }

  const known = models.some(entry => entry.id === model);
  return <section className="detail server-form" aria-labelledby="defaults-title">
    <header><h2 id="defaults-title">Defaults</h2>
      <p className="muted">What new sessions start with. Stored in {scope === "project" ? "this project's .pi/settings.json; empty fields inherit the global defaults" : "settings.json"}.</p></header>
    {project && <fieldset className="scope-choice"><legend>Edit</legend>
      <label><input type="radio" name="defaults-scope" checked={scope === "global"} disabled={busy} onChange={() => setScopeChoice("global")} />Global defaults</label>
      <label><input type="radio" name="defaults-scope" checked={scope === "project"} disabled={busy} onChange={() => setScopeChoice("project")} />This project</label>
    </fieldset>}
    {error && <div role="alert" className="error"><strong>Not saved</strong><p>{error}</p></div>}
    {!view ? !error && <div className="loading" aria-busy="true">Reading settings…</div> : <form onSubmit={event => void save(event)} className="server-form">
      <label>Default provider<select value={provider} onChange={event => { setProvider(event.target.value); setModel(""); }}>
        <option value="">Automatic</option>
        {provider && !providers.some(entry => entry.id === provider) && <option value={provider}>{provider} (not in Pi's catalog)</option>}
        {providers.map(entry => <option key={entry.id} value={entry.id}>{entry.name}{entry.auth.configured ? "" : " (not set up)"}</option>)}
      </select></label>
      <label>Default model<select value={model} disabled={!provider} onChange={event => setModel(event.target.value)}>
        <option value="">Automatic</option>
        {model && !known && <option value={model}>{model}</option>}
        {models.map(entry => <option key={entry.id} value={entry.id}>{entry.name === entry.id ? entry.id : `${entry.name} (${entry.id})`}</option>)}
      </select></label>
      <label>Thinking level<select value={thinking} onChange={event => setThinking(event.target.value)}>
        <option value="">Pi's default (medium)</option>
        {LEVELS.map(level => <option key={level} value={level}>{level}</option>)}
      </select><span className="muted">Pi limits the level to what the model supports.</span></label>
      <label>Enabled models<textarea rows={4} value={enabled} placeholder="All available models" spellCheck={false} onChange={event => setEnabled(event.target.value)} />
        <span className="muted">One pattern per line, in Pi's --models format, for startup selection and Ctrl+P cycling.</span></label>
      <div className="form-actions"><Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save defaults"}</Button></div>
    </form>}
  </section>;
}
