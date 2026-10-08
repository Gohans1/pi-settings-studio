import { useId, useState, type FormEvent } from "react";
import { CircleAlert } from "lucide-react";
import type { McpFileView, McpImportPreview, McpServerView } from "../shared/mcp";
import { importMcp, previewMcpImport, type McpTarget } from "./api";
import { Alert, AlertDescription, AlertTitle } from "./components/ui/alert";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "./components/ui/card";
import { Checkbox } from "./components/ui/checkbox";
import { Field, FieldDescription, FieldLabel } from "./components/ui/field";
import { Textarea } from "./components/ui/textarea";

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
  const id = useId();
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
    <Field><FieldLabel htmlFor={id}>Pasted configuration</FieldLabel>
      <Textarea id={id} className="field-sizing-fixed font-mono" rows={10} spellCheck={false} value={text} autoComplete="off" aria-describedby={id + "-hint"}
        placeholder={'{ "mcpServers": { … } }  or  [mcp_servers.name] …'} onChange={event => { setText(event.target.value); setPreview(undefined); }} />
      <FieldDescription id={id + "-hint"}>A whole file or its servers part, from Claude Desktop, Claude Code, Cursor, VS Code, OpenCode (JSON) or Codex (TOML). Nothing is saved until you import.</FieldDescription></Field>
    {error && <Alert variant="destructive"><CircleAlert aria-hidden="true" /><AlertTitle>Not imported</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
    {preview && <section aria-label="Preview" className="import-preview">
      <p>Read as {preview.format}. {preview.servers.length} server{preview.servers.length === 1 ? "" : "s"} found.</p>
      {preview.notes.length > 0 && <ul className="notes">{preview.notes.map(note => <li key={note}>{note}</li>)}</ul>}
      <ul className="import-list">{preview.servers.map(({ server, exists }) => <li key={server.name}><Card size="sm">
        <CardHeader>
          <Field orientation="horizontal"><Checkbox id={`${id}-${server.name}`} checked={chosen.has(server.name)} disabled={!!server.error}
            onCheckedChange={checked => toggle(server.name, checked)} /><FieldLabel htmlFor={`${id}-${server.name}`}>{server.name}</FieldLabel></Field>
          <CardDescription><code>{summary(server)}</code>
            {server.env.length > 0 && <><br />Environment: {server.env.join(", ")}</>}
            {server.headers.length > 0 && <><br />Headers: {server.headers.join(", ")}</>}</CardDescription>
        </CardHeader>
        {(exists || server.error) && <CardContent>{server.error
          ? <Alert role="note" variant="destructive"><AlertDescription>Pi refuses it: {server.error}</AlertDescription></Alert>
          : <Alert role="note"><AlertDescription>Replaces the server of the same name in this file.</AlertDescription></Alert>}</CardContent>}
      </Card></li>)}</ul>
    </section>}
    <div className="form-actions">
      {preview ? <Button type="submit" disabled={busy || !chosen.size}>Import {chosen.size} server{chosen.size === 1 ? "" : "s"}</Button>
        : <Button type="button" disabled={busy || !text.trim()} onClick={() => void check()}>Preview</Button>}
      <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>Cancel</Button>
    </div>
  </form>;
}
