import { useEffect, useId, useState, type FormEvent } from "react";
import { RawJsonEditor, SECRET_NOTE } from "./RawJsonEditor";
import { Boxes, CircleAlert, CircleCheck, FileJson, Plus, RefreshCw, SlidersHorizontal } from "lucide-react";
import type { CustomProvidersView, ProvidersView, ProviderView } from "../shared/models";
import { loadModelsRaw, saveModelsRaw, addCustomProvider, editCustomProvider, loadCustomProviders, loadProviders, removeCustomProvider, removeProviderKey, restoreAuth, restoreCustomProviders, saveProviderKey } from "./api";
import { CustomProviderForm } from "./CustomProviderForm";
import { JobPanel, useJob } from "./JobPanel";
import type { JobView } from "../shared/jobs";
import { Alert, AlertDescription, AlertTitle } from "./components/ui/alert";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Empty, EmptyDescription, EmptyHeader } from "./components/ui/empty";
import { Field, FieldDescription, FieldLabel } from "./components/ui/field";
import { Input } from "./components/ui/input";
import { DropdownMenuItem } from "./components/ui/dropdown-menu";
import { Spinner } from "./components/ui/spinner";
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
  const keyId = useId();
  // Pi's own sign-in flow; its questions and links are shown here and Pi writes auth.json.
  const login = useJob({ actions: ["provider-login"], provider: provider.id }, job => { if (job.status === "done") onSignedIn(); });
  // pi auth check: Pi resolves the credential as a session would, environment included.
  const check = useJob({ actions: ["provider-check"], provider: provider.id });
  // Pi's own key setup: its questions (a key, an account ID, a region…) are answered here.
  const setup = useJob({ actions: ["provider-setup"], provider: provider.id }, job => { if (job.status === "done") onSignedIn(); });
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (await onSaveKey(key)) setKey("");
  }
  return <section className="detail" aria-labelledby="provider-title" aria-describedby="provider-status">
    <header className="detail-header"><div className="detail-title"><h2 id="provider-title">{provider.name}</h2>
      <Badge id="provider-status" variant={provider.auth.configured ? "outline" : "secondary"}>
        {provider.auth.configured ? <><CircleCheck aria-hidden="true" className="text-success" />{state(provider)}</> : state(provider) || "not set up"}</Badge></div>
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
    {check.job?.check && <Alert role="status" variant={check.job.check.status === "ready" ? "default" : "destructive"} className="mt-4">
      {check.job.check.status === "ready" ? <CircleCheck aria-hidden="true" /> : <CircleAlert aria-hidden="true" />}<AlertTitle>{verdict(check.job.check)}</AlertTitle></Alert>}
    {check.job && !check.job.check && <JobPanel job={check.job} error={check.error} onAnswer={() => {}} onCancel={() => void check.cancel()} onDismiss={check.dismiss} />}
    <JobPanel job={login.job} error={login.error} onAnswer={value => void login.answer(value)} onCancel={() => void login.cancel()} onDismiss={login.dismiss} />
    {provider.apiKey && <form className="key-form" onSubmit={event => void submit(event)}>
      <Field className="w-[min(22rem,100%)]"><FieldLabel htmlFor={keyId}>API key</FieldLabel>
        <Input id={keyId} type="password" value={key} autoComplete="new-password" spellCheck={false}
          placeholder={provider.stored === "api_key" ? "Stored. Enter a new key to replace it." : "Paste a key"} onChange={event => setKey(event.target.value)} /></Field>
      <Button type="submit" disabled={busy || !key}>Save key</Button>
      {provider.stored === "oauth" && <FieldDescription className="basis-full">Saving a key replaces the stored sign-in.</FieldDescription>}
    </form>}
    {provider.keySetup && <p className="muted key-setup">Needs more than a key, such as an account ID, a region or a profile?{" "}
      <Button variant="link" size="xs" disabled={busy || setup.running} onClick={() => void setup.start({ action: "provider-setup", provider: provider.id })}>Set up with Pi's questions</Button></p>}
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
  const groups: [string, ProviderView[]][] = [
    ["Set up", visible.filter(provider => provider.auth.configured)],
    ["Not set up", visible.filter(provider => !provider.auth.configured)],
  ];
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
        <ItemGroup>{(custom?.providers ?? []).map(entry => <div key={entry.id} role="listitem" className="list-row">
          <ListItem selected={selected === CUSTOM + entry.id} onSelect={() => { setSelected(CUSTOM + entry.id); setFormError(""); }}
            name={entry.name ?? entry.id} state={entry.models.length ? `${entry.models.length} ${entry.models.length === 1 ? "model" : "models"}` : entry.otherKeys.join(", ")} /></div>)}</ItemGroup>
      </section>
      {groups.map(([title, members]) => members.length > 0 && <div key={title} className="item-group">
        <div className="list-header"><h2>{title}</h2><span>{members.length}</span></div>
        <ItemGroup>{members.map(provider => <div key={provider.id} role="listitem" className="list-row">
          <ListItem selected={provider.id === selected} onSelect={() => setSelected(provider.id)} name={provider.name} quiet={!provider.auth.configured}
            tone={provider.auth.configured ? "ready" : undefined} state={provider.auth.configured ? <><CircleCheck aria-hidden="true" />{state(provider)}</> : state(provider)} />
        </div>)}</ItemGroup>
      </div>)}
      {!visible.length && <Empty><EmptyHeader><EmptyDescription>No providers match “{query.trim()}”.</EmptyDescription></EmptyHeader></Empty>}
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
