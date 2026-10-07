import { useEffect, useState } from "react";
import type { InstructionFile, InstructionsView } from "../shared/instructions";
import { deleteInstruction, loadInstructions, restoreInstruction, saveInstruction } from "./api";
import { Button } from "./components/ui/button";

const baseName = (path: string) => path.split(/[\\/]/).pop() ?? path;
const home = (path: string) => path.replace(/^\/home\/[^/]+/, "~");

function title(file: InstructionFile): string {
  if (file.kind === "context") return `Instructions (${baseName(file.path)})`;
  return file.scope === "project" ? `.pi/${baseName(file.path)}` : baseName(file.path);
}

function role(file: InstructionFile, files: InstructionFile[], loadsInProject: boolean): string {
  if (file.kind === "context") {
    return file.scope === "global" ? "Loaded in every project, before the project's own instructions."
      : "Loaded when Pi runs in this folder or below it, even when the project is not trusted.";
  }
  const what = file.kind === "system" ? "Replaces Pi's default system prompt." : "Added to the end of Pi's system prompt.";
  const local = files.find(other => other.scope === "project" && other.kind === file.kind);
  if (file.scope === "global" && local?.exists) return `${what} This project's .pi/${baseName(local.path)} replaces it there${loadsInProject ? "" : " once the project is trusted"}.`;
  if (file.scope === "project") return `${what} Takes the place of the global ${baseName(file.path)} in this project${loadsInProject ? "" : ", but only once the project is trusted"}.`;
  return what;
}

function Editor({ file, files, project, loadsInProject, busy, onSave, onDelete }: {
  file: InstructionFile; files: InstructionFile[]; project?: string; loadsInProject: boolean; busy: boolean;
  onSave: (text: string) => void; onDelete: () => void;
}) {
  const [text, setText] = useState(file.text ?? "");
  const changed = text !== (file.text ?? "");
  return <section className="detail instruction" aria-labelledby="instruction-title">
    <h2 id="instruction-title">{title(file)}</h2>
    <p className="muted">{role(file, files, loadsInProject)}</p>
    <code className="scope-info">{home(file.path)}</code>
    {file.error ? <div className="error"><strong>Cannot edit this file here</strong><p>{file.error}</p></div> : <>
      {!file.exists && <p className="notice">Not created yet. Saving creates it{file.kind === "context" ? " as AGENTS.md" : ""}.</p>}
      {file.others?.length ? <p className="notice">Pi ignores {file.others.join(", ")} in this folder, because {baseName(file.path)} comes first.</p> : null}
      <textarea aria-label={`Contents of ${baseName(file.path)}`} value={text} rows={22} spellCheck={false} onChange={event => setText(event.target.value)} />
      <div className="actions">
        <Button disabled={busy || (file.exists && !changed)} onClick={() => onSave(text)}>{busy ? "Saving…" : file.exists ? "Save file" : "Create file"}</Button>
        {changed && <Button variant="outline" disabled={busy} onClick={() => setText(file.text ?? "")}>Discard changes</Button>}
        {file.exists && <Button variant="destructive" disabled={busy || changed} onClick={onDelete}>Delete file</Button>}
      </div>
      {project && file.scope === "global" && <p className="muted">Applies to every project, not only the one chosen at the top.</p>}
    </>}
  </section>;
}

export function InstructionsTab({ project, loadsInProject = true }: { project?: string; loadsInProject?: boolean }) {
  const [view, setView] = useState<InstructionsView>();
  const [selected, setSelected] = useState<string>("global:context");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [undo, setUndo] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setError("");
    try { setView(await loadInstructions(project)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not read the instruction files."); }
  }
  useEffect(() => { void refresh(); }, [project]);

  async function run(change: () => Promise<InstructionsView>, done: string, undoable?: string) {
    setBusy(true); setError(""); setMessage(""); setUndo(undefined);
    try { setView(await change()); setMessage(`${done} Applies to new T3Code threads, or after /reload.`); setUndo(undoable); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save."); await refresh(); }
    finally { setBusy(false); }
  }

  const files = view?.files ?? [];
  const current = files.find(file => file.id === selected) ?? files[0];
  const extra = (view?.loaded ?? []).filter(path => !files.some(file => file.path === path));
  const list = (scope: "global" | "project") => <ul className="item-list">{files.filter(file => file.scope === scope).map(file => <li key={file.id}>
    <button type="button" aria-pressed={file.id === current?.id} onClick={() => setSelected(file.id)}>
      <span className="item-name">{title(file)}</span><span className="item-state">{file.error ? "unreadable" : file.exists ? "" : "not created"}</span>
    </button>
  </li>)}</ul>;
  return <>
    <div className="page-heading"><div><h1>Instructions</h1><p>Text Pi puts in every system prompt: context files (AGENTS.md), SYSTEM.md and APPEND_SYSTEM.md.</p></div></div>
    <div role="status" className="feedback">{message}{undo && <>{" "}<Button variant="outline" size="sm" disabled={busy}
      onClick={() => { const id = undo; const name = baseName(files.find(file => file.id === id)?.path ?? id); void run(() => restoreInstruction(id, project), `Restored ${name}.`); }}>Undo</Button></>}</div>
    {error && <div role="alert" className="error"><strong>Could not complete the change</strong><p>{error}</p></div>}
    {!view ? !error && <div className="loading" aria-busy="true">Reading instruction files…</div> : <div className="master-detail">
      <div className="master">
        <section className="item-group" aria-label="Global instruction files"><div className="list-header"><h2>Global</h2></div>{list("global")}</section>
        {project && <section className="item-group" aria-label="This project's instruction files"><div className="list-header"><h2>This project</h2></div>{list("project")}</section>}
        {project && extra.length > 0 && <section className="item-group" aria-label="Also loaded">
          <div className="list-header"><h2>Also loaded here</h2></div>
          <ul className="plain-list">{extra.map(path => <li key={path}><code>{home(path)}</code></li>)}</ul>
          <p className="muted">Context files in parent folders. Edit them in their own folder.</p>
        </section>}
      </div>
      {current && <Editor key={current.id + current.revision} file={current} files={files} project={project} loadsInProject={loadsInProject} busy={busy}
        onSave={text => void run(() => saveInstruction(current.id, current.revision, text, project), `Saved ${baseName(current.path)}.`)}
        onDelete={() => void run(() => deleteInstruction(current.id, current.revision, project), `Deleted ${baseName(current.path)}.`, current.id)} />}
    </div>}
  </>;
}
