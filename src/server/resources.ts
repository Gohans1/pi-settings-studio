// Resource listing and toggles the way `pi config` does them (Pi 1.0.3, re-checked against 1.1.0;
// dist/modes/interactive/components/config-selector.js, MIT): Pi's DefaultPackageManager resolves
// the resources; a toggle writes `+pattern`/`-pattern` to the settings array, or to the
// package's own filter for package resources.
import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, relative } from "node:path";
import { Hono } from "hono";
import { z } from "zod";
import { DefaultPackageManager, loadSkills, parseFrontmatter, ProjectTrustStore, SettingsManager, type ResolvedResource } from "@earendil-works/pi-coding-agent";
import type { PackageUpdateCheck, PackageView, PluginsView, ResourceType, ResourceView, SkillsView } from "../shared/resources.ts";
import type { ToolSource, ToolsView } from "../shared/plugin-tools.ts";
import { isRecord, mcpNamespace, readMcpServers } from "./mcp-config.ts";
import { ConfigError, type ConfigStore, type DocumentName, type Scope } from "./store.ts";
import type { ProjectRegistry } from "./projects.ts";
import { runProvidersProbe, runToolProbe, runToolsProbe } from "./plugin-tools.ts";
import type { ExtensionProviderSource } from "./models.ts";
import { Inspections } from "./inspections.ts";
import { knownSecrets, redact } from "./jobs.ts";
import { changeUpdateCache, DAY, readUpdateCache } from "./update-cache.ts";

/** Pi's built-in extensions, as named in docs/settings.md (a test keeps the two in step). */
export const BUILTIN_EXTENSIONS = ["mcp", "llama.cpp", "codemode", "tool-search"];
const BUILTIN_PREFIX = "builtin:";

/**
 * The home folder as Pi takes it when it runs: HOME, else the system's (Pi 1.1.0 dist/core/package-manager.js
 * getHomeDir, MIT, Copyright Mario Zechner). Bun's homedir() keeps the HOME the process started with.
 */
export const piHome = () => process.env.HOME || homedir();

function formatBaseDir(baseDir: string): string {
  const home = piHome();
  const display = baseDir === home ? "~" : baseDir.startsWith(home) ? `~${baseDir.slice(home.length).replace(/\\/g, "/")}` : baseDir.replace(/\\/g, "/");
  return display.endsWith("/") ? display : `${display}/`;
}

function groupLabel(metadata: ResolvedResource["metadata"], agentDir: string): string {
  if (metadata.origin === "package") return `${metadata.source} (${metadata.scope})`;
  if (metadata.source === "builtin") return metadata.scope === "user" ? "Built-in" : "Built-in (project override)";
  if (metadata.source === "auto") {
    if (metadata.baseDir) return metadata.scope === "user" ? `User (${formatBaseDir(metadata.baseDir)})` : `Project (${formatBaseDir(metadata.baseDir)})`;
    return metadata.scope === "user" ? `User (${formatBaseDir(agentDir)})` : "Project (.pi/)";
  }
  return metadata.scope === "user" ? "User settings" : "Project settings";
}

type Settings = Record<string, unknown>;
type Project = { dir: string; settings: Settings };

/**
 * Pi's own resolver over the given settings, read-only. With a project, its .pi settings and
 * resources are included as if the project were trusted (the trust panel says whether Pi
 * loads them). Missing packages are skipped, never installed: nothing runs to display configuration.
 */
function packageManager(agentDir: string, global: Settings, project?: Project) {
  // Listing must run nothing. Pi looks for packages installed globally by old versions with
  // `<npmCommand> root -g`, and npmCommand can come from an untrusted project's settings. So the
  // command is dropped and that lookup is turned off on this instance (a private Pi method;
  // tests/resources-safety.test.ts fails if Pi renames it and a command runs again).
  const { npmCommand: _global, ...globalSettings } = global;
  const { npmCommand: _project, ...projectSettings } = project?.settings ?? {};
  const texts = { global: JSON.stringify(globalSettings), project: project && JSON.stringify(projectSettings) };
  const storage: Parameters<typeof SettingsManager.fromStorage>[0] = { withLock: (scope, read) => { read(texts[scope]); } };
  const settingsManager = SettingsManager.fromStorage(storage, { projectTrusted: !!project });
  const manager = new DefaultPackageManager({ cwd: project?.dir ?? agentDir, agentDir, settingsManager, builtinExtensions: BUILTIN_EXTENSIONS });
  Object.defineProperty(manager, "getLegacyGlobalNpmInstallPath", { value: () => undefined });
  return manager;
}

export async function resolveResources(agentDir: string, global: Settings, project?: Project) {
  return packageManager(agentDir, global, project).resolve(async () => "skip");
}
export const resolveUserResources = (agentDir: string, settings: Settings) => resolveResources(agentDir, settings);

/** Patterns are relative to the base folder of the settings file that holds them, as in pi config. */
function patternFor(item: ResolvedResource, base: string): string {
  if (item.metadata.origin === "package") return relative(item.metadata.baseDir ?? dirname(item.path), item.path);
  if (item.metadata.source === "builtin") return item.path;
  return relative(item.metadata.baseDir ?? base, item.path);
}

const withoutPattern = (entries: unknown, pattern: string) =>
  (Array.isArray(entries) ? entries.filter((entry): entry is string => typeof entry === "string") : [])
    .filter(entry => (/^[!+-]/.test(entry) ? entry.slice(1) : entry) !== pattern);

/** `pi config`'s toggle for one resource, applied to the settings of the resource's own scope. */
export function toggleResource(settings: Settings, type: ResourceType, item: ResolvedResource, enabled: boolean, base: string): Settings {
  const pattern = patternFor(item, base);
  const entry = `${enabled ? "+" : "-"}${pattern}`;
  if (item.metadata.origin === "top-level") {
    settings[type] = [...withoutPattern(settings[type], pattern), entry];
    return settings;
  }
  const packages = Array.isArray(settings.packages) ? [...settings.packages] : [];
  const index = packages.findIndex(pkg => (typeof pkg === "string" ? pkg : isRecord(pkg) ? pkg.source : undefined) === item.metadata.source);
  if (index === -1) throw new ConfigError("The package that provides this resource is no longer in settings.json.");
  const pkg: Record<string, unknown> = typeof packages[index] === "string" ? { source: packages[index] } : { ...(packages[index] as Record<string, unknown>) };
  pkg[type] = [...withoutPattern(pkg[type], pattern), entry];
  packages[index] = pkg;
  settings.packages = packages;
  return settings;
}

/** Display names as `pi config` shows them. */
function displayName(type: ResourceType, item: ResolvedResource): string {
  const file = basename(item.path);
  const parent = basename(dirname(item.path));
  if (item.metadata.source === "builtin") return item.path.slice(BUILTIN_PREFIX.length);
  if (type === "extensions") return parent !== "extensions" ? `${parent}/${file}` : file;
  if (type === "skills" && file === "SKILL.md") return parent;
  return type === "prompts" ? file.replace(/\.md$/, "") : file;
}

async function describe(type: ResourceType, item: ResolvedResource, agentDir: string): Promise<ResourceView> {
  let name = displayName(type, item);
  let description: string | undefined;
  let disableModelInvocation: boolean | undefined;
  // Only Markdown carries frontmatter; extension code is never read, let alone run.
  if (type === "skills" || type === "prompts") {
    try {
      const { frontmatter } = parseFrontmatter<Record<string, unknown>>(await readFile(item.path, "utf8"));
      if (type === "skills" && typeof frontmatter.name === "string" && frontmatter.name) name = frontmatter.name;
      if (typeof frontmatter.description === "string") description = frontmatter.description;
      if (frontmatter["disable-model-invocation"] === true) disableModelInvocation = true;
    } catch { /* Pi reports unreadable files itself; show the file name */ }
  }
  return { type, path: item.path, name, description, enabled: item.enabled, origin: item.metadata.origin, scope: item.metadata.scope,
    group: groupLabel(item.metadata, agentDir), ...(disableModelInvocation ? { disableModelInvocation } : {}) };
}

type ScopeName = "global" | "project";
const scopeOf = (item: ResolvedResource): ScopeName => item.metadata.scope === "project" ? "project" : "global";

/** Shared by Skills and Plugins: read both files, resolve, and toggle within one scope's file. */
export function resourceContext(store: ConfigStore, registry: ProjectRegistry, agentDir: string) {
  async function load(project: string | undefined) {
    const dir = project === undefined ? undefined : await registry.require(project);
    const projectStore = dir ? registry.storeFor(dir) : undefined;
    const global = await store.read("global");
    const local = projectStore ? await projectStore.read("project") : undefined;
    return { dir, projectStore, global, local };
  }
  async function resolve(project: string | undefined) {
    const { dir, global, local } = await load(project);
    const resolved = await resolveResources(agentDir, global.value, dir ? { dir, settings: local!.value } : undefined);
    return { resolved, revision: global.revision, ...(local ? { projectRevision: local.revision } : {}), manager: packageManager(agentDir, global.value, dir ? { dir, settings: local!.value } : undefined),
      settings: { global: global.value, ...(local ? { project: local.value } : {}) } };
  }
  async function toggle(project: string | undefined, scope: ScopeName, revision: string, enabled: boolean, items: { type: ResourceType; path: string }[]) {
    const { dir, projectStore, global } = await load(project);
    if (scope === "project" && (!dir || !projectStore)) throw new ConfigError("Choose a project first.", 400);
    const target = scope === "project" ? projectStore! : store;
    await target.transform(scope, revision, async settings => {
      // Resolve against the file being edited, so a concurrent change cannot slip in between.
      const resolved = scope === "project"
        ? await resolveResources(agentDir, global.value, { dir: dir!, settings })
        : await resolveResources(agentDir, settings, dir ? { dir, settings: (await projectStore!.read("project")).value } : undefined);
      for (const { type, path } of items) {
        const item = resolved[type].find(entry => entry.path === path);
        if (!item) throw new ConfigError("A resource is no longer discovered. Reload the list.");
        if (scopeOf(item) !== scope) throw new ConfigError(`${basename(path)} belongs to the ${scopeOf(item)} settings, not the ${scope} ones.`);
        toggleResource(settings, type, item, enabled, scope === "project" ? join(dir!, ".pi") : agentDir);
      }
      return settings;
    });
  }
  return { resolve, toggle };
}

const toggleBody = { scope: z.enum(["global", "project"]).default("global"), revision: z.string().min(1).max(100), enabled: z.boolean() };

/**
 * Of two enabled skills with one name, Pi loads the first in resolver order: its own loader, called
 * as its ResourceLoader calls it (it reads SKILL.md files only). Maps each skipped skill to the winner.
 */
export function skillCollisions(resolved: ResolvedResource[], agentDir: string, cwd: string): Map<string, string> {
  const { diagnostics } = loadSkills({ cwd, agentDir, skillPaths: resolved.filter(item => item.enabled).map(item => item.path), includeDefaults: false });
  return new Map(diagnostics.flatMap(diagnostic => diagnostic.collision ? [[diagnostic.collision.loserPath, diagnostic.collision.winnerPath] as const] : []));
}

export function skillRoutes(store: ConfigStore, registry: ProjectRegistry, agentDir: string) {
  const context = resourceContext(store, registry, agentDir);
  async function view(project: string | undefined): Promise<SkillsView> {
    const { resolved, revision, projectRevision } = await context.resolve(project);
    const dir = project === undefined ? undefined : await registry.require(project);
    const winners = skillCollisions(resolved.skills, agentDir, dir ?? agentDir);
    const skills = await Promise.all(resolved.skills.map(async item => {
      const view = await describe("skills", item, agentDir);
      const winner = item.enabled ? winners.get(item.path) : undefined;
      return winner ? { ...view, shadowedBy: winner } : view;
    }));
    return { revision, ...(projectRevision ? { projectRevision } : {}), skills };
  }
  return new Hono()
    .get("/", async c => c.json(await view(c.req.query("project"))))
    .patch("/", async c => {
      const project = c.req.query("project");
      const { scope, revision, paths, enabled } = z.object({ ...toggleBody, paths: z.array(z.string().max(4096)).min(1).max(1000) }).strict().parse(await c.req.json());
      await context.toggle(project, scope, revision, enabled, paths.map(path => ({ type: "skills" as const, path })));
      return c.json(await view(project));
    });
}

/**
 * What an inspection reads besides the settings: the MCP and credential files and the extensions' own
 * files. A file an extension imports, or a server whose tools change, waits for Refresh tools or the age limit.
 */
async function inspectionStamp(store: ConfigStore, projectStore: ConfigStore | undefined, agentDir: string, settings: (string | undefined)[], paths: string[]) {
  const revision = (target: ConfigStore | undefined, scope: Scope, file: DocumentName) => target?.read(scope, file).then(document => document.revision, () => "unreadable");
  const modified = (path: string) => stat(path).then(info => info.mtimeMs, () => 0);
  return JSON.stringify([...settings, await revision(store, "global", "mcp.json"), await revision(projectStore, "project", "mcp.json"),
    await revision(store, "global", "auth.json"), await modified(join(agentDir, "mcp-auth.json")),
    ...await Promise.all(paths.map(async path => path.startsWith(BUILTIN_PREFIX) ? path : `${path}@${await modified(path)}`))]);
}

/** A tool inspection's result, or its error, with known credentials hidden. */
async function redacted<T>(known: string[] | Promise<string[]>, run: () => Promise<T>): Promise<T> {
  const secrets = await known;
  try { return redact(await run(), secrets); } catch (error) {
    if (error instanceof ConfigError) throw new ConfigError(redact(error.message, secrets), error.status);
    throw error;
  }
}

/** The MCP servers a session loads here, each on or off: the global file, then the project's overrides and servers, as Pi merges them. */
async function mcpServersOf(store: ConfigStore, projectStore?: ConfigStore): Promise<Map<string, boolean>> {
  async function file(target: ConfigStore, scope: Scope) {
    try { return (await target.read(scope, "mcp.json")).value; } catch (error) { if (error instanceof ConfigError) return {}; throw error; }
  }
  const configs = new Map(readMcpServers(await file(store, "global")).servers.flatMap(server => server.config ? [[server.name, server.config] as const] : []));
  if (projectStore) for (const server of readMcpServers(await file(projectStore, "project"), new Map(configs)).servers) if (server.config) configs.set(server.name, server.config);
  return new Map([...configs].map(([name, config]) => [name, config.enabled !== false]));
}

/** Every tool a new session registers, with the Pi feature, extension or MCP server it comes from, and the sources it takes none from. */
export function toolRoutes(store: ConfigStore, registry: ProjectRegistry, agentDir: string, inspections = new Inspections()) {
  const context = resourceContext(store, registry, agentDir);
  return new Hono().post("/", async c => {
    const { fresh } = z.object({ fresh: z.boolean().optional() }).strict().parse(await c.req.json());
    const project = c.req.query("project");
    const { resolved, settings, revision, projectRevision } = await context.resolve(project);
    const projectStore = project ? registry.storeFor(project) : undefined;
    const extensions = new Map(await Promise.all(resolved.extensions.map(async item => [item.path, await describe("extensions", item, agentDir)] as const)));
    const servers = await mcpServersOf(store, projectStore);
    function sourceOf(path: string, namespace?: string): ToolSource {
      // Server names as configured: tool names only carry the sanitized namespace.
      if (path === BUILTIN_PREFIX + "mcp" && namespace?.startsWith("mcp__")) {
        return { kind: "mcp", server: [...servers.keys()].find(name => mcpNamespace(name) === namespace) ?? namespace.slice("mcp__".length) };
      }
      const extension = extensions.get(path);
      if (extension) return { kind: "extension", name: extension.name, group: extension.group };
      return path.startsWith(BUILTIN_PREFIX) ? { kind: "pi" } : { kind: "extension", name: basename(path) };
    }
    const paths = resolved.extensions.filter(item => item.enabled).map(item => item.path);
    const stamp = await inspectionStamp(store, projectStore, agentDir, [revision, projectRevision], paths);
    return c.json(await inspections.get(`tools\0${project ?? ""}`, stamp, !!fresh, signal => redacted(knownSecrets(store, projectStore), async (): Promise<ToolsView> => {
      const view = await runToolsProbe({
        agentDir, cwd: project ?? agentDir, project: !!project, paths,
        globalSettings: settings.global, projectSettings: settings.project,
      }, signal);
      const tools = view.tools.map(({ path, namespace, ...tool }) => ({ ...tool, source: sourceOf(path, namespace) }));
      const used = new Set(tools.map(tool => JSON.stringify(tool.source)));
      const idle = (source: ToolSource, on: boolean) => used.has(JSON.stringify(source)) ? [] : [{ source, status: on ? "empty" as const : "off" as const }];
      const idleSources = [
        // The MCP extension's own tools are listed under their servers.
        ...resolved.extensions.filter(item => item.path !== BUILTIN_PREFIX + "mcp").flatMap(item => {
          const { name, group } = extensions.get(item.path)!;
          return idle({ kind: "extension", name, group }, item.enabled);
        }),
        ...[...servers].flatMap(([server, on]) => idle({ kind: "mcp", server }, on)),
      ];
      return { ...view, tools, idleSources };
    }), c.req.raw.signal));
  });
}

/**
 * The providers enabled extensions register, read in a probe process and kept like tool inspections. One that
 * fails to load is an issue and the result is kept: it fails again until its file changes, which changes the
 * stamp. A probe that fails as a whole is an issue too, with no providers, so the catalog still answers; it is tried again next time.
 */
export function extensionProviderSource(store: ConfigStore, registry: ProjectRegistry, agentDir: string, inspections = new Inspections()): ExtensionProviderSource {
  const context = resourceContext(store, registry, agentDir);
  return async (project, signal) => {
    const { resolved, settings, revision, projectRevision } = await context.resolve(project);
    const projectStore = project ? registry.storeFor(project) : undefined;
    const paths = resolved.extensions.filter(item => item.enabled).map(item => item.path);
    const models = await store.read("global", "models.json").then(document => document.revision, () => "none");
    const stamp = await inspectionStamp(store, projectStore, agentDir, [revision, projectRevision, models], paths);
    return inspections.get(`providers\0${project ?? ""}`, stamp, false, run => redacted(knownSecrets(store, projectStore), async () => {
      try {
        return { complete: true, ...await runProvidersProbe({ agentDir, cwd: project ?? agentDir, project: !!project, paths, globalSettings: settings.global, projectSettings: settings.project }, run, 15_000) };
      } catch (error) {
        if (run.aborted) throw error;
        return { complete: false, checkedAt: new Date().toISOString(), issues: [error instanceof Error ? error.message : "The extensions could not be read."], providers: [] };
      }
    }), signal);
  };
}

const PLUGIN_TYPES = ["extensions", "prompts", "themes"] as const;
const FILTER_KEYS = ["autoload", "extensions", "skills", "prompts", "themes"];

/** Checks by project ("" for global), each for the settings revisions it read. Results are also kept on disk (update-cache.ts). */
export type PackageUpdateCache = Map<string, {
  revision: string; projectRevision?: string; result?: PackageUpdateCheck; pending?: Promise<PackageUpdateCheck>;
}>;

/** A package job changed what is installed: forget every check, kept ones included. */
export function forgetPackageChecks(checks: PackageUpdateCache, agentDir: string): Promise<void> {
  checks.clear();
  return changeUpdateCache(agentDir, ({ packages: _forgotten, ...cache }) => cache);
}

export function pluginRoutes(store: ConfigStore, registry: ProjectRegistry, agentDir: string, checks: PackageUpdateCache = new Map(), inspections = new Inspections(), checkUpdates = false) {
  const context = resourceContext(store, registry, agentDir);
  // What earlier runs found, unless this run already knows better.
  const kept = readUpdateCache(agentDir).then(cache => {
    for (const [key, result] of Object.entries(cache.packages ?? {})) {
      if (!checks.has(key)) checks.set(key, { revision: result.revision, ...(result.projectRevision ? { projectRevision: result.projectRevision } : {}), result });
    }
  });
  // When each automatic check last started, so a failing one is not repeated on every visit.
  const started = new Map<string, number>();
  const trusted = (project: string | undefined, settings: { global: Settings }) =>
    !project || (new ProjectTrustStore(agentDir).getEntry(project)?.decision ?? settings.global.defaultProjectTrust === "always");

  /** Pi's own check (npm view, git ls-remote), joined while it runs; a result is kept in memory and on disk. */
  function check(key: string, revision: string, projectRevision: string | undefined, manager: DefaultPackageManager) {
    const previous = checks.get(key);
    if (previous?.pending && previous.revision === revision && previous.projectRevision === projectRevision) return previous;
    // The last result stays shown while a new one is found for the same settings.
    const entry: NonNullable<ReturnType<PackageUpdateCache["get"]>> = { revision, projectRevision,
      ...(previous?.result && previous.revision === revision && previous.projectRevision === projectRevision ? { result: previous.result } : {}) };
    // Bound the process-local history.
    if (checks.size >= 30) checks.delete(checks.keys().next().value!);
    checks.set(key, entry);
    entry.pending = (async (): Promise<PackageUpdateCheck> => {
      const offline = !!process.env.PI_OFFLINE;
      // Public Pi API, not extension code. It uses npm view / git ls-remote, skips pins,
      // deduplicates global/project sources and silently skips failed lookups.
      const updates = await manager.checkForAvailableUpdates();
      const result: PackageUpdateCheck = { revision, projectRevision, checkedAt: new Date().toISOString(), offline,
        updates: updates.map(({ source, scope }) => ({ source, scope: scope === "user" ? "global" : "project" })) };
      entry.result = result;
      if (checks.get(key) === entry) await changeUpdateCache(agentDir, cache => ({ ...cache, packages: { ...cache.packages, [key]: result } }));
      return result;
    })();
    entry.pending.catch(() => { if (checks.get(key) === entry) checks.delete(key); }).finally(() => { entry.pending = undefined; });
    return entry;
  }

  async function view(project: string | undefined): Promise<PluginsView> {
    const { resolved, revision, projectRevision, manager, settings } = await context.resolve(project);
    const resources = (await Promise.all(PLUGIN_TYPES.map(type => Promise.all(resolved[type].map(item => describe(type, item, agentDir)))))).flat();
    const packages: PackageView[] = (["global", "project"] as const).flatMap(scope => {
      const list = settings[scope]?.packages;
      return (Array.isArray(list) ? list : []).flatMap(pkg => {
        const source = typeof pkg === "string" ? pkg : isRecord(pkg) && typeof pkg.source === "string" ? pkg.source : undefined;
        if (!source) return [];
        const path = manager.getInstalledPath(source, scope === "global" ? "user" : "project");
        const filters = isRecord(pkg) ? Object.fromEntries(Object.entries(pkg).filter(([key]) => FILTER_KEYS.includes(key))) : {};
        return [{ scope, source, installed: !!path && existsSync(path), filtered: typeof pkg !== "string", filters }];
      });
    });
    await kept;
    const key = project ?? "";
    const cached = checks.get(key);
    let current = cached?.revision === revision && cached.projectRevision === projectRevision ? cached : undefined;
    // Like Pi at startup: look for updates in the background, at most once a day.
    const due = !current?.result || Date.now() - Date.parse(current.result.checkedAt) > DAY;
    const attempt = [key, revision, projectRevision].join("\0");
    if (checkUpdates && due && !current?.pending && packages.length && !process.env.PI_OFFLINE && trusted(project, settings)
      && Date.now() - (started.get(attempt) ?? 0) > DAY / 24) {
      started.set(attempt, Date.now());
      current = check(key, revision, projectRevision, manager);
    }
    return { revision, ...(projectRevision ? { projectRevision } : {}), resources, packages,
      ...(current?.result ? { updateCheck: current.result } : {}), ...(current?.pending ? { updateChecking: true as const } : {}) };
  }
  return new Hono()
    .get("/", async c => c.json(await view(c.req.query("project"))))
    .post("/tools", async c => {
      const project = c.req.query("project");
      const { path, fresh } = z.object({ path: z.string().min(1).max(4096), fresh: z.boolean().optional() }).strict().parse(await c.req.json());
      const { resolved, settings, revision, projectRevision } = await context.resolve(project);
      const selected = resolved.extensions.find(item => item.path === path);
      if (!selected) throw new ConfigError("Choose an extension from the current project's plugin list.", 400);
      const projectStore = project ? registry.storeFor(project) : undefined;
      const paths = resolved.extensions.filter(item => item.enabled || item.path === path).map(item => item.path);
      const stamp = await inspectionStamp(store, projectStore, agentDir, [revision, projectRevision], paths);
      return c.json(await inspections.get(`plugin\0${project ?? ""}\0${path}`, stamp, !!fresh, signal => redacted(knownSecrets(store, projectStore), () => runToolProbe({
        agentDir, cwd: project ?? agentDir, project: !!project, path, enabled: selected.enabled, paths,
        globalSettings: settings.global, projectSettings: settings.project,
      }, signal)), c.req.raw.signal));
    })
    .post("/updates", async c => {
      z.object({}).strict().parse(await c.req.json());
      const project = c.req.query("project");
      const { manager, settings, revision, projectRevision } = await context.resolve(project);
      if (!trusted(project, settings)) {
        return c.json({ error: "Trust this project before checking its packages, or select global only." }, 403);
      }
      await kept;
      try { return c.json(await check(project ?? "", revision, projectRevision, manager).pending); }
      catch { return c.json({ error: "Could not check package updates. Check your connection and package sources, then try again." }, 502); }
    })
    .put("/packages", async c => {
      const project = c.req.query("project");
      const list = z.array(z.string().max(500)).max(200).nullable().optional();
      const { scope, revision, source, filters } = z.object({
        scope: z.enum(["global", "project"]), revision: z.string().min(1).max(100), source: z.string().max(500),
        filters: z.object({ autoload: z.boolean().nullable().optional(), extensions: list, skills: list, prompts: list, themes: list }).strict(),
      }).strict().parse(await c.req.json());
      const target = scope === "global" ? store : registry.storeFor(await registry.require(project));
      await target.transform(scope, revision, settings => {
        const packages = Array.isArray(settings.packages) ? [...settings.packages] : [];
        const index = packages.findIndex(pkg => (typeof pkg === "string" ? pkg : isRecord(pkg) ? pkg.source : undefined) === source);
        if (index === -1) throw new ConfigError(`settings.json has no package ${source}.`);
        const entry: Record<string, unknown> = typeof packages[index] === "string" ? { source } : { ...(packages[index] as Record<string, unknown>) };
        // null removes a filter (load everything the package allows); [] loads none of that type.
        for (const [key, value] of Object.entries(filters)) {
          if (value === null) delete entry[key];
          else if (value !== undefined) entry[key] = value;
        }
        packages[index] = Object.keys(entry).some(key => key !== "source") ? entry : source;
        settings.packages = packages;
        return settings;
      });
      return c.json(await view(project));
    })
    .patch("/", async c => {
      const project = c.req.query("project");
      const { scope, revision, items, enabled } = z.object({
        ...toggleBody, items: z.array(z.object({ type: z.enum(PLUGIN_TYPES), path: z.string().max(4096) }).strict()).min(1).max(1000),
      }).strict().parse(await c.req.json());
      await context.toggle(project, scope, revision, enabled, items);
      return c.json(await view(project));
    });
}
