import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Hono } from "hono";
import type { ThemeView } from "../shared/themes.ts";
import { isRecord } from "./mcp-config.ts";
import type { ProjectRegistry } from "./projects.ts";
import { resolveResources } from "./resources.ts";
import { ConfigError, type ConfigStore } from "./store.ts";

// Pi's built-in themes ship as JSON next to its interactive mode (dist/modes/interactive/theme).
export const BUILTIN_DIR = join(dirname(fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent"))), "modes", "interactive", "theme");

async function describe(path: string, source: ThemeView["source"]): Promise<ThemeView> {
  const file = path.split(/[\\/]/).pop()!;
  try {
    const value = JSON.parse(await readFile(path, "utf8"));
    if (!isRecord(value) || typeof value.name !== "string") return { name: file, source, path, error: "No name field; Pi does not load it." };
    return { name: value.name, source, path, ...(value.appearance === "dark" || value.appearance === "light" ? { appearance: value.appearance } : {}) };
  } catch { return { name: file, source, path, error: "Not valid JSON; Pi reports it at startup." }; }
}

export function themeRoutes(store: ConfigStore, registry: ProjectRegistry, agentDir: string) {
  return new Hono().get("/", async c => {
    const project = c.req.query("project") === undefined ? undefined : await registry.require(c.req.query("project"));
    const builtins = (await readdir(BUILTIN_DIR)).filter(file => file.endsWith(".json") && file !== "theme-schema.json").sort();
    const global = await store.read("global").then(doc => doc.value, error => { if (error instanceof ConfigError) return {}; throw error; });
    const local = project ? await registry.storeFor(project).read("project").then(doc => doc.value, () => ({})) : undefined;
    const { themes } = await resolveResources(agentDir, global, project ? { dir: project, settings: local! } : undefined);
    const found = await Promise.all(themes.filter(item => item.enabled).map(item => describe(item.path, item.metadata.scope === "project" ? "project" : "user")));
    const order = { user: 0, project: 1 };
    return c.json([
      ...await Promise.all(builtins.map(file => describe(join(BUILTIN_DIR, file), "built-in"))),
      ...found.sort((a, b) => order[a.source as "user"] - order[b.source as "user"] || a.name.localeCompare(b.name)),
    ]);
  });
}
