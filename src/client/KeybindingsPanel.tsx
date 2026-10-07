import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import type { KeybindingAction, KeybindingsView } from "../shared/keybindings";
import { isValidKey } from "../shared/keys";
import { loadKeybindings, saveKeybindings } from "./api";
import { Button } from "./components/ui/button";

type Draft = Record<string, string[] | null>;
const parse = (text: string) => text.split(",").map(key => key.trim()).filter(Boolean);

/** keybindings.json: only Pi's terminal UI reads it. */
export function KeybindingsPanel() {
  const [view, setView] = useState<KeybindingsView>();
  const [draft, setDraft] = useState<Draft>({});
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { loadKeybindings().then(setView).catch(cause => setError(cause instanceof Error ? cause.message : "Could not read keybindings.json.")); }, []);

  const current = (action: KeybindingAction): string[] | null => Object.hasOwn(draft, action.id) ? draft[action.id] ?? null : action.keys ?? null;
  const set = (id: string, keys: string[] | null) => { setMessage(""); setDraft(old => ({ ...old, [id]: keys })); };
  const invalid = Object.entries(texts).filter(([, text]) => parse(text).some(key => !isValidKey(key))).map(([id]) => id);
  const changes = Object.entries(draft).filter(([id, keys]) => JSON.stringify(keys) !== JSON.stringify(view?.actions.find(action => action.id === id)?.keys ?? null))
    .map(([id, keys]) => ({ id, keys }));
  async function save() {
    if (!view) return;
    setBusy(true); setError(""); setMessage("");
    try {
      setView(await saveKeybindings(view.revision, changes));
      setDraft({}); setTexts({});
      setMessage("Saved keybindings.json. Run /reload in a terminal Pi session to apply it.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Not saved."); }
    finally { setBusy(false); }
  }
  const needle = query.trim().toLowerCase();
  const visible = (view?.actions ?? []).filter(action => !needle || `${action.id} ${action.description}`.toLowerCase().includes(needle));
  return <section className="settings-group keybindings" id="group-keybindings" aria-labelledby="keybindings-title">
    <h2 id="keybindings-title">Keyboard shortcuts</h2>
    <p className="notice">Only affects Pi in a terminal. No effect in T3Code. A set value replaces the defaults; separate several keys with commas.</p>
    {view && <code className="scope-info">{view.path}</code>}
    <div role="status" className="feedback">{message}</div>
    {(error || view?.error) && <div role="alert" className="error"><strong>keybindings.json</strong><p>{error || view?.error}</p></div>}
    <div className="search"><Search aria-hidden="true" /><input type="search" aria-label="Search shortcuts" placeholder="Search shortcuts…" value={query} onChange={e => setQuery(e.target.value)} /></div>
    {view && <div className="keybinding-list">{visible.map(action => {
      const keys = current(action);
      const text = texts[action.id] ?? (keys ?? []).join(", ");
      const bad = invalid.includes(action.id);
      return <div className="keybinding-row" key={action.id}>
        <div><strong>{action.description}</strong><code className="muted">{action.id}</code></div>
        <div className="keybinding-control">
          <input aria-label={`Keys for ${action.id}`} value={text} aria-invalid={bad || undefined} spellCheck={false} autoComplete="off"
            placeholder={keys && !keys.length ? "Disabled" : action.defaults.join(", ") || "No default"}
            onChange={e => { setTexts(old => ({ ...old, [action.id]: e.target.value })); if (!parse(e.target.value).some(key => !isValidKey(key))) set(action.id, e.target.value.trim() ? parse(e.target.value) : null); }} />
          <span className="muted">{keys === null ? "Default" : keys.length ? "Custom" : "Disabled"}</span>
          {keys !== null && <Button variant="ghost" size="sm" aria-label={`Use default for ${action.id}`} onClick={() => { setTexts(old => ({ ...old, [action.id]: "" })); set(action.id, null); }}>Use default</Button>}
          {!(keys && !keys.length) && <Button variant="ghost" size="sm" aria-label={`Disable ${action.id}`} onClick={() => { setTexts(old => ({ ...old, [action.id]: "" })); set(action.id, []); }}>Disable</Button>}
          {bad && <p className="field-error">"{parse(text).find(key => !isValidKey(key))}" is not a key Pi understands.</p>}
        </div>
      </div>;
    })}</div>}
    {view && view.unknown.length > 0 && <p className="muted">Also in the file and kept: {view.unknown.join(", ")}.</p>}
    <div className="save-bar"><p>{changes.length ? `${changes.length} unsaved ${changes.length === 1 ? "change" : "changes"}` : "No unsaved changes"}</p>
      <Button disabled={!changes.length || !!invalid.length || busy} onClick={() => void save()}>{busy ? "Saving…" : "Save shortcuts"}</Button></div>
  </section>;
}
