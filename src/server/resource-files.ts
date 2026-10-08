// Content of skills, prompts, themes and extensions. Only files Pi discovers are opened: the
// requested path is matched against Pi's own resolution on every request. User and project
// resources can be edited; package and built-in ones are shown read-only.
import { existsSync } from "node:fs";
import { readdir, readFile, realpath, stat } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, normalize, relative, sep } from "node:path";
import { Hono } from "hono";
import { z } from "zod";
import type { ResolvedResource } from "@earendil-works/pi-coding-agent";
import type { ResourceFileView, ResourceType } from "../shared/resources.ts";
import type { ProjectRegistry } from "./projects.ts";
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

export function resourceFileRoutes(store: ConfigStore, registry: ProjectRegistry, agentDir: string) {
  const context = resourceContext(store, registry, agentDir);
  async function find(project: string | undefined, type: ResourceType, path: string) {
    const { resolved } = await context.resolve(project);
    const item = resolved[type].find(entry => entry.path === path);
    if (!item) throw new ConfigError("Pi does not discover this resource. Reload the list.", 404);
    return item;
  }
  const query = z.object({ type: z.enum(TYPES), path: z.string().min(1).max(4096), file: z.string().min(1).max(1024).optional() });

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
