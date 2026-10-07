// MCP args and URLs can carry credentials (`--api-key <key>`, `?token=…`, `user:pass@`). Like
// pi-web, parts that look like secrets are replaced by placeholders before reaching the browser;
// an edit that keeps a placeholder keeps the stored value.
import { ConfigError } from "./store.ts";

const SECRET_NAME = /(key|token|secret|passw|pwd|auth|bearer|credential)/i;
const HIDDEN = "‹hidden";
const placeholder = (n: number) => `‹hidden ${n}›`;

/** Mask args after a secret-named option, `--secret-option=value` values, and copies of env values. */
export function maskArgs(args: string[], knownSecrets: string[]): { masked: string[]; hidden: Map<string, string> } {
  const known = knownSecrets.filter(value => value.length >= 6);
  const hidden = new Map<string, string>();
  const hide = (value: string) => {
    const token = placeholder(hidden.size + 1);
    hidden.set(token, value);
    return token;
  };
  const masked = args.map((arg, i) => {
    const previous = i > 0 ? args[i - 1]! : "";
    if (previous.startsWith("-") && !previous.includes("=") && SECRET_NAME.test(previous) && !arg.startsWith("-")) return hide(arg);
    const inline = /^(-{1,2}[^=]+)=(.+)$/.exec(arg);
    if (inline && SECRET_NAME.test(inline[1]!)) return `${inline[1]}=${hide(inline[2]!)}`;
    if (known.includes(arg)) return hide(arg);
    return arg;
  });
  return { masked, hidden };
}

/** Put stored values back where the browser kept their placeholders. */
export function unmaskArgs(args: string[], stored: string[], knownSecrets: string[]): string[] {
  const { hidden } = maskArgs(stored, knownSecrets);
  return args.map(arg => {
    const restored = arg.replace(/‹hidden \d+›/g, token => hidden.get(token) ?? token);
    if (restored.includes(HIDDEN)) throw new ConfigError("An argument still holds a ‹hidden› placeholder that no longer matches a stored value. Type the value again.");
    return restored;
  });
}

function decode(text: string): string {
  try { return decodeURIComponent(text); } catch { return text; }
}

/** Mask the password of `scheme://user:password@host` and secret-named query values. */
export function maskUrl(url: string): string {
  const hashAt = url.indexOf("#");
  const base = hashAt === -1 ? url : url.slice(0, hashAt);
  const queryAt = base.indexOf("?");
  const head = (queryAt === -1 ? base : base.slice(0, queryAt)).replace(/^([a-z][a-z0-9+.-]*:\/\/[^/@:?#]*):([^/@?#]+)@/i, `$1:${HIDDEN}›@`);
  const query = queryAt === -1 ? undefined : base.slice(queryAt + 1).split("&").map(pair => {
    const eq = pair.indexOf("=");
    return eq > 0 && eq < pair.length - 1 && SECRET_NAME.test(decode(pair.slice(0, eq))) ? `${pair.slice(0, eq)}=${HIDDEN}›` : pair;
  }).join("&");
  return head + (query === undefined ? "" : `?${query}`) + (hashAt === -1 ? "" : url.slice(hashAt));
}

/** An unchanged masked URL keeps the stored one; a URL that still holds a placeholder is refused. */
export function unmaskUrl(url: string, stored: string | undefined): string {
  if (stored !== undefined && url === maskUrl(stored)) return stored;
  if (url.includes(HIDDEN)) throw new ConfigError("The URL still holds a ‹hidden› placeholder. Type the full URL again, or keep the hidden part unchanged.");
  return url;
}
