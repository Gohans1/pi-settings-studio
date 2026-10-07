import { randomBytes, timingSafeEqual } from "node:crypto";
import { lstat } from "node:fs/promises";
import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { bodyLimit } from "hono/body-limit";
import { serveStatic } from "@hono/node-server/serve-static";
import { z } from "zod";
import { ConfigError, type ConfigStore, type Scope } from "./store.js";
import { changeSchema, fields, readSetting, type SettingsView } from "../shared/settings.js";

export type AppOptions = { store: ConfigStore; origin: string; token: string; staticDir?: string };
const SCOPE = z.enum(["global", "project"]);
function equal(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function createApp({ store, origin, token, staticDir }: AppOptions) {
  const app = new Hono();
  // Browser cookies are not port-scoped. Keep concurrent Pi sessions distinct.
  const cookieName = `pi_settings_session_${new URL(origin).port}`;
  const session = randomBytes(32).toString("base64url");
  const startedAt = Date.now();
  let failures = 0;
  let windowStart = startedAt;

  app.use("*", async (c, next) => {
    c.header("Cache-Control", "no-store");
    c.header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    c.header("X-Content-Type-Options", "nosniff");
    c.header("X-Frame-Options", "DENY");
    c.header("Referrer-Policy", "no-referrer");
    c.header("Cross-Origin-Resource-Policy", "same-origin");
    c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    if (c.req.header("host") !== new URL(origin).host ||
      (c.req.header("origin") && c.req.header("origin") !== origin) ||
      c.req.header("sec-fetch-site") === "cross-site") {
      return c.json({ error: "This request must come from the local settings window." }, 403);
    }
    if (!["GET", "HEAD"].includes(c.req.method)) {
      if (c.req.header("origin") !== origin) return c.json({ error: "A same-origin request is required." }, 403);
      if (c.req.header("content-type")?.split(";")[0]?.trim() !== "application/json") return c.json({ error: "Expected application/json." }, 415);
    }
    await next();
  });
  app.use("/api/*", bodyLimit({ maxSize: 64 * 1024, onError: c => c.json({ error: "Request exceeds 64 KiB." }, 413) }));
  app.post("/api/session", async c => {
    if (Date.now() - windowStart > 60_000) { failures = 0; windowStart = Date.now(); }
    if (failures >= 10) return c.json({ error: "Too many attempts. Try again in one minute." }, 429);
    const input = z.object({ token: z.string().max(200) }).strict().parse(await c.req.json());
    if (Date.now() - startedAt > 10 * 60_000 || !equal(input.token, token)) {
      failures++;
      return c.json({ error: "Invalid or expired launch link. Open Settings again from Pi." }, 401);
    }
    setCookie(c, cookieName, session, { httpOnly: true, sameSite: "Strict", path: "/api", maxAge: 8 * 60 * 60 });
    // Secure cookies are not portable over 127.0.0.1 HTTP. This service is strictly
    // loopback-only; authenticated requests must also pass exact origin checks.
    return c.body(null, 204);
  });
  app.use("/api/*", async (c, next) => {
    if (Date.now() - startedAt > 8 * 60 * 60_000 || !equal(getCookie(c, cookieName) ?? "", session)) {
      return c.json({ error: "Open the launch link to connect to this settings session." }, 401);
    }
    await next();
  });

  async function view(scope: Scope): Promise<SettingsView> {
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
    let hasBackup = false;
    try { hasBackup = (await lstat(store.path(scope) + ".pi-settings-backup")).isFile(); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    return { scope, path: store.path(scope), revision: current.revision, values, inherited, invalid, exists: current.exists, hasBackup };
  }

  app.get("/api/settings/:scope", async c => c.json(await view(SCOPE.parse(c.req.param("scope")))));
  app.patch("/api/settings/:scope", async c => {
    const scope = SCOPE.parse(c.req.param("scope"));
    const input = changeSchema.parse(await c.req.json());
    const changes = input.changes.map(change => {
      const field = fields.find(f => f.key === change.key);
      if (!field) throw new ConfigError("This setting is not supported by the current editor.");
      return "remove" in change ? { path: field.key.split("."), remove: true as const }
        : { path: field.key.split("."), value: field.schema.parse(change.value) };
    });
    await store.patch(scope, input.revision, changes);
    return c.json(await view(scope));
  });
  app.post("/api/settings/:scope/restore", async c => {
    const scope = SCOPE.parse(c.req.param("scope"));
    const input = z.object({ revision: z.string().min(1).max(100), confirm: z.literal(true) }).strict().parse(await c.req.json());
    await store.restore(scope, input.revision);
    return c.json(await view(scope));
  });
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
