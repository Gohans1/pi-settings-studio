import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { McpFileView, McpServerInput, McpServerView } from "../shared/mcp";
import type { CodemodeView } from "../shared/codemode";
import { addMcpServer, editMcpServer, loadCodemode, loadMcp, loadMcpLog, removeMcpServer, restoreMcp, saveCodemode, saveMcpServer, saveMcpSettings, type McpTarget, loadMcpRaw, saveMcpRaw } from "./api";
import { RawJsonEditor, SECRET_NOTE } from "./RawJsonEditor";
import { CodemodePanel } from "./CodemodePanel";
import { exposureLabels, McpServerForm } from "./McpServerForm";
import { McpImportPanel } from "./McpImportPanel";
import { JobPanel, useJob } from "./JobPanel";
import type { JobView } from "../shared/jobs";
import { Button } from "./components/ui/button";
import { Switch } from "./components/ui/switch";


function shortState(server: McpServerView): string {
  if (server.error) return "refused";
  if (!server.enabled) return "off";
  return exposureLabels[server.exposure]?.[0] ?? server.exposure;
}

function signIn(server: McpServerView): string | undefined {
  if (server.transport !== "http") return undefined;
  if (server.authProvider) return `Sends the token of the Pi provider ${server.authProvider}.`;
  if (server.headers.some(name => name.toLowerCase() === "authorization")) return "Authorization header.";
  const state = server.signedIn === undefined ? "" : server.signedIn ? " Signed in." : " Not signed in yet.";
  if (server.oauth?.clientId) return `OAuth with the registered client ${server.oauth.clientId}${server.oauth.hasClientSecret ? " (secret set)" : ""}.${state}`;
  if (server.oauth?.clientRegistration === "cimd") return `OAuth with Pi's client ID metadata document.${state}`;
  return `OAuth, when the server asks for it.${state}`;
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
    {Object.keys(server.toolExposure).length > 0 && <p className="muted">Own exposure: {Object.entries(server.toolExposure).map(([tool, exposure]) => `${tool} → ${exposureLabels[exposure]?.[0] ?? exposure}`).join(", ")}</p>}
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
  const [codemodeScope, setCodemodeScope] = useState<"global" | "project">("global");
  const codemodeProject = codemodeScope === "project" ? project : undefined;
  const [selected, setSelected] = useState<Selection>();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<{ mode: "add" | "edit" | "import"; scope: "global" | "project" }>();
  const [formError, setFormError] = useState("");
  const [undo, setUndo] = useState<McpTarget>();
  const target = (scope: "global" | "project"): McpTarget => ({ scope, project });
  // Running servers is explicit: `pi mcp list` connects every enabled server.
  const check = useJob();
  const [rawScope, setRawScope] = useState<"global" | "project">();
  const [log, setLog] = useState<{ path: string; exists: boolean; text: string }>();
  const showLog = () => { setSelected(undefined); setForm(undefined); loadMcpLog(project).then(setLog).catch(cause => setError(cause instanceof Error ? cause.message : "Could not read mcp.log.")); };
  const loadRaw = useCallback(() => loadMcpRaw(target(rawScope ?? "global")), [rawScope, project]);
  const saveRaw = useCallback((revision: string, text: string) => saveMcpRaw(target(rawScope ?? "global"), revision, text), [rawScope, project]);
  const signIn = useJob();

  async function refresh() {
    setError("");
    try {
      const [global, local, code] = await Promise.all([loadMcp(), project ? loadMcp(target("project")) : undefined, loadCodemode(codemodeProject)]);
      setViews({ global, project: local }); setCodemode(code);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not read the MCP settings."); }
  }
  useEffect(() => { setSelected(undefined); setForm(undefined); setRawScope(undefined); setLog(undefined); setCodemodeScope("global"); }, [project]);
  useEffect(() => { void refresh(); }, [project, codemodeProject]);

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
    try { setCodemode(await loadCodemode(codemodeProject)); } catch { /* the MCP view still works */ }
  }
  async function runCodemode(patch: Parameters<typeof saveCodemode>[1], done: string) {
    if (!codemode) return;
    setBusy(true); setError(""); setMessage(""); setUndo(undefined);
    try {
      setCodemode(await saveCodemode(codemode.revision, patch, codemodeProject));
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
  const choose = (next: Selection) => { setSelected(next); setForm(undefined); setLog(undefined); };

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
  if (log && !form && !selected) {
    detail = <section className="detail" aria-labelledby="log-title">
      <h2 id="log-title">mcp.log</h2>
      <p className="muted">Messages servers log while Pi runs, newest last; known secrets are hidden. <code>{log.path}</code></p>
      {log.exists ? <pre className="log-tail" tabIndex={0}>{log.text || "Empty."}</pre> : <p className="empty">No server has logged anything yet.</p>}
      <div className="actions detail-actions"><Button variant="outline" onClick={showLog}>Reload</Button><Button variant="outline" onClick={() => setLog(undefined)}>Close</Button></div>
    </section>;
  } else if (form?.mode === "import" && views[form.scope]) {
    const scope = form.scope;
    detail = <McpImportPanel key={scope} target={target(scope)} revision={views[scope]!.revision} onCancel={() => setForm(undefined)}
      onImported={(next, names) => {
        setViews(current => ({ ...current, [scope]: next }));
        setForm(undefined); setError(""); setUndo(target(scope));
        setMessage(`Imported ${names.join(", ")}. Applies to new T3Code threads, or after /reload.`);
      }} />;
  } else if (form) {
    detail = <McpServerForm key={form.mode + form.scope + (current?.name ?? "")} server={form.mode === "edit" ? current : undefined} busy={busy} error={formError} scope={form.scope}
      title={form.mode === "add" ? (form.scope === "project" ? "Add MCP server to this project" : "Add MCP server") : undefined}
      onSave={(name, input) => void submit(name, input)} onCancel={() => setForm(undefined)} />;
  } else if (selected === "codemode" && codemode && global) {
    const autoScope = codemode.scope === "project" ? "project" : "global";
    const where = autoScope === "project" ? " in this project" : "";
    detail = <CodemodePanel key={codemode.scope + codemode.revision} view={codemode} autoEnable={global.autoEnableCodemode ?? true} busy={busy}
      project={project} scope={codemodeScope} onScope={setCodemodeScope}
      onChange={(patch, done) => void runCodemode(patch, done)}
      onAutoEnable={enabled => void run(autoScope, revision => saveMcpSettings(revision, { autoEnableCodemode: enabled }, target(autoScope)),
        enabled === null ? "Automatic start follows the global choice in this project." : enabled ? `Code mode turns on automatically again${where}.` : `Code mode no longer turns on automatically${where}.`).then(refreshCodemode)} />;
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
    {rawScope ? <RawJsonEditor file="mcp.json" load={loadRaw} save={saveRaw}
      note={SECRET_NOTE}
      onClose={saved => { setRawScope(undefined); if (saved) { setMessage("Saved mcp.json. Applies to new T3Code threads, or after /reload."); void refresh(); } }} />
    : !global ? !error && <div className="loading" aria-busy="true">Reading MCP settings…</div> : <div className="master-detail">
      <div className="master">
        <ul className="item-list codemode-item"><li><button type="button" aria-pressed={selected === "codemode"} onClick={() => choose("codemode")}>
          <span className="item-name">Code mode</span><span className="item-state">{codemode ? codemode.disabledByExtensions ? "off" : (codemode.effective?.preference ?? codemode.preference) === "always" ? "always on" : "automatic" : ""}</span>
        </button></li></ul>
        <section aria-labelledby="global-servers" className="item-group">
          <div className="list-header"><h2 id="global-servers">Global</h2><span>{on} of {globalServers.length} servers on</span></div>
          <div className="actions add-button">
            <Button variant="outline" size="sm" disabled={busy || !!global.error} onClick={() => { setForm({ mode: "add", scope: "global" }); setFormError(""); }}>Add server</Button>
            <Button variant="outline" size="sm" disabled={busy || !!global.error} aria-label="Import servers into the global mcp.json" onClick={() => setForm({ mode: "import", scope: "global" })}>Import</Button>
            <Button variant="outline" size="sm" disabled={check.running} onClick={() => void check.start({ action: "mcp-test", ...(project ? { project } : {}) })}>Test connections</Button>
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => setRawScope("global")} aria-label="Edit global mcp.json as JSON">Edit JSON</Button>
            <Button variant="ghost" size="sm" onClick={showLog} aria-label="Show mcp.log">Log</Button>
          </div>
          {globalServers.length ? serverList("global", globalServers) : !global.error && <p className="empty">No MCP servers yet.</p>}
        </section>
        {project && local && <section aria-label="This project's servers" className="item-group">
          <div className="list-header"><h2>This project</h2><span>{projectServers.length} in .pi/mcp.json</span></div>
          <div className="actions add-button">
            <Button variant="outline" size="sm" disabled={busy || !!local.error} onClick={() => { setForm({ mode: "add", scope: "project" }); setFormError(""); }}>Add server to project</Button>
            <Button variant="outline" size="sm" disabled={busy || !!local.error} aria-label="Import servers into the project's mcp.json" onClick={() => setForm({ mode: "import", scope: "project" })}>Import</Button>
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => setRawScope("project")} aria-label="Edit the project's mcp.json as JSON">Edit JSON</Button>
          </div>
          {projectServers.length ? serverList("project", projectServers) : !local.error && <p className="empty">No servers in this project's .pi/mcp.json yet.</p>}
        </section>}
      </div>
      {detail}
    </div>}
  </>;
}
