import { useEffect, useId, useState, type FormEvent } from "react";
import type { AgentInput, AgentView, AgentsView } from "../shared/agents";
import { addAgent, editAgent, loadAgents, removeAgent, restoreAgent, type AgentScope } from "./api";
import { Bot, CircleAlert, Plus, TriangleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "./components/ui/alert";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Empty, EmptyDescription } from "./components/ui/empty";
import { Field, FieldDescription, FieldLabel } from "./components/ui/field";
import { Input } from "./components/ui/input";
import { Textarea } from "./components/ui/textarea";
import { Spinner } from "./components/ui/spinner";
import { Disclosure } from "./Disclosure";
import { Feedback } from "./Feedback";
import { PageHeader } from "./PageHeader";
import { EmptyDetail, IconButton, ListItem, Workbench } from "./Workbench";

function AgentForm({ agent, busy, error, title: heading, onSave, onCancel }: {
  agent?: AgentView; busy: boolean; error: string; title?: string; onSave: (input: AgentInput) => void; onCancel: () => void;
}) {
  const [name, setName] = useState(agent?.name ?? "");
  const [description, setDescription] = useState(agent?.description ?? "");
  const [tools, setTools] = useState((agent?.tools ?? []).join(", "));
  const [model, setModel] = useState(agent?.model ?? "");
  const [prompt, setPrompt] = useState(agent?.prompt ?? "");
  const title = heading ?? (agent ? `Edit ${agent.name ?? agent.file}` : "Add profile");
  const id = useId();
  function submit(event: FormEvent) {
    event.preventDefault();
    onSave({ name: name.trim(), description: description.trim(), tools: tools.split(",").map(tool => tool.trim()).filter(Boolean),
      ...(model.trim() ? { model: model.trim() } : {}), prompt });
  }
  return <form className="detail server-form" aria-label={title} onSubmit={submit}>
    <h2>{title}</h2>
    {error && <Alert variant="destructive"><CircleAlert aria-hidden="true" /><AlertTitle>Not saved</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
    <Field><FieldLabel htmlFor={id + "name"}>Name</FieldLabel>
      <Input id={id + "name"} value={name} required pattern="[A-Za-z0-9][A-Za-z0-9_.\-]*" title="Letters, digits, ., _ and -" autoComplete="off" spellCheck={false} onChange={e => setName(e.target.value)} />
      {!agent && <FieldDescription>Saved as {name.trim() || "name"}.md</FieldDescription>}</Field>
    <Field><FieldLabel htmlFor={id + "description"}>Description</FieldLabel>
      <Input id={id + "description"} value={description} required placeholder="When to use this agent, in a sentence" onChange={e => setDescription(e.target.value)} /></Field>
    <Field><FieldLabel htmlFor={id + "tools"}>Tools</FieldLabel>
      <Input id={id + "tools"} value={tools} placeholder="read, grep, find, ls" autoComplete="off" spellCheck={false} aria-describedby={id + "tools-hint"} onChange={e => setTools(e.target.value)} />
      <FieldDescription id={id + "tools-hint"}>Comma-separated. Empty means the extension's default tools.</FieldDescription></Field>
    <Field><FieldLabel htmlFor={id + "model"}>Model</FieldLabel>
      <Input id={id + "model"} value={model} placeholder="Default model" autoComplete="off" spellCheck={false} onChange={e => setModel(e.target.value)} /></Field>
    <Field><FieldLabel htmlFor={id + "prompt"}>System prompt</FieldLabel>
      <Textarea id={id + "prompt"} className="field-sizing-fixed" rows={12} value={prompt} onChange={e => setPrompt(e.target.value)} /></Field>
    {agent && agent.extraKeys.length > 0 && <FieldDescription>Kept as they are: {agent.extraKeys.join(", ")}.</FieldDescription>}
    <div className="form-actions"><Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save profile"}</Button>
      <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>Cancel</Button></div>
  </form>;
}

function AgentDetail({ agent, busy, onEdit, onRemove }: { agent: AgentView; busy: boolean; onEdit: () => void; onRemove: () => void }) {
  const title = agent.name ?? agent.file;
  return <section className="detail" aria-labelledby="agent-title">
    <header className="detail-header"><h2 id="agent-title">{title}</h2>
      <div className="actions">
        <Button variant="outline" disabled={busy} onClick={onEdit} aria-label={`Edit ${title}`}>Edit</Button>
        <Button variant="destructive" disabled={busy} onClick={onRemove} aria-label={`Remove ${title}`}>Remove</Button>
      </div></header>
    {agent.error && <Alert role="note" variant="destructive"><CircleAlert aria-hidden="true" /><AlertTitle>Not loaded</AlertTitle><AlertDescription>{agent.error}</AlertDescription></Alert>}
    {agent.shadowed && <Alert role="note"><AlertDescription>This project has its own "{agent.name}" profile, which replaces this one there.</AlertDescription></Alert>}
    <dl className="detail-list">
      {agent.description && <div><dt>Description</dt><dd>{agent.description}</dd></div>}
      <div><dt>Tools</dt><dd>{agent.tools?.join(", ") ?? <span className="muted">Extension default</span>}</dd></div>
      <div><dt>Model</dt><dd>{agent.model ?? <span className="muted">Default model</span>}</dd></div>
      {agent.extraKeys.length > 0 && <div><dt>Other keys</dt><dd className="flex flex-wrap items-center gap-1.5">{agent.extraKeys.map(key => <Badge key={key} variant="outline" render={<code />}>{key}</Badge>)}<span className="muted">kept as they are</span></dd></div>}
      <div><dt>File</dt><dd><code>{agent.file}</code><span className="muted"> · {agent.scope === "project" ? "this project's .pi/agents" : "global"}</span></dd></div>
    </dl>
    <div className="prompt-preview"><Disclosure label="System prompt"><pre>{agent.prompt || "(empty)"}</pre></Disclosure></div>
  </section>;
}

export function SubagentsTab({ project }: { project?: string }) {
  const [view, setView] = useState<AgentsView>();
  const [selected, setSelected] = useState<{ scope: AgentScope; file: string }>();
  const [mode, setMode] = useState<"view" | "add" | "edit">("view");
  const [addScope, setAddScope] = useState<AgentScope>("user");
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [message, setMessage] = useState("");
  const [undo, setUndo] = useState<{ scope: AgentScope; file: string }>();
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setError("");
    try { setView(await loadAgents(project)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not read the profiles."); }
  }
  useEffect(() => { setSelected(undefined); setMode("view"); void refresh(); }, [project]);

  async function run(change: () => Promise<AgentsView>, done: string, after?: () => void) {
    setBusy(true); setError(""); setFormError(""); setMessage(""); setUndo(undefined);
    try { setView(await change()); setMessage(done); after?.(); }
    catch (cause) {
      const text = cause instanceof Error ? cause.message : "Could not save.";
      if (mode === "view") { setError(text); await refresh(); } else setFormError(text);
    } finally { setBusy(false); }
  }

  const agents = view?.agents ?? [];
  const current = agents.find(agent => agent.scope === selected?.scope && agent.file === selected.file);
  const add = (scope: AgentScope) => { setAddScope(scope); setMode("add"); setFormError(""); };
  const list = (scope: AgentScope) => <ul className="item-list">{agents.filter(agent => agent.scope === scope).map(agent => <li key={agent.file}>
    <ListItem selected={selected?.scope === scope && agent.file === selected.file} onSelect={() => { setSelected({ scope, file: agent.file }); setMode("view"); }}
      name={agent.name ?? agent.file} tone={agent.error ? "refused" : undefined} state={agent.error ? "skipped" : agent.shadowed ? "replaced here" : agent.model ?? ""} />
  </li>)}</ul>;
  const open = mode !== "view" || !!current;
  return <>
    <PageHeader title="Sub-agents" description="Profiles in the format of Pi's example subagent extension." files={[view?.dir]}
      actions={<Button variant="outline" disabled={busy} onClick={() => add("user")}><Plus aria-hidden="true" />Add profile</Button>} />
    {view && !view.readerInstalled && <Alert role="note" className="mb-4"><TriangleAlert aria-hidden="true" /><AlertDescription>No installed extension reads these profiles yet. Pi has no built-in sub-agents: install Pi's example subagent extension (or another that reads this folder) for them to take effect. T3Code's own sub-agents are separate.</AlertDescription></Alert>}
    <Feedback message={message} onDismiss={() => { setMessage(""); setUndo(undefined); }}
      action={undo && { label: "Undo", disabled: busy, onClick: () => { const target = undo; void run(() => restoreAgent(target.scope, target.file, project), `Restored ${target.file}.`, () => setSelected(target)); } }} />
    {error && <Alert variant="destructive"><CircleAlert aria-hidden="true" /><AlertTitle>Could not complete the change</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
    {!view ? !error && <div className="loading" aria-busy="true"><Spinner />Reading profiles…</div> : <Workbench open={open} onBack={() => { setSelected(undefined); setMode("view"); }} backLabel="All profiles" list={<>
      <section className="item-group" aria-label="Global profiles">
        <div className="list-header"><h2>Global</h2><span>{agents.filter(agent => agent.scope === "user").length}</span></div>
        {agents.some(agent => agent.scope === "user") ? list("user") : <Empty><EmptyDescription>No profiles yet.</EmptyDescription></Empty>}
      </section>
      {project && <section className="item-group" aria-label="This project's profiles">
        <div className="list-header"><h2>This project</h2><span>{agents.filter(agent => agent.scope === "project").length} in .pi/agents</span>
          <IconButton label="Add profile to project" disabled={busy} onClick={() => add("project")}><Plus aria-hidden="true" /></IconButton></div>
        {agents.some(agent => agent.scope === "project") ? list("project") : <Empty><EmptyDescription>No profiles in this project yet.</EmptyDescription></Empty>}
      </section>}
    </>} detail={mode !== "view" ? <AgentForm key={mode + addScope + (selected?.file ?? "")} agent={mode === "edit" ? current : undefined} busy={busy} error={formError}
        title={mode === "add" && addScope === "project" ? "Add profile to this project" : undefined}
        onCancel={() => setMode("view")}
        onSave={input => void run(() => mode === "add" ? addAgent(addScope, input, project) : editAgent(current!.scope, current!.file, current!.revision, input, project),
          `${input.name} saved. Applies to new T3Code threads, or after /reload.`,
          () => { setSelected(mode === "add" ? { scope: addScope, file: `${input.name}.md` } : { scope: current!.scope, file: current!.file }); setMode("view"); })} />
      : current ? <AgentDetail agent={current} busy={busy} onEdit={() => { setMode("edit"); setFormError(""); }}
          onRemove={() => { const target = { scope: current.scope, file: current.file }; void run(() => removeAgent(target.scope, target.file, current.revision, project), `Removed ${target.file}.`, () => setUndo(target)); }} />
      : <EmptyDetail icon={Bot} title="No profile selected">Choose a profile to read its tools, model and prompt, or add one.</EmptyDetail>} />}
  </>;
}
