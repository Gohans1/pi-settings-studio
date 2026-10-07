import { useEffect, useState, type FormEvent } from "react";
import { Search } from "lucide-react";
import type { ProvidersView, ProviderView } from "../shared/models";
import { loadProviders, removeProviderKey, restoreAuth, saveProviderKey } from "./api";
import { Button } from "./components/ui/button";

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

function ProviderDetail({ provider, busy, onSaveKey, onRemove }: {
  provider: ProviderView; busy: boolean; onSaveKey: (key: string) => Promise<boolean>; onRemove: () => void;
}) {
  const [key, setKey] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (await onSaveKey(key)) setKey("");
  }
  return <section className="detail" aria-labelledby="provider-title">
    <h2 id="provider-title">{provider.name}</h2>
    <dl className="detail-list">
      <div><dt>ID</dt><dd><code>{provider.id}</code>{provider.custom && <span className="muted"> · defined in models.json</span>}</dd></div>
      <div><dt>Models</dt><dd>{provider.models}</dd></div>
      <div><dt>Authentication</dt><dd>{provider.auth.configured
        ? <>{sources[provider.auth.source ?? ""] ?? provider.auth.source ?? "Configured"}{provider.stored === "oauth" && " (signed in)"}</>
        : <span className="muted">Not set up here. Environment variables are not checked by this app.</span>}</dd></div>
      {provider.oauth && <div><dt>Sign-in</dt><dd>{provider.oauth.name}{provider.oauth.subscription ? " (subscription)" : ""}.
        <span className="muted"> Run /login in Pi to sign in; signing in from here comes later.</span></dd></div>}
    </dl>
    {provider.apiKey && <form className="key-form" onSubmit={event => void submit(event)}>
      <label>API key<input type="password" value={key} autoComplete="new-password" spellCheck={false}
        placeholder={provider.stored === "api_key" ? "Stored. Enter a new key to replace it." : "Paste a key"} onChange={event => setKey(event.target.value)} /></label>
      <Button type="submit" disabled={busy || !key}>Save key</Button>
      {provider.stored === "oauth" && <p className="muted">Saving a key replaces the stored sign-in.</p>}
    </form>}
    {provider.stored && <div className="actions detail-actions">
      <Button variant="destructive" disabled={busy} onClick={onRemove}>Remove credential</Button></div>}
  </section>;
}

export function ModelsTab() {
  const [view, setView] = useState<ProvidersView>();
  const [selected, setSelected] = useState<string>();
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [undo, setUndo] = useState(false);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setError("");
    try { setView(await loadProviders()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not read the providers."); }
  }
  useEffect(() => { void refresh(); }, []);

  async function run(change: (revision: string) => Promise<ProvidersView>, done: string, undoable = false): Promise<boolean> {
    if (!view) return false;
    setBusy(true); setError(""); setMessage(""); setUndo(false);
    try {
      setView(await change(view.revision));
      setMessage(`${done} Applies to new T3Code threads, or after /reload.`);
      setUndo(undoable);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save.");
      await refresh();
      return false;
    } finally { setBusy(false); }
  }

  const providers = view?.providers ?? [];
  const needle = query.trim().toLowerCase();
  const visible = providers.filter(provider => !needle || `${provider.name} ${provider.id}`.toLowerCase().includes(needle));
  const groups: [string, ProviderView[]][] = [
    ["Set up", visible.filter(provider => provider.auth.configured)],
    ["Not set up", visible.filter(provider => !provider.auth.configured)],
  ];
  const current = providers.find(provider => provider.id === selected);
  return <>
    <div className="page-heading"><div><h1>Models</h1><p>Providers and their credentials, from auth.json and models.json. Keys are never shown.</p></div>
      <div className="search"><Search aria-hidden="true" /><input type="search" aria-label="Search providers" placeholder="Search providers…" value={query} onChange={event => setQuery(event.target.value)} /></div></div>
    <div role="status" className="feedback">{message}{undo && view && <>{" "}<Button variant="outline" size="sm" disabled={busy}
      onClick={() => void run(restoreAuth, "Restored the previous auth.json.")}>Undo</Button></>}</div>
    {error && <div role="alert" className="error"><strong>Could not complete the change</strong><p>{error}</p></div>}
    {view?.error && <div role="alert" className="error"><strong>models.json has a problem</strong><p>{view.error}</p></div>}
    {!view ? !error && <div className="loading" aria-busy="true">Reading providers…</div> : <div className="master-detail">
      <section className="master" aria-label="Providers">
        {groups.map(([title, members]) => members.length > 0 && <div key={title} className="item-group">
          <div className="list-header"><h2>{title}</h2><span>{members.length}</span></div>
          <ul className="item-list">{members.map(provider => <li key={provider.id}>
            <button type="button" aria-pressed={provider.id === selected} onClick={() => setSelected(provider.id)}>
              <span className="item-name">{provider.name}</span><span className="item-state">{state(provider)}</span>
            </button>
          </li>)}</ul>
        </div>)}
        {!visible.length && <p className="empty">No matching providers.</p>}
      </section>
      {current ? <ProviderDetail key={current.id} provider={current} busy={busy}
        onSaveKey={key => run(revision => saveProviderKey(current.id, revision, key), `API key saved for ${current.name}.`)}
        onRemove={() => void run(revision => removeProviderKey(current.id, revision), `Removed the stored credential for ${current.name}.`, true)} />
        : <section className="detail"><p className="empty">Select a provider to manage its credential.</p></section>}
    </div>}
  </>;
}
