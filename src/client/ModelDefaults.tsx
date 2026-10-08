import { useEffect, useState, type FormEvent, type KeyboardEvent } from "react";
import { CircleAlert, TriangleAlert, X } from "lucide-react";
import type { ModelScopeView, ModelSummary, ProviderView } from "../shared/models";
import type { SettingsChange, SettingsView } from "../shared/settings";
import { checkModelScope, loadModelIds, loadModels, loadSettings, saveSettings } from "./api";
import { Alert, AlertDescription, AlertTitle } from "./components/ui/alert";
import { Button } from "./components/ui/button";
import { Field, FieldDescription, FieldLabel, FieldLegend, FieldSet } from "./components/ui/field";
import { Input } from "./components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "./components/ui/tooltip";
import { OptionSelect } from "./OptionSelect";
import { ScopeChoice } from "./ScopeChoice";
import { IconButton } from "./Workbench";

const LEVELS = [{ value: "", label: "Pi's default (medium)" }, ...["off", "minimal", "low", "medium", "high", "xhigh", "max"].map(level => ({ value: level, label: level }))];
const hasGlob = (text: string) => /[*?[]/.test(text);
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
const misses = {
  "no-credential": "No credential for this provider here, so Pi skips it",
  "unknown-provider": "Not in the catalog this app reads; an extension may provide it",
  "no-match": "No model matches",
};

/** A value Pi may not accept: the icon carries the tone. */
function Warning({ id, children }: { id: string; children: React.ReactNode }) {
  return <FieldDescription id={id}><TriangleAlert aria-hidden="true" className="me-1.5 inline size-4 align-text-bottom text-warning" />{children}</FieldDescription>;
}

/** enabledModels as rows: what each pattern selects among the providers that are set up, and an adder. */
function EnabledModels({ patterns, scope, ids, inherited, onChange }: {
  patterns: string[]; scope?: ModelScopeView; ids: string[]; inherited?: string[]; onChange: (patterns: string[]) => void;
}) {
  const [text, setText] = useState("");
  function add() {
    const pattern = text.trim();
    if (pattern && !patterns.includes(pattern)) onChange([...patterns, pattern]);
    setText("");
  }
  // Enter adds the pattern here instead of submitting the whole form.
  const onKey = (event: KeyboardEvent) => { if (event.key === "Enter") { event.preventDefault(); add(); } };
  const matched = (pattern: string) => scope?.patterns.find(entry => entry.pattern === pattern);
  return <FieldSet>
    <FieldLegend variant="label">Enabled models</FieldLegend>
    {patterns.length ? <ul className="pattern-list">{patterns.map(pattern => {
      const match = matched(pattern);
      const count = match && (match.matches ? plural(match.matches, "model", "models") : misses[match.reason ?? "no-match"]);
      return <li key={pattern}>
        <code translate="no">{pattern}</code>
        {match?.examples.length
          ? <Tooltip><TooltipTrigger render={<span className="muted" />}>{count}</TooltipTrigger><TooltipContent>{match.examples.join(", ")}</TooltipContent></Tooltip>
          : <span className="muted">{count}</span>}
        <IconButton type="button" label={`Remove ${pattern}`} onClick={() => onChange(patterns.filter(entry => entry !== pattern))}><X aria-hidden="true" /></IconButton>
      </li>;
    })}</ul> : <FieldDescription>{inherited?.length ? `None here, so the global list applies: ${inherited.join(", ")}.` : "None: every model that has a credential."}</FieldDescription>}
    <div className="pattern-add">
      <Input aria-label="Model or pattern" list="enabled-model-options" value={text} placeholder="anthropic/* or provider/model" autoComplete="off" spellCheck={false}
        onChange={event => setText(event.target.value)} onKeyDown={onKey} />
      <Button type="button" variant="outline" onClick={add}>Add</Button>
      <datalist id="enabled-model-options">{ids.map(id => <option key={id} value={id} />)}</datalist>
    </div>
    <FieldDescription>Models for startup selection and Ctrl+P cycling. A pattern such as anthropic/* or *sonnet* selects several; add :high for a thinking level.</FieldDescription>
  </FieldSet>;
}

/** Startup provider, model, thinking level and model cycling. Pi's catalog suggests; any name can be typed. */
export function ModelDefaults({ providers, project, onSaved }: { providers: ProviderView[]; project?: string; onSaved: (message: string) => void }) {
  const [scopeChoice, setScopeChoice] = useState<"global" | "project">("global");
  const scope = project ? scopeChoice : "global";
  const target = scope === "project" ? project : undefined;
  const [view, setView] = useState<SettingsView>();
  const [provider, setProvider] = useState("");
  const [model, setModel] = useState("");
  const [thinking, setThinking] = useState("");
  const [enabled, setEnabled] = useState<string[]>([]);
  const [models, setModels] = useState<ModelSummary[]>([]);
  const [ids, setIds] = useState<string[]>([]);
  const [modelScope, setModelScope] = useState<ModelScopeView>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function fill(next: SettingsView) {
    setView(next);
    setProvider(String(next.values.defaultProvider ?? ""));
    setModel(String(next.values.defaultModel ?? ""));
    setThinking(String(next.values.defaultThinkingLevel ?? ""));
    setEnabled(Array.isArray(next.values.enabledModels) ? next.values.enabledModels.map(String) : []);
  }
  useEffect(() => { setView(undefined); loadSettings(scope, target).then(fill).catch(cause => setError(cause instanceof Error ? cause.message : "Could not read settings.json.")); }, [scope, target]);
  useEffect(() => { loadModelIds().then(setIds).catch(() => setIds([])); }, []);
  const catalogued = providers.find(entry => entry.id === provider.trim());
  useEffect(() => {
    setModels([]);
    if (catalogued) loadModels(catalogued.id).then(setModels).catch(() => setModels([]));
  }, [catalogued?.id]);

  // In a project, an empty field inherits the global value; Pi starts with what is in effect.
  const inherited = (key: string) => scope === "project" ? view?.inherited[key] : undefined;
  const inheritedEnabled = Array.isArray(inherited("enabledModels")) ? (inherited("enabledModels") as unknown[]).map(String) : undefined;
  const effectiveEnabled = enabled.length ? enabled : inheritedEnabled ?? [];
  const effectiveProvider = provider.trim() || String(inherited("defaultProvider") ?? "");
  const effectiveModel = model.trim() || String(inherited("defaultModel") ?? "");
  const reference = effectiveProvider && effectiveModel ? `${effectiveProvider}/${effectiveModel}` : undefined;
  useEffect(() => {
    if (!view) return;
    const timer = setTimeout(() => {
      checkModelScope(effectiveEnabled, reference).then(setModelScope).catch(() => setModelScope(undefined));
    }, 200);
    return () => clearTimeout(timer);
  }, [view, effectiveEnabled.join("\n"), reference]);

  // Pi keeps a saved default inside a non-empty scope (AgentSession._addPersistedDefaultToNonEmptyScope);
  // outside it, new sessions start with the scope's first model.
  const outOfScope = modelScope?.defaultInScope === false && !!modelScope.first;
  const addToScope = outOfScope && enabled.length > 0 && !!provider.trim() && !!model.trim();

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!view) return;
    const ref = `${provider.trim()}/${model.trim()}`;
    const patterns = addToScope && !enabled.some(pattern => pattern.toLowerCase() === ref.toLowerCase()) ? [...enabled, ref] : enabled;
    const wanted: Record<string, unknown> = {
      defaultProvider: provider.trim() || undefined, defaultModel: model.trim() || undefined, defaultThinkingLevel: thinking || undefined,
      enabledModels: patterns.length ? patterns : undefined,
    };
    const changes: SettingsChange[] = Object.entries(wanted).flatMap(([key, value]): SettingsChange[] =>
      value === undefined ? (Object.hasOwn(view.values, key) ? [{ key, remove: true }] : [])
        : JSON.stringify(value) === JSON.stringify(view.values[key]) ? [] : [{ key, value }]);
    if (!changes.length) { onSaved("Defaults are unchanged."); return; }
    setBusy(true); setError("");
    try {
      fill(await saveSettings(scope, view.revision, changes, target));
      onSaved(`Defaults saved${patterns !== enabled ? `; ${ref} added to Enabled models, as Pi does` : ""}. Applies to new T3Code threads, or after /reload.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Not saved."); }
    finally { setBusy(false); }
  }

  // Suggestions: Pi's catalog, plus provider and model names the Enabled models list mentions.
  const named = effectiveEnabled.map(pattern => pattern.split(":")[0]!).filter(pattern => pattern.includes("/"));
  const extraProviders = [...new Set(named.map(pattern => pattern.split("/")[0]!).filter(name => name && !hasGlob(name) && !providers.some(entry => entry.id === name)))];
  const extraModels = named.filter(pattern => pattern.startsWith(provider.trim() + "/")).map(pattern => pattern.slice(provider.trim().length + 1))
    .filter(id => id && !hasGlob(id) && !models.some(entry => entry.id === id));
  const providerWarning = !!provider.trim() && !catalogued;
  const modelWarning = !!catalogued && !!model.trim() && models.length > 0 && !models.some(entry => entry.id === model.trim());
  return <section className="detail server-form" aria-labelledby="defaults-title">
    <header><h2 id="defaults-title">Defaults</h2>
      <p className="muted">What new sessions start with. Stored in {scope === "project" ? "this project's .pi/settings.json; empty fields inherit the global defaults" : "settings.json"}.</p></header>
    {project && <ScopeChoice className="mb-5" value={scope} globalLabel="Global defaults" disabled={busy} onChange={setScopeChoice} />}
    {error && <Alert variant="destructive"><CircleAlert aria-hidden="true" /><AlertTitle>Not saved</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
    {!view ? !error && <div className="loading" aria-busy="true">Reading settings…</div> : <form onSubmit={event => void save(event)} className="server-form">
      <Field><FieldLabel htmlFor="default-provider">Default provider</FieldLabel>
        <Input id="default-provider" value={provider} list="default-provider-options" placeholder={String(inherited("defaultProvider") ?? "Automatic")} autoComplete="off" spellCheck={false}
          aria-describedby={providerWarning ? "provider-warning" : undefined} onChange={event => setProvider(event.target.value)} />
        {providerWarning && <Warning id="provider-warning">{provider.trim()} is not in the catalog this app reads. An extension or package may provide it; this app does not run them, so it cannot check the name. If Pi cannot find it, new sessions start with another available model.</Warning>}</Field>
      <datalist id="default-provider-options">
        {providers.map(entry => <option key={entry.id} value={entry.id} label={`${entry.name}${entry.auth.configured ? "" : " (not set up)"}`} />)}
        {extraProviders.map(name => <option key={name} value={name} label="From Enabled models" />)}
      </datalist>
      <Field><FieldLabel htmlFor="default-model">Default model</FieldLabel>
        <Input id="default-model" value={model} list="default-model-options" placeholder={String(inherited("defaultModel") ?? "Automatic")} autoComplete="off" spellCheck={false}
          aria-describedby={[modelWarning && "model-warning", outOfScope && "scope-warning"].filter(Boolean).join(" ") || undefined} onChange={event => setModel(event.target.value)} />
        {modelWarning && <Warning id="model-warning">{catalogued!.name} has no model {model.trim()} in the catalog this app reads. Check the ID, or refresh the model catalogs. If Pi cannot find it, new sessions start with another available model.</Warning>}
        {outOfScope && <Warning id="scope-warning">Not in Enabled models, so new sessions start with {modelScope!.first} instead. {addToScope ? "Saving adds it to Enabled models, as Pi does when you save a default with Ctrl+S." : "Add it to Enabled models to start with it."}</Warning>}</Field>
      <datalist id="default-model-options">
        {models.map(entry => <option key={entry.id} value={entry.id} label={entry.name === entry.id ? undefined : entry.name} />)}
        {extraModels.map(id => <option key={id} value={id} label="From Enabled models" />)}
      </datalist>
      <Field><FieldLabel htmlFor="default-thinking">Thinking level</FieldLabel>
        <OptionSelect id="default-thinking" className="w-full" options={LEVELS} value={thinking} onChange={setThinking} aria-describedby="default-thinking-help" />
        <FieldDescription id="default-thinking-help">Pi limits the level to what the model supports.</FieldDescription></Field>
      <EnabledModels patterns={enabled} scope={modelScope} ids={ids} inherited={inheritedEnabled} onChange={setEnabled} />
      <div className="form-actions"><Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save defaults"}</Button></div>
    </form>}
  </section>;
}
