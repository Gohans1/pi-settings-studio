// Content of skills, prompts, themes and extensions. Only files Pi discovers are opened: the
// requested path is matched against Pi's own resolution on every request. User and project
// resources can be edited; package and built-in ones are shown read-only.
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { lstat, mkdir, readdir, readFile, realpath, rename, rm, stat } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, normalize, relative, sep } from "node:path";
import { Hono } from "hono";
import { z } from "zod";
import { parseFrontmatter, type ResolvedResource } from "@earendil-works/pi-coding-agent";
import type { ResourceFileView, ResourceType } from "../shared/resources.ts";
import type { ProjectRegistry } from "./projects.ts";
import { addedPaths } from "./resource-paths.ts";
import { resourceContext } from "./resources.ts";
import { ConfigError, type ConfigStore } from "./store.ts";
import { BUILTIN_DIR } from "./themes.ts";

const TYPES = ["skills", "prompts", "themes", "extensions"] as const;
const MAX_BYTES = 1024 * 1024;
const MAX_FILES = 200;

const inside = (folder: string, path: string) => path === folder || path.startsWith(folder + sep);

/** A skill's folder holds its supporting files; other resources are a single file. */
const folderOf = (type: ResourceType, path: string) => type === "skills" && basename(path) === "SKILL.md" ? dirname(path) : undefined;

async function listFiles(folder: string): Promise<string[]> {
  const real = await realpath(folder);
  const entries = await readdir(folder, { recursive: true });
  const files: string[] = [];
  for (const entry of entries.map(String).sort()) {
    if (files.length >= MAX_FILES) break;
    if (entry.split(sep).some(part => part === "node_modules" || part === ".git") || entry.endsWith(".pi-settings-backup")) continue;
    try {
      const target = await realpath(join(folder, entry));
      if (inside(real, target) && (await stat(target)).isFile()) files.push(entry.split(sep).join("/"));
    } catch { /* broken link: not listed */ }
  }
  return files;
}

/** The file to open: the resource itself, or a file inside a skill's folder that stays inside it. */
async function target(type: ResourceType, item: ResolvedResource, file: string | undefined): Promise<string> {
  const folder = folderOf(type, item.path);
  if (file === undefined || file === basename(item.path) && !folder) return item.path;
  if (!folder || isAbsolute(file) || normalize(file).split(/[\\/]/).includes("..")) throw new ConfigError("That file is not part of this resource.", 400);
  const path = join(folder, file);
  let real: string;
  try { real = await realpath(path); } catch { throw new ConfigError("That file does not exist.", 404); }
  if (!inside(await realpath(folder), real)) throw new ConfigError("That file points outside the skill's folder.", 400);
  return path;
}

async function readText(path: string): Promise<string> {
  const info = await stat(path);
  if (!info.isFile()) throw new ConfigError("Not a file.", 400);
  if (info.size > MAX_BYTES) throw new ConfigError("The file is larger than 1 MiB; edit it in a text editor.", 422);
  const text = await readFile(path, "utf8");
  if (text.includes("\0")) throw new ConfigError("The file is binary; edit it with another tool.", 422);
  return text;
}

/** Why a resource cannot be edited here, if it cannot. */
function readOnlyReason(item: ResolvedResource): string | undefined {
  if (item.metadata.source === "builtin") return "Built into Pi.";
  if (item.metadata.origin === "package") return `From the package ${item.metadata.source}; change it at its source or with filters.`;
  return undefined;
}

const SKILL_NAME = z.string().max(64).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Lowercase letters, digits and single hyphens.");
const FILE_NAME = z.string().max(100).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, "Letters, digits, ., _ and -.");
/** A YAML scalar: plain when safe, otherwise double-quoted (JSON strings are valid YAML). */
const yaml = (text: string) => /^[A-Za-z0-9][\w .,()'/-]*$/.test(text) ? text : JSON.stringify(text);

async function template(type: ResourceType, name: string, description: string | undefined): Promise<{ path: string; text: string }> {
  switch (type) {
    case "skills": return { path: join("skills", name, "SKILL.md"), text: `---\nname: ${name}\ndescription: ${yaml(description!)}\n---\n\n` };
    case "prompts": return { path: join("prompts", `${name}.md`), text: description ? `---\ndescription: ${yaml(description)}\n---\n\n` : "" };
    case "themes": {
      // Pi's dark theme as a starting point (docs/themes.md suggests copying a built-in theme).
      const theme = JSON.parse(await readFile(join(BUILTIN_DIR, "dark.json"), "utf8"));
      return { path: join("themes", `${name}.json`), text: JSON.stringify({ ...theme, name }, null, "\t") + "\n" };
    }
    case "extensions": return { path: join("extensions", `${name}.ts`), text: `import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  // See https://pi.dev/docs/extensions for events, tools and commands.
}
` };
  }
}

const INVOCATION = /^disable-model-invocation\s*:.*\n/m;

/**
 * A skill's SKILL.md with `disable-model-invocation: true` added or removed. Only that line changes;
 * Pi's own frontmatter parser then has to agree, or the file is left for the editor.
 */
export function setModelInvocation(text: string, allowed: boolean): string {
  const block = /^---\r?\n([\s\S]*?\r?\n)?---\r?\n/.exec(text);
  if (!block) throw new ConfigError("SKILL.md has no frontmatter. Add it in the file editor.", 422);
  const eol = block[0].includes("\r\n") ? "\r\n" : "\n";
  const front = (block[1] ?? "").replace(INVOCATION, "");
  const next = `---${eol}${front}${allowed ? "" : `disable-model-invocation: true${eol}`}---${eol}` + text.slice(block[0].length);
  const { frontmatter } = parseFrontmatter<Record<string, unknown>>(next);
  if ((frontmatter["disable-model-invocation"] === true) === allowed) throw new ConfigError("Could not change the frontmatter safely. Edit SKILL.md in the file editor.", 422);
  return next;
}

export function resourceFileRoutes(store: ConfigStore, registry: ProjectRegistry, agentDir: string) {
  const context = resourceContext(store, registry, agentDir);
  async function find(project: string | undefined, type: ResourceType, path: string) {
    const { resolved } = await context.resolve(project);
    const item = resolved[type].find(entry => entry.path === path);
    if (!item) throw new ConfigError("Pi does not discover this resource. Reload the list.", 404);
    return item;
  }
  const query = z.object({ type: z.enum(TYPES), path: z.string().min(1).max(4096), file: z.string().min(1).max(1024).optional() });
  const skillPath = z.object({ path: z.string().min(1).max(4096) }).strict();
  /**
   * Where a removed skill waits for Undo: one copy per original place, in the agent folder, outside every folder
   * Pi or another agent reads skills from.
   */
  const keptCopy = (unit: string) => join(agentDir, ".pi-settings-backup", "skills", createHash("sha256").update(unit).digest("hex").slice(0, 16));
  const exists = (path: string) => lstat(path).then(() => true, () => false);

  return new Hono()
    .get("/", async c => {
      const { type, path, file } = query.parse(c.req.query());
      const item = await find(c.req.query("project"), type, path);
      const opened = await target(type, item, file);
      const folder = folderOf(type, item.path);
      let readOnly = readOnlyReason(item);
      let revision = "";
      // Pi reads through symbolic links; this app never writes through them.
      try { revision = (await store.readPath(opened)).revision; }
      catch (error) {
        if (!(error instanceof ConfigError)) throw error;
        readOnly ??= `A symbolic link to ${await realpath(opened)}. Edit it at its target.`;
      }
      const view: ResourceFileView = {
        path: item.path, file: folder ? relative(folder, opened).split(sep).join("/") : basename(opened), text: await readText(opened), revision,
        editable: !readOnly, ...(readOnly ? { readOnly } : {}), files: folder ? await listFiles(folder) : [basename(item.path)],
      };
      return c.json(view);
    })
    .put("/", async c => {
      const body = query.extend({ revision: z.string().min(1).max(100), text: z.string().max(MAX_BYTES) }).strict().parse(await c.req.json());
      const item = await find(c.req.query("project"), body.type, body.path);
      const readOnly = readOnlyReason(item);
      if (readOnly) throw new ConfigError(readOnly, 422);
      const opened = await target(body.type, item, body.file);
      if (opened.endsWith(".json")) {
        try { JSON.parse(body.text); } catch (error) { throw new ConfigError(`Not valid JSON, so Pi would skip it: ${error instanceof Error ? error.message : error}`, 422); }
      }
      await store.writePath(opened, body.revision, body.text);
      return c.json({ revision: (await store.readPath(opened)).revision });
    })
    .patch("/invocation", async c => {
      const { paths, modelInvocation } = z.object({ paths: z.array(z.string().min(1).max(4096)).min(1).max(1000), modelInvocation: z.boolean() }).strict().parse(await c.req.json());
      const { resolved } = await context.resolve(c.req.query("project"));
      // Every file is checked before any is written, so a skill that cannot change leaves all of them as they were.
      const edits: { path: string; revision: string; text: string }[] = [];
      for (const path of paths) {
        const item = resolved.skills.find(entry => entry.path === path);
        if (!item) throw new ConfigError("Pi does not discover this skill. Reload the list.", 404);
        const name = basename(folderOf("skills", path) ?? path);
        const readOnly = readOnlyReason(item);
        if (readOnly) throw new ConfigError(`${name}: ${readOnly}`, 422);
        const { text, revision } = await store.readPath(path);
        if (text === undefined) throw new ConfigError(`${name}: SKILL.md is gone. Reload the list.`, 404);
        try {
          // Already as asked: the file is left alone and not reported as changed.
          if ((parseFrontmatter<Record<string, unknown>>(text).frontmatter["disable-model-invocation"] === true) !== modelInvocation) continue;
          edits.push({ path, revision, text: setModelInvocation(text, modelInvocation) });
        } catch (error) {
          throw new ConfigError(`${name}: ${error instanceof ConfigError ? error.message : "Pi cannot read its frontmatter. Fix it in the file editor."}`, 422);
        }
      }
      for (const edit of edits) await store.writePath(edit.path, edit.revision, edit.text);
      return c.json({ changed: edits.map(edit => edit.path) });
    })
    .delete("/skill", async c => {
      const { path } = skillPath.parse(await c.req.json());
      const project = c.req.query("project");
      const { resolved, settings } = await context.resolve(project);
      const item = resolved.skills.find(entry => entry.path === path);
      if (!item) throw new ConfigError("Pi does not discover this skill. Reload the list.", 404);
      const readOnly = readOnlyReason(item);
      if (readOnly) throw new ConfigError(readOnly, 422);
      // A skill is its folder, or a Markdown file on its own.
      const unit = folderOf("skills", path) ?? path;
      const dir = project === undefined ? undefined : await registry.require(project);
      // Folders Pi reads skills from: its own, the paths the settings add, and by name every .pi/skills or
      // .agents/skills (a project's and its parents'). Removing one, or a folder holding one, is not removing a skill.
      const places = [join(agentDir, "skills"), ...addedPaths(settings.global, "skills", agentDir), ...(dir ? addedPaths(settings.project, "skills", join(dir, ".pi")) : [])];
      if (places.some(place => place === unit || place.startsWith(unit + sep)) || basename(unit) === "skills" && [".pi", ".agents"].includes(basename(dirname(unit)))) {
        throw new ConfigError(`Pi reads ${unit} as a place to find skills, not as one skill inside it. Remove it under Folders, or delete it outside this app.`, 422);
      }
      // As with every other file here: never through a symbolic link.
      if (await realpath(unit) !== unit) throw new ConfigError(`${unit} is a symbolic link or inside one. Delete it at its target, outside this app.`, 422);
      const kept = keptCopy(unit);
      await rm(kept, { recursive: true, force: true });
      await mkdir(kept, { recursive: true, mode: 0o700 });
      // ponytail: a rename, so nothing is half-moved; a skill on another drive than the agent folder is refused, copy then delete if that matters.
      try { await rename(unit, join(kept, basename(unit))); }
      catch (error) {
        await rm(kept, { recursive: true, force: true });
        if ((error as NodeJS.ErrnoException).code === "EXDEV") throw new ConfigError(`${unit} is on another drive than ${agentDir}, where removed skills are kept for Undo. Delete it outside this app.`, 422);
        throw error;
      }
      return c.body(null, 204);
    })
    .post("/skill/restore", async c => {
      const { path } = skillPath.parse(await c.req.json());
      if (!isAbsolute(path) || normalize(path) !== path) throw new ConfigError("Unknown skill path.", 400);
      // Only a place this app removed a skill from has a kept copy, so nothing else can be written here.
      const unit = folderOf("skills", path) ?? path;
      const kept = keptCopy(unit), copy = join(kept, basename(unit));
      if (!await exists(copy)) throw new ConfigError("No removed copy of this skill is kept, so there is nothing to restore.", 404);
      if (await exists(unit)) throw new ConfigError(`${unit} exists again; nothing to restore.`, 409);
      const parent = await realpath(dirname(unit)).catch(() => undefined);
      if (parent !== dirname(unit)) throw new ConfigError(`The folder ${dirname(unit)} is gone or is now a symbolic link. The removed copy is in ${kept}.`, 409);
      await rename(copy, unit);
      await rm(kept, { recursive: true, force: true });
      return c.body(null, 204);
    })
    .post("/", async c => {
      const body = z.object({ scope: z.enum(["global", "project"]), type: z.enum(TYPES), name: z.string(), description: z.string().max(1024).optional() }).strict().parse(await c.req.json());
      const name = (body.type === "skills" ? SKILL_NAME : FILE_NAME).parse(body.name);
      if (body.type === "themes" && name === "system") throw new ConfigError('"system" is reserved; choose another theme name.', 422);
      if (body.type === "skills" && !body.description?.trim()) throw new ConfigError("Pi does not load a skill without a description.", 422);
      const project = c.req.query("project");
      const root = body.scope === "global" ? agentDir : join(await registry.require(project), ".pi");
      const { path, text } = await template(body.type, name, body.description?.trim());
      const full = join(root, path);
      if (existsSync(full)) throw new ConfigError(`${full} already exists.`, 409);
      await store.writePath(full, (await store.readPath(full)).revision, text);
      return c.json({ type: body.type, path: full });
    });
}
