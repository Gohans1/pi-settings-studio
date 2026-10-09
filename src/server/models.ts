import { join } from "node:path";
import { Hono } from "hono";
import { z } from "zod";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { getSupportedThinkingLevels, InMemoryCredentialStore, type Api, type Credential, type CredentialInfo, type CredentialStore, type Model } from "@earendil-works/pi-ai";
import type { AvailableModel, ModelScopeView, ModelSummary, ProvidersView, ProviderView } from "../shared/models.ts";
import { resolveModelScope } from "./model-scope.ts";
import { isRecord } from "./mcp-config.ts";
import { ConfigError, type ConfigStore } from "./store.ts";
import { customProviderRoutes } from "./models-json.ts";

/** auth.json as read under our lock, handed to Pi's runtime so it can never write credentials itself. */
class ReadOnlyCredentials implements CredentialStore {
  constructor(private readonly credentials: Record<string, Credential>) {}
  async read(providerId: string) { return this.credentials[providerId]; }
  async list(): Promise<readonly CredentialInfo[]> {
    return Object.entries(this.credentials).map(([providerId, credential]) => ({ providerId, type: credential.type }));
  }
  async modify(): Promise<never> { throw new Error("Credentials are read-only here."); }
  async delete(): Promise<never> { throw new Error("Credentials are read-only here."); }
}

const credentialsOf = (value: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(value).filter(([, entry]) => isRecord(entry) && (entry.type === "api_key" || entry.type === "oauth"))) as Record<string, Credential>;

/** Pi's model runtime without network access: no catalog refresh and no availability checks. */
async function runtimeFor(agentDir: string, credentials: Record<string, Credential>) {
  return ModelRuntime.create({
    credentials: new ReadOnlyCredentials(credentials),
    modelsPath: join(agentDir, "models.json"),
    modelsStorePath: join(agentDir, "models-store.json"),
    allowModelNetwork: false,
    refreshOnCreate: false,
  });
}

function summary(model: Model<Api>): ModelSummary {
  return {
    id: model.id, name: model.name, reasoning: !!model.reasoning,
    ...(model.contextWindow > 0 ? { contextWindow: model.contextWindow } : {}),
    ...(model.maxTokens > 0 ? { maxTokens: model.maxTokens } : {}),
    ...(model.input.includes("image") ? { image: true } : {}),
    thinkingLevels: getSupportedThinkingLevels(model),
    ...(model.cost.input || model.cost.output ? { cost: { input: model.cost.input, output: model.cost.output } } : {}),
  };
}

export function modelRoutes(store: ConfigStore, agentDir: string) {
  // The providers Pi ships do not change while it runs: a runtime without models.json lists them once.
  let shipped: Promise<Set<string>> | undefined;
  const builtIns = () => shipped ??= ModelRuntime.create({
    credentials: new InMemoryCredentialStore(), modelsPath: null, modelsStorePath: join(agentDir, "models-store.json"),
    allowModelNetwork: false, refreshOnCreate: false,
  }).then(runtime => new Set(runtime.getProviders().map(provider => provider.id)));

  async function view(): Promise<ProvidersView> {
    const { value, revision } = await store.read("global", "auth.json");
    const credentials = credentialsOf(value);
    let custom: string[] = [];
    try {
      const models = (await store.read("global", "models.json")).value;
      if (isRecord(models.providers)) custom = Object.keys(models.providers);
    } catch (error) { if (!(error instanceof ConfigError)) throw error; }
    const [runtime, shippedIds] = await Promise.all([runtimeFor(agentDir, credentials), builtIns()]);
    const providers = runtime.getProviders().map((provider): ProviderView => {
      const others = runtime.getAllModels(provider.id).filter(model => model.type === "image" || model.type === "classifier");
      const count = (type: string) => others.filter(model => model.type === type).length;
      // Pi's order: a stored credential first, then models.json. Pi fills "stored" during an
      // availability refresh, which may run credential commands, so it is read from auth.json here.
      // ponytail: environment variables are not checked (Pi checks them in its own environment).
      const status: { configured: boolean; source?: string; label?: string } = credentials[provider.id]
        ? { configured: true, source: "stored" } : runtime.getProviderAuthStatus(provider.id);
      return {
        id: provider.id,
        name: provider.name,
        models: runtime.getModels(provider.id).length,
        keySetup: !!provider.auth.apiKey?.login,
        ...(provider.auth.oauth ? { oauth: { name: provider.auth.oauth.name, subscription: !!provider.auth.oauth.isSubscription } } : {}),
        auth: { configured: status.configured, ...(status.source ? { source: status.source } : {}), ...(status.label ? { label: status.label } : {}) },
        ...(credentials[provider.id] ? { stored: credentials[provider.id]!.type } : {}),
        custom: custom.includes(provider.id),
        builtIn: shippedIds.has(provider.id),
        ...(provider.auth.apiKey?.name ? { keyName: provider.auth.apiKey.name } : {}),
        ...(provider.baseUrl ? { baseUrl: provider.baseUrl } : {}),
        ...(others.length ? { otherModels: { ...(count("image") ? { image: count("image") } : {}), ...(count("classifier") ? { classifier: count("classifier") } : {}) } } : {}),
      };
    });
    const error = runtime.getError();
    return { revision, providers, ...(error ? { error } : {}) };
  }

  /**
   * Models of providers that are set up: stored in auth.json or configured per Pi's status, which
   * runs no credential command. Pi's own startup also counts environment keys this app cannot see.
   */
  async function readyModels() {
    const auth = credentialsOf((await store.read("global", "auth.json")).value);
    const runtime = await runtimeFor(agentDir, auth);
    const all = runtime.getProviders(), ready = all.filter(provider => auth[provider.id] || runtime.getProviderAuthStatus(provider.id).configured);
    return { models: ready.flatMap(provider => runtime.getModels(provider.id)), providers: { all: all.map(provider => provider.id), ready: ready.map(provider => provider.id) } };
  }

  async function knownProvider(id: string, credentials: Record<string, Credential>) {
    const provider = (await runtimeFor(agentDir, credentials)).getProvider(id);
    if (!provider) throw new ConfigError(`Pi has no provider named "${id}".`);
    return provider;
  }

  return new Hono()
    .route("/custom", customProviderRoutes(store))
    .get("/providers", async c => c.json(await view()))
    .get("/available", async c => c.json((await readyModels()).models.map((model): AvailableModel => ({ provider: model.provider, ...summary(model) }))))
    .post("/scope", async c => {
      const { patterns, default: chosen } = z.object({ patterns: z.array(z.string().max(300)).max(200), default: z.string().max(400).optional() }).strict().parse(await c.req.json());
      const { models, providers } = await readyModels();
      const ref = (model: { provider: string; id: string }) => `${model.provider}/${model.id}`;
      const each = patterns.map(pattern => {
        const matched = resolveModelScope([pattern], models).scopedModels.map(scoped => ref(scoped.model));
        // A "provider/…" pattern names its provider; say why it selects nothing.
        const named = /^([^/*?[]+)\//.exec(pattern)?.[1];
        const reason = matched.length ? undefined : !named ? "no-match" as const
          : !providers.all.includes(named) ? "unknown-provider" as const : !providers.ready.includes(named) ? "no-credential" as const : "no-match" as const;
        return { pattern, matches: matched.length, models: matched, ...(reason ? { reason } : {}) };
      });
      const scoped = resolveModelScope(patterns, models).scopedModels.map(scoped => ref(scoped.model));
      const known = chosen !== undefined && models.some(model => ref(model) === chosen);
      const view: ModelScopeView = { patterns: each, ...(scoped[0] ? { first: scoped[0] } : {}), ...(known ? { defaultInScope: scoped.includes(chosen!) } : {}) };
      return c.json(view);
    })
    .get("/providers/:id/models", async c => {
      const runtime = await runtimeFor(agentDir, credentialsOf((await store.read("global", "auth.json")).value));
      const id = c.req.param("id");
      if (!runtime.getProvider(id)) return c.json({ error: `Pi has no provider named "${id}".` }, 404);
      return c.json(runtime.getModels(id).map(summary));
    })
    .post("/auth/restore", async c => {
      const { revision } = z.object({ revision: z.string().min(1).max(100) }).strict().parse(await c.req.json());
      await store.restore("global", revision, "auth.json");
      return c.json(await view());
    })
    .delete("/providers/:id/key", async c => {
      const { revision } = z.object({ revision: z.string().min(1).max(100) }).strict().parse(await c.req.json());
      const id = c.req.param("id");
      await store.transform("global", revision, async auth => {
        await knownProvider(id, credentialsOf(auth));
        if (!Object.hasOwn(auth, id)) throw new ConfigError(`auth.json has no credential for ${id}.`);
        delete auth[id];
        return auth;
      }, "auth.json");
      return c.json(await view());
    });
}
