// Code mode choices as pi-web's Settings › MCP offers them (lib/codemode-settings.ts and
// lib/powershell-settings.ts at pi-web fdeea87, MIT): "automatic" leaves `codemode` to the MCP
// extension, which activates it when a server with codemode exposure connects; "always" adds
// `+codemode` to the global `defaultTools`.
import { Hono } from "hono";
import { z } from "zod";
import type { CodemodePreference, CodemodeView, ProjectCodemodePreference } from "../shared/codemode.ts";
import { isRecord } from "./mcp-config.ts";
import { ConfigError, type ConfigStore } from "./store.ts";
import type { ProjectRegistry } from "./projects.ts";

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

/** What a project's own defaultTools says about codemode: nothing (inherit), on, or off. */
export function projectCodemodePreference(entries: readonly string[] | undefined): ProjectCodemodePreference {
  if (!entries) return "inherit";
  if (entries.some(entry => !isModifier(entry))) return resolveDefaultTools(entries).includes(CODEMODE) ? "always" : "automatic";
  const last = [...entries].reverse().find(namesCodemode);
  return last === undefined ? "inherit" : last.startsWith("-") ? "automatic" : "always";
}

/**
 * Project edit: drop entries naming codemode, then add +codemode or -codemode. A plain project list
 * replaces the user's selection, so "automatic" only drops codemode from it.
 */
export function withProjectCodemodePreference(entries: readonly string[] | undefined, preference: ProjectCodemodePreference): string[] | undefined {
  const kept = (entries ?? []).filter(entry => !namesCodemode(entry));
  const plain = kept.some(entry => !isModifier(entry));
  if (preference === "always") return [...kept, `+${CODEMODE}`];
  if (preference === "automatic" && !plain) return [...kept, `-${CODEMODE}`];
  return kept.length ? kept : undefined;
}

/** Pi's merge: a project list of only +/- entries changes the user's selection; a plain name replaces it. */
export function effectiveTools(user: readonly string[] | undefined, project: readonly string[] | undefined): string[] {
  const base = user === undefined ? [...DEFAULT_TOOLS] : resolveDefaultTools(user);
  if (!project) return base;
  if (project.some(entry => !isModifier(entry))) return resolveDefaultTools(project);
  return resolveDefaultTools([...base, ...project]);
}

function toolEntries(settings: Record<string, unknown>): string[] | undefined {
  const value = settings.defaultTools;
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some(entry => typeof entry !== "string")) {
    throw new ConfigError("defaultTools in settings.json must be a list of tool names. Repair it in Tools › Startup tools.");
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
    scope: "global",
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

function codemodeObject(settings: Record<string, unknown>) {
  const codemode = isRecord(settings.codemode) ? settings.codemode : {};
  const budget = codemode.inlineBudget;
  return {
    mode: codemode.mode === undefined ? undefined : codemode.mode === "only" ? "only" as const : "on" as const,
    inlineBudget: typeof budget === "number" && Number.isSafeInteger(budget) && budget >= 0 ? budget : undefined,
  };
}

async function readOr(store: ConfigStore, scope: "global" | "project", file?: "mcp.json"): Promise<Record<string, unknown>> {
  try { return (await store.read(scope, file)).value; }
  catch (error) { if (error instanceof ConfigError) return {}; throw error; }
}

/** The project's own choices, and what its sessions end up with after the global file. */
async function projectView(store: ConfigStore, projectStore: ConfigStore): Promise<CodemodeView> {
  const global = await readOr(store, "global");
  const { value: local, revision } = await projectStore.read("project");
  const own = codemodeObject(local), inherited = codemodeObject(global);
  const globalMcp = await readOr(store, "global", "mcp.json"), localMcp = await readOr(projectStore, "project", "mcp.json");
  const ownAuto = typeof localMcp.autoEnableCodemode === "boolean" ? localMcp.autoEnableCodemode : undefined;
  const extensions = [...(Array.isArray(global.extensions) ? global.extensions : []), ...(Array.isArray(local.extensions) ? local.extensions : [])];
  return {
    scope: "project",
    revision,
    preference: projectCodemodePreference(toolEntries(local)),
    mode: own.mode ?? "on",
    ...(own.mode ? { ownMode: own.mode } : {}),
    ...(own.inlineBudget !== undefined ? { inlineBudget: own.inlineBudget } : {}),
    defaultInlineBudget: DEFAULT_INLINE_BUDGET,
    autoEnableCodemode: ownAuto ?? true,
    ...(ownAuto !== undefined ? { ownAutoEnable: ownAuto } : {}),
    disabledByExtensions: extensions.lastIndexOf(`-builtin:${CODEMODE}`) > extensions.lastIndexOf(`+builtin:${CODEMODE}`),
    effective: {
      preference: effectiveTools(toolEntries(global), toolEntries(local)).includes(CODEMODE) ? "always" : "automatic",
      mode: own.mode ?? inherited.mode ?? "on",
      inlineBudget: own.inlineBudget ?? inherited.inlineBudget ?? DEFAULT_INLINE_BUDGET,
      autoEnableCodemode: ownAuto ?? (typeof globalMcp.autoEnableCodemode === "boolean" ? globalMcp.autoEnableCodemode : true),
    },
  };
}

const codemodePatch = z.object({
  revision: z.string().min(1).max(100),
  preference: z.enum(["automatic", "always", "inherit"]).optional(),
  mode: z.enum(["on", "only"]).nullable().optional(),
  inlineBudget: z.number().int().min(0).max(MAX_INLINE_BUDGET).nullable().optional(),
}).strict();

/** Apply mode/budget edits to the codemode object. In global scope "on" is Pi's default and is removed. */
function editCodemodeObject(settings: Record<string, unknown>, mode: "on" | "only" | null | undefined, inlineBudget: number | null | undefined, project: boolean) {
  if (mode === undefined && inlineBudget === undefined) return;
  if (settings.codemode !== undefined && !isRecord(settings.codemode)) throw new ConfigError("codemode in settings.json is not an object. Repair it first.");
  const codemode = { ...(settings.codemode as Record<string, unknown> | undefined) };
  if (mode === null || (mode === "on" && !project)) delete codemode.mode;
  else if (mode) codemode.mode = mode;
  if (inlineBudget === null) delete codemode.inlineBudget;
  else if (inlineBudget !== undefined) codemode.inlineBudget = inlineBudget;
  if (Object.keys(codemode).length) settings.codemode = codemode;
  else delete settings.codemode;
}

export function codemodeRoutes(store: ConfigStore, registry: ProjectRegistry) {
  return new Hono()
    .get("/", async c => {
      const project = c.req.query("project");
      if (project === undefined) return c.json(await codemodeView(store));
      return c.json(await projectView(store, registry.storeFor(await registry.require(project))));
    })
    .patch("/", async c => {
      const { revision, preference, mode, inlineBudget } = codemodePatch.parse(await c.req.json());
      const project = c.req.query("project");
      if (project !== undefined) {
        const projectStore = registry.storeFor(await registry.require(project));
        await projectStore.transform("project", revision, settings => {
          if (preference) {
            const next = withProjectCodemodePreference(toolEntries(settings), preference);
            if (next === undefined) delete settings.defaultTools;
            else settings.defaultTools = next;
          }
          editCodemodeObject(settings, mode, inlineBudget, true);
          return settings;
        });
        return c.json(await projectView(store, projectStore));
      }
      if (preference === "inherit" || mode === null) throw new ConfigError("The global settings have nothing to inherit from.");
      await store.transform("global", revision, settings => {
        if (preference) {
          const next = withCodemodePreference(toolEntries(settings), preference);
          if (next === undefined) delete settings.defaultTools;
          else settings.defaultTools = next;
        }
        editCodemodeObject(settings, mode, inlineBudget, false);
        return settings;
      });
      return c.json(await codemodeView(store));
    });
}
