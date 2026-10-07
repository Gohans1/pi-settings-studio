import { useState, type FormEvent } from "react";
import { X } from "lucide-react";
import type { McpServerInput, McpServerView } from "../shared/mcp";
import { Button } from "./components/ui/button";

type Row = { name: string; value: string; stored: boolean };
type Draft = {
  name: string; transport: "stdio" | "http"; command: string; args: string; cwd: string; env: Row[];
  url: string; headers: Row[]; description: string; timeout: string;
};

function draftFrom(server?: McpServerView): Draft {
  const rows = (names: string[] = []) => names.map(name => ({ name, value: "", stored: true }));
  return {
    name: server?.name ?? "", transport: server?.transport ?? "stdio",
    command: server?.command ?? "", args: (server?.args ?? []).join("\n"), cwd: server?.cwd ?? "", env: rows(server?.env),
    url: server?.url ?? "", headers: rows(server?.headers),
    description: server?.description ?? "", timeout: server?.timeout ? String(server.timeout) : "",
  };
}

function toInput(draft: Draft): McpServerInput {
  const named = (rows: Row[]) => rows.filter(row => row.name.trim()).map(row => ({ name: row.name.trim(), ...(row.value ? { value: row.value } : {}) }));
  const common = {
    ...(draft.description.trim() ? { description: draft.description.trim() } : {}),
    ...(draft.timeout ? { timeout: Number(draft.timeout) } : {}),
  };
  if (draft.transport === "http") return { transport: "http", url: draft.url.trim(), headers: named(draft.headers), ...common };
  const args = draft.args.split("\n").map(arg => arg.trim()).filter(Boolean);
  return { transport: "stdio", command: draft.command.trim(), args, ...(draft.cwd.trim() ? { cwd: draft.cwd.trim() } : {}), env: named(draft.env), ...common };
}

function NamedRows({ kind, rows, onChange }: { kind: "variable" | "header"; rows: Row[]; onChange: (rows: Row[]) => void }) {
  const Kind = kind === "variable" ? "Variable" : "Header";
  const update = (index: number, patch: Partial<Row>) => onChange(rows.map((row, i) => i === index ? { ...row, ...patch } : row));
  return <div className="named-rows">
    {rows.map((row, index) => <div className="named-row" key={index}>
      <input aria-label={`${Kind} name ${index + 1}`} value={row.name} placeholder="NAME" autoComplete="off" spellCheck={false}
        onChange={event => update(index, { name: event.target.value })} />
      <input aria-label={`Value of ${kind} ${index + 1}`} type="password" value={row.value} autoComplete="new-password"
        placeholder={row.stored ? "Hidden. Leave empty to keep." : "Value"} onChange={event => update(index, { value: event.target.value })} />
      <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${kind} ${row.name || index + 1}`}
        onClick={() => onChange(rows.filter((_, i) => i !== index))}><X aria-hidden="true" /></Button>
    </div>)}
    <Button type="button" variant="outline" size="sm" onClick={() => onChange([...rows, { name: "", value: "", stored: false }])}>Add {kind}</Button>
    <p className="muted">Values can use <code>{"${NAME}"}</code> or <code>!command</code>. Saved values are never shown here.</p>
  </div>;
}

export function McpServerForm({ server, busy, error, onSave, onCancel }: {
  server?: McpServerView; busy: boolean; error: string;
  onSave: (name: string, input: McpServerInput) => void; onCancel: () => void;
}) {
  const [draft, setDraft] = useState(() => draftFrom(server));
  const set = (patch: Partial<Draft>) => setDraft(current => ({ ...current, ...patch }));
  const title = server ? `Edit ${server.name}` : "Add MCP server";
  function submit(event: FormEvent) {
    event.preventDefault();
    onSave(draft.name.trim(), toInput(draft));
  }
  return <form className="detail server-form" aria-label={title} onSubmit={submit}>
    <h2>{title}</h2>
    {error && <div role="alert" className="error"><strong>Not saved</strong><p>{error}</p></div>}
    {!server && <label>Name<input value={draft.name} required pattern="[A-Za-z0-9_-]+" title="Letters, digits, _ and -" autoComplete="off" spellCheck={false}
      onChange={event => set({ name: event.target.value })} /></label>}
    <label>Transport<select value={draft.transport} onChange={event => set({ transport: event.target.value as Draft["transport"] })}>
      <option value="stdio">Command (stdio)</option><option value="http">URL (streamable HTTP)</option>
    </select></label>
    {draft.transport === "stdio" ? <>
      <label>Command<input value={draft.command} required placeholder="npx" autoComplete="off" spellCheck={false} onChange={event => set({ command: event.target.value })} /></label>
      <label>Arguments<textarea rows={3} value={draft.args} placeholder={"-y\n@modelcontextprotocol/server-filesystem"} spellCheck={false} onChange={event => set({ args: event.target.value })} />
        <span className="muted">One argument per line. Not a shell command.</span></label>
      <label>Working directory<input value={draft.cwd} placeholder="Session directory" autoComplete="off" spellCheck={false} onChange={event => set({ cwd: event.target.value })} /></label>
      <fieldset><legend>Environment</legend><NamedRows kind="variable" rows={draft.env} onChange={env => set({ env })} /></fieldset>
    </> : <>
      <label>URL<input value={draft.url} required type="text" placeholder="https://example.com/mcp" autoComplete="off" spellCheck={false} onChange={event => set({ url: event.target.value })} /></label>
      <fieldset><legend>Headers</legend><NamedRows kind="header" rows={draft.headers} onChange={headers => set({ headers })} /></fieldset>
    </>}
    <label>Description<input value={draft.description} placeholder="What the server offers, in a sentence" onChange={event => set({ description: event.target.value })} /></label>
    <label>Timeout (seconds)<input type="number" min={1} step="any" value={draft.timeout} placeholder="60" onChange={event => set({ timeout: event.target.value })} /></label>
    <div className="actions"><Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save server"}</Button>
      <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>Cancel</Button></div>
  </form>;
}
