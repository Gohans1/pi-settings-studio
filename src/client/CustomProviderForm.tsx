import { useState, type FormEvent } from "react";
import { X } from "lucide-react";
import type { CustomModel, CustomProviderInput, CustomProviderView } from "../shared/models";
import { Button } from "./components/ui/button";
import { NamedRows } from "./McpServerForm";

// pi-ai's KnownApi values (Pi 1.0.3); models.json also accepts APIs that extensions register.
const APIS = ["openai-completions", "openai-responses", "anthropic-messages", "google-generative-ai", "google-vertex",
  "mistral-conversations", "azure-openai-responses", "openai-codex-responses", "bedrock-converse-stream", "pi-messages"];
const keyKinds = { literal: "a key", environment: "an environment variable reference", command: "a command" };

type ModelRow = { id: string; name: string; reasoning: boolean; image: boolean; contextWindow: string; maxTokens: string };
const toRow = (model?: CustomModel): ModelRow => ({ id: model?.id ?? "", name: model?.name ?? "", reasoning: !!model?.reasoning, image: !!model?.image,
  contextWindow: model?.contextWindow ? String(model.contextWindow) : "", maxTokens: model?.maxTokens ? String(model.maxTokens) : "" });

export function CustomProviderForm({ provider, busy, error, onSave, onRemove, onCancel }: {
  provider?: CustomProviderView; busy: boolean; error: string;
  onSave: (id: string, input: CustomProviderInput) => void; onRemove?: () => void; onCancel: () => void;
}) {
  const [id, setId] = useState(provider?.id ?? "");
  const [name, setName] = useState(provider?.name ?? "");
  const [baseUrl, setBaseUrl] = useState(provider?.baseUrl ?? "");
  const [api, setApi] = useState(provider?.api ?? "");
  const [apiKey, setApiKey] = useState("");
  const [clearKey, setClearKey] = useState(false);
  const [headers, setHeaders] = useState((provider?.headers ?? []).map(header => ({ name: header, value: "", stored: true })));
  const [authHeader, setAuthHeader] = useState(!!provider?.authHeader);
  const [models, setModels] = useState<ModelRow[]>((provider?.models ?? []).map(toRow));
  const title = provider ? `Edit ${provider.id}` : "Add custom provider";
  const update = (index: number, patch: Partial<ModelRow>) => setModels(rows => rows.map((row, i) => i === index ? { ...row, ...patch } : row));
  function submit(event: FormEvent) {
    event.preventDefault();
    const number = (value: string) => value ? Number(value) : undefined;
    onSave(id.trim(), {
      ...(name.trim() ? { name: name.trim() } : {}), ...(baseUrl.trim() ? { baseUrl: baseUrl.trim() } : {}), ...(api ? { api } : {}),
      ...(apiKey ? { apiKey } : {}), ...(clearKey ? { clearApiKey: true } : {}),
      headers: headers.filter(row => row.name.trim()).map(row => ({ name: row.name.trim(), ...(row.value ? { value: row.value } : {}) })),
      ...(authHeader ? { authHeader: true } : {}),
      models: models.filter(row => row.id.trim()).map(row => ({ id: row.id.trim(), ...(row.name.trim() ? { name: row.name.trim() } : {}),
        ...(row.reasoning ? { reasoning: true } : {}), ...(row.image ? { image: true } : {}),
        ...(number(row.contextWindow) ? { contextWindow: number(row.contextWindow) } : {}), ...(number(row.maxTokens) ? { maxTokens: number(row.maxTokens) } : {}) })),
    });
  }
  return <form className="detail server-form" aria-label={title} onSubmit={submit}>
    <h2>{title}</h2>
    <p className="muted">An endpoint that speaks an API Pi supports (Ollama, LM Studio, vLLM, a proxy). Pi checks the entry before it is saved.</p>
    {error && <div role="alert" className="error"><strong>Not saved</strong><p>{error}</p></div>}
    {!provider && <label>Provider ID<input value={id} required pattern="[A-Za-z0-9][A-Za-z0-9._\-]*" autoComplete="off" spellCheck={false} onChange={e => setId(e.target.value)} />
      <span className="muted">Used in model names such as {id || "ollama"}/model-id. An existing ID changes that built-in provider.</span></label>}
    <label>Display name<input value={name} placeholder={id || "Optional"} onChange={e => setName(e.target.value)} /></label>
    <label>Base URL<input value={baseUrl} placeholder="http://localhost:11434/v1" autoComplete="off" spellCheck={false} onChange={e => setBaseUrl(e.target.value)} /></label>
    <label>API<select aria-label="API" value={api} onChange={e => setApi(e.target.value)}>
      <option value="">Not set</option>
      {[...new Set([...(api && !APIS.includes(api) ? [api] : []), ...APIS])].map(value => <option key={value} value={value}>{value}</option>)}
    </select></label>
    <label>API key<input type="password" value={apiKey} autoComplete="new-password" disabled={clearKey}
      placeholder={provider?.apiKey ? `Stored (${keyKinds[provider.apiKey]}). Leave empty to keep.` : "Literal key, $ENV_NAME or !command"} onChange={e => setApiKey(e.target.value)} /></label>
    {provider?.apiKey && <label className="checkbox"><input type="checkbox" checked={clearKey} onChange={e => setClearKey(e.target.checked)} />Remove the stored API key</label>}
    <label className="checkbox"><input type="checkbox" checked={authHeader} onChange={e => setAuthHeader(e.target.checked)} />Also send the key as <code>Authorization: Bearer</code></label>
    <fieldset><legend>Headers</legend><NamedRows kind="header" rows={headers} onChange={setHeaders} /></fieldset>
    <fieldset><legend>Models</legend>
      <div className="model-rows">{models.map((row, index) => <div className="model-row" key={index}>
        <input aria-label={`Model ID ${index + 1}`} value={row.id} placeholder="model-id" spellCheck={false} onChange={e => update(index, { id: e.target.value })} />
        <input aria-label={`Model name ${index + 1}`} value={row.name} placeholder="Display name" onChange={e => update(index, { name: e.target.value })} />
        <input aria-label={`Context window ${index + 1}`} type="number" min={1} value={row.contextWindow} placeholder="Context" onChange={e => update(index, { contextWindow: e.target.value })} />
        <input aria-label={`Max output tokens ${index + 1}`} type="number" min={1} value={row.maxTokens} placeholder="Max out" onChange={e => update(index, { maxTokens: e.target.value })} />
        <label className="checkbox"><input type="checkbox" checked={row.reasoning} onChange={e => update(index, { reasoning: e.target.checked })} />Reasoning</label>
        <label className="checkbox"><input type="checkbox" checked={row.image} onChange={e => update(index, { image: e.target.checked })} />Images</label>
        <Button type="button" variant="ghost" size="icon" aria-label={`Remove model ${row.id || index + 1}`} onClick={() => setModels(rows => rows.filter((_, i) => i !== index))}><X aria-hidden="true" /></Button>
      </div>)}</div>
      <Button type="button" variant="outline" size="sm" onClick={() => setModels(rows => [...rows, toRow()])}>Add model</Button>
      <p className="muted">Other model fields (cost, compat, thinking maps) stay as they are in the file.</p>
    </fieldset>
    {provider && provider.otherKeys.length > 0 && <p className="muted">Kept as they are: {provider.otherKeys.join(", ")}.</p>}
    <div className="actions"><Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save provider"}</Button>
      {onRemove && <Button type="button" variant="destructive" disabled={busy} onClick={onRemove} aria-label={`Remove ${provider?.id}`}>Remove</Button>}
      <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>Cancel</Button></div>
  </form>;
}
