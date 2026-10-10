import { Fragment, useEffect, useId, useState, type FormEvent } from "react";
import { CircleAlert, TriangleAlert } from "lucide-react";
import type { ResourcePathsView, ResourceType } from "../shared/resources";
import { changeResourcePath, loadResourcePaths } from "./api";
import { Alert, AlertDescription } from "./components/ui/alert";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "./components/ui/field";
import { Input } from "./components/ui/input";
import { Spinner } from "./components/ui/spinner";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemSeparator } from "./components/ui/item";
import { OptionSelect } from "./OptionSelect";
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
        setPath(""); onChanged({ message: `Added ${entry}.${replaces} Applies to new Pi sessions, or after /reload.` });
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
        <ItemGroup>{view.standard.map((place, index) => <Fragment key={place.path}>{index > 0 && <ItemSeparator aria-hidden="true" />}<Item size="xs" role="listitem">
          <ItemContent><FilePath path={place.path} folder />
            {(place.scope === "project" || !place.exists) && <ItemDescription>{[place.scope === "project" && "This project", !place.exists && "not created"].filter(Boolean).join(" · ")}</ItemDescription>}</ItemContent>
        </Item></Fragment>)}</ItemGroup>
      </div>
      <div className="folder-block">
        <p className="folder-block-title">Added in settings</p>
        {view.paths.length ? <ItemGroup>{view.paths.map((entry, index) => {
          const notes = [
            home(entry.resolved) !== entry.entry && <span>as <code translate="no">{entry.entry}</code></span>,
            entry.scope === "project" && "This project",
            entry.exists && `${entry.found} ${entry.found === 1 ? singular : plural}${entry.kind === "file" ? " (a file)" : ""}`,
          ].filter(Boolean);
          const warnings = [
            !entry.exists && "Not found",
            !!entry.replaces && `${entry.replaces} ${entry.replaces === 1 ? "replaces a skill" : "replace skills"} of the same name`,
            !!entry.skipped && `${entry.skipped} not loaded (same name)`,
          ].filter((text): text is string => !!text);
          return <Fragment key={entry.scope + entry.entry}>{index > 0 && <ItemSeparator aria-hidden="true" />}<Item size="xs" role="listitem">
            <ItemContent>
              <FilePath path={entry.resolved} folder={entry.kind !== "file"} />
              {notes.length > 0 && <ItemDescription>{notes.map((note, i) => <Fragment key={i}>{i > 0 && " · "}{note}</Fragment>)}</ItemDescription>}
              {warnings.length > 0 && <div className="flex flex-wrap gap-1">{warnings.map(text => <Badge key={text} variant="outline">
                <TriangleAlert aria-hidden="true" data-icon="inline-start" className="text-warning" />{text}</Badge>)}</div>}
            </ItemContent>
            <ItemActions><Button variant="destructive" size="xs" disabled={busy} aria-label={`Remove ${entry.entry}`} onClick={() => void change("DELETE", entry.scope, entry.entry)}>Remove</Button></ItemActions>
          </Item></Fragment>;
        })}</ItemGroup> : <p className="muted">None. Pi only uses the folders above{type === "skills" ? " and packages" : ""}.</p>}
      </div>
      <form className="add-path" onSubmit={submit} noValidate>
        <Field className="flex-1 basis-72" data-invalid={!!error || undefined}><FieldLabel htmlFor={`${id}-path`}>Folder or file</FieldLabel>
          <Input id={`${id}-path`} value={path} required autoComplete="off" spellCheck={false} placeholder={EXAMPLES[type]}
            aria-invalid={!!error || undefined} aria-describedby={`${id}-hint${error ? ` ${id}-error` : ""}`} onChange={event => { setPath(event.target.value); setError(""); }} /></Field>
        {project && <Field className="w-auto"><FieldLabel htmlFor={`${id}-scope`}>Save in</FieldLabel>
          <OptionSelect id={`${id}-scope`} value={scope} onChange={setScope} options={[{ value: "global", label: "Global settings" }, { value: "project", label: "This project" }] as const} /></Field>}
        <Button type="submit" disabled={busy}>Add</Button>
        <FieldDescription id={`${id}-hint`} className="basis-full">An absolute path, ~/…, or a path relative to {scope === "project" ? "the project's .pi folder" : "the agent folder"}. Pi finds {plural} inside folders.</FieldDescription>
        {error && <FieldError id={`${id}-error`} className="basis-full">{error}</FieldError>}
      </form>
    </>}
    {!view && !error && <div className="loading" aria-busy="true"><Spinner />Reading settings…</div>}
    {!view && error && <Alert variant="destructive"><CircleAlert aria-hidden="true" /><AlertDescription>{error}</AlertDescription></Alert>}
  </section>;
}
