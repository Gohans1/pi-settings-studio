import { useEffect, useRef, useState } from "react";
import { Braces, Search, SlidersHorizontal, Wrench, RotateCcw, ShieldCheck } from "lucide-react";
import { fields, type SettingsChange, type SettingsView } from "../shared/settings";
import { loadSettings, restoreSettings, saveSettings } from "./api";
import { SettingField } from "./SettingField";
import { ChangeReview } from "./ChangeReview";
import { Button } from "./components/ui/button";

export function App() {
  const [scope, setScope] = useState<SettingsView["scope"]>("global");
  const [section, setSection] = useState("models");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<SettingsView>();
  const [draft, setDraft] = useState<Record<string, SettingsChange>>({});
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [review, setReview] = useState(false);
  const [restore, setRestore] = useState(false);
  const title = useRef<HTMLHeadingElement>(null);
  const changes = Object.values(draft).map(change => {
    if (!("value" in change)) return change;
    const parsed = fields.find(field => field.key === change.key)?.schema.safeParse(change.value);
    return parsed?.success ? { key: change.key, value: parsed.data } : change;
  });
  const invalidKeys = changes.filter(change => "value" in change &&
    !fields.find(f => f.key === change.key)?.schema.safeParse(change.value).success).map(change => change.key);

  useEffect(() => {
    let active = true;
    setLoading(true); setError(""); setMessage(""); setView(undefined);
    void loadSettings(scope).then(data => {
      if (active) setView(data);
    }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [scope]);
  useEffect(() => {
    if (!changes.length) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [changes.length]);

  function change(key: string, value: unknown) {
    setMessage("");
    setDraft(current => {
      const next = { ...current };
      if (JSON.stringify(view?.values[key]) === JSON.stringify(value)) delete next[key];
      else next[key] = { key, value };
      return next;
    });
  }
  function reset(key: string) {
    setDraft(current => {
      const next = { ...current };
      if (view && Object.hasOwn(view.values, key)) next[key] = { key, remove: true };
      else delete next[key];
      return next;
    });
    setMessage("");
  }
  async function save() {
    if (!view) return;
    setBusy(true); setError(""); setMessage("");
    try {
      setView(await saveSettings(scope, view.revision, changes));
      setDraft({}); setReview(false); setMessage("Saved to file. Reload Pi or start a new session to apply supported settings.");
      title.current?.focus();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Save failed. Your draft is unchanged."); }
    finally { setBusy(false); }
  }
  async function recover() {
    if (!view) return;
    setBusy(true); setError(""); setMessage("");
    try {
      setView(await restoreSettings(scope, view.revision));
      setRestore(false); setMessage("Previous file restored. Reload Pi to apply the change.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Restore failed."); }
    finally { setBusy(false); }
  }
  async function refresh() {
    setBusy(true); setError(""); setMessage("");
    try {
      setView(await loadSettings(scope));
      setMessage(changes.length ? "File reloaded. Your draft is still here; review it against the new values." : "Settings reloaded from disk.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Reload failed."); }
    finally { setBusy(false); }
  }

  const results = fields.filter(field => query.trim()
    ? (field.label + " " + field.key + " " + field.help).toLowerCase().includes(query.trim().toLowerCase())
    : field.section === section);
  const heading = query.trim() ? "Search results" : section === "models" ? "Models & thinking" : "Tools & codemode";
  return <div className="workspace">
    <a className="skip-link" href="#main">Skip to settings</a>
    <aside className="sidebar" aria-label="Settings navigation">
      <div className="identity"><SlidersHorizontal aria-hidden="true" /><span>Pi Settings<span className="identity-detail">Studio</span></span></div>
      <nav aria-label="Sections">
        <button aria-current={section === "models" ? "page" : undefined} onClick={() => { setSection("models"); setQuery(""); }}><Braces aria-hidden="true" />Models & thinking</button>
        <button aria-current={section === "tools" ? "page" : undefined} onClick={() => { setSection("tools"); setQuery(""); }}><Wrench aria-hidden="true" />Tools & codemode</button>
      </nav>
      <div className="sidebar-note"><ShieldCheck aria-hidden="true" /><p>Native Pi files.<br />Nothing runs on inspection.</p></div>
    </aside>
    <div className="main-column">
      <header className="toolbar">
        <div className="search"><Search aria-hidden="true" /><input type="search" aria-label="Search settings" placeholder="Search settings or keys…" value={query} onChange={e => setQuery(e.target.value)} /></div>
        <label className="scope-label">Editing<select aria-label="Settings scope" value={scope} disabled={!!changes.length || busy || restore} onChange={e => { setScope(e.target.value as SettingsView["scope"]); setReview(false); }}>
          <option value="global">Global settings</option><option value="project">Project settings</option>
        </select></label>
      </header>
      <main id="main" tabIndex={-1}>
        <div className="page-heading"><div><h1 ref={title} tabIndex={-1}>{heading}</h1><p>{query ? "Matches across available settings." : section === "models" ? "Choose how Pi starts its next conversation." : "Control which tools Pi exposes to the model."}</p></div><span className="preview-label">Development preview</span></div>
        <div className="scope-info"><span>{scope === "global" ? "Applies across projects. Trusted project settings can override these values." : "Overrides global values when Pi trusts this project. This editor does not grant trust."}</span>{view && <code>{view.path}</code>}</div>
        <div role="status" className="feedback">{message}</div>
        {error && <div role="alert" className="error"><strong>Could not complete the operation</strong><p>{error}</p><Button variant="outline" disabled={busy} onClick={() => void refresh()}>Reload settings</Button></div>}
        {loading ? <div className="loading" aria-busy="true">Reading settings…</div> : view && <>
          {review ? <ChangeReview changes={changes} view={view} busy={busy} onSave={() => void save()} onBack={() => setReview(false)} /> : restore ? <section className="review"><h2>Restore previous file?</h2><p>This replaces the whole selected file with its latest backup, including settings this editor does not display. The current file becomes the next backup.</p><div className="actions"><Button variant="outline" disabled={busy} onClick={() => setRestore(false)}>Cancel</Button><Button disabled={busy} onClick={() => void recover()}>Confirm restore</Button></div></section> : <>
            <div className="settings-list">{results.map(field => {
              const edit = draft[field.key];
              const overridden = edit ? "value" in edit : Object.hasOwn(view.values, field.key);
              const value = edit ? "value" in edit ? edit.value : view.inherited[field.key] : view.values[field.key] ?? view.inherited[field.key];
              return <SettingField key={scope + field.key} field={field} value={value} inherited={view.inherited[field.key]} overridden={overridden}
                invalid={invalidKeys.includes(field.key) || (!edit && view.invalid.includes(field.key))}
                onChange={value => change(field.key, value)} onReset={() => reset(field.key)} />;
            })}{!results.length && <p className="empty">No matching settings. Try a label such as “model” or “budget”.</p>}</div>
            <div className="save-bar"><p>{changes.length ? `${changes.length} unsaved ${changes.length === 1 ? "change" : "changes"}` : "No unsaved changes"}</p><div className="actions">
              {changes.length > 0 && <Button variant="outline" onClick={() => { setDraft({}); setError(""); setMessage("Draft discarded. No file was changed."); }}>Discard draft</Button>}
              <Button disabled={!changes.length || !!invalidKeys.length || busy} onClick={() => setReview(true)}>Review changes</Button>
            </div></div>
          </>}
          {!review && !restore && <section className="file-tools" aria-label="File actions"><Button variant="ghost" disabled={busy} onClick={() => void refresh()}><RotateCcw aria-hidden="true" />Reload from disk</Button>
            {view.hasBackup && <Button variant="ghost" disabled={busy || !!changes.length} onClick={() => setRestore(true)}>Restore previous file</Button>}</section>}
        </>}
        <footer className="scope-footnote"><p>Showing saved configuration, not live T3Code session state. Runtime overrides may differ.</p>
          <details><summary>About this development preview</summary><p>Model defaults and codemode configuration are available here. Provider login, custom models, MCP, skills, packages, subagents and remaining Pi core settings are still being implemented. This is not yet pi-web parity.</p><p>Catalogue source: Pi 1.0.3 settings documentation. Unknown file keys are preserved, not displayed.</p></details>
        </footer>
      </main>
    </div>
  </div>;
}
