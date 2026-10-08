// Actions that run something, only on an explicit click: Pi's own CLI (`pi mcp list`, `pi mcp
// login`, `pi install`…) with a fixed argument list and no shell, or Pi's model runtime for a
// provider sign-in. Every job works on the app's agent directory (PI_CODING_AGENT_DIR).
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import { z } from "zod";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import type { AuthPrompt } from "@earendil-works/pi-ai";
import type { JobAction, JobPrompt, JobView } from "../shared/jobs.ts";
import { isRecord, readMcpServers } from "./mcp-config.ts";
import { maskArgs } from "./mcp-secrets.ts";
import type { ProjectRegistry } from "./projects.ts";
import { ConfigError, type ConfigStore } from "./store.ts";

type Job = JobView & { cancel: () => void; answer?: (promptId: string, value: string) => boolean; secrets: string[] };
const MAX_OUTPUT = 200_000;
const MAX_JOBS = 30;

export function piCommand(): string[] {
  return [Bun.which("pi") ?? join(homedir(), ".local", "bin", "pi")];
}

/** Every credential string the app knows, so command output can never echo one to the browser. */
export async function knownSecrets(store: ConfigStore, projectStore?: ConfigStore): Promise<string[]> {
  const found: string[] = [];
  const strings = (value: unknown): void => {
    if (typeof value === "string") found.push(value);
    else if (Array.isArray(value)) value.forEach(strings);
    else if (isRecord(value)) Object.values(value).forEach(strings);
  };
  const read = async (target: ConfigStore, scope: "global" | "project", file: "mcp.json" | "auth.json" | "models.json") => {
    try { return (await target.read(scope, file)).value; } catch { return {}; }
  };
  for (const [target, scope] of [[store, "global"], ...(projectStore ? [[projectStore, "project"]] : [])] as [ConfigStore, "global" | "project"][]) {
    for (const { raw } of readMcpServers(await read(target, scope, "mcp.json")).servers) {
      if (!isRecord(raw)) continue;
      strings(raw.env); strings(raw.headers); strings(isRecord(raw.oauth) ? raw.oauth.clientSecret : undefined);
      const values = [raw.env, raw.headers].flatMap(group => isRecord(group) ? Object.values(group).filter((v): v is string => typeof v === "string") : []);
      if (Array.isArray(raw.args)) found.push(...maskArgs(raw.args.filter((arg): arg is string => typeof arg === "string"), values).hidden.values());
      if (typeof raw.url === "string" && URL.canParse(raw.url)) {
        const url = new URL(raw.url);
        if (url.password) found.push(decodeURIComponent(url.password));
        for (const [key, value] of url.searchParams) if (/(key|token|secret|passw|auth)/i.test(key)) found.push(value);
      }
    }
  }
  for (const credential of Object.values(await read(store, "global", "auth.json"))) {
    if (isRecord(credential)) for (const [key, value] of Object.entries(credential)) if (key !== "type") strings(value);
  }
  const models = await read(store, "global", "models.json");
  if (isRecord(models.providers)) for (const provider of Object.values(models.providers)) if (isRecord(provider)) { strings(provider.apiKey); strings(provider.headers); }
  // "Bearer <token>": the token can also show up on its own.
  found.push(...found.flatMap(value => /^\s*(?:Bearer|Basic|Token|Bot)\s+(\S+)\s*$/i.exec(value)?.slice(1) ?? []));
  return [...new Set(found.filter(value => value.length >= 6))].sort((a, b) => b.length - a.length);
}

export function redact<T>(value: T, secrets: string[]): T {
  if (typeof value === "string") return secrets.reduce((text, secret) => text.split(secret).join("‹hidden›"), value) as T;
  if (Array.isArray(value)) return value.map(item => redact(item, secrets)) as T;
  if (isRecord(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redact(item, secrets)])) as T;
  return value;
}

const view = ({ cancel: _cancel, answer: _answer, secrets, ...job }: Job): JobView => redact(job, secrets);

const SERVER = z.string().regex(/^[A-Za-z0-9_-]+$/);
// A package source is one argument; it may not look like an option or span lines.
const SOURCE = z.string().min(1).max(500).refine(source => !source.startsWith("-") && !/[\r\n\0]/.test(source), "Not a package source.");
const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("mcp-test"), project: z.string().optional() }).strict(),
  z.object({ action: z.literal("mcp-login"), server: SERVER, project: z.string().optional() }).strict(),
  z.object({ action: z.literal("mcp-logout"), server: SERVER, project: z.string().optional() }).strict(),
  z.object({ action: z.literal("package-install"), source: SOURCE, project: z.string().optional() }).strict(),
  z.object({ action: z.literal("package-remove"), source: SOURCE, project: z.string().optional() }).strict(),
  z.object({ action: z.literal("package-update"), source: SOURCE }).strict(),
  z.object({ action: z.literal("packages-update") }).strict(),
  z.object({ action: z.literal("models-refresh") }).strict(),
  z.object({ action: z.literal("provider-login"), provider: z.string().max(100) }).strict(),
  z.object({ action: z.literal("provider-setup"), provider: z.string().max(100) }).strict(),
  z.object({ action: z.literal("provider-check"), provider: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/) }).strict(),
  z.object({ action: z.literal("pi-update") }).strict(),
]);

export function jobRoutes(store: ConfigStore, registry: ProjectRegistry, agentDir: string, command = piCommand()) {
  const jobs = new Map<string, Job>();
  function create(action: JobAction, title: string, secrets: string[]): Job {
    const job: Job = { id: randomUUID(), action, title, status: "running", output: "", events: [], secrets, cancel: () => {} };
    jobs.set(job.id, job);
    for (const old of [...jobs.values()].filter(other => other.status !== "running").slice(0, Math.max(0, jobs.size - MAX_JOBS))) jobs.delete(old.id);
    return job;
  }
  const append = (job: Job, text: string) => { job.output = (job.output + text).slice(-MAX_OUTPUT); };

  function runPi(job: Job, args: string[], cwd: string, after?: (job: Job, stdout: string) => void) {
    if (!existsSync(command[0]!)) { job.status = "failed"; job.error = `The pi command was not found (${command[0]}).`; return; }
    const child = Bun.spawn([...command, ...args], {
      cwd, stdin: "ignore", stdout: "pipe", stderr: "pipe",
      env: { ...process.env, PI_CODING_AGENT_DIR: agentDir, NO_COLOR: "1" },
    });
    job.cancel = () => { if (job.status === "running") { job.status = "cancelled"; child.kill(); } };
    let stdout = "";
    const pump = async (stream: ReadableStream<Uint8Array>, keep: boolean) => {
      const decoder = new TextDecoder();
      for await (const chunk of stream) {
        const text = decoder.decode(chunk, { stream: true });
        if (keep) stdout += text;
        append(job, text);
        // pi mcp login prints the authorization page; offer it as a link.
        for (const url of text.match(/https?:\/\/\S+/g) ?? []) {
          if (job.action === "mcp-login" && !job.events.some(event => event.type === "link")) job.events.push({ type: "link", url, label: "Open the sign-in page" });
        }
      }
    };
    void Promise.all([pump(child.stdout, true), pump(child.stderr, false), child.exited]).then(([, , code]) => {
      job.exitCode = code;
      after?.(job, stdout);
      // A test or check that reported its result is done, whatever it found.
      if (job.status === "running") job.status = code === 0 || job.result || job.check ? "done" : "failed";
    }).catch(error => { if (job.status === "running") { job.status = "failed"; job.error = String(error); } });
  }

  /** Pi's own sign-in (oauth) or key setup (api_key), its questions relayed to the browser; Pi writes auth.json. */
  async function providerLogin(job: Job, providerId: string, type: "oauth" | "api_key") {
    const runtime = await ModelRuntime.create({
      authPath: join(agentDir, "auth.json"), modelsPath: join(agentDir, "models.json"), modelsStorePath: join(agentDir, "models-store.json"),
      allowModelNetwork: false, refreshOnCreate: false,
    });
    const provider = runtime.getProvider(providerId);
    if (!provider) throw new ConfigError(`Pi has no provider named "${providerId}".`);
    if (type === "oauth" && !provider.auth.oauth) throw new ConfigError(`${provider.name} has no sign-in. Store an API key instead.`);
    if (type === "api_key" && !provider.auth.apiKey?.login) throw new ConfigError(`${provider.name} has no key setup in Pi. Sign in instead.`);
    // Pi's own device id (settings.json deviceId), created the way Pi creates it.
    let deviceId = (await store.read("global")).value.deviceId;
    if (typeof deviceId !== "string" || !deviceId) {
      deviceId = randomUUID();
      const { revision } = await store.read("global");
      await store.transform("global", revision, settings => ({ ...settings, deviceId }));
    }
    const controller = new AbortController();
    const pending = new Map<string, (value: string) => void>();
    job.cancel = () => { if (job.status === "running") { job.status = "cancelled"; job.prompt = undefined; controller.abort(); } };
    job.answer = (promptId, value) => {
      const resolve = pending.get(promptId);
      if (!resolve) return false;
      // A typed secret is hidden from anything the job shows later, like the stored ones.
      if (job.prompt?.type === "secret" && value.length >= 6) job.secrets.push(value);
      pending.delete(promptId); job.prompt = undefined; resolve(value);
      return true;
    };
    const notify = (event: Parameters<Parameters<typeof runtime.login>[2]["notify"]>[0]) => {
      if (event.type === "auth_url") job.events.push({ type: "link", url: event.url, label: event.instructions ?? "Open the sign-in page" });
      else if (event.type === "device_code") job.events.push({ type: "code", code: event.userCode, url: event.verificationUri });
      else {
        job.events.push({ type: "info", message: event.message });
        if (event.type === "info") for (const link of event.links ?? []) job.events.push({ type: "link", url: link.url, label: link.label ?? link.url });
      }
    };
    const prompt = (request: AuthPrompt) => new Promise<string>((resolve, reject) => {
      const id = randomUUID();
      const shown: JobPrompt = { id, type: request.type, message: request.message,
        ...("placeholder" in request && request.placeholder ? { placeholder: request.placeholder } : {}),
        ...(request.type === "select" ? { options: request.options.map(option => ({ ...option })) } : {}) };
      job.prompt = shown;
      pending.set(id, resolve);
      const abort = () => { pending.delete(id); if (job.prompt?.id === id) job.prompt = undefined; reject(new Error("aborted")); };
      controller.signal.addEventListener("abort", abort, { once: true });
      request.signal?.addEventListener("abort", abort, { once: true });
    });
    runtime.login(providerId, type, { signal: controller.signal, notify, prompt }, { getDeviceId: () => deviceId as string })
      .then(() => { if (job.status === "running") { job.status = "done"; job.events.push({ type: "info", message: `${type === "oauth" ? "Signed in to" : "Set up"} ${provider.name}. Pi stored the credential in auth.json.` }); } })
      .catch(error => { if (job.status === "running") { job.status = "failed"; job.error = error instanceof Error ? error.message : String(error); } });
  }

  return new Hono()
    .post("/", async c => {
      const input = body.parse(await c.req.json());
      const project = "project" in input && input.project !== undefined ? await registry.require(input.project) : undefined;
      const local = project ? ["-l"] : [];
      const cwd = project ?? agentDir;
      const secrets = await knownSecrets(store, project ? registry.storeFor(project) : undefined);
      switch (input.action) {
        case "mcp-test": {
          const job = create(input.action, "Test MCP connections", secrets);
          runPi(job, ["mcp", "list", "--json"], cwd, (done, stdout) => {
            try { done.result = JSON.parse(stdout); } catch { /* the output explains */ }
          });
          return c.json(view(job));
        }
        case "mcp-login": case "mcp-logout": {
          const job = create(input.action, `${input.action === "mcp-login" ? "Sign in to" : "Sign out of"} ${input.server}`, secrets);
          runPi(job, input.action === "mcp-login" ? ["mcp", "login", input.server, "--timeout", "300"] : ["mcp", "logout", input.server], cwd);
          return c.json(view(job));
        }
        case "package-install": case "package-remove": {
          const job = create(input.action, `${input.action === "package-install" ? "Install" : "Remove"} ${input.source}`, secrets);
          runPi(job, [input.action === "package-install" ? "install" : "remove", input.source, ...local], cwd);
          return c.json(view(job));
        }
        case "package-update": {
          const job = create(input.action, `Update ${input.source}`, secrets);
          runPi(job, ["update", input.source], agentDir);
          return c.json(view(job));
        }
        case "packages-update": {
          const job = create(input.action, "Update all packages", secrets);
          runPi(job, ["update", "--extensions"], agentDir);
          return c.json(view(job));
        }
        case "models-refresh": {
          const job = create(input.action, "Refresh model catalogs", secrets);
          runPi(job, ["update", "--models"], agentDir);
          return c.json(view(job));
        }
        case "provider-check": {
          const job = create(input.action, `Check the credential of ${input.provider}`, secrets);
          runPi(job, ["auth", "check", "--provider", input.provider, "--json"], agentDir, (done, stdout) => {
            try { done.check = JSON.parse(stdout); } catch { /* the output explains */ }
          });
          return c.json(view(job));
        }
        case "pi-update": {
          const job = create(input.action, "Update Pi", secrets);
          runPi(job, ["update", "--self"], agentDir);
          return c.json(view(job));
        }
        case "provider-login": case "provider-setup": {
          const job = create(input.action, `${input.action === "provider-login" ? "Sign in to" : "Set up"} ${input.provider}`, secrets);
          try { await providerLogin(job, input.provider, input.action === "provider-login" ? "oauth" : "api_key"); }
          catch (error) { jobs.delete(job.id); throw error; }
          return c.json(view(job));
        }
      }
    })
    .get("/:id", c => {
      const job = jobs.get(c.req.param("id"));
      return job ? c.json(view(job)) : c.json({ error: "This job is no longer known. Start it again." }, 404);
    })
    .post("/:id/answer", async c => {
      const job = jobs.get(c.req.param("id"));
      if (!job?.answer) return c.json({ error: "Nothing is waiting for an answer." }, 404);
      const { promptId, value } = z.object({ promptId: z.string().max(100), value: z.string().max(10_000) }).strict().parse(await c.req.json());
      if (!job.answer(promptId, value)) throw new ConfigError("That question was already answered or cancelled.", 409);
      return c.json(view(job));
    })
    .post("/:id/cancel", c => {
      const job = jobs.get(c.req.param("id"));
      if (!job) return c.json({ error: "This job is no longer known." }, 404);
      job.cancel();
      return c.json(view(job));
    });
}
