import { useState, type FormEvent } from "react";
import type { McpFileView, McpImportPreview, McpServerView } from "../shared/mcp";
import { importMcp, previewMcpImport, type McpTarget } from "./api";
import { Button } from "./components/ui/button";

const summary = (server: McpServerView) => server.url ?? [server.command, ...(server.args ?? [])].filter(Boolean).join(" ");

/** Paste servers from Claude, Cursor, VS Code, OpenCode or Codex; preview Pi's verdict, then import the chosen ones. */
export function McpImportPanel({ target, revision, onImported, onCancel }: {
  target: McpTarget; revision: string; onImported: (view: McpFileView, names: string[]) => void; onCancel: () => void;
}) {
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<McpImportPreview>();
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function check() {
    setBusy(true); setError("");
    try {
      const next = await previewMcpImport(target, text);
      setPreview(next);
      setChosen(new Set(next.servers.filter(entry => !entry.exists && !entry.server.error).map(entry => entry.server.name)));
    } catch (cause) { setPreview(undefined); setError(cause instanceof Error ? cause.message : "Could not read the configuration."); }
    finally { setBusy(false); }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    const names = [...chosen];
    setBusy(true); setError("");
    try { onImported(await importMcp(target, revision, text, names), names); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not import the servers."); }
    finally { setBusy(false); }
  }
  const toggle = (name: string, on: boolean) => setChosen(current => { const next = new Set(current); if (on) next.add(name); else next.delete(name); return next; });
  return <form className="detail server-form" aria-label="Import MCP servers" onSubmit={submit}>
    <h2>Import MCP servers{target.scope === "project" ? " to this project" : ""}</h2>
    <label>Pasted configuration<textarea className="import-source" rows={10} spellCheck={false} value={text} autoComplete="off"
      placeholder={'{ "mcpServers": { … } }  or  [mcp_servers.name] …'} onChange={event => { setText(event.target.value); setPreview(undefined); }} />
      <span className="muted">A whole file or its servers part, from Claude Desktop, Claude Code, Cursor, VS Code, OpenCode (JSON) or Codex (TOML). Nothing is saved until you import.</span></label>
    {error && <div role="alert" className="error"><strong>Not imported</strong><p>{error}</p></div>}
    {preview && <section aria-label="Preview" className="import-preview">
      <p>Read as {preview.format}. {preview.servers.length} server{preview.servers.length === 1 ? "" : "s"} found.</p>
      {preview.notes.length > 0 && <ul className="notes">{preview.notes.map(note => <li key={note}>{note}</li>)}</ul>}
      <ul className="import-list">{preview.servers.map(({ server, exists }) => <li key={server.name}>
        <label className="check"><input type="checkbox" aria-label={`Import ${server.name}`} checked={chosen.has(server.name)} disabled={!!server.error}
          onChange={event => toggle(server.name, event.target.checked)} /><strong>{server.name}</strong></label>
        <code>{summary(server)}</code>
        {server.env.length > 0 && <span className="muted">Environment: {server.env.join(", ")}</span>}
        {server.headers.length > 0 && <span className="muted">Headers: {server.headers.join(", ")}</span>}
        {exists && !server.error && <span className="notice">Replaces the server of the same name in this file.</span>}
        {server.error && <span className="field-error">Pi refuses it: {server.error}</span>}
      </li>)}</ul>
    </section>}
    <div className="form-actions">
      {preview ? <Button type="submit" disabled={busy || !chosen.size}>Import {chosen.size} server{chosen.size === 1 ? "" : "s"}</Button>
        : <Button type="button" disabled={busy || !text.trim()} onClick={() => void check()}>Preview</Button>}
      <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>Cancel</Button>
    </div>
  </form>;
}
