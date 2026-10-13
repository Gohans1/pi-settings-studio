// Lists the models an endpoint offers, for the custom-provider form. Pi itself only discovers models
// through provider extensions (docs/custom-provider.md), so the endpoints follow each API's own docs.
import type { CustomModel } from "../shared/models.ts";
import { isRecord } from "./mcp-config.ts";
import { ConfigError } from "./store.ts";

/**
 * `$NAME` and `${NAME}` interpolation as Pi resolves models.json values (Pi 1.2.0,
 * dist/core/resolve-config-value.js, MIT, Copyright Mario Zechner): `$$` and `$!` escape, a missing
 * variable resolves to undefined. Commands (`!…`) are refused by the caller, never run.
 * tests/model-discovery.test.ts compares it with Pi's resolver.
 */
export function resolveTemplate(value: string, env: Record<string, string | undefined> = process.env): string | undefined {
  let missing = false;
  const resolved = value.replace(/\$(?:([$!])|\{([^}]*)\}|([A-Za-z_]\w*))/g, (match, escaped?: string, braced?: string, bare?: string) => {
    if (escaped) return escaped;
    if (braced !== undefined && !/^[A-Za-z_]\w*$/.test(braced)) return match;
    const found = env[(braced ?? bare)!] || process.env[(braced ?? bare)!] || undefined;
    if (found === undefined) missing = true;
    return found ?? "";
  });
  return missing ? undefined : resolved;
}

type Endpoint = { path: string; headers: (key: string, authHeader: boolean) => Record<string, string>; parse: (body: unknown) => CustomModel[] };

const bearer = (key: string): Record<string, string> => key ? { Authorization: `Bearer ${key}` } : {};
const list = (body: unknown, key: string) => isRecord(body) && Array.isArray(body[key]) ? body[key].filter(isRecord) : [];
const positive = (value: unknown) => typeof value === "number" && value > 0 ? value : undefined;
const defined = (model: Record<string, unknown>) => Object.fromEntries(Object.entries(model).filter(([, value]) => value !== undefined)) as CustomModel;

// OpenAI's /models; OpenRouter, vLLM and others add context and capability fields.
const openAiModels = (body: unknown) => list(body, "data").filter(model => typeof model.id === "string").map(model => {
  const architecture = isRecord(model.architecture) ? model.architecture : {};
  const top = isRecord(model.top_provider) ? model.top_provider : {};
  return defined({
    id: model.id, name: typeof model.name === "string" && model.name !== model.id ? model.name : undefined,
    contextWindow: positive(model.context_length) ?? positive(model.max_model_len), maxTokens: positive(top.max_completion_tokens),
    image: Array.isArray(architecture.input_modalities) && architecture.input_modalities.includes("image") ? true : undefined,
    reasoning: Array.isArray(model.supported_parameters) && model.supported_parameters.includes("reasoning") ? true : undefined,
  });
});

const ENDPOINTS: Record<string, Endpoint> = {
  "openai-completions": { path: "/models", headers: bearer, parse: openAiModels },
  "openai-responses": { path: "/models", headers: bearer, parse: openAiModels },
  // Pi's Mistral and Anthropic base URLs end before /v1.
  "mistral-conversations": { path: "/v1/models", headers: bearer, parse: openAiModels },
  "anthropic-messages": {
    path: "/v1/models",
    headers: (key, authHeader) => ({ "anthropic-version": "2023-06-01", ...(authHeader ? bearer(key) : key ? { "x-api-key": key } : {}) }),
    parse: body => list(body, "data").filter(model => typeof model.id === "string")
      .map(model => defined({ id: model.id, name: typeof model.display_name === "string" ? model.display_name : undefined })),
  },
  "google-generative-ai": {
    path: "/models",
    headers: (key): Record<string, string> => key ? { "x-goog-api-key": key } : {},
    parse: body => list(body, "models")
      .filter(model => typeof model.name === "string" && (!Array.isArray(model.supportedGenerationMethods) || model.supportedGenerationMethods.includes("generateContent")))
      .map(model => defined({
        id: String(model.name).replace(/^models\//, ""), name: typeof model.displayName === "string" ? model.displayName : undefined,
        contextWindow: positive(model.inputTokenLimit), maxTokens: positive(model.outputTokenLimit),
      })),
  },
};
export const DISCOVERY_APIS = Object.keys(ENDPOINTS);

/** Resolve a stored or typed value; commands are refused rather than run. */
export function resolveValue(value: string, what: string): string {
  if (value.startsWith("!")) throw new ConfigError(`The ${what} is a command, which listing models does not run. Type a key in the form to list once.`);
  const resolved = resolveTemplate(value);
  if (resolved === undefined) throw new ConfigError(`The ${what} names an environment variable this app cannot see.`);
  return resolved;
}

export async function discoverModels(api: string, baseUrl: string, key: string, headers: Record<string, string>, authHeader: boolean): Promise<CustomModel[]> {
  const endpoint = ENDPOINTS[api];
  if (!endpoint) throw new ConfigError(`Listing models works for ${DISCOVERY_APIS.join(", ")}; not for ${api}.`);
  if (!URL.canParse(baseUrl) || !/^https?:$/.test(new URL(baseUrl).protocol)) throw new ConfigError("The base URL must be an http or https URL.");
  const url = baseUrl.replace(/\/+$/, "") + endpoint.path;
  let response: Response;
  try {
    response = await fetch(url, { headers: { accept: "application/json", ...headers, ...endpoint.headers(key, authHeader) }, signal: AbortSignal.timeout(15_000), redirect: "error" });
  } catch (error) {
    throw new ConfigError(`Could not reach ${url}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!response.ok) throw new ConfigError(`${url} answered ${response.status} ${response.statusText}.`);
  let body: unknown;
  try { body = await response.json(); } catch { throw new ConfigError(`${url} did not answer with JSON.`); }
  return endpoint.parse(body).sort((a, b) => a.id.localeCompare(b.id));
}
