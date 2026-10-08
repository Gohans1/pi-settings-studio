import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConfigStore } from "../src/server/store.ts";
import { jobRoutes } from "../src/server/jobs.ts";
import { projectRegistry } from "../src/server/projects.ts";

// Record the intended CLI invocation, never run a real package update.
test("package update jobs carry the selected project's cwd to Pi and invalidate notices", async t => {
  const root = await mkdtemp(join(tmpdir(), "pss-update-jobs-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const agent = join(root, "agent"), project = join(root, "project");
  await mkdir(agent); await mkdir(project);
  await writeFile(join(agent, "settings.json"), "{}");
  const script = join(root, "pi-fixture.ts");
  await writeFile(script, 'console.log(JSON.stringify({ cwd: process.cwd(), args: process.argv.slice(2) }));');
  let invalidations = 0;
  const routes = jobRoutes(new ConfigStore({ global: agent }), projectRegistry(agent, [project]), agent,
    [process.execPath, script], () => { invalidations++; });
  for (const input of [
    { action: "package-update", source: "npm:old-package", project },
    { action: "packages-update", project },
    { action: "package-update", source: "npm:old-package" },
  ]) {
    const response = await routes.request("/", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
    assert.equal(response.status, 200);
    const { id } = await response.json();
    let result;
    for (let attempt = 0; attempt < 100; attempt++) {
      result = await (await routes.request("/" + id)).json();
      if (result.status !== "running") break;
      await Bun.sleep(20);
    }
    assert.equal(result.status, "done");
    assert.deepEqual(JSON.parse(result.output), { cwd: "project" in input ? project : agent,
      args: ["update", input.action === "packages-update" ? "--extensions" : "npm:old-package"] });
  }
  assert.equal(invalidations, 6); // At start and completion, so in-flight checks cannot resurrect stale notices.
});
