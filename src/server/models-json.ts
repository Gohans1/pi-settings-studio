// models.json custom providers. Pi's own loader validates every change before it is written:
// the candidate file goes to a private temporary folder and ModelRuntime reports what Pi would refuse.
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import { z } from "zod";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { InMemoryCredentialStore } from "@earendil-works/pi-ai";
import type { CustomModel, CustomProviderInput, CustomProvidersView, CustomProviderView } from "../shared/models.ts";
import { isRecord } from "./mcp-config.ts";
import { withValues } from "./mcp-api.ts";
import { maskJson, modelsSecrets, unmaskJson } from "./json-secrets.ts";
import { ConfigError, type ConfigStore } from "./store.ts";
import { discoverModels, resolveValue } from "./model-discovery.ts";

type Json = Record<string, unknown>;
const PROVIDER_KEYS = ["name", "baseUrl", "api", "apiKey", "headers", "authHeader", "models"];
const MODEL_KEYS = ["id", "name", "reasoning", "input", "contextWindow", "maxTokens"];

export function keyKind(value: string): "literal" | "environment" | "command" {
  if (value.startsWith("!")) return "command";
  return /^\$\{?[A-Za-z_][A-Za-z0-9_]*\}?$/.test(value) ? "environment" : "literal";
}

function modelView(model: Json): CustomModel {
  const input = Array.isArray(model.input) ? model.input : [];
  return {
    id: String(model.id),
    ...(typeof model.name === "string" ? { name: model.name } : {}),
    ...(model.reasoning === true ? { reasoning: true } : {}),
    ...(input.includes("image") ? { image: true } : {}),
    ...(typeof model.contextWindow === "number" ? { contextWindow: model.contextWindow } : {}),
    ...(typeof model.maxTokens === "number" ? { maxTokens: model.maxTokens } : {}),
  };
}

function providerView(id: string, raw: unknown): CustomProviderView {
  const entry = isRecord(raw) ? raw : {};
  const text = (key: string) => typeof entry[key] === "string" ? { [key]: entry[key] as string } : {};
  return {
    id, ...text("name"), ...text("baseUrl"), ...text("api"),
    ...(typeof entry.apiKey === "string" ? { apiKey: keyKind(entry.apiKey) } : {}),
    headers: isRecord(entry.headers) ? Object.keys(entry.headers) : [],
    ...(entry.authHeader === true ? { authHeader: true } : {}),
    models: Array.isArray(entry.models) ? entry.models.filter(isRecord).filter(model => typeof model.id === "string").map(modelView) : [],
    otherKeys: Object.keys(entry).filter(key => !PROVIDER_KEYS.includes(key)),
  };
}

/** The form's fields over the stored entry: hidden values and unmanaged keys are kept, per model too. */
function buildProvider(input: CustomProviderInput, previous: Json = {}): Json {
  const entry: Json = {};
  if (input.name) entry.name = input.name;
  if (input.baseUrl) entry.baseUrl = input.baseUrl;
  if (input.api) entry.api = input.api;
  if (input.apiKey) entry.apiKey = input.apiKey;
  else if (!input.clearApiKey && typeof previous.apiKey === "string") entry.apiKey = previous.apiKey;
  const headers = withValues(input.headers, previous.headers);
  if (headers) entry.headers = headers;
  if (input.authHeader) entry.authHeader = true;
  const stored = Array.isArray(previous.models) ? previous.models.filter(isRecord) : [];
  const models = input.models.map(model => {
    const base = stored.find(old => old.id === model.id) ?? {};
    const next: Json = { id: model.id };
    if (model.name) next.name = model.name;
    if (model.reasoning) next.reasoning = true;
    if (model.image) next.input = ["text", "image"];
    if (model.contextWindow) next.contextWindow = model.contextWindow;
    if (model.maxTokens) next.maxTokens = model.maxTokens;
    for (const [key, value] of Object.entries(base)) if (!MODEL_KEYS.includes(key)) next[key] = value;
    return next;
  });
  if (models.length) entry.models = models;
  for (const [key, value] of Object.entries(previous)) if (!PROVIDER_KEYS.includes(key)) entry[key] = value;
  return entry;
}

/** Ask Pi whether it accepts the file; only problems of the edited provider block the change. */
async function assertPiAccepts(file: Json, id: string, realPath: string): Promise<void> {
  const error = await piModelsError(file, realPath);
  if (error && [`Provider "${id}"`, `Provider ${id}`, `providers.${id}.`, `providers.${id}:`].some(mark => error.includes(mark))) throw new ConfigError(error);
}

/** What Pi's own loader reports for this file, if anything. */
async function piModelsError(file: Json, realPath: string): Promise<string | undefined> {
  const dir = await mkdtemp(join(tmpdir(), "pi-settings-validate-"));
  try {
    const candidate = join(dir, "models.json");
    await writeFile(candidate, JSON.stringify(file), { mode: 0o600 });
    const runtime = await ModelRuntime.create({
      credentials: new InMemoryCredentialStore(), modelsPath: candidate, modelsStorePath: join(dir, "models-store.json"),
      allowModelNetwork: false, refreshOnCreate: false,
    });
    return runtime.getError()?.replaceAll(candidate, realPath);
  } finally { await rm(dir, { recursive: true, force: true }); }
}

const named = z.array(z.object({ name: z.string().min(1).max(200), value: z.string().max(10_000).optional() }).strict()).max(50);
const providerInput = z.object({
  name: z.string().max(200).optional(), baseUrl: z.string().max(2000).optional(), api: z.string().max(100).optional(),
  apiKey: z.string().max(10_000).optional(), clearApiKey: z.boolean().optional(), headers: named.optional(), authHeader: z.boolean().optional(),
  models: z.array(z.object({
    id: z.string().min(1).max(300), name: z.string().max(300).optional(), reasoning: z.boolean().optional(), image: z.boolean().optional(),
    contextWindow: z.number().int().positive().optional(), maxTokens: z.number().int().positive().optional(),
  }).strict()).max(500),
}).strict();
const PROVIDER_ID = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/, "Use letters, digits, ., _ and -.");
const revision = z.string().min(1).max(100);

function providers(file: Json): Json {
  if (file.providers === undefined) file.providers = {};
  if (!isRecord(file.providers)) throw new ConfigError('models.json needs a "providers" object. Repair the file first.');
  return file.providers;
}

export function customProviderRoutes(store: ConfigStore) {
  const path = () => store.path("global", "models.json");
  async function view(): Promise<CustomProvidersView> {
    const hasBackup = await store.hasBackup("global", "models.json");
    try {
      const { value, revision, exists } = await store.read("global", "models.json");
      const list = isRecord(value.providers) ? Object.entries(value.providers).map(([id, raw]) => providerView(id, raw)) : [];
      return { path: path(), revision, exists, hasBackup, providers: list, ...(value.providers !== undefined && !isRecord(value.providers) ? { error: 'Expected a "providers" object.' } : {}) };
    } catch (error) {
      if (!(error instanceof ConfigError)) throw error;
      return { path: path(), revision: "invalid", exists: true, hasBackup, providers: [], error: error.message };
    }
  }
  const save = (rev: string, id: string, edit: (entries: Json) => void) => store.transform("global", rev, async file => {
    edit(providers(file));
    await assertPiAccepts(file, id, path());
    return file;
  }, "models.json");
  async function raw() {
    const { text, revision } = await store.readText("global", "models.json");
    let value: Json;
    try { value = JSON.parse(text); } catch { throw new ConfigError(`${path()} is not valid JSON, so its keys cannot be hidden. Repair it in a text editor.`); }
    if (!isRecord(value)) throw new ConfigError("models.json must contain a JSON object.");
    return { path: path(), revision, text: maskJson(value, modelsSecrets(value)) };
  }
  const discoverInput = z.object({
    provider: PROVIDER_ID.optional(), baseUrl: z.string().max(2000), api: z.string().max(100), apiKey: z.string().max(10_000).optional(),
    headers: z.array(z.object({ name: z.string().min(1).max(200), value: z.string().max(10_000).optional() }).strict()).max(50).optional(), authHeader: z.boolean().optional(),
  }).strict();
  return new Hono()
    .post("/discover", async c => {
      const input = discoverInput.parse(await c.req.json());
      const file = input.provider ? (await store.read("global", "models.json")).value : {};
      const stored = isRecord(file.providers) && isRecord(file.providers[input.provider!]) ? file.providers[input.provider!] as Json : undefined;
      // Stored credentials only go to the URL they were saved with.
      const same = stored?.baseUrl === input.baseUrl;
      const storedHeaders = same && isRecord(stored?.headers) ? stored.headers : {};
      const raw = input.headers ? withValues(input.headers, storedHeaders) ?? {} : storedHeaders as Record<string, string>;
      const headers = Object.fromEntries(Object.entries(raw).map(([name, value]) => [name, resolveValue(String(value), `${name} header`)]));
      const key = input.apiKey || (same && typeof stored?.apiKey === "string" ? stored.apiKey : "");
      return c.json(await discoverModels(input.api, input.baseUrl, key ? resolveValue(key, "API key") : "", headers, input.authHeader ?? stored?.authHeader === true));
    })
    .get("/raw", async c => c.json(await raw()))
    .put("/raw", async c => {
      const body = z.object({ revision, text: z.string().max(200_000) }).strict().parse(await c.req.json());
      await store.transform("global", body.revision, async current => {
        const next = unmaskJson(body.text, modelsSecrets(current));
        // A file Pi rejects loses every custom provider, so it is never written.
        const error = await piModelsError(next, path());
        if (error) throw new ConfigError(error);
        return next;
      }, "models.json");
      return c.json(await raw());
    })
    .get("/", async c => c.json(await view()))
    .post("/", async c => {
      const body = z.object({ revision, id: PROVIDER_ID, provider: providerInput }).strict().parse(await c.req.json());
      await save(body.revision, body.id, entries => {
        if (Object.hasOwn(entries, body.id)) throw new ConfigError(`models.json already defines "${body.id}".`);
        entries[body.id] = buildProvider(body.provider);
      });
      return c.json(await view());
    })
    .post("/restore", async c => {
      const body = z.object({ revision }).strict().parse(await c.req.json());
      await store.restore("global", body.revision, "models.json");
      return c.json(await view());
    })
    .put("/:id", async c => {
      const id = PROVIDER_ID.parse(c.req.param("id"));
      const body = z.object({ revision, provider: providerInput }).strict().parse(await c.req.json());
      await save(body.revision, id, entries => {
        const previous = entries[id];
        if (!isRecord(previous)) throw new ConfigError(`models.json does not define "${id}".`);
        entries[id] = buildProvider(body.provider, previous);
      });
      return c.json(await view());
    })
    .delete("/:id", async c => {
      const id = PROVIDER_ID.parse(c.req.param("id"));
      const body = z.object({ revision }).strict().parse(await c.req.json());
      await store.transform("global", body.revision, file => {
        const entries = providers(file);
        if (!Object.hasOwn(entries, id)) throw new ConfigError(`models.json does not define "${id}".`);
        delete entries[id];
        return file;
      }, "models.json");
      return c.json(await view());
    });
}
