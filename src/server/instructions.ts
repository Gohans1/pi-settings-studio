// Instruction files as Pi 1.0.3-1.2.0 finds them (dist/core/resource-loader.js): in a folder, the first of
// AGENTS.override.md, AGENTS.md, AGENTS.MD, CLAUDE.md, CLAUDE.MD is its context file; SYSTEM.md
// replaces Pi's prompt and APPEND_SYSTEM.md adds to it, a trusted project's .pi copy taking precedence.
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { Hono } from "hono";
import { z } from "zod";
import { loadProjectContextFiles } from "@earendil-works/pi-coding-agent";
import type { InstructionFile, InstructionId, InstructionsView } from "../shared/instructions.ts";
import type { ProjectRegistry } from "./projects.ts";
import { ConfigError, type ConfigStore } from "./store.ts";

const CONTEXT_CANDIDATES = ["AGENTS.override.md", "AGENTS.md", "AGENTS.MD", "CLAUDE.md", "CLAUDE.MD"];
const IDS: InstructionId[] = ["global:context", "global:system", "global:append", "project:context", "project:system", "project:append"];
const isFile = (path: string) => existsSync(path) && statSync(path).isFile();

function locate(id: InstructionId, agentDir: string, project: string | undefined): { path: string; others?: string[] } {
  const [scope, kind] = id.split(":") as ["global" | "project", "context" | "system" | "append"];
  if (scope === "project" && !project) throw new ConfigError("Choose a project first.", 400);
  if (kind === "context") {
    const dir = scope === "global" ? agentDir : project!;
    const present = CONTEXT_CANDIDATES.filter(name => isFile(join(dir, name)));
    // Without a context file yet, a new one is AGENTS.md.
    return { path: join(dir, present[0] ?? "AGENTS.md"), others: present.slice(1) };
  }
  const name = kind === "system" ? "SYSTEM.md" : "APPEND_SYSTEM.md";
  return { path: scope === "global" ? join(agentDir, name) : join(project!, ".pi", name) };
}

export function instructionRoutes(store: ConfigStore, registry: ProjectRegistry, agentDir: string) {
  async function projectOf(value: string | undefined) {
    return value === undefined ? undefined : registry.require(value);
  }
  function idOf(value: string): InstructionId {
    if (!(IDS as string[]).includes(value)) throw new ConfigError("Unknown instruction file.", 400);
    return value as InstructionId;
  }
  async function view(project: string | undefined): Promise<InstructionsView> {
    const files = await Promise.all(IDS.filter(id => project || id.startsWith("global:")).map(async (id): Promise<InstructionFile> => {
      const { path, others } = locate(id, agentDir, project);
      const [scope, kind] = id.split(":") as [InstructionFile["scope"], InstructionFile["kind"]];
      try {
        const { text, revision } = await store.readPath(path);
        return { id, scope, kind, path, exists: text !== undefined, revision, ...(text !== undefined ? { text } : {}), ...(others?.length ? { others } : {}) };
      } catch (error) {
        // One unreadable file (a symlink, too large) must not hide the others.
        if (!(error instanceof ConfigError)) throw error;
        return { id, scope, kind, path, exists: true, revision: "unreadable", error: error.message };
      }
    }));
    const loaded = loadProjectContextFiles({ cwd: project ?? agentDir, agentDir }).map(file => file.path);
    return { files, loaded };
  }
  return new Hono()
    .get("/", async c => c.json(await view(await projectOf(c.req.query("project")))))
    .put("/:id", async c => {
      const project = await projectOf(c.req.query("project"));
      const { revision, text } = z.object({ revision: z.string().min(1).max(100), text: z.string().max(1_000_000) }).strict().parse(await c.req.json());
      await store.writePath(locate(idOf(c.req.param("id")), agentDir, project).path, revision, text);
      return c.json(await view(project));
    })
    .delete("/:id", async c => {
      const project = await projectOf(c.req.query("project"));
      const { revision } = z.object({ revision: z.string().min(1).max(100) }).strict().parse(await c.req.json());
      await store.removePath(locate(idOf(c.req.param("id")), agentDir, project).path, revision);
      return c.json(await view(project));
    })
    .post("/:id/restore", async c => {
      const project = await projectOf(c.req.query("project"));
      await store.restorePath(locate(idOf(c.req.param("id")), agentDir, project).path);
      return c.json(await view(project));
    });
}
