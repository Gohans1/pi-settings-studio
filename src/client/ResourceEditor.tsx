import { useEffect, useState, type FormEvent } from "react";
import type { ResourceFileView, ResourceType } from "../shared/resources";
import { createResource, loadResourceFile, saveResourceFile } from "./api";
import { Button } from "./components/ui/button";

/** Text editor for one resource; a skill's other files are listed beside it. Read-only views explain why. */
export function ResourceEditor({ type, path, name, editable: hint, project, onMessage, onClose }: {
  type: ResourceType; path: string; name: string; editable: boolean; project?: string; onMessage: (text: string) => void; onClose: () => void;
}) {
  const [view, setView] = useState<ResourceFileView>();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function open(file?: string) {
    setBusy(true); setError("");
    try { const next = await loadResourceFile(type, path, file, project); setView(next); setText(next.text); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not read the file."); }
    finally { setBusy(false); }
  }
  useEffect(() => { void open(); }, [type, path, project]);
  const dirty = !!view && text !== view.text;
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!view) return;
    setBusy(true); setError("");
    try {
      const { revision } = await saveResourceFile({ type, path, file: view.file, revision: view.revision, text }, project);
      setView({ ...view, text, revision });
      onMessage(`Saved ${view.file}. Applies to new T3Code threads, or after /reload.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save the file."); }
    finally { setBusy(false); }
  }
  const editable = view ? view.editable : hint;
  return <form className="detail resource-editor" aria-label={`${editable ? "Edit" : "View"} ${name}`} onSubmit={submit}>
    <h2>{name}</h2>
    {view?.readOnly && <p className="notice">Read-only. {view.readOnly}</p>}
    {error && <div role="alert" className="error"><strong>Not saved</strong><p>{error}</p></div>}
    {view && view.files.length > 1 && <nav aria-label="Files" className="file-list">
      {view.files.map(file => <Button key={file} type="button" size="sm" variant={file === view.file ? "secondary" : "ghost"} aria-current={file === view.file ? "true" : undefined}
        disabled={busy || (dirty && file !== view.file)} title={dirty ? "Save or discard the changes first" : undefined} onClick={() => void open(file)}>{file}</Button>)}
    </nav>}
    {view && <label>{view.file}<textarea aria-label={`Content of ${view.file}`} value={text} readOnly={!view.editable} rows={22} spellCheck={false}
      onChange={event => setText(event.target.value)} /></label>}
    {!view && !error && <div className="loading" aria-busy="true">Reading…</div>}
    <p className="muted"><code>{path}</code></p>
    <div className="actions">
      {view?.editable && <Button type="submit" disabled={busy || !dirty}>Save</Button>}
      {dirty && <Button type="button" variant="outline" disabled={busy} onClick={() => setText(view!.text)}>Discard changes</Button>}
      <Button type="button" variant="outline" onClick={() => { if (!dirty || window.confirm("Discard the unsaved changes?")) onClose(); }}>Close</Button>
    </div>
  </form>;
}

const LABELS: Record<ResourceType, string> = { skills: "skill", prompts: "prompt", themes: "theme", extensions: "extension" };
const HINTS: Record<ResourceType, string> = {
  skills: "Lowercase letters, digits and single hyphens, up to 64 characters. Used as /skill:name.",
  prompts: "The file name becomes the /command.",
  themes: "Starts as a copy of Pi's dark theme. Not \"system\".",
  extensions: "Creates a TypeScript file with an empty extension.",
};

/** Creates a resource where Pi looks for it: ~/.pi/agent/<type>/ or the project's .pi/<type>/. */
export function NewResourceForm({ type, project, onCreated, onCancel }: {
  type: ResourceType; project?: string; onCreated: (path: string, name: string) => void; onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [scope, setScope] = useState<"global" | "project">("global");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const label = LABELS[type];
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      const { path } = await createResource({ scope, type, name: name.trim(), ...(description.trim() ? { description: description.trim() } : {}) }, scope === "project" ? project : undefined);
      onCreated(path, name.trim());
    } catch (cause) { setError(cause instanceof Error ? cause.message : `Could not create the ${label}.`); }
    finally { setBusy(false); }
  }
  return <form className="detail server-form" aria-label={`New ${label}`} onSubmit={submit}>
    <h2>New {label}</h2>
    {error && <div role="alert" className="error"><strong>Not created</strong><p>{error}</p></div>}
    <label>Name<input value={name} required autoComplete="off" spellCheck={false} onChange={event => setName(event.target.value)} />
      <span className="muted">{HINTS[type]}</span></label>
    {(type === "skills" || type === "prompts") && <label>Description<input value={description} required={type === "skills"} maxLength={1024}
      placeholder={type === "skills" ? "When the model should use it" : "Shown in command completion"} onChange={event => setDescription(event.target.value)} /></label>}
    {project && <label>Where<select aria-label="Where" value={scope} onChange={event => setScope(event.target.value as "global" | "project")}>
      <option value="global">Global: ~/.pi/agent/{type}/</option><option value="project">This project: .pi/{type}/</option>
    </select></label>}
    <div className="actions"><Button type="submit" disabled={busy}>Create {label}</Button>
      <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>Cancel</Button></div>
  </form>;
}
