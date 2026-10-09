import { useEffect, useId, useState, type FormEvent } from "react";
import { CircleAlert, X } from "lucide-react";
import type { McpExposure, McpServerInput, McpServerView } from "../shared/mcp";
import type { ProviderView } from "../shared/models";
import { loadProviders } from "./api";
import { Alert, AlertDescription, AlertTitle } from "./components/ui/alert";
import { Button } from "./components/ui/button";
import { Checkbox } from "./components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "./components/ui/field";
import { Input } from "./components/ui/input";
import { Textarea } from "./components/ui/textarea";
import { Spinner } from "./components/ui/spinner";
import { Disclosure } from "./Disclosure";
import { OptionSelect } from "./OptionSelect";
import { providerSuggestions, SuggestInput } from "./SuggestInput";
import { useFieldErrors } from "./useFieldErrors";

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
      <Input aria-label={`${Kind} name ${index + 1}`} value={row.name} placeholder="NAME" autoComplete="off" spellCheck={false}
        onChange={event => update(index, { name: event.target.value })} />
      <Input aria-label={`Value of ${kind} ${index + 1}`} type="password" value={row.value} autoComplete="new-password"
        placeholder={row.stored ? "Hidden. Leave empty to keep." : "Value"} onChange={event => update(index, { value: event.target.value })} />
      <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${kind} ${row.name || index + 1}`}
        onClick={() => onChange(rows.filter((_, i) => i !== index))}><X aria-hidden="true" /></Button>
    </div>)}
    <Button type="button" variant="outline" size="sm" onClick={() => onChange([...rows, { name: "", value: "", stored: false }])}>Add {kind}</Button>
    <FieldDescription>Values can use <code>{"${NAME}"}</code> or <code>!command</code>. Saved values are never shown here.</FieldDescription>
  </div>;
}

function RuleRows({ rules, onChange }: { rules: Rule[]; onChange: (rules: Rule[]) => void }) {
  const update = (index: number, patch: Partial<Rule>) => onChange(rules.map((rule, i) => i === index ? { ...rule, ...patch } : rule));
  return <div className="named-rows">
    {rules.map((rule, index) => <div className="named-row" key={index}>
      <Input aria-label={`Tool or pattern ${index + 1}`} value={rule.tool} placeholder="search_* or exact_tool_name" autoComplete="off" spellCheck={false}
        onChange={event => update(index, { tool: event.target.value })} />
      <OptionSelect aria-label={`Exposure of rule ${index + 1}`} className="w-full" value={rule.exposure} onChange={exposure => update(index, { exposure })}
        options={Object.entries(exposureLabels).map(([value, [label]]) => ({ value: value as McpExposure, label }))} />
      <Button type="button" variant="ghost" size="icon" aria-label={`Remove rule ${rule.tool || index + 1}`}
        onClick={() => onChange(rules.filter((_, i) => i !== index))}><X aria-hidden="true" /></Button>
    </div>)}
    <Button type="button" variant="outline" size="sm" onClick={() => onChange([...rules, { tool: "", exposure: "direct" }])}>Add rule</Button>
    <FieldDescription>Server tool names, without the <code>mcp__server__</code> prefix. <code>*</code> matches any characters. Exact names win over patterns; among patterns, the first match wins.</FieldDescription>
  </div>;
}

function OAuthFields({ oauth, unused, onChange }: { oauth: OAuthDraft; unused?: string; onChange: (patch: Partial<OAuthDraft>) => void }) {
  const id = useId();
  const input = (key: (typeof OAUTH_TEXT)[number], label: string, placeholder: string, hint?: string) => <Field>
    <FieldLabel htmlFor={id + key}>{label}</FieldLabel>
    <Input id={id + key} value={oauth[key]} placeholder={placeholder} autoComplete="off" spellCheck={false} inputMode={key === "callbackPort" ? "numeric" : undefined}
      aria-describedby={hint ? id + key + "-hint" : undefined} onChange={event => onChange({ [key]: event.target.value })} />
    {hint && <FieldDescription id={id + key + "-hint"}>{hint}</FieldDescription>}</Field>;
  // Open once when something is stored; later edits must not close it.
  const [open] = useState(() => OAUTH_TEXT.some(key => oauth[key]) || oauth.hasClientSecret || !!oauth.clientRegistration);
  return <Disclosure label="OAuth settings" defaultOpen={open}><div className="oauth-fields">
    {unused ? <Alert role="note"><AlertDescription>OAuth is not used while {unused} is set.</AlertDescription></Alert>
      : <FieldDescription>Only for servers without dynamic client registration, or with special needs. Leave empty for the default sign-in.</FieldDescription>}
    <Field><FieldLabel htmlFor={id + "registration"}>Client registration</FieldLabel>
      <OptionSelect id={id + "registration"} className="w-full" value={oauth.clientRegistration} onChange={clientRegistration => onChange({ clientRegistration })} options={[
        { value: "", label: "Default: register a client (dcr)" }, { value: "dcr", label: "dcr: dynamic client registration" },
        { value: "cimd", label: "cimd: Pi's client ID metadata document on pi.dev" }]} /></Field>
    {input("clientId", "Client ID", "Pre-registered client id", "Not with cimd.")}
    <Field><FieldLabel htmlFor={id + "secret"}>Client secret</FieldLabel>
      <Input id={id + "secret"} type="password" value={oauth.clientSecret} autoComplete="new-password" disabled={oauth.clearClientSecret}
        placeholder={oauth.hasClientSecret ? "Hidden. Leave empty to keep." : "Optional; ${NAME} or !command work"} onChange={event => onChange({ clientSecret: event.target.value })} /></Field>
    {oauth.hasClientSecret && <Field orientation="horizontal"><Checkbox id={id + "clear"} checked={oauth.clearClientSecret}
      onCheckedChange={checked => onChange({ clearClientSecret: checked, clientSecret: "" })} /><FieldLabel htmlFor={id + "clear"}>Remove the stored client secret</FieldLabel></Field>}
    {input("callbackPort", "Callback port", "Free port", "Redirect URI http://127.0.0.1:<port>/callback.")}
    {input("callbackUrl", "Callback URL", "http://localhost:8080/oauth/callback", "Only http on localhost, 127.0.0.1 or [::1].")}
    {input("scope", "Scope", "Scopes the server advertises", "Space-separated.")}
    {input("clientName", "Client name", "pi", "Sent when registering. Sign out first to register again under a new name. Not with cimd.")}
    {input("authServerMetadataUrl", "Authorization server metadata URL", "https://example.okta.com/.well-known/openid-configuration", "Replaces discovery and is trusted as written.")}
  </div></Disclosure>;
}

export function McpServerForm({ server, busy, error, title: heading, scope = "global", onSave, onCancel }: {
  server?: McpServerView; busy: boolean; error: string; title?: string; scope?: "global" | "project";
  onSave: (name: string, input: McpServerInput) => void; onCancel: () => void;
}) {
  const [draft, setDraft] = useState(() => draftFrom(server));
  const [providers, setProviders] = useState<ProviderView[]>([]);
  useEffect(() => {
    if (scope === "global") loadProviders().then(view => setProviders(view.providers)).catch(() => setProviders([]));
  }, [scope]);
  const set = (patch: Partial<Draft>) => setDraft(current => ({ ...current, ...patch }));
  const title = heading ?? (server ? `Edit ${server.name}` : "Add MCP server");
  const id = useId();
  const { errors, check, clear, describe } = useFieldErrors({ [id + "name"]: "Use letters, digits, _ and -." });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (check(event.currentTarget)) onSave(draft.name.trim(), toInput(draft, scope));
  }
  return <form className="detail server-form" aria-label={title} onSubmit={submit} onInput={clear} noValidate>
    <h2>{title}</h2>
    {error && <Alert variant="destructive"><CircleAlert aria-hidden="true" /><AlertTitle>Not saved</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
    <FieldGroup>
    {!server && <Field data-invalid={!!errors[id + "name"] || undefined}><FieldLabel htmlFor={id + "name"}>Name</FieldLabel><Input id={id + "name"} value={draft.name} required pattern="[A-Za-z0-9_\-]+" autoComplete="off" spellCheck={false}
      {...describe(id + "name")} onChange={event => set({ name: event.target.value })} /><FieldError id={id + "name-error"}>{errors[id + "name"]}</FieldError></Field>}
    <Field><FieldLabel htmlFor={id + "transport"}>Transport</FieldLabel>
      <OptionSelect id={id + "transport"} className="w-full" value={draft.transport} onChange={transport => set({ transport })}
        options={[{ value: "stdio", label: "Command (stdio)" }, { value: "http", label: "URL (streamable HTTP)" }] as const} /></Field>
    {draft.transport === "stdio" ? <>
      <Field data-invalid={!!errors[id + "command"] || undefined}><FieldLabel htmlFor={id + "command"}>Command</FieldLabel><Input id={id + "command"} value={draft.command} required placeholder="npx" autoComplete="off" spellCheck={false}
        {...describe(id + "command")} onChange={event => set({ command: event.target.value })} /><FieldError id={id + "command-error"}>{errors[id + "command"]}</FieldError></Field>
      <Field><FieldLabel htmlFor={id + "args"}>Arguments</FieldLabel>
        <Textarea id={id + "args"} rows={3} value={draft.args} placeholder={"-y\n@modelcontextprotocol/server-filesystem"} spellCheck={false} aria-describedby={id + "args-hint"} onChange={event => set({ args: event.target.value })} />
        <FieldDescription id={id + "args-hint"}>One argument per line. Not a shell command. ‹hidden N› stands for a stored secret: keep it to keep the value.</FieldDescription></Field>
      <Field><FieldLabel htmlFor={id + "cwd"}>Working directory</FieldLabel><Input id={id + "cwd"} value={draft.cwd} placeholder="Session directory" autoComplete="off" spellCheck={false} onChange={event => set({ cwd: event.target.value })} /></Field>
      <FieldSet><FieldLegend variant="label">Environment</FieldLegend><NamedRows kind="variable" rows={draft.env} onChange={env => set({ env })} /></FieldSet>
    </> : <>
      <Field data-invalid={!!errors[id + "url"] || undefined}><FieldLabel htmlFor={id + "url"}>URL</FieldLabel><Input id={id + "url"} value={draft.url} required type="text" placeholder="https://example.com/mcp" autoComplete="off" spellCheck={false}
        {...describe(id + "url")} onChange={event => set({ url: event.target.value })} /><FieldError id={id + "url-error"}>{errors[id + "url"]}</FieldError></Field>
      <FieldSet><FieldLegend variant="label">Headers</FieldLegend><NamedRows kind="header" rows={draft.headers} onChange={headers => set({ headers })} /></FieldSet>
      <FieldSet><FieldLegend variant="label">Sign-in</FieldLegend>
        {scope === "global" ? <Field><FieldLabel htmlFor={id + "provider"}>Pi provider</FieldLabel>
          <SuggestInput id={id + "provider"} value={draft.authProvider} placeholder="Empty: OAuth, or the Authorization header" suggestions={providerSuggestions(providers)}
            aria-describedby={id + "provider-hint"} onChange={authProvider => set({ authProvider })} />
          <FieldDescription id={id + "provider-hint"}>Sends the token of a Pi provider you signed in to with /login instead of OAuth. Needs https except on loopback hosts.</FieldDescription></Field>
          : <FieldDescription>A Pi provider token can only be set in the global mcp.json.</FieldDescription>}
        <OAuthFields oauth={draft.oauth} unused={draft.authProvider.trim() ? "a Pi provider" : draft.headers.some(row => row.name.trim().toLowerCase() === "authorization") ? "an Authorization header" : undefined} onChange={patch => set({ oauth: { ...draft.oauth, ...patch } })} />
      </FieldSet>
    </>}
    <FieldSet><FieldLegend variant="label">Tool exposure rules</FieldLegend><RuleRows rules={draft.rules} onChange={rules => set({ rules })} /></FieldSet>
    <Field><FieldLabel htmlFor={id + "description"}>Description</FieldLabel><Input id={id + "description"} value={draft.description} placeholder="What the server offers, in a sentence" onChange={event => set({ description: event.target.value })} /></Field>
    <Field data-invalid={!!errors[id + "timeout"] || undefined}><FieldLabel htmlFor={id + "timeout"}>Timeout (seconds)</FieldLabel><Input id={id + "timeout"} type="number" min={1} step="any" value={draft.timeout} placeholder="60" {...describe(id + "timeout")} onChange={event => set({ timeout: event.target.value })} /><FieldError id={id + "timeout-error"}>{errors[id + "timeout"]}</FieldError></Field>
    </FieldGroup>
    <div className="form-actions"><Button type="submit" disabled={busy}>{busy && <Spinner data-icon="inline-start" aria-hidden="true" />}{busy ? "Saving…" : "Save server"}</Button>
      <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>Cancel</Button></div>
  </form>;
}
