import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { serveStatic } from "@hono/bun";
import { z } from "zod";
import { ConfigError, type ConfigStore, type Scope } from "./store.ts";
import { changeSchema, fields, readSetting, type SettingsView } from "../shared/settings.ts";
import { mcpRoutes } from "./mcp-api.ts";
import { codemodeRoutes } from "./codemode.ts";
import { sessionRoutes } from "./sessions.ts";
import { pluginRoutes, skillRoutes } from "./resources.ts";
import { agentRoutes } from "./agents.ts";
import { modelRoutes } from "./models.ts";
import { projectRegistry, projectRoutes } from "./projects.ts";
import { instructionRoutes } from "./instructions.ts";
import { keybindingRoutes } from "./keybindings.ts";
import { jobRoutes } from "./jobs.ts";

// No login: the exact Host/Origin allowlist blocks browser-originated attacks (CSRF,
// DNS rebinding). Same-user processes can edit the files directly; see SPEC.md.
export type AppOptions = { store: ConfigStore; agentDir: string; origins: string[]; staticDir?: string; projects?: string[] };
const SCOPE = z.enum(["global", "project"]);

export function createApp({ store, agentDir, origins, staticDir, projects = [] }: AppOptions) {
  const app = new Hono();
  const registry = projectRegistry(agentDir, projects);
  const hosts = origins.map(origin => new URL(origin).host);

  app.use("*", async (c, next) => {
    c.header("Cache-Control", "no-store");
    c.header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    c.header("X-Content-Type-Options", "nosniff");
    c.header("X-Frame-Options", "DENY");
    c.header("Referrer-Policy", "no-referrer");
    c.header("Cross-Origin-Resource-Policy", "same-origin");
    c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    const origin = c.req.header("origin");
    if (!hosts.includes(c.req.header("host") ?? "") ||
      (origin && !origins.includes(origin)) ||
      c.req.header("sec-fetch-site") === "cross-site") {
      return c.json({ error: "This request must come from the local settings window." }, 403);
    }
    if (!["GET", "HEAD"].includes(c.req.method)) {
      if (!origin) return c.json({ error: "A same-origin request is required." }, 403);
      if (c.req.header("content-type")?.split(";")[0]?.trim() !== "application/json") return c.json({ error: "Expected application/json." }, 415);
    }
    await next();
  });
  // Instruction files are free text and can be long; every other request stays small.
  const smallBodies = bodyLimit({ maxSize: 64 * 1024, onError: c => c.json({ error: "Request exceeds 64 KiB." }, 413) });
  const textBodies = bodyLimit({ maxSize: 1024 * 1024 + 4096, onError: c => c.json({ error: "Request exceeds 1 MiB." }, 413) });
  app.use("/api/*", (c, next) => (c.req.path.startsWith("/api/instructions/") ? textBodies : smallBodies)(c, next));
  /** Global settings use the app's store; project settings need a known project in ?project=. */
  async function storeFor(scope: Scope, project: string | undefined): Promise<ConfigStore> {
    return scope === "global" ? store : registry.storeFor(await registry.require(project));
  }
  async function view(scope: Scope, store: ConfigStore): Promise<SettingsView> {
    const current = await store.read(scope);
    const parent = scope === "project" ? await store.read("global") : undefined;
    const values: Record<string, unknown> = {};
    const inherited: Record<string, unknown> = {};
    const invalid: string[] = [];
    for (const field of fields) {
      const raw = readSetting(current.value, field.key);
      if (raw !== undefined) {
        const parsed = field.schema.safeParse(raw);
        if (parsed.success) values[field.key] = parsed.data;
        else invalid.push(field.key);
      }
      const rawParent = parent ? readSetting(parent.value, field.key) : undefined;
      const parsedParent = field.schema.safeParse(rawParent);
      const fallback = parsedParent.success ? parsedParent.data : field.defaultValue;
      if (fallback !== undefined) inherited[field.key] = fallback;
    }
    return { scope, path: store.path(scope), revision: current.revision, values, inherited, invalid, exists: current.exists, hasBackup: await store.hasBackup(scope) };
  }

  app.get("/api/settings/:scope", async c => {
    const scope = SCOPE.parse(c.req.param("scope"));
    return c.json(await view(scope, await storeFor(scope, c.req.query("project"))));
  });
  app.patch("/api/settings/:scope", async c => {
    const scope = SCOPE.parse(c.req.param("scope"));
    const store = await storeFor(scope, c.req.query("project"));
    const input = changeSchema.parse(await c.req.json());
    const changes = input.changes.map(change => {
      const field = fields.find(f => f.key === change.key);
      if (!field) throw new ConfigError("This setting is not supported by the current editor.");
      if (scope === "project" && field.globalOnly) throw new ConfigError(`${field.label} can only be set in the global settings.json; Pi ignores it in a project.`);
      return "remove" in change ? { path: field.key.split("."), remove: true as const }
        : { path: field.key.split("."), value: field.schema.parse(change.value) };
    });
    await store.patch(scope, input.revision, changes);
    return c.json(await view(scope, store));
  });
  app.get("/api/settings/:scope/raw", async c => {
    const scope = SCOPE.parse(c.req.param("scope"));
    const store = await storeFor(scope, c.req.query("project"));
    return c.json({ path: store.path(scope), ...await store.readText(scope) });
  });
  app.put("/api/settings/:scope/raw", async c => {
    const scope = SCOPE.parse(c.req.param("scope"));
    const store = await storeFor(scope, c.req.query("project"));
    const { revision, text } = z.object({ revision: z.string().min(1).max(100), text: z.string().max(60_000) }).strict().parse(await c.req.json());
    await store.writeText(scope, revision, text);
    return c.json({ path: store.path(scope), ...await store.readText(scope) });
  });
  app.post("/api/settings/:scope/restore", async c => {
    const scope = SCOPE.parse(c.req.param("scope"));
    const store = await storeFor(scope, c.req.query("project"));
    const input = z.object({ revision: z.string().min(1).max(100), confirm: z.literal(true) }).strict().parse(await c.req.json());
    await store.restore(scope, input.revision);
    return c.json(await view(scope, store));
  });
  app.route("/api/mcp", mcpRoutes(store, registry));
  app.route("/api/codemode", codemodeRoutes(store, registry));
  app.route("/api/sessions", sessionRoutes(agentDir));
  app.route("/api/skills", skillRoutes(store, registry, agentDir));
  app.route("/api/plugins", pluginRoutes(store, registry, agentDir));
  app.route("/api/agents", agentRoutes(store, registry, agentDir));
  app.route("/api/models", modelRoutes(store, agentDir));
  app.route("/api/projects", projectRoutes(registry, store, agentDir));
  app.route("/api/instructions", instructionRoutes(store, registry, agentDir));
  app.route("/api/keybindings", keybindingRoutes(store));
  app.route("/api/jobs", jobRoutes(store, registry, agentDir));
  app.get("/api/status", c => c.json({ source: "persisted-files", liveSession: false, catalogue: "Pi 1.0.3", parityComplete: false }));
  if (staticDir) app.get("*", serveStatic({ root: staticDir }));
  app.notFound(c => c.json({ error: "Not found." }, 404));
  app.onError((error, c) => {
    if (error instanceof ConfigError) return c.json({ error: error.message }, error.status);
    if (error instanceof z.ZodError) return c.json({ error: "Invalid setting value. Check the field type and allowed values." }, 422);
    if (error instanceof SyntaxError) return c.json({ error: "Request must contain valid JSON." }, 400);
    return c.json({ error: "Unable to access configuration. Check filesystem permissions and try again." }, 500);
  });
  return app;
}
