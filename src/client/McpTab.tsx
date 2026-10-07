import { useEffect, useState, type ReactNode } from "react";
import type { McpFileView, McpServerInput, McpServerView } from "../shared/mcp";
import type { CodemodeView } from "../shared/codemode";
import { addMcpServer, editMcpServer, loadCodemode, loadMcp, removeMcpServer, restoreMcp, saveCodemode, saveMcpServer, saveMcpSettings, type McpTarget } from "./api";
import { CodemodePanel } from "./CodemodePanel";
import { McpServerForm } from "./McpServerForm";
import { JobPanel, useJob } from "./JobPanel";
import type { JobView } from "../shared/jobs";
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

function ServerDetail({ server, busy, onExposure, actions, children }: {
  server: McpServerView; busy: boolean; onExposure?: (exposure: string) => void; actions?: ReactNode; children?: ReactNode;
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
    <select aria-label={`Tool exposure for ${server.name}`} value={server.exposure} disabled={busy || !!server.error || !onExposure} onChange={event => onExposure?.(event.target.value)}>
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
    {children}
    <dl className="detail-list">{rows.map(([term, value]) => <div key={term}><dt>{term}</dt><dd>{value}</dd></div>)}</dl>
    {actions && <div className="actions detail-actions">{actions}</div>}
  </section>;
}

function TestResults({ job }: { job: JobView }) {
  if (!job.result) return null;
  return <ul className="job-results">{job.result.servers.map(server => <li key={server.name}>
    <strong>{server.name}</strong>
    <span>{server.state}{server.state === "connected" ? ` · ${server.tools.length} tool${server.tools.length === 1 ? "" : "s"}` : ""}</span>
    {server.error && <span className="muted">{server.error}</span>}
  </li>)}{job.result.errors.map(error => <li key={error} className="field-error">{error}</li>)}</ul>;
}

type Selection = { scope: "global" | "project"; name: string } | "codemode";

export function McpTab({ project }: { project?: string }) {
  const [views, setViews] = useState<{ global?: McpFileView; project?: McpFileView }>({});
  const [codemode, setCodemode] = useState<CodemodeView>();
  const [selected, setSelected] = useState<Selection>();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<{ mode: "add" | "edit"; scope: "global" | "project" }>();
  const [formError, setFormError] = useState("");
  const [undo, setUndo] = useState<McpTarget>();
  const target = (scope: "global" | "project"): McpTarget => ({ scope, project });
  // Running servers is explicit: `pi mcp list` connects every enabled server.
  const check = useJob();
  const signIn = useJob();

  async function refresh() {
    setError("");
    try {
      const [global, local, code] = await Promise.all([loadMcp(), project ? loadMcp(target("project")) : undefined, loadCodemode()]);
      setViews({ global, project: local }); setCodemode(code);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not read the MCP settings."); }
  }
  useEffect(() => { setSelected(undefined); setForm(undefined); void refresh(); }, [project]);

  async function run(scope: "global" | "project", change: (revision: string) => Promise<McpFileView>, done: string, options: { undoable?: boolean } = {}) {
    const view = views[scope];
    if (!view) return;
    setBusy(true); setError(""); setMessage(""); setUndo(undefined);
    try {
      const next = await change(view.revision);
      setViews(current => ({ ...current, [scope]: next }));
      setMessage(`${done} Applies to new T3Code threads, or after /reload.`);
      if (options.undoable) setUndo(target(scope));
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
    setBusy(true); setError(""); setMessage(""); setUndo(undefined);
    try {
      setCodemode(await saveCodemode(codemode.revision, patch));
      setMessage(`${done} Applies to new T3Code threads, or after /reload.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save Code mode.");
      await refreshCodemode();
    } finally { setBusy(false); }
  }
  async function submit(name: string, input: McpServerInput) {
    if (!form || selected === "codemode") return;
    const view = views[form.scope];
    if (!view) return;
    setBusy(true); setFormError(""); setMessage(""); setUndo(undefined);
    try {
      const next = form.mode === "add" ? await addMcpServer(target(form.scope), view.revision, name, input)
        : await editMcpServer(target(form.scope), selected!.name, view.revision, input);
      setViews(current => ({ ...current, [form.scope]: next }));
      const shown = form.mode === "add" ? name : selected!.name;
      setMessage(`${shown} ${form.mode === "add" ? "added" : "saved"}. Applies to new T3Code threads, or after /reload.`);
      setSelected({ scope: form.scope, name: shown });
      setForm(undefined);
    } catch (cause) {
      // Keep the draft next to the error; reload in case the file changed.
      setFormError(cause instanceof Error ? cause.message : "Could not save the server.");
      try { const next = await loadMcp(target(form.scope)); setViews(current => ({ ...current, [form.scope]: next })); } catch { /* the form error explains */ }
    } finally { setBusy(false); }
  }

  const global = views.global, local = views.project;
  const globalServers = global?.servers ?? [];
  const projectServers = local?.servers ?? [];
  const inProject = (name: string) => projectServers.find(server => server.name === name);
  const current = selected && selected !== "codemode" ? (views[selected.scope]?.servers ?? []).find(server => server.name === selected.name) : undefined;
  const isSelected = (scope: "global" | "project", name: string) => selected !== "codemode" && selected?.scope === scope && selected.name === name;
  const choose = (next: Selection) => { setSelected(next); setForm(undefined); };

  /** The global server's state in the chosen project: an override switch, or a replacement note. */
  function projectControls(name: string) {
    if (!project || !local || local.error) return undefined;
    const entry = inProject(name);
    const globalEntry = globalServers.find(server => server.name === name);
    if (entry && !entry.override) return <p className="notice">This project's .pi/mcp.json defines its own "{name}" server, which replaces the global one there.</p>;
    const enabled = entry ? entry.enabled : !!globalEntry?.enabled;
    return <fieldset className="in-project" aria-label="In this project"><legend>In this project</legend>
      <div className="switch-row"><Switch aria-label={`Enable ${name} in this project`} checked={enabled} disabled={busy || !globalEntry}
        onCheckedChange={on => void run("project", revision => saveMcpServer(target("project"), name, revision, { enabled: on }), `${name} turned ${on ? "on" : "off"} in this project.`)} />
        <span>{entry ? `${enabled ? "On" : "Off"} here (override in .pi/mcp.json)` : "Same as global"}</span></div>
      {entry && <Button variant="outline" size="sm" disabled={busy}
        onClick={() => void run("project", revision => removeMcpServer(target("project"), name, revision), `${name} follows the global setting again in this project.`)}>Use the global setting</Button>}
    </fieldset>;
  }

  function serverList(scope: "global" | "project", list: McpServerView[]) {
    return <ul className="item-list">{list.map(server => {
      const local = scope === "global" ? inProject(server.name) : undefined;
      const state = scope === "project" && server.override ? `override, ${server.enabled ? "on" : "off"}`
        : local ? (local.override ? `${shortState(server)}, ${local.enabled ? "on" : "off"} here` : `${shortState(server)}, replaced here`) : shortState(server);
      return <li key={server.name}>
        <button type="button" aria-pressed={isSelected(scope, server.name)} onClick={() => choose({ scope, name: server.name })}>
          <span className="item-name">{server.name}</span><span className="item-state" data-state={shortState(server)}>{state}</span>
        </button>
        <Switch aria-label={scope === "global" ? `Enable ${server.name}` : `Enable ${server.name} in this project`} checked={server.enabled} disabled={busy}
          onCheckedChange={enabled => void run(scope, revision => saveMcpServer(target(scope), server.name, revision, { enabled }),
            `${server.name} turned ${enabled ? "on" : "off"}${scope === "project" ? " in this project" : ""}.`)} />
      </li>;
    })}</ul>;
  }

  let detail: ReactNode = <section className="detail"><p className="empty">Select a server to see its details.</p></section>;
  if (form) {
    detail = <McpServerForm key={form.mode + form.scope + (current?.name ?? "")} server={form.mode === "edit" ? current : undefined} busy={busy} error={formError}
      title={form.mode === "add" ? (form.scope === "project" ? "Add MCP server to this project" : "Add MCP server") : undefined}
      onSave={(name, input) => void submit(name, input)} onCancel={() => setForm(undefined)} />;
  } else if (selected === "codemode" && codemode && global) {
    detail = <CodemodePanel key={codemode.revision} view={codemode} autoEnable={global.autoEnableCodemode ?? true} busy={busy}
      onChange={(patch, done) => void runCodemode(patch, done)}
      onAutoEnable={enabled => void run("global", revision => saveMcpSettings(revision, { autoEnableCodemode: enabled }),
        enabled ? "Code mode turns on automatically again." : "Code mode no longer turns on automatically.").then(refreshCodemode)} />;
  } else if (current && selected && selected !== "codemode") {
    const scope = selected.scope;
    const label = scope === "project" ? "the project's .pi/mcp.json" : "mcp.json";
    detail = current.override
      ? <ServerDetail server={current} busy={busy}>{projectControls(current.name)}<p className="muted">Other settings come from the global server.</p></ServerDetail>
      : <ServerDetail server={current} busy={busy}
        onExposure={exposure => void run(scope, revision => saveMcpServer(target(scope), current.name, revision, { exposure }), `${current.name} now uses ${exposureLabels[exposure]?.[0] ?? exposure}.`)}
        actions={<>
          {current.transport === "http" && !current.authProvider && !current.headers.some(name => name.toLowerCase() === "authorization") && <>
            <Button variant="outline" disabled={busy || signIn.running} onClick={() => void signIn.start({ action: "mcp-login", server: current.name, ...(scope === "project" ? { project } : {}) })}>Sign in</Button>
            <Button variant="ghost" disabled={busy || signIn.running} onClick={() => void signIn.start({ action: "mcp-logout", server: current.name, ...(scope === "project" ? { project } : {}) })}>Sign out</Button>
          </>}
          <Button variant="outline" disabled={busy} onClick={() => { setForm({ mode: "edit", scope }); setFormError(""); }} aria-label={`Edit ${current.name}`}>Edit</Button>
          <Button variant="destructive" disabled={busy} aria-label={`Remove ${current.name}`}
            onClick={() => void run(scope, revision => removeMcpServer(target(scope), current.name, revision), `Removed ${current.name} from ${label}.`, { undoable: true })}>Remove</Button>
        </>}>{scope === "global" ? projectControls(current.name) : undefined}
          <JobPanel job={signIn.job} error={signIn.error} onAnswer={value => void signIn.answer(value)} onCancel={() => void signIn.cancel()} onDismiss={signIn.dismiss} />
        </ServerDetail>;
  }

  const on = globalServers.filter(server => server.enabled && !server.error).length;
  return <>
    <div className="page-heading"><div><h1>MCP</h1><p>Servers Pi connects to. Changes apply to new T3Code threads, or after /reload.</p></div></div>
    {global && <div className="scope-info"><code>{global.path}</code>{local && <><br /><code>{local.path}</code></>}</div>}
    <div role="status" className="feedback">{message}{undo && <>{" "}<Button variant="outline" size="sm" disabled={busy}
      onClick={() => { const scope = undo.scope; void run(scope, revision => restoreMcp(target(scope), revision), "Restored the previous file."); }}>Undo</Button></>}</div>
    {error && <div role="alert" className="error"><strong>Could not complete the change</strong><p>{error}</p><Button variant="outline" onClick={() => void refresh()}>Try again</Button></div>}
    {global?.error && <div role="alert" className="error"><strong>Pi loads none of the global servers</strong><p>{global.error}</p></div>}
    {local?.error && <div role="alert" className="error"><strong>Pi loads none of this project's servers</strong><p>{local.error}</p></div>}
    <JobPanel job={check.job} error={check.error} onAnswer={value => void check.answer(value)} onCancel={() => void check.cancel()} onDismiss={check.dismiss}>
      {check.job && <TestResults job={check.job} />}
    </JobPanel>
    {!global ? !error && <div className="loading" aria-busy="true">Reading MCP settings…</div> : <div className="master-detail">
      <div className="master">
        <ul className="item-list codemode-item"><li><button type="button" aria-pressed={selected === "codemode"} onClick={() => choose("codemode")}>
          <span className="item-name">Code mode</span><span className="item-state">{codemode ? codemode.disabledByExtensions ? "off" : codemode.preference === "always" ? "always on" : "automatic" : ""}</span>
        </button></li></ul>
        <section aria-labelledby="global-servers" className="item-group">
          <div className="list-header"><h2 id="global-servers">Global</h2><span>{on} of {globalServers.length} servers on</span></div>
          <div className="actions add-button">
            <Button variant="outline" size="sm" disabled={busy || !!global.error} onClick={() => { setForm({ mode: "add", scope: "global" }); setFormError(""); }}>Add server</Button>
            <Button variant="outline" size="sm" disabled={check.running} onClick={() => void check.start({ action: "mcp-test", ...(project ? { project } : {}) })}>Test connections</Button>
          </div>
          {globalServers.length ? serverList("global", globalServers) : !global.error && <p className="empty">No MCP servers yet.</p>}
        </section>
        {project && local && <section aria-label="This project's servers" className="item-group">
          <div className="list-header"><h2>This project</h2><span>{projectServers.length} in .pi/mcp.json</span></div>
          <Button variant="outline" size="sm" className="add-button" disabled={busy || !!local.error} onClick={() => { setForm({ mode: "add", scope: "project" }); setFormError(""); }}>Add server to project</Button>
          {projectServers.length ? serverList("project", projectServers) : !local.error && <p className="empty">No servers in this project's .pi/mcp.json yet.</p>}
        </section>}
      </div>
      {detail}
    </div>}
  </>;
}
