import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer } from "../src/server/server.ts";

test("server binds loopback, serves the API without a login, writes nothing on launch, and closes", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "pi-settings-lifecycle-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const running = await startServer({ agentDir: join(root, "agent"), projectDir: join(root, "workspace"), port: 0 });
  t.after(() => running.close());
  const url = new URL(running.url);
  assert.equal(url.hostname, "127.0.0.1");
  assert.notEqual(url.port, "0");
  assert.equal(url.hash, "");
  assert.equal((await fetch(url.origin + "/api/settings/global")).status, 200);
  await assert.rejects(stat(join(root, "agent")), { code: "ENOENT" });
  await running.close();
  await assert.rejects(fetch(url.origin + "/api/settings/global"));
});
