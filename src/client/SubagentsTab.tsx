import { useEffect, useState, type FormEvent } from "react";
import type { AgentInput, AgentView, AgentsView } from "../shared/agents";
import { addAgent, editAgent, loadAgents, removeAgent, restoreAgent } from "./api";
import { Button } from "./components/ui/button";

function AgentForm({ agent, busy, error, onSave, onCancel }: {
  agent?: AgentView; busy: boolean; error: string; onSave: (input: AgentInput) => void; onCancel: () => void;
}) {
  const [name, setName] = useState(agent?.name ?? "");
  const [description, setDescription] = useState(agent?.description ?? "");
  const [tools, setTools] = useState((agent?.tools ?? []).join(", "));
  const [model, setModel] = useState(agent?.model ?? "");
  const [prompt, setPrompt] = useState(agent?.prompt ?? "");
  const title = agent ? `Edit ${agent.name ?? agent.file}` : "Add profile";
  function submit(event: FormEvent) {
    event.preventDefault();
    onSave({ name: name.trim(), description: description.trim(), tools: tools.split(",").map(tool => tool.trim()).filter(Boolean),
      ...(model.trim() ? { model: model.trim() } : {}), prompt });
  }
  return <form className="detail server-form" aria-label={title} onSubmit={submit}>
    <h2>{title}</h2>
    {error && <div role="alert" className="error"><strong>Not saved</strong><p>{error}</p></div>}
    <label>Name<input value={name} required pattern="[A-Za-z0-9][A-Za-z0-9_.\-]*" title="Letters, digits, ., _ and -" autoComplete="off" spellCheck={false} onChange={e => setName(e.target.value)} />
      {!agent && <span className="muted">Saved as {name.trim() || "name"}.md</span>}</label>
    <label>Description<input value={description} required placeholder="When to use this agent, in a sentence" onChange={e => setDescription(e.target.value)} /></label>
    <label>Tools<input value={tools} placeholder="read, grep, find, ls" autoComplete="off" spellCheck={false} onChange={e => setTools(e.target.value)} />
      <span className="muted">Comma-separated. Empty means the extension's default tools.</span></label>
    <label>Model<input value={model} placeholder="Default model" autoComplete="off" spellCheck={false} onChange={e => setModel(e.target.value)} /></label>
    <label>System prompt<textarea rows={12} value={prompt} onChange={e => setPrompt(e.target.value)} /></label>
    {agent && agent.extraKeys.length > 0 && <p className="muted">Kept as they are: {agent.extraKeys.join(", ")}.</p>}
    <div className="actions"><Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save profile"}</Button>
      <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>Cancel</Button></div>
  </form>;
}

function AgentDetail({ agent, busy, onEdit, onRemove }: { agent: AgentView; busy: boolean; onEdit: () => void; onRemove: () => void }) {
  const title = agent.name ?? agent.file;
  return <section className="detail" aria-labelledby="agent-title">
    <h2 id="agent-title">{title}</h2>
    {agent.error && <div className="error"><strong>Not loaded</strong><p>{agent.error}</p></div>}
    <dl className="detail-list">
      {agent.description && <div><dt>Description</dt><dd>{agent.description}</dd></div>}
      <div><dt>Tools</dt><dd>{agent.tools?.join(", ") ?? <span className="muted">Extension default</span>}</dd></div>
      <div><dt>Model</dt><dd>{agent.model ?? <span className="muted">Default model</span>}</dd></div>
      {agent.extraKeys.length > 0 && <div><dt>Other keys</dt><dd>{agent.extraKeys.map(key => <code key={key} className="chip">{key}</code>)}<span className="muted"> kept as they are</span></dd></div>}
      <div><dt>File</dt><dd><code>{agent.file}</code></dd></div>
    </dl>
    <details className="prompt-preview"><summary>System prompt</summary><pre>{agent.prompt || "(empty)"}</pre></details>
    <div className="actions detail-actions">
      <Button variant="outline" disabled={busy} onClick={onEdit} aria-label={`Edit ${title}`}>Edit</Button>
      <Button variant="destructive" disabled={busy} onClick={onRemove} aria-label={`Remove ${title}`}>Remove</Button>
    </div>
  </section>;
}

export function SubagentsTab() {
  const [view, setView] = useState<AgentsView>();
  const [selected, setSelected] = useState<string>();
  const [mode, setMode] = useState<"view" | "add" | "edit">("view");
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [message, setMessage] = useState("");
  const [undo, setUndo] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setError("");
    try { setView(await loadAgents()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not read the profiles."); }
  }
  useEffect(() => { void refresh(); }, []);

  async function run(change: () => Promise<AgentsView>, done: string, after?: () => void) {
    setBusy(true); setError(""); setFormError(""); setMessage(""); setUndo(undefined);
    try { setView(await change()); setMessage(done); after?.(); }
    catch (cause) {
      const text = cause instanceof Error ? cause.message : "Could not save.";
      if (mode === "view") { setError(text); await refresh(); } else setFormError(text);
    } finally { setBusy(false); }
  }

  const agents = view?.agents ?? [];
  const current = agents.find(agent => agent.file === selected);
  return <>
    <div className="page-heading"><div><h1>Sub-agents</h1><p>Profiles in the format of Pi's example subagent extension, in <code>{view?.dir ?? "~/.pi/agent/agents"}</code>.</p></div></div>
    {view && !view.readerInstalled && <p className="notice">No installed extension reads these profiles yet. Pi has no built-in sub-agents: install Pi's example subagent extension (or another that reads this folder) for them to take effect. T3Code's own sub-agents are separate.</p>}
    <div role="status" className="feedback">{message}{undo && <>{" "}<Button variant="outline" size="sm" disabled={busy}
      onClick={() => { const file = undo; void run(() => restoreAgent(file), `Restored ${file}.`, () => setSelected(file)); }}>Undo</Button></>}</div>
    {error && <div role="alert" className="error"><strong>Could not complete the change</strong><p>{error}</p></div>}
    {!view ? !error && <div className="loading" aria-busy="true">Reading profiles…</div> : <div className="master-detail">
      <section className="master" aria-label="Profiles">
        <Button variant="outline" size="sm" disabled={busy} onClick={() => { setMode("add"); setFormError(""); }}>Add profile</Button>
        {agents.length ? <ul className="item-list">{agents.map(agent => <li key={agent.file}>
          <button type="button" aria-pressed={agent.file === selected} onClick={() => { setSelected(agent.file); setMode("view"); }}>
            <span className="item-name">{agent.name ?? agent.file}</span>
            <span className="item-state" data-state={agent.error ? "refused" : undefined}>{agent.error ? "skipped" : agent.model ?? ""}</span>
          </button>
        </li>)}</ul> : <p className="empty">No profiles yet.</p>}
      </section>
      {mode !== "view" ? <AgentForm key={mode + (selected ?? "")} agent={mode === "edit" ? current : undefined} busy={busy} error={formError}
        onCancel={() => setMode("view")}
        onSave={input => void run(() => mode === "add" ? addAgent(input) : editAgent(current!.file, current!.revision, input),
          `${input.name} saved. Applies to new T3Code threads, or after /reload.`,
          () => { setSelected(mode === "add" ? `${input.name}.md` : current!.file); setMode("view"); })} />
      : current ? <AgentDetail agent={current} busy={busy} onEdit={() => { setMode("edit"); setFormError(""); }}
          onRemove={() => { const file = current.file; void run(() => removeAgent(file, current.revision), `Removed ${file}.`, () => setUndo(file)); }} />
      : <section className="detail"><p className="empty">Select a profile to see it.</p></section>}
    </div>}
  </>;
}
