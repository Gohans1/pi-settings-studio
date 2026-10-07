import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, symlink, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConfigStore } from "../src/server/store.ts";

async function fixture(t: import("node:test").TestContext) {
  const root = await mkdtemp(join(tmpdir(), "pi-settings-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const roots = { global: join(root, "agent"), project: join(root, "project", ".pi") };
  await mkdir(roots.global, { recursive: true });
  return { roots, store: new ConfigStore(roots), file: join(roots.global, "settings.json"), root };
}

test("reading absent settings never creates files", async (t) => {
  const { store, roots } = await fixture(t);
  const result = await store.read("project");
  assert.deepEqual(result.value, {});
  assert.equal(result.exists, false);
  await assert.rejects(stat(roots.project), { code: "ENOENT" });
});

test("patch writes only changed paths and preserves unknown fields with a private exact backup", async (t) => {
  const { store, file } = await fixture(t);
  const original = '{ "defaultModel": "old", "codemode": { "mode": "only", "future": true }, "extensionSecret": "fixture-only" }\n';
  await writeFile(file, original);
  const before = await store.read("global");
  await store.patch("global", before.revision, [
    { path: ["defaultModel"], value: "new" },
    { path: ["codemode", "inlineBudget"], value: 1200 },
  ]);
  assert.deepEqual(JSON.parse(await readFile(file, "utf8")), {
    defaultModel: "new", codemode: { mode: "only", future: true, inlineBudget: 1200 }, extensionSecret: "fixture-only",
  });
  assert.equal(await readFile(file + ".pi-settings-backup", "utf8"), original);
  if (process.platform !== "win32") assert.equal((await stat(file)).mode & 0o777, 0o600);
});

test("a stale draft cannot overwrite another Pi session's update", async (t) => {
  const { store, file } = await fixture(t);
  await writeFile(file, '{"defaultModel":"first"}');
  const before = await store.read("global");
  await writeFile(file, '{"defaultModel":"other-session"}');
  await assert.rejects(store.patch("global", before.revision, [{ path: ["defaultModel"], value: "stale" }]), /changed/i);
  assert.deepEqual(JSON.parse(await readFile(file, "utf8")), { defaultModel: "other-session" });
});

test("concurrent writers with one revision cannot both succeed", async (t) => {
  const { store } = await fixture(t);
  const before = await store.read("global");
  const results = await Promise.allSettled(["one", "two"].map(value =>
    store.patch("global", before.revision, [{ path: ["defaultModel"], value }])
  ));
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
});

test("invalid JSON is not replaced with an empty file", async (t) => {
  const { store, file } = await fixture(t);
  await writeFile(file, "{ broken");
  await assert.rejects(store.read("global"), /valid JSON/i);
  // Even with the file's current revision, a patch cannot replace broken JSON.
  const { revision } = await store.readText("global");
  await assert.rejects(store.patch("global", revision, [{ path: ["theme"], value: "light" }]), /valid JSON/i);
  assert.equal(await readFile(file, "utf8"), "{ broken");
});

test("symlinked settings and directory targets are rejected without touching the target", async (t) => {
  const { store, roots, file, root } = await fixture(t);
  const outside = join(root, "outside.json");
  await writeFile(outside, '{"defaultModel":"private"}');
  await symlink(outside, file);
  await assert.rejects(store.read("global"), /symbolic link/i);
  await mkdir(join(root, "project"));
  await symlink(roots.global, roots.project, "dir");
  await assert.rejects(store.read("project"), /symbolic link/i);
  assert.equal(await readFile(outside, "utf8"), '{"defaultModel":"private"}');
});

test("resetting an override removes the key and restore recovers the prior document", async (t) => {
  const { store, file } = await fixture(t);
  await writeFile(file, '{"defaultModel":"custom","unknown":42}');
  const before = await store.read("global");
  const after = await store.patch("global", before.revision, [{ path: ["defaultModel"], remove: true }]);
  assert.deepEqual(after.value, { unknown: 42 });
  const restored = await store.restore("global", after.revision);
  assert.deepEqual(restored.value, before.value);
});

test("unsafe path segments and malformed ancestor shapes cannot destroy stored data", async (t) => {
  const { store, file } = await fixture(t);
  await writeFile(file, '{"codemode":"not-an-object"}');
  const before = await store.read("global");
  for (const path of [["__proto__", "polluted"], ["constructor"], [], ["a.b"]]) {
    await assert.rejects(store.patch("global", before.revision, [{ path, value: "bad" }]));
  }
  await assert.rejects(store.patch("global", before.revision, [{ path: ["codemode", "mode"], value: "on" }]), /object/i);
  assert.equal(await readFile(file, "utf8"), '{"codemode":"not-an-object"}');
});
