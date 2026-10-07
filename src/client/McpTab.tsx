import { useEffect, useState } from "react";
import type { McpFileView, McpServerView } from "../shared/mcp";
import { loadMcp } from "./api";
import { Button } from "./components/ui/button";

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

function ServerDetail({ server }: { server: McpServerView }) {
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
  const [label, help] = exposureLabels[server.exposure] ?? [server.exposure, ""];
  rows.push(["Tools", <>{label}<span className="muted"> — {help}</span>{server.toolExposureRules > 0 && <p className="muted">{server.toolExposureRules} toolExposure rule(s) keep their own exposure.</p>}</>]);
  if (server.timeout) rows.push(["Timeout", `${server.timeout} s`]);
  return <section className="detail" aria-labelledby="server-title">
    <h2 id="server-title">{server.name}</h2>
    {server.error && <div className="error"><strong>Pi refuses this entry, so it never connects:</strong><p>{server.error}</p></div>}
    {!server.error && !server.enabled && <p className="notice">Turned off in the file, so it does not connect.</p>}
    <dl className="detail-list">{rows.map(([term, value]) => <div key={term}><dt>{term}</dt><dd>{value}</dd></div>)}</dl>
  </section>;
}

export function McpTab() {
  const [view, setView] = useState<McpFileView>();
  const [selected, setSelected] = useState<string>();
  const [error, setError] = useState("");

  async function refresh() {
    setError("");
    try { setView(await loadMcp()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not read the MCP settings."); }
  }
  useEffect(() => { void refresh(); }, []);

  const servers = view?.servers ?? [];
  const on = servers.filter(server => server.enabled && !server.error).length;
  const current = servers.find(server => server.name === selected);
  return <>
    <div className="page-heading"><div><h1>MCP</h1><p>Servers Pi connects to. Changes apply to new T3Code threads, or after /reload.</p></div></div>
    {view && <div className="scope-info"><code>{view.path}</code></div>}
    {error && <div role="alert" className="error"><strong>Could not read the MCP settings</strong><p>{error}</p><Button variant="outline" onClick={() => void refresh()}>Try again</Button></div>}
    {view?.error && <div role="alert" className="error"><strong>Pi loads none of these servers</strong><p>{view.error}</p></div>}
    {!view ? !error && <div className="loading" aria-busy="true">Reading MCP settings…</div> : <div className="master-detail">
      <section className="master" aria-labelledby="global-servers">
        <div className="list-header"><h2 id="global-servers">Global</h2><span>{on} of {servers.length} servers on</span></div>
        {servers.length ? <ul className="item-list">{servers.map(server => <li key={server.name}>
          <button type="button" aria-pressed={server.name === selected} onClick={() => setSelected(server.name)}>
            <span className="item-name">{server.name}</span><span className="item-state" data-state={shortState(server)}>{shortState(server)}</span>
          </button>
        </li>)}</ul> : !view.error && <p className="empty">No MCP servers yet.</p>}
      </section>
      {current ? <ServerDetail server={current} /> : <section className="detail"><p className="empty">Select a server to see its details.</p></section>}
    </div>}
  </>;
}
