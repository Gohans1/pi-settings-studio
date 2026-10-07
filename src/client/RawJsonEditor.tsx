import { useEffect, useState } from "react";
import { loadRawSettings, saveRawSettings, type RawSettings } from "./api";
import { Button } from "./components/ui/button";

/** Whole-file editor for settings.json: covers keys without a field and repairs broken JSON. */
export function RawJsonEditor({ scope = "global", project, onClose }: { scope?: "global" | "project"; project?: string; onClose: (saved: boolean) => void }) {
  const [raw, setRaw] = useState<RawSettings>();
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    loadRawSettings(scope, project).then(data => { setRaw(data); setText(data.text); })
      .catch(cause => setError(cause instanceof Error ? cause.message : "Could not read settings.json."));
  }, [scope, project]);
  async function save() {
    if (!raw) return;
    setBusy(true); setError("");
    try { await saveRawSettings(raw.revision, text, scope, project); onClose(true); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Not saved."); }
    finally { setBusy(false); }
  }
  return <section className="raw-editor" aria-labelledby="raw-title">
    <h2 id="raw-title">Raw JSON</h2>
    <p className="muted">Edits the whole file as text, including keys that have no field. It must stay one JSON object. The previous file is kept as a backup.</p>
    {error && <div role="alert" className="error"><strong>Not saved</strong><p>{error}</p></div>}
    {raw && <code className="scope-info">{raw.path}</code>}
    {raw ? <label>settings.json<textarea value={text} rows={22} spellCheck={false} autoComplete="off" onChange={event => setText(event.target.value)} /></label>
      : !error && <div className="loading" aria-busy="true">Reading settings.json…</div>}
    <div className="actions"><Button disabled={!raw || busy} onClick={() => void save()}>{busy ? "Saving…" : "Save JSON"}</Button>
      <Button variant="outline" disabled={busy} onClick={() => onClose(false)}>Cancel</Button></div>
  </section>;
}
