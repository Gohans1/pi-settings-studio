import { useEffect, useState } from "react";
import type { RawSettings } from "./api";
import { Button } from "./components/ui/button";
import { FilePath } from "./PageHeader";

/**
 * Whole-file JSON editor: covers keys without a field and repairs broken files. For files that
 * hold credentials, the server sends secrets as ‹hidden N› placeholders and restores them on save.
 */
export function RawJsonEditor({ file, load, save, note, onClose }: {
  file: string; load: () => Promise<RawSettings>; save: (revision: string, text: string) => Promise<RawSettings>;
  note?: string; onClose: (saved: boolean) => void;
}) {
  const [raw, setRaw] = useState<RawSettings>();
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    load().then(data => { setRaw(data); setText(data.text); })
      .catch(cause => setError(cause instanceof Error ? cause.message : `Could not read ${file}.`));
  }, [load, file]);
  async function submit() {
    if (!raw) return;
    setBusy(true); setError("");
    try { await save(raw.revision, text); onClose(true); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Not saved."); }
    finally { setBusy(false); }
  }
  return <section className="raw-editor" aria-labelledby="raw-title">
    <header><h2 id="raw-title">Edit {file} as JSON</h2>
      <p className="muted">Edits the whole file as text, including keys that have no field. It must stay one JSON object. The previous file is kept as a backup.{note ? ` ${note}` : ""}</p>
      {raw && <FilePath path={raw.path} />}</header>
    {error && <div role="alert" className="error"><strong>Not saved</strong><p>{error}</p></div>}
    {raw ? <label>{file}<textarea aria-label={file} value={text} rows={22} spellCheck={false} autoComplete="off" onChange={event => setText(event.target.value)} /></label>
      : !error && <div className="loading" aria-busy="true">Reading {file}…</div>}
    <div className="form-actions"><Button disabled={!raw || busy} onClick={() => void submit()}>{busy ? "Saving…" : "Save JSON"}</Button>
      <Button variant="outline" disabled={busy} onClick={() => onClose(false)}>Cancel</Button></div>
  </section>;
}

export const SECRET_NOTE = "Secrets appear as ‹hidden N›: keep a placeholder to keep its value, or type a new value in its place.";
