import { stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Hono } from "hono";
import { z } from "zod";
import { ProjectTrustStore } from "@earendil-works/pi-coding-agent";
import type { ProjectView, TrustView } from "../shared/projects.ts";
import { listSessions } from "./sessions.ts";
import { ConfigError, ConfigStore } from "./store.ts";

const isDirectory = (path: string) => stat(path).then(info => info.isDirectory(), () => false);

/**
 * Projects are the folders Pi has sessions in, plus folders named with --project. Requests may
 * only name one of these, so the browser never chooses an arbitrary folder to write into.
 */
export function projectRegistry(agentDir: string, extra: string[] = []) {
  let cache: { at: number; list: Promise<{ path: string; lastActive?: string }[]> } | undefined;
  async function load() {
    const seen = new Map<string, string | undefined>();
    for (const path of extra) seen.set(resolve(path), undefined);
    for (const session of await listSessions(agentDir, extra)) {
      if (session.cwd && !seen.has(session.cwd)) seen.set(session.cwd, session.modified.toISOString());
    }
    const entries = [...seen].map(([path, lastActive]) => ({ path, ...(lastActive ? { lastActive } : {}) }));
    const exists = await Promise.all(entries.map(entry => isDirectory(entry.path)));
    return entries.filter((_, i) => exists[i]);
  }
  function list() {
    // Listing sessions reads every session file; reuse it for a few seconds.
    if (!cache || Date.now() - cache.at > 10_000) cache = { at: Date.now(), list: load() };
    return cache.list;
  }
  async function require(path: string | undefined): Promise<string> {
    if (!path) throw new ConfigError("Choose a project first.", 400);
    if (!(await list()).some(project => project.path === path)) throw new ConfigError("Unknown project. Choose one from the project list.", 400);
    return path;
  }
  /** A store whose project scope is the project's .pi folder. */
  const storeFor = (project: string) => new ConfigStore({ global: agentDir, project: join(project, ".pi") });
  return { list, require, storeFor, forget: () => { cache = undefined; } };
}
export type ProjectRegistry = ReturnType<typeof projectRegistry>;

async function trustOf(store: ConfigStore, trust: ProjectTrustStore, project: string): Promise<TrustView> {
  let setting: unknown;
  try { setting = (await store.read("global")).value.defaultProjectTrust; }
  catch (error) { if (!(error instanceof ConfigError)) throw error; }
  const defaultTrust = setting === "always" || setting === "never" ? setting : "ask";
  const entry = trust.getEntry(project);
  return {
    defaultTrust,
    ...(entry ? { decision: entry.decision, savedFor: entry.path } : {}),
    loadsInT3Code: entry ? entry.decision : defaultTrust === "always",
  };
}

export function projectRoutes(registry: ProjectRegistry, store: ConfigStore, agentDir: string) {
  const trust = new ProjectTrustStore(agentDir);
  return new Hono()
    .get("/", async c => c.json(await Promise.all((await registry.list()).map(async (project): Promise<ProjectView> =>
      ({ ...project, trust: await trustOf(store, trust, project.path) })))))
    .post("/trust", async c => {
      const { project, decision } = z.object({ project: z.string().max(4096), decision: z.boolean().nullable() }).strict().parse(await c.req.json());
      // Pi's own store: canonical paths, its lock file, the format Pi reads.
      trust.set(await registry.require(project), decision);
      return c.json(await trustOf(store, trust, project));
    });
}
