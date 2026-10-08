import { useEffect, useState, type FormEvent } from "react";
import { RawJsonEditor, SECRET_NOTE } from "./RawJsonEditor";
import { Boxes, FileJson, Plus, RefreshCw, SlidersHorizontal } from "lucide-react";
import type { CustomProvidersView, ProvidersView, ProviderView } from "../shared/models";
import { loadModelsRaw, saveModelsRaw, addCustomProvider, editCustomProvider, loadCustomProviders, loadProviders, removeCustomProvider, removeProviderKey, restoreAuth, restoreCustomProviders, saveProviderKey } from "./api";
import { CustomProviderForm } from "./CustomProviderForm";
import { JobPanel, useJob } from "./JobPanel";
import type { JobView } from "../shared/jobs";
import { Button } from "./components/ui/button";
import { DropdownMenuItem } from "./components/ui/dropdown-menu";
import { ModelDefaults } from "./ModelDefaults";
import { Feedback } from "./Feedback";
import { PageHeader } from "./PageHeader";
import { EmptyDetail, MoreMenu, Workbench } from "./Workbench";
import { SearchField } from "./SearchField";

const DEFAULTS = "#defaults";
const CUSTOM = "#custom:";
const NEW_CUSTOM = "#custom-new";

const sources: Record<string, string> = {
  stored: "Stored in auth.json",
  models_json_key: "API key in models.json",
  models_json_command: "Command in models.json",
  environment: "Environment variable",
  runtime: "Runtime key",
  fallback: "Fallback",
};

function state(provider: ProviderView): string {
  if (provider.stored === "oauth") return "signed in";
  if (provider.stored === "api_key") return "API key";
  if (provider.auth.configured) return provider.custom ? "models.json" : "ready";
  return "";
}

const authTypes: Record<string, string> = { api_key: "API key", oauth: "sign-in" };
/** pi auth check's result in words; reasons are Pi's codes made readable. */
function verdict(check: NonNullable<JobView["check"]>): string {
  if (check.status === "ready") return `Pi can use it: ${authTypes[check.authType ?? ""] ?? check.authType ?? "configured"}.`;
  const reason = check.reason ? `: ${check.reason.replaceAll("_", " ")}` : "";
  return check.status === "invalid" ? `Pi finds the credential invalid${reason}.` : `Pi cannot use it yet${reason}.`;
}

function ProviderDetail({ provider, busy, onSaveKey, onRemove, onSignedIn }: {
  provider: ProviderView; busy: boolean; onSaveKey: (key: string) => Promise<boolean>; onRemove: () => void; onSignedIn: () => void;
}) {
  const [key, setKey] = useState("");
  // Pi's own sign-in flow; its questions and links are shown here and Pi writes auth.json.
  const login = useJob(job => { if (job.status === "done") onSignedIn(); });
  // pi auth check: Pi resolves the credential as a session would, environment included.
  const check = useJob();
  // Pi's own key setup: its questions (a key, an account ID, a region…) are answered here.
  const setup = useJob(job => { if (job.status === "done") onSignedIn(); });
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (await onSaveKey(key)) setKey("");
  }
  return <section className="detail" aria-labelledby="provider-title">
    <header className="detail-header"><h2 id="provider-title">{provider.name}</h2>
      <div className="actions">
        {provider.oauth && <Button variant="outline" disabled={busy || login.running} onClick={() => void login.start({ action: "provider-login", provider: provider.id })} aria-label={`Sign in to ${provider.name}`}>Sign in</Button>}
        <Button variant="outline" disabled={check.running} onClick={() => void check.start({ action: "provider-check", provider: provider.id })}>Check credential</Button>
      </div></header>
    <dl className="detail-list">
      <div><dt>ID</dt><dd><code>{provider.id}</code>{provider.custom && <span className="muted"> · defined in models.json</span>}</dd></div>
      <div><dt>Models</dt><dd>{provider.models}</dd></div>
      <div><dt>Authentication</dt><dd>{provider.auth.configured
        ? <>{sources[provider.auth.source ?? ""] ?? provider.auth.source ?? "Configured"}{provider.stored === "oauth" && " (signed in)"}</>
        : <span className="muted">Not in auth.json or models.json. Check credential also looks at the environment of this app.</span>}</dd></div>
      {provider.oauth && <div><dt>Sign-in</dt><dd>{provider.oauth.name}{provider.oauth.subscription ? " (subscription)" : ""}</dd></div>}
    </dl>
    {check.job?.check && <p className={check.job.check.status === "ready" ? "notice check-result" : "error check-result"} role="status">{verdict(check.job.check)}</p>}
    {check.job && !check.job.check && <JobPanel job={check.job} error={check.error} onAnswer={() => {}} onCancel={() => void check.cancel()} onDismiss={check.dismiss} />}
    <JobPanel job={login.job} error={login.error} onAnswer={value => void login.answer(value)} onCancel={() => void login.cancel()} onDismiss={login.dismiss} />
    {provider.apiKey && <form className="key-form" onSubmit={event => void submit(event)}>
      <label>API key<input type="password" value={key} autoComplete="new-password" spellCheck={false}
        placeholder={provider.stored === "api_key" ? "Stored. Enter a new key to replace it." : "Paste a key"} onChange={event => setKey(event.target.value)} /></label>
      <Button type="submit" disabled={busy || !key}>Save key</Button>
      {provider.stored === "oauth" && <p className="muted">Saving a key replaces the stored sign-in.</p>}
    </form>}
    {provider.keySetup && <p className="muted key-setup">Needs more than a key, such as an account ID, a region or a profile?{" "}
      <Button variant="link" size="xs" className="px-0" disabled={busy || setup.running} onClick={() => void setup.start({ action: "provider-setup", provider: provider.id })}>Set up with Pi's questions</Button></p>}
    <JobPanel job={setup.job} error={setup.error} onAnswer={value => void setup.answer(value)} onCancel={() => void setup.cancel()} onDismiss={setup.dismiss} />
    {provider.stored && <div className="actions remove-credential">
      <Button variant="destructive" disabled={busy} onClick={onRemove}>Remove credential</Button></div>}
  </section>;
}

export function ModelsTab({ project }: { project?: string }) {
  const [view, setView] = useState<ProvidersView>();
  const [selected, setSelected] = useState<string>();
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [undo, setUndo] = useState<"auth" | "models">();
  const [custom, setCustom] = useState<CustomProvidersView>();
  const [formError, setFormError] = useState("");
  const [raw, setRaw] = useState(false);
  const [busy, setBusy] = useState(false);

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
      setMessage(`${done} Applies to new T3Code threads, or after /reload.`);
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
      setMessage(`${done} Applies to new T3Code threads, or after /reload.`);
      if (undoable) setUndo("models");
      after?.();
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "Could not save models.json.");
      try { setCustom(await loadCustomProviders()); } catch { /* the form error explains */ }
    } finally { setBusy(false); }
  }
  const catalog = useJob(() => void refresh());
  const providers = view?.providers ?? [];
  const customId = selected?.startsWith(CUSTOM) ? selected.slice(CUSTOM.length) : undefined;
  const customEntry = custom?.providers.find(entry => entry.id === customId);
  const needle = query.trim().toLowerCase();
  const visible = providers.filter(provider => !needle || `${provider.name} ${provider.id}`.toLowerCase().includes(needle));
  const groups: [string, ProviderView[]][] = [
    ["Set up", visible.filter(provider => provider.auth.configured)],
    ["Not set up", visible.filter(provider => !provider.auth.configured)],
  ];
  const current = providers.find(provider => provider.id === selected);
  const open = !!selected;
  return <>
    <PageHeader title="Models" description="Providers and their credentials, from auth.json and models.json. Keys are never shown."
      actions={<Button variant="outline" disabled={catalog.running} onClick={() => void catalog.start({ action: "models-refresh" })}><RefreshCw aria-hidden="true" />Refresh model catalogs</Button>} />
    <JobPanel job={catalog.job} error={catalog.error} onAnswer={value => void catalog.answer(value)} onCancel={() => void catalog.cancel()} onDismiss={catalog.dismiss} />
    <Feedback message={message} onDismiss={() => { setMessage(""); setUndo(undefined); }}
      action={undo && view && { label: "Undo", disabled: busy, onClick: () => undo === "auth" ? void run(restoreAuth, "Restored the previous auth.json.") : void runCustom(restoreCustomProviders, "Restored the previous models.json.") }} />
    {error && <div role="alert" className="error"><strong>Could not complete the change</strong><p>{error}</p></div>}
    {view?.error && <div role="alert" className="error"><strong>models.json has a problem</strong><p>{view.error}</p></div>}
    {raw ? <RawJsonEditor file="models.json" load={loadModelsRaw} save={saveModelsRaw}
      note={`${SECRET_NOTE} modelOverrides, compat, cost, thinkingLevelMap and samplingParams are edited here. Pi checks the file before it is saved.`}
      onClose={saved => { setRaw(false); if (saved) { setMessage("Saved models.json. Applies to new T3Code threads, or after /reload."); void refresh(); } }} />
    : !view ? !error && <div className="loading" aria-busy="true">Reading providers…</div> : <Workbench open={open} onBack={() => setSelected(undefined)} backLabel="All providers" list={<section aria-label="Providers">
      <div className="list-search"><SearchField label="Search providers" placeholder="Search providers…" value={query} onChange={setQuery} /></div>
      <ul className="item-list pinned"><li><button type="button" aria-pressed={selected === DEFAULTS} onClick={() => setSelected(DEFAULTS)}>
        <SlidersHorizontal aria-hidden="true" /><span className="item-name">Defaults</span><span className="item-state">provider, model, thinking</span></button></li></ul>
      <section className="item-group" aria-label="Custom providers">
        <div className="list-header"><h2>models.json</h2><span>{custom?.providers.length ?? 0}</span>
          <Button variant="ghost" size="icon-xs" aria-label="Add custom provider" title="Add custom provider" disabled={busy || !!custom?.error} onClick={() => { setSelected(NEW_CUSTOM); setFormError(""); }}><Plus aria-hidden="true" /></Button>
          <MoreMenu label="More actions for models.json"><DropdownMenuItem disabled={busy} onClick={() => setRaw(true)}><FileJson aria-hidden="true" />Edit as JSON</DropdownMenuItem></MoreMenu>
        </div>
        {custom?.error && <p className="field-error list-note">{custom.error}</p>}
        {custom && !custom.error && !custom.providers.length && <p className="muted list-note">Ollama, LM Studio, a proxy: any endpoint that speaks an API Pi knows.</p>}
        <ul className="item-list">{(custom?.providers ?? []).map(entry => <li key={entry.id}>
          <button type="button" aria-pressed={selected === CUSTOM + entry.id} onClick={() => { setSelected(CUSTOM + entry.id); setFormError(""); }}>
            <span className="item-name">{entry.name ?? entry.id}</span><span className="item-state">{entry.models.length ? `${entry.models.length} models` : entry.otherKeys.join(", ")}</span>
          </button></li>)}</ul>
      </section>
      {groups.map(([title, members]) => members.length > 0 && <div key={title} className="item-group">
        <div className="list-header"><h2>{title}</h2><span>{members.length}</span></div>
        <ul className="item-list">{members.map(provider => <li key={provider.id}>
          <button type="button" aria-pressed={provider.id === selected} onClick={() => setSelected(provider.id)}>
            <span className="item-name">{provider.name}</span><span className="item-state">{state(provider)}</span>
          </button>
        </li>)}</ul>
      </div>)}
      {!visible.length && <p className="empty">No providers match “{query.trim()}”.</p>}
    </section>} detail={selected === NEW_CUSTOM || customEntry ? <CustomProviderForm key={selected + (customEntry ? custom!.revision : "")} provider={customEntry} busy={busy} error={formError}
          onCancel={() => setSelected(undefined)}
          onSave={(id, input) => void runCustom(revision => customEntry ? editCustomProvider(customEntry.id, revision, input) : addCustomProvider(revision, id, input),
            `${customEntry?.id ?? id} saved.`, () => setSelected(CUSTOM + (customEntry?.id ?? id)))}
          onRemove={customEntry ? () => void runCustom(revision => removeCustomProvider(customEntry.id, revision), `Removed ${customEntry.id} from models.json.`, () => setSelected(undefined), true) : undefined} />
      : selected === DEFAULTS ? <ModelDefaults providers={providers} project={project} onSaved={text => { setMessage(text); setUndo(undefined); }} />
        : current ? <ProviderDetail key={current.id} provider={current} busy={busy}
        onSaveKey={key => run(revision => saveProviderKey(current.id, revision, key), `API key saved for ${current.name}.`)}
        onRemove={() => void run(revision => removeProviderKey(current.id, revision), `Removed the stored credential for ${current.name}.`, true)}
        onSignedIn={() => void refresh()} />
        : <EmptyDetail icon={Boxes} title="No provider selected">Choose a provider to sign in, store a key or check its credential. Defaults sets what new sessions start with.</EmptyDetail>} />}
  </>;
}
