import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProjectTrustStore } from "@earendil-works/pi-coding-agent";
import { ConfigStore } from "../src/server/store.ts";
import { createApp } from "../src/server/app.ts";

const origin = "http://127.0.0.1:43123";
const line = (entry: object) => JSON.stringify(entry) + "\n";

/** A session file as Pi writes it into a custom sessionDir: flat, one file per session. */
async function session(dir: string, id: string, cwd: string) {
  await mkdir(dir, { recursive: true });
  const iso = "2026-10-01T10:00:00.000Z";
  await writeFile(join(dir, `${id}.jsonl`), line({ type: "session", version: 3, id, timestamp: iso, cwd })
    + line({ type: "message", id: "m1", parentId: null, timestamp: iso, message: { role: "user", content: `hello ${id}`, timestamp: Date.parse(iso) } }));
}

async function fixture(t: import("node:test").TestContext, globalSessionDir: (root: string) => string) {
  const root = await mkdtemp(join(tmpdir(), "pi-settings-session-dir-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const agent = join(root, "agent"), shared = join(root, "shared"), trusted = join(root, "trusted"), untrusted = join(root, "untrusted");
  for (const dir of [agent, shared, join(trusted, ".pi"), join(untrusted, ".pi")]) await mkdir(dir, { recursive: true });
  await writeFile(join(agent, "settings.json"), JSON.stringify({ sessionDir: globalSessionDir(root) }));
  for (const project of [trusted, untrusted]) await writeFile(join(project, ".pi", "settings.json"), JSON.stringify({ sessionDir: "local-sessions" }));
  new ProjectTrustStore(agent).set(trusted, true);
  const app = createApp({ store: new ConfigStore({ global: agent }), agentDir: agent, projects: [trusted, untrusted], origins: [origin] });
  const request = (path: string) => app.request(new Request(origin + path, { headers: { host: new URL(origin).host } }));
  return { root, shared, trusted, untrusted, request };
}

test("sessions in a custom sessionDir are listed: global path, and a trusted project's own folder", async (t) => {
  const { root, shared, trusted, untrusted, request } = await fixture(t, root => join(root, "shared"));
  const beta = join(root, "beta");
  await mkdir(beta);
  await session(shared, "beta-1", beta);
  await session(join(trusted, "local-sessions"), "trusted-1", trusted);
  await session(join(untrusted, "local-sessions"), "untrusted-1", untrusted);
  const sessions = await (await request("/api/sessions")).json();
  assert.deepEqual(sessions.map((entry: { id: string }) => entry.id).sort(), ["beta-1", "trusted-1"]);
  const projects = await (await request("/api/projects")).json();
  assert.ok(projects.some((project: { path: string }) => project.path === beta), "beta is found through the global sessionDir");
  assert.equal((await request("/api/sessions/beta-1/system-prompt")).status, 200);
});

test("a relative global sessionDir resolves from each project's folder", async (t) => {
  const { untrusted, request } = await fixture(t, () => ".sessions");
  await session(join(untrusted, ".sessions"), "relative-1", untrusted);
  const sessions = await (await request("/api/sessions")).json();
  assert.deepEqual(sessions.map((entry: { id: string }) => entry.id), ["relative-1"]);
});
