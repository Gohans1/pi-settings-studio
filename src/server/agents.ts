// Sub-agent profiles in the format of Pi's example subagent extension (Pi 1.0.3,
// examples/extensions/subagent/agents.ts, MIT): <agentDir>/agents/*.md with `name`,
// `description`, optional `tools` and `model`, and the system prompt as the body.
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { Hono } from "hono";
import { z } from "zod";
import { stringify } from "yaml";
import { parseFrontmatter } from "@earendil-works/pi-coding-agent";
import type { AgentInput, AgentView } from "../shared/agents.ts";
import { resolveUserResources } from "./resources.ts";
import { ConfigError, type ConfigStore } from "./store.ts";
import type { ProjectRegistry } from "./projects.ts";

const MANAGED = ["name", "description", "tools", "model"];
// File names come from this pattern, never from a path the browser sends.
const NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;
const FILE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}\.md$/;

/** The example extension accepts `tools: a, b` and `tools: [a, b]`. */
function toolList(value: unknown): string[] | undefined {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  const tools = raw.filter((tool): tool is string => typeof tool === "string").map(tool => tool.trim()).filter(Boolean);
  return tools.length ? tools : undefined;
}

function toView(file: string, text: string, revision: string): Omit<AgentView, "scope"> {
  const { frontmatter, body } = parseFrontmatter<Record<string, unknown>>(text);
  const name = typeof frontmatter.name === "string" ? frontmatter.name : undefined;
  const description = typeof frontmatter.description === "string" ? frontmatter.description : undefined;
  return {
    file, revision, name, description, tools: toolList(frontmatter.tools),
    model: typeof frontmatter.model === "string" ? frontmatter.model : undefined,
    prompt: body, extraKeys: Object.keys(frontmatter).filter(key => !MANAGED.includes(key)),
    ...(!name || !description ? { error: "Needs a name and a description; Pi's example subagent extension skips this file." } : {}),
  };
}

function serialize(frontmatter: Record<string, unknown>, input: AgentInput): string {
  const next: Record<string, unknown> = { name: input.name, description: input.description };
  if (input.tools.length) next.tools = input.tools.join(", ");
  if (input.model) next.model = input.model;
  for (const [key, value] of Object.entries(frontmatter)) if (!MANAGED.includes(key)) next[key] = value;
  return `---\n${stringify(next)}---\n${input.prompt}`;
}

const agentInput = z.object({
  name: z.string().regex(NAME, "Use letters, digits, ., _ and -, starting with a letter or digit."),
  description: z.string().min(1, "A description is required: Pi skips profiles without one.").max(2000),
  tools: z.array(z.string().regex(/^[^,\s]+$/).max(200)).max(200),
  model: z.string().max(200).optional(),
  prompt: z.string().max(200_000),
}).strict();

export function agentRoutes(store: ConfigStore, registry: ProjectRegistry, agentDir: string) {
  const userDir = join(agentDir, "agents");
  type Scope = "user" | "project";
  /** The profile folder of a scope: ~/.pi/agent/agents, or the project's .pi/agents. */
  async function dirOf(scope: Scope, project: string | undefined): Promise<string> {
    return scope === "user" ? userDir : join(await registry.require(project), ".pi", "agents");
  }
  async function pathOf(c: { req: { param: (name: "file") => string; query: (name: string) => string | undefined } }): Promise<string> {
    const file = c.req.param("file");
    if (!FILE.test(file)) throw new ConfigError("Unknown profile file.", 400);
    return join(await dirOf(scopeParam(c.req.query("scope")), c.req.query("project")), file);
  }
  const scopeParam = (value: string | undefined): Scope => value === "project" ? "project" : "user";
  async function listDir(dir: string, scope: Scope): Promise<AgentView[]> {
    let files: string[] = [];
    try { files = (await readdir(dir, { withFileTypes: true })).filter(entry => entry.isFile() && FILE.test(entry.name)).map(entry => entry.name).sort(); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    return Promise.all(files.map(async file => {
      const { text = "", revision } = await store.readPath(join(dir, file));
      return { ...toView(file, text, revision), scope };
    }));
  }
  /** Pi itself has no subagents: an extension (such as Pi's example) must read these profiles. */
  async function readerInstalled(): Promise<boolean> {
    try {
      const { extensions } = await resolveUserResources(agentDir, (await store.read("global")).value);
      return extensions.some(extension => extension.enabled && /subagent/i.test(extension.path));
    } catch (error) { if (error instanceof ConfigError) return false; throw error; }
  }
  async function json(project: string | undefined) {
    const projectDir = project === undefined ? undefined : await dirOf("project", project);
    const user = await listDir(userDir, "user");
    const local = projectDir ? await listDir(projectDir, "project") : [];
    // The example extension lets a project profile replace a user profile of the same name.
    const projectNames = new Set(local.map(agent => agent.name));
    const agents = [...user.map(agent => projectNames.has(agent.name) ? { ...agent, shadowed: true } : agent), ...local];
    return { dir: userDir, ...(projectDir ? { projectDir } : {}), readerInstalled: await readerInstalled(), agents };
  }
  return new Hono()
    .get("/", async c => c.json(await json(c.req.query("project"))))
    .post("/", async c => {
      const input = agentInput.parse(await c.req.json());
      const path = join(await dirOf(scopeParam(c.req.query("scope")), c.req.query("project")), `${input.name}.md`);
      const current = await store.readPath(path);
      if (current.text !== undefined) throw new ConfigError(`A profile file named ${input.name}.md already exists here.`);
      await store.writePath(path, current.revision, serialize({}, input));
      return c.json(await json(c.req.query("project")));
    })
    .put("/:file", async c => {
      const { revision, ...input } = agentInput.extend({ revision: z.string().min(1).max(100) }).parse(await c.req.json());
      const path = await pathOf(c);
      const current = await store.readPath(path);
      if (current.text === undefined) throw new ConfigError("This profile no longer exists.");
      await store.writePath(path, revision, serialize(parseFrontmatter<Record<string, unknown>>(current.text).frontmatter, input));
      return c.json(await json(c.req.query("project")));
    })
    .delete("/:file", async c => {
      const { revision } = z.object({ revision: z.string().min(1).max(100) }).strict().parse(await c.req.json());
      await store.removePath(await pathOf(c), revision);
      return c.json(await json(c.req.query("project")));
    })
    .post("/:file/restore", async c => {
      await store.restorePath(await pathOf(c));
      return c.json(await json(c.req.query("project")));
    });
}
