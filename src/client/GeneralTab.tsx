import { useCallback, useEffect, useRef, useState } from "react";
import { Search, RotateCcw } from "lucide-react";
import { fields, sections, type SettingsChange, type SettingsView } from "../shared/settings";
import { loadRawSettings, loadSettings, restoreSettings, saveRawSettings, saveSettings } from "./api";
import { SettingField } from "./SettingField";
import { Button } from "./components/ui/button";
import { RawJsonEditor } from "./RawJsonEditor";
import { KeybindingsPanel } from "./KeybindingsPanel";

export function GeneralTab({ project }: { project?: string }) {
  // The project's own .pi/settings.json overrides the global file key by key.
  const [scopeChoice, setScopeChoice] = useState<"global" | "project">("global");
  const scope = project ? scopeChoice : "global";
  const target = scope === "project" ? project : undefined;
  const loadRaw = useCallback(() => loadRawSettings(scope, target), [scope, target]);
  const saveRaw = useCallback((revision: string, text: string) => saveRawSettings(revision, text, scope, target), [scope, target]);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<SettingsView>();
  const [draft, setDraft] = useState<Record<string, SettingsChange>>({});
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [restore, setRestore] = useState(false);
  const [raw, setRaw] = useState(false);
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
    setDraft({});
    void loadSettings(scope, target).then(data => {
      if (active) setView(data);
    }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [scope, target]);
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
      setView(await saveSettings(scope, view.revision, changes, target));
      setDraft({}); setMessage("Saved to file. Reload Pi or start a new session to apply supported settings.");
      title.current?.focus();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Save failed. Your draft is unchanged."); }
    finally { setBusy(false); }
  }
  async function recover() {
    if (!view) return;
    setBusy(true); setError(""); setMessage("");
    try {
      setView(await restoreSettings(scope, view.revision, target));
      setRestore(false); setMessage("Previous file restored. Reload Pi to apply the change.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Restore failed."); }
    finally { setBusy(false); }
  }
  async function refresh() {
    setBusy(true); setError(""); setMessage("");
    try {
      setView(await loadSettings(scope, target));
      setMessage(changes.length ? "File reloaded. Your draft is still here; check it against the new values." : "Settings reloaded from disk.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Reload failed."); }
    finally { setBusy(false); }
  }

  const needle = query.trim().toLowerCase();
  const results = fields.filter(field => field.section !== "modelDefaults" && (!needle || (field.label + " " + field.key + " " + field.help).toLowerCase().includes(needle)));
  async function closeRaw(saved: boolean) {
    setRaw(false);
    if (!saved) return;
    setDraft({});
    setError("");
    setLoading(true);
    try { setView(await loadSettings(scope, target)); setMessage("Saved settings.json. Applies to new T3Code threads, or after /reload."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Reload failed."); }
    finally { setLoading(false); }
  }
  const rawButton = <Button variant="outline" disabled={busy || !!changes.length} onClick={() => { setRaw(true); setMessage(""); }}>Edit raw JSON</Button>;
  if (raw) return <>
    <div className="page-heading"><div><h1>General</h1><p>Pi core settings shared by every project.</p></div></div>
    <RawJsonEditor file="settings.json" load={loadRaw} save={saveRaw} onClose={saved => void closeRaw(saved)} />
  </>;
  return <>
    <div className="page-heading"><div><h1 ref={title} tabIndex={-1}>General</h1><p>{scope === "project" ? "Settings for this project only. They override the global ones while the project is trusted." : "Pi core settings shared by every project."}</p></div>
      <div className="search"><Search aria-hidden="true" /><input type="search" aria-label="Search settings" placeholder="Search settings or keys…" value={query} onChange={e => setQuery(e.target.value)} /></div></div>
    {project && <fieldset className="scope-choice"><legend>Edit</legend>
      <label><input type="radio" name="general-scope" checked={scope === "global"} disabled={busy || !!changes.length} onChange={() => setScopeChoice("global")} />Global settings</label>
      <label><input type="radio" name="general-scope" checked={scope === "project"} disabled={busy || !!changes.length} onChange={() => setScopeChoice("project")} />This project</label>
    </fieldset>}
    {view && <div className="scope-info"><code>{view.path}</code></div>}
    {!needle && <nav className="section-links" aria-label="Setting groups">{sections.map(section => <a key={section.id} href={"#group-" + section.id}
      onClick={event => { event.preventDefault(); document.getElementById("group-" + section.id)?.scrollIntoView({ behavior: "smooth" }); }}>{section.title}</a>)}
      {scope === "global" && <a href="#group-keybindings" onClick={event => { event.preventDefault(); document.getElementById("group-keybindings")?.scrollIntoView({ behavior: "smooth" }); }}>Keyboard shortcuts</a>}</nav>}
    <div role="status" className="feedback">{message}</div>
    {error && <div role="alert" className="error"><strong>Could not complete the operation</strong><p>{error}</p><div className="actions"><Button variant="outline" disabled={busy} onClick={() => void refresh()}>Reload settings</Button>{rawButton}</div></div>}
    {loading ? <div className="loading" aria-busy="true">Reading settings…</div> : view && <>
      {restore ? <section className="review"><h2>Restore previous file?</h2><p>This replaces the whole file with its latest backup, including settings this page does not display. The current file becomes the next backup.</p><div className="actions"><Button variant="outline" disabled={busy} onClick={() => setRestore(false)}>Cancel</Button><Button disabled={busy} onClick={() => void recover()}>Confirm restore</Button></div></section> : <>
        {sections.map(group => {
          const items = results.filter(field => field.section === group.id);
          return items.length > 0 && <section key={group.id} className="settings-group" aria-labelledby={"group-" + group.id}>
            <h2 id={"group-" + group.id}>{group.title}</h2>
            {"note" in group && <p className="notice">{group.note}</p>}
            <div className="settings-list">{items.map(field => {
              const edit = draft[field.key];
              const overridden = edit ? "value" in edit : Object.hasOwn(view.values, field.key);
              const value = edit ? "value" in edit ? edit.value : view.inherited[field.key] : view.values[field.key] ?? view.inherited[field.key];
              return <SettingField key={field.key} field={field} value={value} overridden={overridden} scope={scope}
                disabled={scope === "project" && !!field.globalOnly}
                invalid={invalidKeys.includes(field.key) || (!edit && view.invalid.includes(field.key))}
                onChange={value => change(field.key, value)} onReset={() => reset(field.key)} />;
            })}</div>
          </section>;
        })}
        {!results.length && <p className="empty">No matching settings. Try a label such as “model” or “budget”.</p>}
        <div className="save-bar"><p>{changes.length ? `${changes.length} unsaved ${changes.length === 1 ? "change" : "changes"}` : "No unsaved changes"}</p><div className="actions">
          {changes.length > 0 && <Button variant="outline" onClick={() => { setDraft({}); setError(""); setMessage("Draft discarded. No file was changed."); }}>Discard draft</Button>}
          <Button disabled={!changes.length || !!invalidKeys.length || busy} onClick={() => void save()}>{busy ? "Saving…" : "Save"}</Button>
        </div></div>
      </>}
      {!restore && <section className="file-tools" aria-label="File actions">{rawButton}<Button variant="ghost" disabled={busy} onClick={() => void refresh()}><RotateCcw aria-hidden="true" />Reload from disk</Button>
        {view.hasBackup && <Button variant="ghost" disabled={busy || !!changes.length} onClick={() => setRestore(true)}>Restore previous file</Button>}</section>}
    </>}
    {scope === "global" && !needle && <KeybindingsPanel />}
    <footer className="scope-footnote"><p>Saved values apply to new T3Code threads, or after /reload. Unknown keys in the file are kept as they are.</p></footer>
  </>;
}
