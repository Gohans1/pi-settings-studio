import { useEffect, useState, type FormEvent } from "react";
import { CircleAlert, TriangleAlert } from "lucide-react";
import type { AvailableModel, ExtensionProvidersView, ModelScopeView, ModelSummary, ProviderView } from "../shared/models";
import type { SettingsChange, SettingsView } from "../shared/settings";
import { clampLevel } from "../shared/thinking";
import { checkModelScope, loadAvailableModels, loadExtensionProviders, loadModels, loadSettings, saveSettings } from "./api";
import { Alert, AlertDescription, AlertTitle } from "./components/ui/alert";
import { Button } from "./components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "./components/ui/field";
import { Spinner } from "./components/ui/spinner";
import { OptionSelect } from "./OptionSelect";
import { ScopeChoice } from "./ScopeChoice";
import { EnabledModels } from "./EnabledModels";
import { levelOptions, ModelMapField } from "./ModelMapField";
import { modelSuggestions, providerSuggestions, SuggestInput } from "./SuggestInput";

const hasGlob = (text: string) => /[*?[]/.test(text);

/** A value Pi may not accept: a note under its field, which describes the field. The Alert sizes its icon. */
function Warning({ id, children }: { id: string; children: React.ReactNode }) {
  return <Alert role="note" id={id}><TriangleAlert aria-hidden="true" /><AlertDescription>{children}</AlertDescription></Alert>;
}

/** Startup provider, model, thinking level and model cycling. Pi's catalog and the providers extensions register suggest; any name can be typed. */
export function ModelDefaults({ providers, project, preset, onPresetUsed, onSaved }: {
  providers: ProviderView[]; project?: string; onSaved: (message: string) => void;
  /** A provider and model to fill in over the file's values, once, as an unsaved edit. */
  preset?: { provider: string; model: string }; onPresetUsed?: () => void;
}) {
  const [scopeChoice, setScopeChoice] = useState<"global" | "project">("global");
  const scope = project ? scopeChoice : "global";
  const target = scope === "project" ? project : undefined;
  const [view, setView] = useState<SettingsView>();
  const [provider, setProvider] = useState("");
  const [model, setModel] = useState("");
  const [thinking, setThinking] = useState("");
  const [enabled, setEnabled] = useState<string[]>([]);
  const [models, setModels] = useState<ModelSummary[]>([]);
  const [available, setAvailable] = useState<AvailableModel[]>([]);
  // Until it arrives, a name the catalog lacks is not called unknown: an extension may register it.
  const [extensions, setExtensions] = useState<ExtensionProvidersView>();
  const [perModel, setPerModel] = useState<unknown>();
  const [modelScope, setModelScope] = useState<ModelScopeView>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function fill(next: SettingsView) {
    setView(next);
    setProvider(String(next.values.defaultProvider ?? ""));
    setModel(String(next.values.defaultModel ?? ""));
    setThinking(String(next.values.defaultThinkingLevel ?? ""));
    setEnabled(Array.isArray(next.values.enabledModels) ? next.values.enabledModels.map(String) : []);
    setPerModel(next.values.modelThinkingLevels);
    if (preset) { setProvider(preset.provider); setModel(preset.model); onPresetUsed?.(); }
  }
  useEffect(() => { setView(undefined); loadSettings(scope, target).then(fill).catch(cause => setError(cause instanceof Error ? cause.message : "Could not read settings.json.")); }, [scope, target]);
  useEffect(() => {
    loadAvailableModels(project).then(setAvailable).catch(() => setAvailable([]));
    loadExtensionProviders(project).then(setExtensions).catch(() => setExtensions({ issues: ["The extensions could not be read."], providers: [] }));
  }, [project]);
  const listed = [...providers, ...extensions?.providers ?? []];
  const chosen = listed.find(entry => entry.id === provider.trim());
  useEffect(() => {
    setModels([]);
    if (chosen) loadModels(chosen.id, project).then(setModels).catch(() => setModels([]));
  }, [chosen?.id, project]);

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
      checkModelScope(effectiveEnabled, reference, project).then(setModelScope).catch(() => setModelScope(undefined));
    }, 200);
    return () => clearTimeout(timer);
  }, [view, effectiveEnabled.join("\n"), reference]);

  // What Pi knows of a provider/modelId: the models of set-up providers, or the typed provider's.
  const known = (ref: string): ModelSummary | undefined => available.find(entry => `${entry.provider}/${entry.id}` === ref)
    ?? (chosen ? models.find(entry => `${chosen.id}/${entry.id}` === ref) : undefined);
  const startModel = reference ? known(reference) : undefined;
  const askedLevel = thinking || String(inherited("defaultThinkingLevel") ?? "") || "medium";
  const startsAt = startModel && clampLevel(startModel.thinkingLevels, askedLevel);
  const offered = startModel?.thinkingLevels;
  const thinkingNote = startModel && startsAt !== askedLevel && (startsAt === "off" ? "Pi starts it with thinking off." : `Pi starts it at ${startsAt} instead.`);
  const offeredText = startModel && offered && (offered.length === 1 && offered[0] === "off" ? `${startModel.name} does not think.`
    : offered.length === 1 ? `${startModel.name} offers only ${offered[0]}.` : `${startModel.name} offers ${offered[0]} to ${offered.at(-1)}.`);

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
      modelThinkingLevels: perModel,
    };
    const changes: SettingsChange[] = Object.entries(wanted).flatMap(([key, value]): SettingsChange[] =>
      value === undefined ? (Object.hasOwn(view.values, key) ? [{ key, remove: true }] : [])
        : JSON.stringify(value) === JSON.stringify(view.values[key]) ? [] : [{ key, value }]);
    if (!changes.length) { onSaved("Defaults are unchanged."); return; }
    setBusy(true); setError("");
    try {
      fill(await saveSettings(scope, view.revision, changes, target));
      onSaved(`Defaults saved${patterns !== enabled ? `; ${ref} added to Enabled models, as Pi does` : ""}. Applies to new Pi sessions, or after /reload.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Not saved."); }
    finally { setBusy(false); }
  }

  // Suggestions: Pi's providers, plus provider and model names the Enabled models list mentions.
  const named = effectiveEnabled.map(pattern => pattern.split(":")[0]!).filter(pattern => pattern.includes("/"));
  const extraProviders = [...new Set(named.map(pattern => pattern.split("/")[0]!).filter(name => name && !hasGlob(name) && !listed.some(entry => entry.id === name)))];
  const extraModels = named.filter(pattern => pattern.startsWith(provider.trim() + "/")).map(pattern => pattern.slice(provider.trim().length + 1))
    .filter(id => id && !hasGlob(id) && !models.some(entry => entry.id === id));
  const providerWarning = !!provider.trim() && !chosen && !!extensions;
  const modelWarning = !!chosen && !!model.trim() && models.length > 0 && !models.some(entry => entry.id === model.trim());
  return <section className="detail server-form" aria-labelledby="defaults-title">
    <header><h2 id="defaults-title">Defaults</h2>
      <p className="muted">What new sessions start with. Stored in {scope === "project" ? "this project's .pi/settings.json; empty fields inherit the global defaults" : "settings.json"}.</p></header>
    {project && <ScopeChoice className="mb-5" value={scope} globalLabel="Global defaults" disabled={busy} onChange={setScopeChoice} />}
    {error && <Alert variant="destructive"><CircleAlert aria-hidden="true" /><AlertTitle>Not saved</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
    {!view ? !error && <div className="loading" aria-busy="true"><Spinner />Reading settings…</div> : <form onSubmit={event => void save(event)} className="server-form">
      <FieldGroup>
      <Field><FieldLabel htmlFor="default-provider">Default provider</FieldLabel>
        <SuggestInput id="default-provider" value={provider} placeholder={String(inherited("defaultProvider") ?? "Automatic")}
          suggestions={providerSuggestions(listed, extraProviders)}
          aria-describedby={providerWarning ? "provider-warning" : undefined} onChange={setProvider} />
        {providerWarning && <Warning id="provider-warning">{provider.trim()} {extensions!.issues.length
          ? "is not in Pi's catalog, and not every extension could be read here, so this app cannot check the name."
          : "is not a provider Pi has here: neither its catalog nor an enabled extension has one by that name."} If Pi cannot find it, new sessions start with another available model.</Warning>}</Field>
      <Field><FieldLabel htmlFor="default-model">Default model</FieldLabel>
        <SuggestInput id="default-model" value={model} placeholder={String(inherited("defaultModel") ?? "Automatic")}
          suggestions={[...models.map(entry => ({ value: entry.id, label: entry.name })), ...extraModels.map(id => ({ value: id, group: "Named in Enabled models" }))]}
          aria-describedby={[modelWarning && "model-warning", outOfScope && "scope-warning"].filter(Boolean).join(" ") || undefined} onChange={setModel} />
        {modelWarning && <Warning id="model-warning">{chosen!.name} has no model {model.trim()} in the catalog this app reads. Check the ID, or refresh the model catalogs. If Pi cannot find it, new sessions start with another available model.</Warning>}
        {outOfScope && <Warning id="scope-warning">Not in Enabled models, so new sessions start with {modelScope!.first} instead. {addToScope ? "Saving adds it to Enabled models, as Pi does when you save a default with Ctrl+S." : "Add it to Enabled models to start with it."}</Warning>}</Field>
      <Field><FieldLabel htmlFor="default-thinking">Thinking level</FieldLabel>
        <OptionSelect id="default-thinking" className="w-full" options={[{ value: "", label: "Pi's default (medium)" }, ...levelOptions(offered, thinking)]} value={thinking} onChange={setThinking}
          aria-describedby={["default-thinking-help", thinkingNote && "thinking-warning"].filter(Boolean).join(" ")} />
        <FieldDescription id="default-thinking-help">{offeredText || "Pi limits the level to what the model offers."}</FieldDescription>
        {thinkingNote && <Warning id="thinking-warning">{thinkingNote}</Warning>}</Field>
      <Field><FieldLabel id="per-model-label">Thinking level per model</FieldLabel>
        <ModelMapField kind="thinkingMap" label="Thinking level per model" value={perModel} suggestions={modelSuggestions(available)}
          levels={ref => known(ref)?.thinkingLevels} onChange={setPerModel} />
        <FieldDescription>{scope === "project" && !perModel && inherited("modelThinkingLevels") ? "None here, so the global ones apply. " : ""}
          Overrides the level above for these models. <a href="#general/models">Thinking budgets and prompt caching</a> are in General.</FieldDescription></Field>
      <EnabledModels patterns={enabled} scope={modelScope} available={available} providers={listed} inherited={inheritedEnabled} onChange={setEnabled} />
      </FieldGroup>
      <div className="form-actions"><Button type="submit" disabled={busy}>{busy && <Spinner data-icon="inline-start" aria-hidden="true" />}{busy ? "Saving…" : "Save defaults"}</Button></div>
    </form>}
  </section>;
}
