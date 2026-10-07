// Code mode choices as pi-web's Settings › MCP offers them (lib/codemode-settings.ts and
// lib/powershell-settings.ts at pi-web fdeea87, MIT): "automatic" leaves `codemode` to the MCP
// extension, which activates it when a server with codemode exposure connects; "always" adds
// `+codemode` to the global `defaultTools`.
import { Hono } from "hono";
import { z } from "zod";
import type { CodemodePreference, CodemodeView } from "../shared/codemode.ts";
import { isRecord } from "./mcp-config.ts";
import { ConfigError, type ConfigStore } from "./store.ts";

const CODEMODE = "codemode";
const DEFAULT_TOOLS = ["read", "bash", "edit", "write"];
export const DEFAULT_INLINE_BUDGET = 3000;
const MAX_INLINE_BUDGET = 1_000_000;

const isModifier = (entry: string) => entry.startsWith("+") || entry.startsWith("-");
const namesCodemode = (entry: string) => (isModifier(entry) ? entry.slice(1) : entry) === CODEMODE;

/** Pi's rule: plain names form the selection (else the defaults), then `+name`/`-name` apply in order. */
export function resolveDefaultTools(entries: readonly string[]): string[] {
  const plain = entries.filter(entry => !isModifier(entry));
  const tools = plain.length > 0 || entries.length === 0 ? plain : [...DEFAULT_TOOLS];
  for (const entry of entries) {
    if (!isModifier(entry)) continue;
    const name = entry.slice(1);
    const index = tools.indexOf(name);
    if (entry.startsWith("+") && index === -1 && name) tools.push(name);
    else if (entry.startsWith("-") && index !== -1) tools.splice(index, 1);
  }
  return tools;
}

export function codemodePreferenceOf(entries: readonly string[] | undefined): CodemodePreference {
  return entries !== undefined && resolveDefaultTools(entries).includes(CODEMODE) ? "always" : "automatic";
}

/**
 * Minimal edit: drop every entry naming codemode; "always" appends `+codemode`. Undefined means
 * remove the key, because an emptied modifier-only list would read as "no built-in tools".
 */
export function withCodemodePreference(entries: readonly string[] | undefined, preference: CodemodePreference): string[] | undefined {
  const kept = (entries ?? []).filter(entry => !namesCodemode(entry));
  if (preference === "always") return [...kept, `+${CODEMODE}`];
  if (kept.length > 0) return kept;
  return entries !== undefined && entries.some(entry => !isModifier(entry)) ? [] : undefined;
}

function toolEntries(settings: Record<string, unknown>): string[] | undefined {
  const value = settings.defaultTools;
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some(entry => typeof entry !== "string")) {
    throw new ConfigError("defaultTools in settings.json must be a list of tool names. Repair it in the General tab.");
  }
  return value;
}

async function codemodeView(store: ConfigStore): Promise<CodemodeView> {
  const { value: settings, revision } = await store.read("global");
  let autoEnableCodemode = true;
  try {
    const mcp = (await store.read("global", "mcp.json")).value;
    if (typeof mcp.autoEnableCodemode === "boolean") autoEnableCodemode = mcp.autoEnableCodemode;
  } catch (error) { if (!(error instanceof ConfigError)) throw error; }
  const codemode = isRecord(settings.codemode) ? settings.codemode : {};
  const budget = codemode.inlineBudget;
  return {
    revision,
    preference: codemodePreferenceOf(toolEntries(settings)),
    // Pi reads anything but "only" as "on".
    mode: codemode.mode === "only" ? "only" : "on",
    ...(typeof budget === "number" && Number.isSafeInteger(budget) && budget >= 0 ? { inlineBudget: budget } : {}),
    defaultInlineBudget: DEFAULT_INLINE_BUDGET,
    autoEnableCodemode,
    disabledByExtensions: Array.isArray(settings.extensions) && settings.extensions.includes(`-builtin:${CODEMODE}`),
  };
}

const codemodePatch = z.object({
  revision: z.string().min(1).max(100),
  preference: z.enum(["automatic", "always"]).optional(),
  mode: z.enum(["on", "only"]).optional(),
  inlineBudget: z.number().int().min(0).max(MAX_INLINE_BUDGET).nullable().optional(),
}).strict();

export function codemodeRoutes(store: ConfigStore) {
  return new Hono()
    .get("/", async c => c.json(await codemodeView(store)))
    .patch("/", async c => {
      const { revision, preference, mode, inlineBudget } = codemodePatch.parse(await c.req.json());
      await store.transform("global", revision, settings => {
        if (preference) {
          const next = withCodemodePreference(toolEntries(settings), preference);
          if (next === undefined) delete settings.defaultTools;
          else settings.defaultTools = next;
        }
        if (mode !== undefined || inlineBudget !== undefined) {
          if (settings.codemode !== undefined && !isRecord(settings.codemode)) throw new ConfigError("codemode in settings.json is not an object. Repair it first.");
          const codemode = { ...(settings.codemode as Record<string, unknown> | undefined) };
          // "on" and an empty budget are Pi's defaults: remove the keys.
          if (mode === "on") delete codemode.mode;
          else if (mode) codemode.mode = mode;
          if (inlineBudget === null) delete codemode.inlineBudget;
          else if (inlineBudget !== undefined) codemode.inlineBudget = inlineBudget;
          if (Object.keys(codemode).length) settings.codemode = codemode;
          else delete settings.codemode;
        }
        return settings;
      });
      return c.json(await codemodeView(store));
    });
}
