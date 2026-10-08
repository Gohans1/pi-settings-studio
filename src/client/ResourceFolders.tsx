import { useEffect, useId, useState, type FormEvent } from "react";
import { TriangleAlert } from "lucide-react";
import type { ResourcePathsView, ResourceType } from "../shared/resources";
import { changeResourcePath, loadResourcePaths } from "./api";
import { Button } from "./components/ui/button";
import { FilePath, home } from "./PageHeader";

const TITLES: Record<ResourceType, string> = { skills: "Skill folders", extensions: "Extension folders", prompts: "Prompt template folders", themes: "Theme folders" };
const EXAMPLES: Record<ResourceType, string> = { skills: "~/my-skills", extensions: "~/my-extensions", prompts: "~/my-prompts", themes: "~/my-themes" };
const NOUNS: Record<ResourceType, [string, string]> = { skills: ["skill", "skills"], extensions: ["extension", "extensions"], prompts: ["prompt template", "prompt templates"], themes: ["theme", "themes"] };

export type FolderChange = { message: string; undo?: { scope: "global" | "project"; revision: string } };

/**
 * Where Pi loads one type of resource from: its own folders, and the paths added in settings.json
 * (or the project's), which can be added and removed here.
 */
export function ResourceFolders({ type, project, level = 3, onChanged }: {
  type: ResourceType; project?: string; level?: 2 | 3; onChanged: (change: FolderChange) => void;
}) {
  const [view, setView] = useState<ResourcePathsView>();
  const [path, setPath] = useState("");
  const [scope, setScope] = useState<"global" | "project">("global");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const id = useId();
  useEffect(() => { setView(undefined); setScope("global"); loadResourcePaths(type, project).then(setView).catch(cause => setError(cause instanceof Error ? cause.message : "Could not read the settings.")); }, [type, project]);
  const [singular, plural] = NOUNS[type];
  const revisionOf = (target: "global" | "project", current = view) => target === "project" ? current?.projectRevision : current?.revision;

  async function change(method: "POST" | "DELETE", target: "global" | "project", entry: string) {
    const revision = revisionOf(target);
    if (!revision) return;
    setBusy(true); setError("");
    try {
      const next = await changeResourcePath(method, { type, scope: target, revision, path: entry }, project);
      setView(next);
      if (method === "POST") {
        // Name what the new folder changes: skills that now replace ones of the same name.
        const added = next.paths.find(item => item.scope === target && item.entry === entry.trim());
        const replaces = added?.replaces ? ` ${added.replaces} of its ${plural} ${added.replaces === 1 ? "replaces one" : "replace ones"} of the same name.` : "";
        setPath(""); onChanged({ message: `Added ${entry}.${replaces} Applies to new T3Code threads, or after /reload.` });
      }
      else onChanged({ message: `Removed ${entry} from ${target === "project" ? "the project's settings.json" : "settings.json"}.`, undo: { scope: target, revision: revisionOf(target, next)! } });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Not saved."); }
    finally { setBusy(false); }
  }
  function submit(event: FormEvent) { event.preventDefault(); void change("POST", scope, path); }

  const Heading = `h${level}` as const;
  return <section className="resource-folders" aria-labelledby={`${id}-title`}>
    <Heading id={`${id}-title`}>{TITLES[type]}</Heading>
    {view && <>
      <div className="folder-block">
        <p className="folder-block-title">Pi looks here</p>
        <ul className="folder-list">{view.standard.map(place => <li key={place.path}>
          <FilePath path={place.path} folder />{place.scope === "project" && <span className="muted">This project</span>}
          {!place.exists && <span className="muted">not created</span>}
        </li>)}</ul>
      </div>
      <div className="folder-block">
        <p className="folder-block-title">Added in settings</p>
        {view.paths.length ? <ul className="folder-list">{view.paths.map(entry => <li key={entry.scope + entry.entry}>
          <FilePath path={entry.resolved} folder={entry.kind !== "file"} />
          {home(entry.resolved) !== entry.entry && <span className="muted">as <code translate="no">{entry.entry}</code></span>}
          {entry.scope === "project" && <span className="muted">This project</span>}
          {entry.exists ? <span className="muted">{entry.found} {entry.found === 1 ? singular : plural}{entry.kind === "file" ? " (a file)" : ""}</span>
            : <span className="folder-missing"><TriangleAlert aria-hidden="true" />Not found</span>}
          {!!entry.replaces && <span className="folder-missing"><TriangleAlert aria-hidden="true" />{entry.replaces} {entry.replaces === 1 ? "replaces a skill" : "replace skills"} of the same name</span>}
          {!!entry.skipped && <span className="folder-missing"><TriangleAlert aria-hidden="true" />{entry.skipped} not loaded (same name)</span>}
          <Button variant="ghost" size="xs" disabled={busy} aria-label={`Remove ${entry.entry}`} onClick={() => void change("DELETE", entry.scope, entry.entry)}>Remove</Button>
        </li>)}</ul> : <p className="muted">None. Pi only uses the folders above{type === "skills" ? " and packages" : ""}.</p>}
      </div>
      <form className="add-path" onSubmit={submit} noValidate>
        <label>Folder or file<input value={path} required autoComplete="off" spellCheck={false} placeholder={EXAMPLES[type]}
          aria-invalid={!!error || undefined} aria-describedby={`${id}-hint${error ? ` ${id}-error` : ""}`} onChange={event => { setPath(event.target.value); setError(""); }} /></label>
        {project && <label>Save in<select value={scope} onChange={event => setScope(event.target.value as "global" | "project")}>
          <option value="global">Global settings</option><option value="project">This project</option></select></label>}
        <Button type="submit" disabled={busy}>Add</Button>
        <p id={`${id}-hint`} className="muted">An absolute path, ~/…, or a path relative to {scope === "project" ? "the project's .pi folder" : "the agent folder"}. Pi finds {plural} inside folders.</p>
        {error && <p id={`${id}-error`} className="field-error">{error}</p>}
      </form>
    </>}
    {!view && !error && <div className="loading" aria-busy="true">Reading settings…</div>}
    {!view && error && <p role="alert" className="field-error">{error}</p>}
  </section>;
}
