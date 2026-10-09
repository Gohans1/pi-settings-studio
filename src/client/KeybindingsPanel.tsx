import { Fragment, useEffect, useState } from "react";
import type { KeybindingAction, KeybindingsView } from "../shared/keybindings";
import { isValidKey } from "../shared/keys";
import { loadKeybindings, saveKeybindings } from "./api";
import { CircleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "./components/ui/alert";
import { Button } from "./components/ui/button";
import { Field, FieldContent, FieldError, FieldGroup, FieldSeparator, FieldTitle } from "./components/ui/field";
import { Input } from "./components/ui/input";
import { Spinner } from "./components/ui/spinner";
import { FilePath } from "./PageHeader";
import { SearchField } from "./SearchField";

type Draft = Record<string, string[] | null>;
const parse = (text: string) => text.split(",").map(key => key.trim()).filter(Boolean);

/** keybindings.json: only Pi's terminal UI reads it. */
export function KeybindingsPanel({ onMessage }: { onMessage: (text: string) => void }) {
  const [view, setView] = useState<KeybindingsView>();
  const [draft, setDraft] = useState<Draft>({});
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { loadKeybindings().then(setView).catch(cause => setError(cause instanceof Error ? cause.message : "Could not read keybindings.json.")); }, []);

  const current = (action: KeybindingAction): string[] | null => Object.hasOwn(draft, action.id) ? draft[action.id] ?? null : action.keys ?? null;
  const set = (id: string, keys: string[] | null) => { onMessage(""); setDraft(old => ({ ...old, [id]: keys })); };
  const invalid = Object.entries(texts).filter(([, text]) => parse(text).some(key => !isValidKey(key))).map(([id]) => id);
  const changes = Object.entries(draft).filter(([id, keys]) => JSON.stringify(keys) !== JSON.stringify(view?.actions.find(action => action.id === id)?.keys ?? null))
    .map(([id, keys]) => ({ id, keys }));
  async function save() {
    if (!view) return;
    // A key Pi does not understand: take the reader to it and write nothing.
    if (invalid.length) { document.getElementById("keys-" + invalid[0])?.focus(); return; }
    setBusy(true); setError(""); onMessage("");
    try {
      setView(await saveKeybindings(view.revision, changes));
      setDraft({}); setTexts({});
      onMessage("Saved keybindings.json. Run /reload in a terminal Pi session to apply it.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Not saved."); }
    finally { setBusy(false); }
  }
  const needle = query.trim().toLowerCase();
  const visible = (view?.actions ?? []).filter(action => !needle || `${action.id} ${action.description}`.toLowerCase().includes(needle));
  return <section className="settings-group" id="group-keybindings" aria-labelledby="keybindings-title">
    <h2 id="keybindings-title">Keyboard shortcuts</h2>
    <Alert role="note"><AlertDescription>Only affects Pi in a terminal. No effect in T3Code. A set value replaces the defaults; separate several keys with commas.</AlertDescription></Alert>
    {view && <FilePath path={view.path} />}
    {(error || view?.error) && <Alert variant="destructive"><CircleAlert aria-hidden="true" /><AlertTitle>keybindings.json</AlertTitle><AlertDescription>{error || view?.error}</AlertDescription></Alert>}
    <SearchField label="Search shortcuts" placeholder="Search shortcuts…" value={query} onChange={setQuery} shortcut={false} className="my-3 w-72 max-w-full" />
    {view && <FieldGroup>{visible.map((action, index) => {
      const keys = current(action);
      const text = texts[action.id] ?? (keys ?? []).join(", ");
      const bad = invalid.includes(action.id);
      return <Fragment key={action.id}>{index > 0 && <FieldSeparator />}<Field orientation="responsive" data-invalid={bad || undefined}>
        <FieldContent><FieldTitle>{action.description}</FieldTitle><code className="setting-key" translate="no">{action.id}</code></FieldContent>
        <div className="keybinding-control @md/field-group:shrink-0 @md/field-group:basis-[min(26rem,50%)]">
          <Input id={"keys-" + action.id} className="min-w-0 flex-1 basis-40 font-mono" aria-label={`Keys for ${action.id}`} value={text} aria-invalid={bad || undefined} aria-describedby={bad ? `keys-${action.id}-error` : undefined} spellCheck={false} autoComplete="off"
            placeholder={keys && !keys.length ? "Disabled" : action.defaults.join(", ") || "No default"}
            onChange={e => { setTexts(old => ({ ...old, [action.id]: e.target.value })); if (!parse(e.target.value).some(key => !isValidKey(key))) set(action.id, e.target.value.trim() ? parse(e.target.value) : null); }} />
          <span className="muted">{keys === null ? "Default" : keys.length ? "Custom" : "Disabled"}</span>
          {keys !== null && <Button variant="ghost" size="xs" aria-label={`Use default for ${action.id}`} onClick={() => { setTexts(old => ({ ...old, [action.id]: "" })); set(action.id, null); }}>Use default</Button>}
          {!(keys && !keys.length) && <Button variant="ghost" size="xs" aria-label={`Disable ${action.id}`} onClick={() => { setTexts(old => ({ ...old, [action.id]: "" })); set(action.id, []); }}>Disable</Button>}
          {bad && <FieldError id={`keys-${action.id}-error`} className="basis-full">"{parse(text).find(key => !isValidKey(key))}" is not a key Pi understands. Use names such as ctrl+k or shift+enter.</FieldError>}
        </div>
      </Field></Fragment>;
    })}</FieldGroup>}
    {view && view.unknown.length > 0 && <p className="muted">Also in the file and kept: {view.unknown.join(", ")}.</p>}
    {(changes.length > 0 || invalid.length > 0) && <div className="save-bar" role="region" aria-label="Unsaved shortcuts">
      <p>{invalid.length ? `${invalid.length} ${invalid.length === 1 ? "shortcut needs" : "shortcuts need"} a key Pi understands` : `${changes.length} unsaved ${changes.length === 1 ? "shortcut" : "shortcuts"}`}</p>
      <Button disabled={busy} onClick={() => void save()}>{busy && <Spinner data-icon="inline-start" aria-hidden="true" />}{busy ? "Saving…" : "Save shortcuts"}</Button></div>}
  </section>;
}
