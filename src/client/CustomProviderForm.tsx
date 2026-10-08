import { useId, useState, type FormEvent } from "react";
import { CircleAlert, X } from "lucide-react";
import type { CustomModel, CustomProviderInput, CustomProviderView } from "../shared/models";
import { Alert, AlertDescription, AlertTitle } from "./components/ui/alert";
import { Button } from "./components/ui/button";
import { Card, CardContent } from "./components/ui/card";
import { Checkbox } from "./components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldLabel, FieldLegend, FieldSet } from "./components/ui/field";
import { Input } from "./components/ui/input";
import { OptionSelect } from "./OptionSelect";
import { NamedRows } from "./McpServerForm";
import { discoverCustomModels } from "./api";

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
  const [providerId, setProviderId] = useState(provider?.id ?? "");
  const [name, setName] = useState(provider?.name ?? "");
  const [baseUrl, setBaseUrl] = useState(provider?.baseUrl ?? "");
  const [api, setApi] = useState(provider?.api ?? "");
  const [apiKey, setApiKey] = useState("");
  const [clearKey, setClearKey] = useState(false);
  const [headers, setHeaders] = useState((provider?.headers ?? []).map(header => ({ name: header, value: "", stored: true })));
  const [authHeader, setAuthHeader] = useState(!!provider?.authHeader);
  const [models, setModels] = useState<ModelRow[]>((provider?.models ?? []).map(toRow));
  const [found, setFound] = useState<CustomModel[]>();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [listing, setListing] = useState(false);
  const [listError, setListError] = useState("");
  const title = provider ? `Edit ${provider.id}` : "Add custom provider";
  const id = useId();
  const headerInput = () => headers.filter(row => row.name.trim()).map(row => ({ name: row.name.trim(), ...(row.value ? { value: row.value } : {}) }));
  async function listModels() {
    setListing(true); setListError("");
    try {
      setFound(await discoverCustomModels({ ...(provider ? { provider: provider.id } : {}), baseUrl: baseUrl.trim(), api, ...(apiKey ? { apiKey } : {}), headers: headerInput(), authHeader }));
      setPicked(new Set());
    } catch (cause) { setFound(undefined); setListError(cause instanceof Error ? cause.message : "Could not list the models."); }
    finally { setListing(false); }
  }
  const known = new Set(models.map(row => row.id.trim()));
  const update = (index: number, patch: Partial<ModelRow>) => setModels(rows => rows.map((row, i) => i === index ? { ...row, ...patch } : row));
  function submit(event: FormEvent) {
    event.preventDefault();
    const number = (value: string) => value ? Number(value) : undefined;
    onSave(providerId.trim(), {
      ...(name.trim() ? { name: name.trim() } : {}), ...(baseUrl.trim() ? { baseUrl: baseUrl.trim() } : {}), ...(api ? { api } : {}),
      ...(apiKey ? { apiKey } : {}), ...(clearKey ? { clearApiKey: true } : {}),
      headers: headerInput(),
      ...(authHeader ? { authHeader: true } : {}),
      models: models.filter(row => row.id.trim()).map(row => ({ id: row.id.trim(), ...(row.name.trim() ? { name: row.name.trim() } : {}),
        ...(row.reasoning ? { reasoning: true } : {}), ...(row.image ? { image: true } : {}),
        ...(number(row.contextWindow) ? { contextWindow: number(row.contextWindow) } : {}), ...(number(row.maxTokens) ? { maxTokens: number(row.maxTokens) } : {}) })),
    });
  }
  return <form className="detail server-form" aria-label={title} onSubmit={submit}>
    <h2>{title}</h2>
    <p className="muted">An endpoint that speaks an API Pi supports (Ollama, LM Studio, vLLM, a proxy). Pi checks the entry before it is saved.</p>
    {error && <Alert variant="destructive"><CircleAlert aria-hidden="true" /><AlertTitle>Not saved</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
    {!provider && <Field><FieldLabel htmlFor={id + "id"}>Provider ID</FieldLabel>
      <Input id={id + "id"} value={providerId} required pattern="[A-Za-z0-9][A-Za-z0-9._\-]*" autoComplete="off" spellCheck={false} aria-describedby={id + "id-help"} onChange={e => setProviderId(e.target.value)} />
      <FieldDescription id={id + "id-help"}>Used in model names such as {providerId || "ollama"}/model-id. An existing ID changes that built-in provider.</FieldDescription></Field>}
    <Field><FieldLabel htmlFor={id + "name"}>Display name</FieldLabel><Input id={id + "name"} value={name} placeholder={providerId || "Optional"} onChange={e => setName(e.target.value)} /></Field>
    <Field><FieldLabel htmlFor={id + "url"}>Base URL</FieldLabel><Input id={id + "url"} value={baseUrl} placeholder="http://localhost:11434/v1" autoComplete="off" spellCheck={false} onChange={e => setBaseUrl(e.target.value)} /></Field>
    <Field><FieldLabel htmlFor={id + "api"}>API</FieldLabel>
      <OptionSelect id={id + "api"} className="w-full" value={api} onChange={setApi}
        options={[{ value: "", label: "Not set" }, ...[...new Set([...(api && !APIS.includes(api) ? [api] : []), ...APIS])].map(value => ({ value, label: value }))]} /></Field>
    <Field><FieldLabel htmlFor={id + "key"}>API key</FieldLabel><Input id={id + "key"} type="password" value={apiKey} autoComplete="new-password" disabled={clearKey}
      placeholder={provider?.apiKey ? `Stored (${keyKinds[provider.apiKey]}). Leave empty to keep.` : "Literal key, $ENV_NAME or !command"} onChange={e => setApiKey(e.target.value)} /></Field>
    {provider?.apiKey && <Field orientation="horizontal"><Checkbox id={id + "clear"} checked={clearKey} onCheckedChange={setClearKey} /><FieldLabel htmlFor={id + "clear"}>Remove the stored API key</FieldLabel></Field>}
    <Field orientation="horizontal"><Checkbox id={id + "bearer"} checked={authHeader} onCheckedChange={setAuthHeader} /><FieldLabel htmlFor={id + "bearer"}>Also send the key as <code>Authorization: Bearer</code></FieldLabel></Field>
    <FieldSet><FieldLegend variant="label">Headers</FieldLegend><NamedRows kind="header" rows={headers} onChange={setHeaders} /></FieldSet>
    <FieldSet><FieldLegend variant="label">Models</FieldLegend>
      <div className="model-rows">{models.map((row, index) => <div className="model-row" key={index}>
        <Input aria-label={`Model ID ${index + 1}`} value={row.id} placeholder="model-id" spellCheck={false} onChange={e => update(index, { id: e.target.value })} />
        <Input aria-label={`Model name ${index + 1}`} value={row.name} placeholder="Display name" onChange={e => update(index, { name: e.target.value })} />
        <Input aria-label={`Context window ${index + 1}`} type="number" min={1} value={row.contextWindow} placeholder="Context" onChange={e => update(index, { contextWindow: e.target.value })} />
        <Input aria-label={`Max output tokens ${index + 1}`} type="number" min={1} value={row.maxTokens} placeholder="Max out" onChange={e => update(index, { maxTokens: e.target.value })} />
        <Field orientation="horizontal" className="w-auto"><Checkbox id={`${id}reasoning-${index}`} checked={row.reasoning} onCheckedChange={reasoning => update(index, { reasoning })} /><FieldLabel htmlFor={`${id}reasoning-${index}`}>Reasoning</FieldLabel></Field>
        <Field orientation="horizontal" className="w-auto"><Checkbox id={`${id}image-${index}`} checked={row.image} onCheckedChange={image => update(index, { image })} /><FieldLabel htmlFor={`${id}image-${index}`}>Images</FieldLabel></Field>
        <Button type="button" variant="ghost" size="icon" aria-label={`Remove model ${row.id || index + 1}`} onClick={() => setModels(rows => rows.filter((_, i) => i !== index))}><X aria-hidden="true" /></Button>
      </div>)}</div>
      <div className="actions">
        <Button type="button" variant="outline" size="sm" onClick={() => setModels(rows => [...rows, toRow()])}>Add model</Button>
        <Button type="button" variant="outline" size="sm" disabled={listing || !baseUrl.trim() || !api} onClick={() => void listModels()}>{listing ? "Listing…" : "List models from the endpoint"}</Button>
      </div>
      {listError && <FieldError>{listError}</FieldError>}
      {found && <Card size="sm"><CardContent><FieldSet>
        <FieldLegend variant="label">Models the endpoint offers</FieldLegend>
        {found.length ? <ul className="found-models">{found.map(model => <li key={model.id}><Field orientation="horizontal" className="flex-wrap">
          <Checkbox id={`${id}found-${model.id}`} checked={known.has(model.id) || picked.has(model.id)} disabled={known.has(model.id)}
            onCheckedChange={checked => setPicked(current => { const next = new Set(current); if (checked) next.add(model.id); else next.delete(model.id); return next; })} />
          <FieldLabel htmlFor={`${id}found-${model.id}`} className="flex-wrap"><code>{model.id}</code>{model.name && <span className="muted">{model.name}</span>}
            {model.contextWindow && <span className="muted">{model.contextWindow.toLocaleString("en")} context</span>}
            {known.has(model.id) && <span className="muted">in the list</span>}</FieldLabel>
        </Field></li>)}</ul> : <FieldDescription>The endpoint lists no models.</FieldDescription>}
        <div className="actions">
          <Button type="button" size="sm" disabled={!picked.size} onClick={() => {
            setModels(rows => [...rows.filter(row => row.id.trim()), ...found.filter(model => picked.has(model.id)).map(toRow)]);
            setFound(undefined);
          }}>Add {picked.size} model{picked.size === 1 ? "" : "s"}</Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setFound(undefined)}>Close</Button>
        </div>
        <FieldDescription>Uses the stored key and headers only while the base URL is unchanged. A key that is a command is not run.</FieldDescription>
      </FieldSet></CardContent></Card>}
      <FieldDescription>Other model fields (cost, compat, thinking maps) stay as they are in the file.</FieldDescription>
    </FieldSet>
    {provider && provider.otherKeys.length > 0 && <FieldDescription>Kept as they are: {provider.otherKeys.join(", ")}.</FieldDescription>}
    <div className="form-actions"><Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save provider"}</Button>
      {onRemove && <Button type="button" variant="destructive" disabled={busy} onClick={onRemove} aria-label={`Remove ${provider?.id}`}>Remove</Button>}
      <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>Cancel</Button></div>
  </form>;
}
