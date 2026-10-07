import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer } from "../src/server/server.ts";

test("server binds an ephemeral loopback port, writes nothing on launch, and closes cleanly", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "pi-settings-lifecycle-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const running = await startServer({ agentDir: join(root, "agent"), projectDir: join(root, "workspace") });
  t.after(() => running.close());
  const url = new URL(running.url);
  assert.equal(url.hostname, "127.0.0.1");
  assert.notEqual(url.port, "0");
  assert.equal(url.search, "");
  assert.ok(url.hash.startsWith("#token="));
  const response = await fetch(url.origin + "/api/settings/global");
  assert.equal(response.status, 401);
  await assert.rejects(stat(join(root, "agent")), { code: "ENOENT" });
  await running.close();
  await assert.rejects(fetch(url.origin + "/api/settings/global"));
});
