import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConfigStore } from "../src/server/store.ts";
import { createApp } from "../src/server/app.ts";

const origin = "http://127.0.0.1:43123";
const at = (n: number) => `2026-10-01T10:00:0${n}.000Z`;
const lines = (...entries: object[]) => entries.map(entry => JSON.stringify(entry)).join("\n") + "\n";

async function fixture(t: import("node:test").TestContext) {
  const root = await mkdtemp(join(tmpdir(), "pi-settings-sessions-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const agent = join(root, "agent");
  const dirA = join(agent, "sessions", "--tmp-proj-a--");
  const dirB = join(agent, "sessions", "--tmp-proj-b--");
  await mkdir(dirA, { recursive: true });
  await mkdir(dirB, { recursive: true });
  const fileA = join(dirA, "2026-10-01T10-00-00-000Z_aaaa.jsonl");
  await writeFile(fileA, lines(
    { type: "session", version: 3, id: "aaaa", timestamp: at(0), cwd: "/tmp/proj-a" },
    { type: "message", id: "e1", parentId: null, timestamp: at(1), message: { role: "system", content: "", timestamp: Date.parse(at(1)),
      sections: { preamble: "You are Pi.", rules: "Rule one." },
      toolsAdded: [{ name: "read", description: "Read files", parameters: {} }, { name: "write", description: "Write files", parameters: {} }] } },
    { type: "message", id: "e2", parentId: "e1", timestamp: at(2), message: { role: "user", content: "Hello there", timestamp: Date.parse(at(2)) } },
    { type: "message", id: "e3", parentId: "e2", timestamp: at(3), message: { role: "system", content: "", timestamp: Date.parse(at(3)),
      sections: { rules: "Rule two.", skills: "<skills/>" }, toolsRemoved: [{ name: "write" }] } },
  ));
  const fileB = join(dirB, "2026-10-02T10-00-00-000Z_bbbb.jsonl");
  await writeFile(fileB, lines(
    { type: "session", version: 3, id: "bbbb", timestamp: "2026-10-02T10:00:00.000Z", cwd: "/tmp/proj-b" },
    { type: "message", id: "f1", parentId: null, timestamp: "2026-10-02T10:00:01.000Z", message: { role: "user", content: "Second project", timestamp: Date.parse("2026-10-02T10:00:01.000Z") } },
  ));
  const app = createApp({ store: new ConfigStore({ global: agent, project: join(root, "p", ".pi") }), agentDir: agent, origins: [origin] });
  return (path: string) => app.request(new Request(origin + path, { headers: { host: new URL(origin).host } }));
}

test("sessions are listed by latest activity with their project, without message text", async (t) => {
  const request = await fixture(t);
  const sessions = await (await request("/api/sessions")).json();
  assert.deepEqual(sessions.map((s: { id: string; cwd: string }) => [s.id, s.cwd]), [["bbbb", "/tmp/proj-b"], ["aaaa", "/tmp/proj-a"]]);
  assert.equal(sessions[1].title, "Hello there");
  assert.equal("allMessagesText" in sessions[1], false);
});

test("the system prompt replays every system message: patched sections and removed tools", async (t) => {
  const request = await fixture(t);
  const prompt = await (await request("/api/sessions/aaaa/system-prompt")).json();
  assert.deepEqual(prompt.sections, [
    { name: "preamble", text: "You are Pi." }, { name: "rules", text: "Rule two." }, { name: "skills", text: "<skills/>" },
  ]);
  assert.deepEqual(prompt.tools, [{ name: "read", description: "Read files" }]);
  assert.equal(prompt.text, "You are Pi.\n\nRule two.\n\n<skills/>");
});

test("a session without a recorded prompt returns an empty prompt; unknown ids are 404", async (t) => {
  const request = await fixture(t);
  const prompt = await (await request("/api/sessions/bbbb/system-prompt")).json();
  assert.deepEqual([prompt.sections, prompt.tools, prompt.text], [[], [], ""]);
  assert.equal((await request("/api/sessions/nope/system-prompt")).status, 404);
});
