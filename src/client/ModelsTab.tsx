import { useEffect, useState } from "react";
import { RawJsonEditor, SECRET_NOTE } from "./RawJsonEditor";
import { Boxes, CircleAlert, CircleCheck, FileJson, Plus, RefreshCw, SlidersHorizontal } from "lucide-react";
import type { CustomProvidersView, ProvidersView, ProviderView } from "../shared/models";
import { loadModelsRaw, saveModelsRaw, addCustomProvider, editCustomProvider, loadCustomProviders, loadProviders, removeCustomProvider, removeProviderKey, restoreAuth, restoreCustomProviders } from "./api";
import { CustomProviderForm } from "./CustomProviderForm";
import { JobPanel, useJob } from "./JobPanel";
import { Alert, AlertDescription, AlertTitle } from "./components/ui/alert";
import { Button } from "./components/ui/button";
import { Empty, EmptyDescription, EmptyHeader } from "./components/ui/empty";
import { DropdownMenuItem } from "./components/ui/dropdown-menu";
import { Spinner } from "./components/ui/spinner";
import { ProviderDetail, providerState } from "./ProviderDetail";
import { ProviderModels } from "./ProviderModels";
import { ItemGroup } from "./components/ui/item";
import { Separator } from "./components/ui/separator";
import { ModelDefaults } from "./ModelDefaults";
import { Feedback } from "./Feedback";
import { PageHeader } from "./PageHeader";
import { EmptyDetail, IconButton, ListItem, MoreMenu, Workbench } from "./Workbench";
import { SearchField } from "./SearchField";

const DEFAULTS = "#defaults";
const CUSTOM = "#custom:";
const NEW_CUSTOM = "#custom-new";
const CHANGE = "#change:";

export function ModelsTab({ project }: { project?: string }) {
  const [view, setView] = useState<ProvidersView>();
  // A link to #models/defaults opens on Defaults.
  const [selected, setSelected] = useState<string | undefined>(() => location.hash.split("/")[1] === "defaults" ? DEFAULTS : undefined);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [undo, setUndo] = useState<"auth" | "models">();
  const [custom, setCustom] = useState<CustomProvidersView>();
  const [formError, setFormError] = useState("");
  const [raw, setRaw] = useState(false);
  const [busy, setBusy] = useState(false);
  // A model chosen in a provider's list, filled into Defaults until the reader saves or leaves it.
  const [preset, setPreset] = useState<{ provider: string; model: string }>();

  async function refresh() {
    setError("");
    try { const [providers, customs] = await Promise.all([loadProviders(), loadCustomProviders()]); setView(providers); setCustom(customs); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not read the providers."); }
  }
  useEffect(() => { void refresh(); }, []);

  async function run(change: (revision: string) => Promise<ProvidersView>, done: string, undoable = false): Promise<boolean> {
    if (!view) return false;
    setBusy(true); setError(""); setMessage(""); setUndo(undefined);
    try {
      setView(await change(view.revision));
      setMessage(`${done} Applies to new Pi sessions, or after /reload.`);
      if (undoable) setUndo("auth");
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save.");
      await refresh();
      return false;
    } finally { setBusy(false); }
  }

  /** models.json changes: the provider list is reloaded, since custom providers join it. */
  async function runCustom(change: (revision: string) => Promise<CustomProvidersView>, done: string, after?: () => void, undoable = false) {
    if (!custom) return;
    setBusy(true); setError(""); setFormError(""); setMessage(""); setUndo(undefined);
    try {
      setCustom(await change(custom.revision));
      setView(await loadProviders());
      setMessage(`${done} Applies to new Pi sessions, or after /reload.`);
      if (undoable) setUndo("models");
      after?.();
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "Could not save models.json.");
      try { setCustom(await loadCustomProviders()); } catch { /* the form error explains */ }
    } finally { setBusy(false); }
  }
  const catalog = useJob({ actions: ["models-refresh"] }, () => void refresh());
  const providers = view?.providers ?? [];
  const customId = selected?.startsWith(CUSTOM) ? selected.slice(CUSTOM.length) : undefined;
  const customEntry = custom?.providers.find(entry => entry.id === customId);
  const needle = query.trim().toLowerCase();
  const visible = providers.filter(provider => !needle || `${provider.name} ${provider.id}`.toLowerCase().includes(needle));
  // A provider only models.json defines is listed once, with the custom providers.
  const listed = visible.filter(provider => provider.builtIn || !provider.custom);
  const groups: [string, ProviderView[]][] = [
    ["Set up", listed.filter(provider => provider.auth.configured)],
    ["Not set up", listed.filter(provider => !provider.auth.configured)],
  ];
  const changing = selected?.startsWith(CHANGE) ? providers.find(provider => provider.id === selected.slice(CHANGE.length)) : undefined;
  const current = providers.find(provider => provider.id === selected);
  const open = !!selected;
  return <>
    <PageHeader title="Models" description="Providers and their credentials, from auth.json and models.json. Keys are never shown."
      actions={<Button variant="outline" disabled={catalog.running} onClick={() => void catalog.start({ action: "models-refresh" })}><RefreshCw aria-hidden="true" data-icon="inline-start" />Refresh model catalogs</Button>} />
    <JobPanel job={catalog.job} error={catalog.error} onAnswer={value => void catalog.answer(value)} onCancel={() => void catalog.cancel()} onDismiss={catalog.dismiss} />
    <Feedback message={message} onDismiss={() => { setMessage(""); setUndo(undefined); }}
      action={undo && view && { label: "Undo", disabled: busy, onClick: () => undo === "auth" ? void run(restoreAuth, "Restored the previous auth.json.") : void runCustom(restoreCustomProviders, "Restored the previous models.json.") }} />
    {error && <Alert variant="destructive"><CircleAlert aria-hidden="true" /><AlertTitle>Could not complete the change</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
    {view?.error && <Alert variant="destructive"><CircleAlert aria-hidden="true" /><AlertTitle>models.json has a problem</AlertTitle><AlertDescription>{view.error}</AlertDescription></Alert>}
    {raw ? <RawJsonEditor file="models.json" load={loadModelsRaw} save={saveModelsRaw}
      note={`${SECRET_NOTE} modelOverrides, compat, cost, thinkingLevelMap and samplingParams are edited here. Pi checks the file before it is saved.`}
      onClose={saved => { setRaw(false); if (saved) { setMessage("Saved models.json. Applies to new Pi sessions, or after /reload."); void refresh(); } }} />
    : !view ? !error && <div className="loading" aria-busy="true"><Spinner />Reading providers…</div> : <Workbench open={open} onBack={() => setSelected(undefined)} backLabel="All providers" list={<section aria-label="Providers">
      <div className="list-search"><SearchField label="Search providers" placeholder="Search providers…" value={query} onChange={setQuery} /></div>
      <ItemGroup><div role="listitem" className="list-row"><ListItem selected={selected === DEFAULTS} onSelect={() => setSelected(DEFAULTS)} icon={SlidersHorizontal} name="Defaults" state="provider, model, thinking" /></div></ItemGroup>
      <Separator className="mt-2" />
      <section className="item-group" aria-label="Custom providers">
        <div className="list-header"><h2>Custom providers</h2><span>{custom?.providers.length ?? 0} in models.json</span>
          <IconButton label="Add custom provider" disabled={busy || !!custom?.error} onClick={() => { setSelected(NEW_CUSTOM); setFormError(""); }}><Plus aria-hidden="true" /></IconButton>
          <MoreMenu label="More actions for models.json"><DropdownMenuItem disabled={busy} onClick={() => setRaw(true)}><FileJson aria-hidden="true" />Edit as JSON</DropdownMenuItem></MoreMenu>
        </div>
        {custom?.error && <Alert variant="destructive"><CircleAlert aria-hidden="true" /><AlertDescription>{custom.error}</AlertDescription></Alert>}
        {custom && !custom.error && !custom.providers.length && <p className="muted list-note">Ollama, LM Studio, a proxy: any endpoint that speaks an API Pi knows.</p>}
        <ItemGroup>{(custom?.providers ?? []).map(entry => {
          const known = providers.find(provider => provider.id === entry.id);
          const state = entry.models.length ? `${entry.models.length} ${entry.models.length === 1 ? "model" : "models"}` : known?.builtIn ? `changes ${known.name}` : entry.otherKeys.join(", ");
          const ready = !!known?.auth.configured && !known.builtIn;
          return <div key={entry.id} role="listitem" className="list-row">
            <ListItem selected={selected === CUSTOM + entry.id} onSelect={() => { setSelected(CUSTOM + entry.id); setFormError(""); }}
              name={entry.name ?? entry.id} tone={ready ? "ready" : undefined} state={ready ? <><CircleCheck aria-hidden="true" />{state}</> : state} /></div>;
        })}</ItemGroup>
      </section>
      {groups.map(([title, members]) => members.length > 0 && <div key={title} className="item-group">
        <div className="list-header"><h2>{title}</h2><span>{members.length}</span></div>
        <ItemGroup>{members.map(provider => <div key={provider.id} role="listitem" className="list-row">
          <ListItem selected={provider.id === selected} onSelect={() => setSelected(provider.id)} name={provider.name} quiet={!provider.auth.configured}
            tone={provider.auth.configured ? "ready" : undefined} state={provider.auth.configured ? <><CircleCheck aria-hidden="true" />{providerState(provider)}</> : providerState(provider)} />
        </div>)}</ItemGroup>
      </div>)}
      {!visible.length && <Empty><EmptyHeader><EmptyDescription>No providers match “{query.trim()}”.</EmptyDescription></EmptyHeader></Empty>}
    </section>} detail={selected === NEW_CUSTOM || customEntry || changing ? <CustomProviderForm key={selected + (customEntry ? custom!.revision : "")} provider={customEntry}
          changes={changing && { id: changing.id, name: changing.name }} busy={busy} error={formError}
          onCancel={() => setSelected(undefined)}
          onSave={(id, input) => void runCustom(revision => customEntry ? editCustomProvider(customEntry.id, revision, input) : addCustomProvider(revision, id, input),
            `${customEntry?.id ?? id} saved.`, () => setSelected(CUSTOM + (customEntry?.id ?? id)))}
          onRemove={customEntry ? () => void runCustom(revision => removeCustomProvider(customEntry.id, revision), `Removed ${customEntry.id} from models.json.`, () => setSelected(undefined), true) : undefined} />
      : selected === DEFAULTS ? <ModelDefaults providers={providers} project={project} preset={preset} onPresetUsed={() => setPreset(undefined)} onSaved={text => { setMessage(text); setUndo(undefined); }} />
        : current ? <ProviderDetail key={current.id} provider={current} busy={busy}
        onRemove={() => void run(revision => removeProviderKey(current.id, revision),
          current.stored === "oauth" ? `Signed out of ${current.name}.` : `Removed the stored credential for ${current.name}.`, true)}
        onChanged={() => void refresh()}
        onEndpoint={() => { setSelected(current.custom ? CUSTOM + current.id : CHANGE + current.id); setFormError(""); }}>
          <ProviderModels provider={current} onUse={model => {
            setPreset({ provider: current.id, model: model.id }); setSelected(DEFAULTS); setUndo(undefined);
            setMessage(`${model.name} is filled in as the default model. Save defaults to keep it.`);
          }} />
        </ProviderDetail>
        : <EmptyDetail icon={Boxes} title="No provider selected">Choose a provider to sign in, store a key or check its credential. Defaults sets what new sessions start with.</EmptyDetail>} />}
  </>;
}
