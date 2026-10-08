import { useEffect, useState, type FormEvent } from "react";
import { X } from "lucide-react";
import type { McpExposure, McpServerInput, McpServerView } from "../shared/mcp";
import { loadProviders } from "./api";
import { Button } from "./components/ui/button";

export const exposureLabels: Record<string, [string, string]> = {
  codemode: ["Code mode", "Callable from codemode scripts; not declared to the model."],
  deferred: ["Tool search", "Declared once tool_search loads them."],
  direct: ["Direct", "Declared to the model like built-in tools: the most tokens."],
  hidden: ["Hidden", "Registered but unreachable."],
};

type Row = { name: string; value: string; stored: boolean };
type Rule = { tool: string; exposure: McpExposure };
const OAUTH_TEXT = ["clientId", "callbackPort", "callbackUrl", "scope", "clientName", "authServerMetadataUrl"] as const;
type OAuthDraft = Record<(typeof OAUTH_TEXT)[number] | "clientSecret" | "clientRegistration", string> & { hasClientSecret: boolean; clearClientSecret: boolean };
type Draft = {
  name: string; transport: "stdio" | "http"; command: string; args: string; cwd: string; env: Row[];
  url: string; headers: Row[]; description: string; timeout: string; rules: Rule[]; oauth: OAuthDraft; authProvider: string;
};

function draftFrom(server?: McpServerView): Draft {
  const rows = (names: string[] = []) => names.map(name => ({ name, value: "", stored: true }));
  return {
    name: server?.name ?? "", transport: server?.transport ?? "stdio",
    command: server?.command ?? "", args: (server?.args ?? []).join("\n"), cwd: server?.cwd ?? "", env: rows(server?.env),
    url: server?.url ?? "", headers: rows(server?.headers),
    description: server?.description ?? "", timeout: server?.timeout ? String(server.timeout) : "",
    rules: Object.entries(server?.toolExposure ?? {}).map(([tool, exposure]) => ({ tool, exposure: exposure as McpExposure })),
    oauth: {
      ...Object.fromEntries(OAUTH_TEXT.map(key => [key, server?.oauth?.[key] === undefined ? "" : String(server.oauth[key])])) as Record<(typeof OAUTH_TEXT)[number], string>,
      clientSecret: "", clientRegistration: server?.oauth?.clientRegistration ?? "", hasClientSecret: !!server?.oauth?.hasClientSecret, clearClientSecret: false,
    },
    authProvider: server?.authProvider ?? "",
  };
}

function toInput(draft: Draft, scope: "global" | "project"): McpServerInput {
  const named = (rows: Row[]) => rows.filter(row => row.name.trim()).map(row => ({ name: row.name.trim(), ...(row.value ? { value: row.value } : {}) }));
  const common = {
    ...(draft.description.trim() ? { description: draft.description.trim() } : {}),
    ...(draft.timeout ? { timeout: Number(draft.timeout) } : {}),
    toolExposure: draft.rules.filter(rule => rule.tool.trim()).map(rule => ({ tool: rule.tool.trim(), exposure: rule.exposure })),
  };
  if (draft.transport === "http") {
    const { oauth } = draft;
    const text = (key: (typeof OAUTH_TEXT)[number]) => oauth[key].trim() ? { [key]: oauth[key].trim() } : {};
    return {
      transport: "http", url: draft.url.trim(), headers: named(draft.headers), ...common,
      oauth: {
        ...text("clientId"), ...text("callbackUrl"), ...text("scope"), ...text("clientName"), ...text("authServerMetadataUrl"),
        ...(oauth.callbackPort ? { callbackPort: Number(oauth.callbackPort) } : {}),
        ...(oauth.clientRegistration ? { clientRegistration: oauth.clientRegistration as "dcr" | "cimd" } : {}),
        ...(oauth.clientSecret ? { clientSecret: oauth.clientSecret } : oauth.clearClientSecret ? { clearClientSecret: true } : {}),
      },
      // Pi refuses auth in a project mcp.json, so the project form leaves it alone.
      ...(scope === "global" ? { authProvider: draft.authProvider.trim() || null } : {}),
    };
  }
  const args = draft.args.split("\n").map(arg => arg.trim()).filter(Boolean);
  return { transport: "stdio", command: draft.command.trim(), args, ...(draft.cwd.trim() ? { cwd: draft.cwd.trim() } : {}), env: named(draft.env), ...common };
}

export function NamedRows({ kind, rows, onChange }: { kind: "variable" | "header"; rows: Row[]; onChange: (rows: Row[]) => void }) {
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

function RuleRows({ rules, onChange }: { rules: Rule[]; onChange: (rules: Rule[]) => void }) {
  const update = (index: number, patch: Partial<Rule>) => onChange(rules.map((rule, i) => i === index ? { ...rule, ...patch } : rule));
  return <div className="named-rows">
    {rules.map((rule, index) => <div className="named-row" key={index}>
      <input aria-label={`Tool or pattern ${index + 1}`} value={rule.tool} placeholder="search_* or exact_tool_name" autoComplete="off" spellCheck={false}
        onChange={event => update(index, { tool: event.target.value })} />
      <select aria-label={`Exposure of rule ${index + 1}`} value={rule.exposure} onChange={event => update(index, { exposure: event.target.value as McpExposure })}>
        {Object.entries(exposureLabels).map(([value, [label]]) => <option key={value} value={value}>{label}</option>)}
      </select>
      <Button type="button" variant="ghost" size="icon" aria-label={`Remove rule ${rule.tool || index + 1}`}
        onClick={() => onChange(rules.filter((_, i) => i !== index))}><X aria-hidden="true" /></Button>
    </div>)}
    <Button type="button" variant="outline" size="sm" onClick={() => onChange([...rules, { tool: "", exposure: "direct" }])}>Add rule</Button>
    <p className="muted">Server tool names, without the <code>mcp__server__</code> prefix. <code>*</code> matches any characters. Exact names win over patterns; among patterns, the first match wins.</p>
  </div>;
}

function OAuthFields({ oauth, unused, onChange }: { oauth: OAuthDraft; unused?: string; onChange: (patch: Partial<OAuthDraft>) => void }) {
  const input = (key: (typeof OAUTH_TEXT)[number], label: string, placeholder: string, hint?: string) => <label>{label}
    <input aria-label={label} value={oauth[key]} placeholder={placeholder} autoComplete="off" spellCheck={false} inputMode={key === "callbackPort" ? "numeric" : undefined}
      onChange={event => onChange({ [key]: event.target.value })} />{hint && <span className="muted">{hint}</span>}</label>;
  // Open once when something is stored; later edits must not close it.
  const [open] = useState(() => OAUTH_TEXT.some(key => oauth[key]) || oauth.hasClientSecret || !!oauth.clientRegistration);
  return <details className="oauth-fields" open={open}>
    <summary>OAuth settings</summary>
    {unused ? <p className="notice">OAuth is not used while {unused} is set.</p>
      : <p className="muted">Only for servers without dynamic client registration, or with special needs. Leave empty for the default sign-in.</p>}
    <label>Client registration<select aria-label="Client registration" value={oauth.clientRegistration} onChange={event => onChange({ clientRegistration: event.target.value })}>
      <option value="">Default: register a client (dcr)</option><option value="dcr">dcr: dynamic client registration</option>
      <option value="cimd">cimd: Pi's client ID metadata document on pi.dev</option>
    </select></label>
    {input("clientId", "Client ID", "Pre-registered client id", "Not with cimd.")}
    <label>Client secret<input aria-label="Client secret" type="password" value={oauth.clientSecret} autoComplete="new-password" disabled={oauth.clearClientSecret}
      placeholder={oauth.hasClientSecret ? "Hidden. Leave empty to keep." : "Optional; ${NAME} or !command work"} onChange={event => onChange({ clientSecret: event.target.value })} /></label>
    {oauth.hasClientSecret && <label className="check"><input type="checkbox" checked={oauth.clearClientSecret}
      onChange={event => onChange({ clearClientSecret: event.target.checked, clientSecret: "" })} />Remove the stored client secret</label>}
    {input("callbackPort", "Callback port", "Free port", "Redirect URI http://127.0.0.1:<port>/callback.")}
    {input("callbackUrl", "Callback URL", "http://localhost:8080/oauth/callback", "Only http on localhost, 127.0.0.1 or [::1].")}
    {input("scope", "Scope", "Scopes the server advertises", "Space-separated.")}
    {input("clientName", "Client name", "pi", "Sent when registering. Sign out first to register again under a new name. Not with cimd.")}
    {input("authServerMetadataUrl", "Authorization server metadata URL", "https://example.okta.com/.well-known/openid-configuration", "Replaces discovery and is trusted as written.")}
  </details>;
}

export function McpServerForm({ server, busy, error, title: heading, scope = "global", onSave, onCancel }: {
  server?: McpServerView; busy: boolean; error: string; title?: string; scope?: "global" | "project";
  onSave: (name: string, input: McpServerInput) => void; onCancel: () => void;
}) {
  const [draft, setDraft] = useState(() => draftFrom(server));
  const [providers, setProviders] = useState<string[]>([]);
  useEffect(() => {
    if (scope === "global") loadProviders().then(view => setProviders(view.providers.map(provider => provider.id))).catch(() => setProviders([]));
  }, [scope]);
  const set = (patch: Partial<Draft>) => setDraft(current => ({ ...current, ...patch }));
  const title = heading ?? (server ? `Edit ${server.name}` : "Add MCP server");
  function submit(event: FormEvent) {
    event.preventDefault();
    onSave(draft.name.trim(), toInput(draft, scope));
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
        <span className="muted">One argument per line. Not a shell command. ‹hidden N› stands for a stored secret: keep it to keep the value.</span></label>
      <label>Working directory<input value={draft.cwd} placeholder="Session directory" autoComplete="off" spellCheck={false} onChange={event => set({ cwd: event.target.value })} /></label>
      <fieldset><legend>Environment</legend><NamedRows kind="variable" rows={draft.env} onChange={env => set({ env })} /></fieldset>
    </> : <>
      <label>URL<input value={draft.url} required type="text" placeholder="https://example.com/mcp" autoComplete="off" spellCheck={false} onChange={event => set({ url: event.target.value })} /></label>
      <fieldset><legend>Headers</legend><NamedRows kind="header" rows={draft.headers} onChange={headers => set({ headers })} /></fieldset>
      <fieldset><legend>Sign-in</legend>
        {scope === "global" ? <label>Pi provider<input aria-label="Pi provider" value={draft.authProvider} placeholder="Empty: OAuth, or the Authorization header" list="mcp-providers" autoComplete="off" spellCheck={false}
          onChange={event => set({ authProvider: event.target.value })} />
          <span className="muted">Sends the token of a Pi provider you signed in to with /login instead of OAuth. Needs https except on loopback hosts.</span></label>
          : <p className="muted">A Pi provider token can only be set in the global mcp.json.</p>}
        <datalist id="mcp-providers">{providers.map(id => <option key={id} value={id} />)}</datalist>
        <OAuthFields oauth={draft.oauth} unused={draft.authProvider.trim() ? "a Pi provider" : draft.headers.some(row => row.name.trim().toLowerCase() === "authorization") ? "an Authorization header" : undefined} onChange={patch => set({ oauth: { ...draft.oauth, ...patch } })} />
      </fieldset>
    </>}
    <fieldset><legend>Tool exposure rules</legend><RuleRows rules={draft.rules} onChange={rules => set({ rules })} /></fieldset>
    <label>Description<input value={draft.description} placeholder="What the server offers, in a sentence" onChange={event => set({ description: event.target.value })} /></label>
    <label>Timeout (seconds)<input type="number" min={1} step="any" value={draft.timeout} placeholder="60" onChange={event => set({ timeout: event.target.value })} /></label>
    <div className="form-actions"><Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save server"}</Button>
      <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>Cancel</Button></div>
  </form>;
}
