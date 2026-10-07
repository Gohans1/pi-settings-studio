import { useEffect, useState } from "react";
import type { McpFileView, McpServerInput, McpServerView } from "../shared/mcp";
import type { CodemodeView } from "../shared/codemode";
import { addMcpServer, editMcpServer, loadCodemode, loadMcp, removeMcpServer, restoreMcp, saveCodemode, saveMcpServer, saveMcpSettings } from "./api";
import { CodemodePanel } from "./CodemodePanel";
import { McpServerForm } from "./McpServerForm";
import { Button } from "./components/ui/button";
import { Switch } from "./components/ui/switch";

// Not a valid server name, so it cannot collide with one.
const CODEMODE = "#codemode";

const exposureLabels: Record<string, [string, string]> = {
  codemode: ["Code mode", "Callable from codemode scripts; not declared to the model."],
  deferred: ["Tool search", "Declared once tool_search loads them."],
  direct: ["Direct", "Declared to the model like built-in tools: the most tokens."],
  hidden: ["Hidden", "Registered but unreachable."],
};

function shortState(server: McpServerView): string {
  if (server.error) return "refused";
  if (!server.enabled) return "off";
  return exposureLabels[server.exposure]?.[0] ?? server.exposure;
}

function signIn(server: McpServerView): string | undefined {
  if (server.transport !== "http") return undefined;
  if (server.authProvider) return `Sends the token of the Pi provider ${server.authProvider}.`;
  if (server.headers.some(name => name.toLowerCase() === "authorization")) return "Authorization header.";
  return "OAuth, when the server asks for it.";
}

function Names({ names }: { names: string[] }) {
  return <>{names.map(name => <code key={name} className="chip">{name}</code>)}<span className="muted"> values hidden</span></>;
}

function ServerDetail({ server, busy, onExposure, onEdit, onRemove }: {
  server: McpServerView; busy: boolean; onExposure: (exposure: string) => void; onEdit: () => void; onRemove: () => void;
}) {
  const rows: [string, React.ReactNode][] = [];
  if (server.description) rows.push(["Description", server.description]);
  if (server.transport) rows.push(["Transport", server.transport === "http" ? "Streamable HTTP" : "stdio"]);
  if (server.command) rows.push(["Command", <code>{[server.command, ...(server.args ?? [])].join(" ")}</code>]);
  if (server.cwd) rows.push(["Working directory", <code>{server.cwd}</code>]);
  if (server.url) rows.push(["URL", <code>{server.url}</code>]);
  if (server.env.length) rows.push(["Environment", <Names names={server.env} />]);
  if (server.headers.length) rows.push(["Headers", <Names names={server.headers} />]);
  const auth = signIn(server);
  if (auth) rows.push(["Sign-in", auth]);
  rows.push(["Tools", <>
    <select aria-label={`Tool exposure for ${server.name}`} value={server.exposure} disabled={busy || !!server.error} onChange={event => onExposure(event.target.value)}>
      {Object.entries(exposureLabels).map(([value, [label]]) => <option key={value} value={value}>{label}{value === "codemode" ? " (default)" : ""}</option>)}
    </select>
    <p className="muted">{exposureLabels[server.exposure]?.[1]}</p>
    {server.toolExposureRules > 0 && <p className="muted">{server.toolExposureRules} toolExposure rule(s) keep their own exposure.</p>}
  </>]);
  if (server.timeout) rows.push(["Timeout", `${server.timeout} s`]);
  return <section className="detail" aria-labelledby="server-title">
    <h2 id="server-title">{server.name}</h2>
    {server.error && <div className="error"><strong>Pi refuses this entry, so it never connects:</strong><p>{server.error}</p></div>}
    {!server.error && !server.enabled && <p className="notice">Turned off in the file, so it does not connect.</p>}
    <dl className="detail-list">{rows.map(([term, value]) => <div key={term}><dt>{term}</dt><dd>{value}</dd></div>)}</dl>
    <div className="actions detail-actions">
      <Button variant="outline" disabled={busy} onClick={onEdit} aria-label={`Edit ${server.name}`}>Edit</Button>
      <Button variant="destructive" disabled={busy} onClick={onRemove} aria-label={`Remove ${server.name}`}>Remove</Button>
    </div>
  </section>;
}

export function McpTab() {
  const [view, setView] = useState<McpFileView>();
  const [codemode, setCodemode] = useState<CodemodeView>();
  const [selected, setSelected] = useState<string>();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"view" | "add" | "edit">("view");
  const [formError, setFormError] = useState("");
  const [undo, setUndo] = useState(false);

  async function refresh() {
    setError("");
    try {
      const [mcp, code] = await Promise.all([loadMcp(), loadCodemode()]);
      setView(mcp); setCodemode(code);
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not read the MCP settings."); }
  }
  useEffect(() => { void refresh(); }, []);

  async function run(change: (revision: string) => Promise<McpFileView>, done: string, options: { undoable?: boolean } = {}) {
    if (!view) return;
    setBusy(true); setError(""); setMessage(""); setUndo(false);
    try {
      setView(await change(view.revision));
      setMessage(`${done} Applies to new T3Code threads, or after /reload.`);
      setUndo(!!options.undoable);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not change the server.");
      await refresh();
    } finally { setBusy(false); }
  }
  async function refreshCodemode() {
    try { setCodemode(await loadCodemode()); } catch { /* the MCP view still works */ }
  }
  async function runCodemode(patch: Parameters<typeof saveCodemode>[1], done: string) {
    if (!codemode) return;
    setBusy(true); setError(""); setMessage(""); setUndo(false);
    try {
      setCodemode(await saveCodemode(codemode.revision, patch));
      setMessage(`${done} Applies to new T3Code threads, or after /reload.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save Code mode.");
      await refreshCodemode();
    } finally { setBusy(false); }
  }
  const save = (name: string, patch: { enabled?: boolean; exposure?: string }, done: string) =>
    run(revision => saveMcpServer(name, revision, patch), done);
  async function submit(name: string, input: McpServerInput) {
    if (!view) return;
    setBusy(true); setFormError(""); setMessage(""); setUndo(false);
    try {
      setView(mode === "add" ? await addMcpServer(view.revision, name, input) : await editMcpServer(selected!, view.revision, input));
      setMessage(`${mode === "add" ? name : selected} ${mode === "add" ? "added" : "saved"}. Applies to new T3Code threads, or after /reload.`);
      if (mode === "add") setSelected(name);
      setMode("view");
    } catch (cause) {
      // Keep the draft next to the error; reload the view in case the file changed.
      setFormError(cause instanceof Error ? cause.message : "Could not save the server.");
      try {
      const [mcp, code] = await Promise.all([loadMcp(), loadCodemode()]);
      setView(mcp); setCodemode(code);
    } catch { /* the form error already explains */ }
    } finally { setBusy(false); }
  }

  const servers = view?.servers ?? [];
  const on = servers.filter(server => server.enabled && !server.error).length;
  const current = servers.find(server => server.name === selected);
  return <>
    <div className="page-heading"><div><h1>MCP</h1><p>Servers Pi connects to. Changes apply to new T3Code threads, or after /reload.</p></div></div>
    {view && <div className="scope-info"><code>{view.path}</code></div>}
    <div role="status" className="feedback">{message}{undo && view && <>{" "}<Button variant="outline" size="sm" disabled={busy}
      onClick={() => void run(restoreMcp, "Restored the previous mcp.json.")}>Undo</Button></>}</div>
    {error && <div role="alert" className="error"><strong>Could not complete the change</strong><p>{error}</p><Button variant="outline" onClick={() => void refresh()}>Try again</Button></div>}
    {view?.error && <div role="alert" className="error"><strong>Pi loads none of these servers</strong><p>{view.error}</p></div>}
    {!view ? !error && <div className="loading" aria-busy="true">Reading MCP settings…</div> : <div className="master-detail">
      <section className="master" aria-labelledby="global-servers">
        <ul className="item-list codemode-item"><li><button type="button" aria-pressed={selected === CODEMODE} onClick={() => { setSelected(CODEMODE); setMode("view"); }}>
          <span className="item-name">Code mode</span><span className="item-state">{codemode ? codemode.disabledByExtensions ? "off" : codemode.preference === "always" ? "always on" : "automatic" : ""}</span>
        </button></li></ul>
        <div className="list-header"><h2 id="global-servers">Global</h2><span>{on} of {servers.length} servers on</span></div>
        <Button variant="outline" size="sm" className="add-button" disabled={busy || !!view.error} onClick={() => { setMode("add"); setFormError(""); }}>Add server</Button>
        {servers.length ? <ul className="item-list">{servers.map(server => <li key={server.name}>
          <button type="button" aria-pressed={server.name === selected} onClick={() => { setSelected(server.name); setMode("view"); }}>
            <span className="item-name">{server.name}</span><span className="item-state" data-state={shortState(server)}>{shortState(server)}</span>
          </button>
          <Switch aria-label={`Enable ${server.name}`} checked={server.enabled} disabled={busy}
            onCheckedChange={enabled => void save(server.name, { enabled }, `${server.name} turned ${enabled ? "on" : "off"}.`)} />
        </li>)}</ul> : !view.error && <p className="empty">No MCP servers yet.</p>}
      </section>
      {mode !== "view" ? <McpServerForm key={mode + (selected ?? "")} server={mode === "edit" ? current : undefined} busy={busy} error={formError}
        onSave={(name, input) => void submit(name, input)} onCancel={() => setMode("view")} />
      : selected === CODEMODE && codemode ? <CodemodePanel key={codemode.revision} view={codemode} autoEnable={view.autoEnableCodemode ?? true} busy={busy}
        onChange={(patch, done) => void runCodemode(patch, done)}
        onAutoEnable={enabled => void run(revision => saveMcpSettings(revision, { autoEnableCodemode: enabled }),
          enabled ? "Code mode turns on automatically again." : "Code mode no longer turns on automatically.").then(refreshCodemode)} />
      : current ? <ServerDetail server={current} busy={busy}
        onExposure={exposure => void save(current.name, { exposure }, `${current.name} now uses ${exposureLabels[exposure]?.[0] ?? exposure}.`)}
        onEdit={() => { setMode("edit"); setFormError(""); }}
        onRemove={() => void run(revision => removeMcpServer(current.name, revision), `Removed ${current.name} from mcp.json.`, { undoable: true })} /> : <section className="detail"><p className="empty">Select a server to see its details.</p></section>}
    </div>}
  </>;
}
