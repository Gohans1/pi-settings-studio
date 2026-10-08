import { useEffect, useId, useState, type FormEvent } from "react";
import { CircleAlert } from "lucide-react";
import type { ResourceFileView, ResourceType } from "../shared/resources";
import { createResource, loadResourceFile, saveResourceFile } from "./api";
import { Alert, AlertDescription, AlertTitle } from "./components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "./components/ui/alert-dialog";
import { Button } from "./components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "./components/ui/field";
import { Input } from "./components/ui/input";
import { Textarea } from "./components/ui/textarea";
import { Spinner } from "./components/ui/spinner";
import { OptionSelect } from "./OptionSelect";
import { useFieldErrors } from "./useFieldErrors";
import { FilePath } from "./PageHeader";

/** Text editor for one resource; a skill's other files are listed beside it. Read-only views explain why. */
export function ResourceEditor({ type, path, name, editable: hint, project, onMessage, onClose }: {
  type: ResourceType; path: string; name: string; editable: boolean; project?: string; onMessage: (text: string) => void; onClose: () => void;
}) {
  const [view, setView] = useState<ResourceFileView>();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [asking, setAsking] = useState(false);
  const id = useId();
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
    <header><h2>{name}</h2><FilePath path={path} /></header>
    {view?.readOnly && <Alert role="note"><AlertDescription>Read-only. {view.readOnly}</AlertDescription></Alert>}
    {error && <Alert variant="destructive"><CircleAlert aria-hidden="true" /><AlertTitle>Not saved</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
    {view && view.files.length > 1 && <nav aria-label="Files" className="file-list">
      {view.files.map(file => <Button key={file} type="button" size="sm" variant={file === view.file ? "secondary" : "ghost"} aria-current={file === view.file ? "true" : undefined}
        disabled={busy || (dirty && file !== view.file)} onClick={() => void open(file)}>{file}</Button>)}
    </nav>}
    {view && view.files.length > 1 && dirty && <p className="muted">Save or discard the changes to open another file.</p>}
    {view && <Field><FieldLabel htmlFor={id}>{view.file}</FieldLabel>
      <Textarea id={id} aria-label={`Content of ${view.file}`} className="field-sizing-fixed font-mono" value={text} readOnly={!view.editable} rows={22} spellCheck={false}
        onChange={event => setText(event.target.value)} /></Field>}
    {!view && !error && <div className="loading" aria-busy="true"><Spinner />Reading…</div>}
    <div className="form-actions">
      {view?.editable && <Button type="submit" disabled={busy || !dirty}>Save</Button>}
      {dirty && <Button type="button" variant="outline" disabled={busy} onClick={() => setText(view!.text)}>Discard changes</Button>}
      <Button type="button" variant="outline" onClick={() => { if (dirty) setAsking(true); else onClose(); }}>Close</Button>
    </div>
    <AlertDialog open={asking} onOpenChange={setAsking}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Discard the unsaved changes?</AlertDialogTitle>
          <AlertDialogDescription>Your edits to {view?.file} are not saved.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep editing</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onClose}>Discard</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
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
  const id = useId();
  const label = LABELS[type];
  const { errors, check, clear, describe } = useFieldErrors();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!check(event.currentTarget)) return;
    setBusy(true); setError("");
    try {
      const { path } = await createResource({ scope, type, name: name.trim(), ...(description.trim() ? { description: description.trim() } : {}) }, scope === "project" ? project : undefined);
      onCreated(path, name.trim());
    } catch (cause) { setError(cause instanceof Error ? cause.message : `Could not create the ${label}.`); }
    finally { setBusy(false); }
  }
  return <form className="detail server-form" aria-label={`New ${label}`} onSubmit={submit} onInput={clear} noValidate>
    <h2>New {label}</h2>
    {error && <Alert variant="destructive"><CircleAlert aria-hidden="true" /><AlertTitle>Not created</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
    <FieldGroup>
    <Field data-invalid={!!errors[id + "name"] || undefined}><FieldLabel htmlFor={id + "name"}>Name</FieldLabel>
      <Input id={id + "name"} value={name} required autoComplete="off" spellCheck={false} {...describe(id + "name", id + "name-hint")} onChange={event => setName(event.target.value)} />
      <FieldError id={id + "name-error"}>{errors[id + "name"]}</FieldError>
      <FieldDescription id={id + "name-hint"}>{HINTS[type]}</FieldDescription></Field>
    {(type === "skills" || type === "prompts") && <Field data-invalid={!!errors[id + "description"] || undefined}><FieldLabel htmlFor={id + "description"}>Description</FieldLabel>
      <Input id={id + "description"} value={description} required={type === "skills"} maxLength={1024} {...describe(id + "description")}
        placeholder={type === "skills" ? "When the model should use it" : "Shown in command completion"} onChange={event => setDescription(event.target.value)} />
      <FieldError id={id + "description-error"}>{errors[id + "description"]}</FieldError></Field>}
    {project && <Field><FieldLabel htmlFor={id + "where"}>Where</FieldLabel>
      <OptionSelect id={id + "where"} className="w-full" value={scope} onChange={setScope}
        options={[{ value: "global", label: `Global: ~/.pi/agent/${type}/` }, { value: "project", label: `This project: .pi/${type}/` }] as const} /></Field>}
    </FieldGroup>
    <div className="form-actions"><Button type="submit" disabled={busy}>Create {label}</Button>
      <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>Cancel</Button></div>
  </form>;
}
