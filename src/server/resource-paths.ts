// Extra resource locations: the path entries of the `skills`, `extensions`, `prompts` and `themes`
// settings (Pi 1.1.0 docs/settings.md, Resources). Entries that start with !, + or - or hold a glob
// are filters (Pi's isPattern in dist/core/package-manager.js); the switches own those. The server
// stats only paths already in a settings file, to say whether they exist; it never reads them.
import { statSync } from "node:fs";
import { isAbsolute, join, resolve, sep } from "node:path";
import { Hono } from "hono";
import { z } from "zod";
import type { ResourcePathsView, ResourcePathView, ResourceType } from "../shared/resources.ts";
import type { ProjectRegistry } from "./projects.ts";
import { piHome, resourceContext, skillCollisions } from "./resources.ts";
import { ConfigError, type ConfigStore } from "./store.ts";

const TYPES = ["skills", "extensions", "prompts", "themes"] as const;
const isPattern = (entry: string) => /^[!+-]/.test(entry) || /[*?]/.test(entry);
const pathsOf = (value: unknown) => (Array.isArray(value) ? value : []).filter((entry): entry is string => typeof entry === "string");

/** As Pi resolves a settings path: ~ is the home folder, relative paths start at the settings file's base. */
export function resolveEntry(entry: string, base: string, home = piHome()): string {
  const path = entry.trim();
  if (path === "~") return home;
  if (path.startsWith("~/")) return join(home, path.slice(2));
  return isAbsolute(path) ? path : resolve(base, path);
}

/** The folders and files one settings file adds for a type, resolved as Pi resolves them. */
export const addedPaths = (settings: Record<string, unknown> | undefined, type: ResourceType, base: string) =>
  pathsOf(settings?.[type]).filter(entry => !isPattern(entry)).map(entry => resolveEntry(entry, base));

function stat(path: string): { exists: boolean; kind?: "folder" | "file" } {
  try { return { exists: true, kind: statSync(path).isDirectory() ? "folder" : "file" }; }
  catch { return { exists: false }; }
}

const ENTRY = z.string().max(1000).transform(path => path.trim()).refine(path => path.length > 0, "Enter a folder or file path.")
  .refine(path => [...path].every(char => char.charCodeAt(0) >= 32), "A path cannot span lines.")
  .refine(path => !isPattern(path), "Enter a folder or file path. Entries that start with +, - or ! and globs are filters; switch resources on or off in the list instead.");
const body = z.object({ type: z.enum(TYPES), scope: z.enum(["global", "project"]), revision: z.string().min(1).max(100), path: ENTRY }).strict();

export function resourcePathRoutes(store: ConfigStore, registry: ProjectRegistry, agentDir: string) {
  const context = resourceContext(store, registry, agentDir);
  async function view(type: ResourceType, project: string | undefined): Promise<ResourcePathsView> {
    const { resolved, revision, projectRevision, settings } = await context.resolve(project);
    const dir = project === undefined ? undefined : await registry.require(project);
    const bases = { global: agentDir, project: dir && join(dir, ".pi") };
    const collisions = type === "skills" ? skillCollisions(resolved.skills, agentDir, dir ?? agentDir) : undefined;
    const winners = new Set(collisions?.values());
    const paths = (["global", "project"] as const).flatMap(scope => bases[scope] === undefined ? [] : pathsOf(settings[scope]?.[type]).filter(entry => !isPattern(entry))
      .map((entry): ResourcePathView => {
        const target = resolveEntry(entry, bases[scope]!);
        const inside = resolved[type].filter(item => item.path === target || item.path.startsWith(target + sep));
        const clashes = collisions && { replaces: inside.filter(item => winners.has(item.path)).length, skipped: inside.filter(item => collisions.has(item.path)).length };
        return { scope, entry, resolved: target, ...stat(target), found: inside.length, ...clashes };
      }));
    // Pi's own locations (docs/configuration.md; docs/skills.md adds the Agent Skills folders).
    const standard = [
      { scope: "global" as const, path: join(agentDir, type) },
      ...(type === "skills" ? [{ scope: "global" as const, path: join(piHome(), ".agents", "skills") }] : []),
      ...(dir ? [{ scope: "project" as const, path: join(dir, ".pi", type) }, ...(type === "skills" ? [{ scope: "project" as const, path: join(dir, ".agents", "skills") }] : [])] : []),
    ].map(place => ({ ...place, exists: stat(place.path).exists }));
    return { type, revision, ...(projectRevision ? { projectRevision } : {}), paths, standard };
  }
  async function target(scope: "global" | "project", project: string | undefined) {
    return scope === "global" ? store : registry.storeFor(await registry.require(project));
  }
  return new Hono()
    .get("/", async c => c.json(await view(z.enum(TYPES).parse(c.req.query("type")), c.req.query("project"))))
    .post("/", async c => {
      const project = c.req.query("project");
      const { type, scope, revision, path } = body.parse(await c.req.json());
      await (await target(scope, project)).transform(scope, revision, settings => {
        const entries = pathsOf(settings[type]);
        if (!entries.includes(path)) settings[type] = [...entries, path];
        return settings;
      });
      return c.json(await view(type, project));
    })
    .delete("/", async c => {
      const project = c.req.query("project");
      const { type, scope, revision, path } = body.parse(await c.req.json());
      await (await target(scope, project)).transform(scope, revision, settings => {
        const entries = pathsOf(settings[type]);
        if (!entries.includes(path)) throw new ConfigError(`${path} is not in the ${type} setting. Reload the list.`, 404);
        settings[type] = entries.filter(entry => entry !== path);
        return settings;
      });
      return c.json(await view(type, project));
    });
}
