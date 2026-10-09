import { test } from "node:test";
import assert from "node:assert/strict";
import { Inspections } from "../src/server/inspections.ts";

type Result = { complete: boolean; n: number };
/** Inspections the test finishes by hand: each start, its signal and how to finish it. */
function runs() {
  const started: { signal: AbortSignal; finish: (result: Result) => void }[] = [];
  const start = (signal: AbortSignal) => new Promise<Result>((resolve, reject) => {
    started.push({ signal, finish: resolve });
    signal.addEventListener("abort", () => reject(new Error("stopped")));
  });
  return { started, start };
}
/** A request that can stop waiting, as a browser does when the reader leaves the tab. */
function request() {
  const controller = new AbortController();
  return { signal: controller.signal, leave: () => controller.abort() };
}

test("a request that stops waiting leaves its inspection running; the next request joins it, and the result is kept", async () => {
  const inspections = new Inspections();
  const { started, start } = runs();
  const first = request();
  const left = inspections.get("tools", "files", false, start, first.signal);
  first.leave();
  await assert.rejects(left, /cancelled/);
  assert.equal(started[0]!.signal.aborted, false);
  const back = inspections.get("tools", "files", false, start);
  started[0]!.finish({ complete: true, n: 1 });
  assert.deepEqual(await back, { complete: true, n: 1 });
  assert.deepEqual(await inspections.get("tools", "files", false, start), { complete: true, n: 1 });
  assert.equal(started.length, 1);
});

test("at most three inspections nobody waits for keep running: a fourth stops the oldest", async () => {
  const inspections = new Inspections();
  const { started, start } = runs();
  for (const key of ["a", "b", "c", "d"]) {
    const reader = request();
    const left = inspections.get(key, "files", false, start, reader.signal).catch(() => {});
    reader.leave();
    await left;
  }
  assert.deepEqual(started.map(run => run.signal.aborted), [true, false, false, false]);
});

test("an inspection someone still waits for is never stopped to make room", async () => {
  const inspections = new Inspections();
  const { started, start } = runs();
  void inspections.get("waited", "files", false, start).catch(() => {});
  for (const key of ["a", "b", "c", "d"]) {
    const reader = request();
    const left = inspections.get(key, "files", false, start, reader.signal).catch(() => {});
    reader.leave();
    await left;
  }
  assert.deepEqual(started.map(run => run.signal.aborted), [false, true, false, false, false]);
});

test("changed files or a fresh request start a new inspection; an old one nobody waits for stops", async () => {
  const inspections = new Inspections();
  const { started, start } = runs();
  const first = request();
  void inspections.get("tools", "old files", false, start, first.signal).catch(() => {});
  first.leave();
  const changed = inspections.get("tools", "new files", false, start);
  assert.equal(started.length, 2);
  assert.equal(started[0]!.signal.aborted, true);
  const fresh = inspections.get("tools", "new files", true, start);
  assert.equal(started.length, 3);
  // Someone still waits for the second run, so it finishes for them.
  assert.equal(started[1]!.signal.aborted, false);
  started[2]!.finish({ complete: true, n: 3 });
  started[1]!.finish({ complete: true, n: 2 });
  assert.equal((await changed).n, 2);
  assert.equal((await fresh).n, 3);
  // The replaced run, finishing last, does not overwrite the newer result.
  assert.equal((await inspections.get("tools", "new files", false, start)).n, 3);
});

test("an incomplete result is not kept: the next request inspects again", async () => {
  const inspections = new Inspections();
  const { started, start } = runs();
  const first = inspections.get("tools", "files", false, start);
  started[0]!.finish({ complete: false, n: 1 });
  await first;
  void inspections.get("tools", "files", false, start).catch(() => {});
  assert.equal(started.length, 2);
});
