// Resource listing and toggles the way `pi config` does them (Pi 1.0.3,
// dist/modes/interactive/components/config-selector.js, MIT): Pi's DefaultPackageManager resolves
// the resources; a toggle writes `+pattern`/`-pattern` to the settings array, or to the
// package's own filter for package resources.
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, relative } from "node:path";
import { Hono } from "hono";
import { z } from "zod";
import { DefaultPackageManager, parseFrontmatter, SettingsManager, type ResolvedResource } from "@earendil-works/pi-coding-agent";
import type { ResourceView, SkillsView } from "../shared/resources.ts";
import { isRecord } from "./mcp-config.ts";
import { ConfigError, type ConfigStore } from "./store.ts";

type ResourceType = "extensions" | "skills" | "prompts" | "themes";

function formatBaseDir(baseDir: string): string {
  const home = homedir();
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

/**
 * Resolve the user's resources with Pi's own resolver. Project resources are left out
 * (projectTrusted: false) until a project picker exists. Missing packages are skipped, never
 * installed: nothing runs to display configuration.
 */
async function resolveUserResources(agentDir: string, settings: Record<string, unknown>) {
  const settingsManager = SettingsManager.inMemory(structuredClone(settings), { projectTrusted: false });
  return new DefaultPackageManager({ cwd: agentDir, agentDir, settingsManager }).resolve(async () => "skip");
}

function patternFor(item: ResolvedResource, agentDir: string): string {
  if (item.metadata.origin === "package") return relative(item.metadata.baseDir ?? dirname(item.path), item.path);
  if (item.metadata.source === "builtin") return item.path;
  return relative(item.metadata.baseDir ?? agentDir, item.path);
}

const withoutPattern = (entries: unknown, pattern: string) =>
  (Array.isArray(entries) ? entries.filter((entry): entry is string => typeof entry === "string") : [])
    .filter(entry => (/^[!+-]/.test(entry) ? entry.slice(1) : entry) !== pattern);

/** `pi config`'s toggle for one user-scope resource, applied to a copy of the global settings. */
export function toggleResource(settings: Record<string, unknown>, type: ResourceType, item: ResolvedResource, enabled: boolean, agentDir: string): Record<string, unknown> {
  const pattern = patternFor(item, agentDir);
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

async function describe(item: ResolvedResource, agentDir: string): Promise<ResourceView> {
  const file = basename(item.path);
  let name = file === "SKILL.md" ? basename(dirname(item.path)) : file.replace(/\.md$/, "");
  let description: string | undefined;
  let disableModelInvocation: boolean | undefined;
  try {
    const { frontmatter } = parseFrontmatter<Record<string, unknown>>(await readFile(item.path, "utf8"));
    if (typeof frontmatter.name === "string" && frontmatter.name) name = frontmatter.name;
    if (typeof frontmatter.description === "string") description = frontmatter.description;
    if (frontmatter["disable-model-invocation"] === true) disableModelInvocation = true;
  } catch { /* Pi reports unreadable skills itself; show the file name */ }
  return { path: item.path, name, description, enabled: item.enabled, origin: item.metadata.origin, scope: item.metadata.scope,
    group: groupLabel(item.metadata, agentDir), ...(disableModelInvocation ? { disableModelInvocation } : {}) };
}

export function skillRoutes(store: ConfigStore, agentDir: string) {
  async function view(): Promise<SkillsView> {
    const { value, revision } = await store.read("global");
    const { skills } = await resolveUserResources(agentDir, value);
    return { revision, skills: await Promise.all(skills.map(item => describe(item, agentDir))) };
  }
  return new Hono()
    .get("/", async c => c.json(await view()))
    .patch("/", async c => {
      const { revision, paths, enabled } = z.object({
        revision: z.string().min(1).max(100), paths: z.array(z.string().max(4096)).min(1).max(1000), enabled: z.boolean(),
      }).strict().parse(await c.req.json());
      await store.transform("global", revision, async settings => {
        const { skills } = await resolveUserResources(agentDir, settings);
        for (const path of paths) {
          const item = skills.find(entry => entry.path === path);
          if (!item) throw new ConfigError("A skill is no longer discovered. Reload the list.");
          toggleResource(settings, "skills", item, enabled, agentDir);
        }
        return settings;
      });
      return c.json(await view());
    });
}
