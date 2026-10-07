// Whole-file JSON editors for files that hold credentials: secret values are replaced by numbered
// ‹hidden N› placeholders before the text reaches the browser, and put back when it is saved.
// Numbering follows the secrets of the current file, which the revision check pins down.
import { isRecord } from "./mcp-config.ts";
import { maskArgs } from "./mcp-secrets.ts";
import { ConfigError } from "./store.ts";

type Json = Record<string, unknown>;
const SECRET_NAME = /(key|token|secret|passw|pwd|auth|bearer|credential)/i;
const TOKEN = /‹hidden (\d+)›/g;

const values = (group: unknown) => isRecord(group) ? Object.values(group).filter((value): value is string => typeof value === "string") : [];

/** The password of scheme://user:password@host and secret-named query values, as written in the URL. */
export function urlSecrets(url: string): string[] {
  const found: string[] = [];
  const auth = /^[a-z][a-z0-9+.-]*:\/\/[^/@:?#]*:([^/@?#]+)@/i.exec(url);
  if (auth) found.push(auth[1]!);
  const query = url.split("#")[0]!.split("?")[1];
  for (const pair of query?.split("&") ?? []) {
    const eq = pair.indexOf("=");
    if (eq > 0 && eq < pair.length - 1 && SECRET_NAME.test(pair.slice(0, eq))) found.push(pair.slice(eq + 1));
  }
  return found;
}

/** Secret values of an mcp.json (global or project). */
export function mcpSecrets(file: Json): string[] {
  const found: string[] = [];
  const servers = isRecord(file.mcpServers) ? Object.values(file.mcpServers) : [];
  for (const server of servers.filter(isRecord)) {
    const known = [...values(server.env), ...values(server.headers)];
    found.push(...known);
    if (isRecord(server.oauth) && typeof server.oauth.clientSecret === "string") found.push(server.oauth.clientSecret);
    if (Array.isArray(server.args)) found.push(...maskArgs(server.args.filter((arg): arg is string => typeof arg === "string"), known).hidden.values());
    if (typeof server.url === "string") found.push(...urlSecrets(server.url));
  }
  return unique(found);
}

/** Secret values of models.json: API keys and header values of providers, models and overrides. */
export function modelsSecrets(file: Json): string[] {
  const found: string[] = [];
  for (const provider of (isRecord(file.providers) ? Object.values(file.providers) : []).filter(isRecord)) {
    if (typeof provider.apiKey === "string") found.push(provider.apiKey);
    found.push(...values(provider.headers));
    for (const model of (Array.isArray(provider.models) ? provider.models : []).filter(isRecord)) found.push(...values(model.headers));
    for (const override of (isRecord(provider.modelOverrides) ? Object.values(provider.modelOverrides) : []).filter(isRecord)) found.push(...values(override.headers));
  }
  return unique(found);
}

/** Longest first, so a secret inside a longer one is replaced as part of it. Empty and tiny values are not secrets. */
function unique(list: string[]): string[] {
  return [...new Set(list.filter(value => value.length >= 4))].sort((a, b) => b.length - a.length || a.localeCompare(b));
}

function mapStrings(value: unknown, map: (text: string) => string): unknown {
  if (typeof value === "string") return map(value);
  if (Array.isArray(value)) return value.map(item => mapStrings(item, map));
  if (isRecord(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, mapStrings(item, map)]));
  return value;
}

export function maskJson(value: Json, secrets: string[]): string {
  const masked = mapStrings(value, text => secrets.reduce((out, secret, i) => out.split(secret).join(`‹hidden ${i + 1}›`), text));
  return JSON.stringify(masked, null, 2) + "\n";
}

export function unmaskJson(text: string, secrets: string[]): Json {
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new ConfigError("The text must be valid JSON."); }
  if (!isRecord(parsed)) throw new ConfigError("The file must contain a JSON object.");
  return mapStrings(parsed, value => value.replace(TOKEN, (token, n: string) => {
    const secret = secrets[Number(n) - 1];
    if (secret === undefined) throw new ConfigError(`${token} is not a placeholder of this file. Type the value again, or reload the file.`);
    return secret;
  })) as Json;
}
