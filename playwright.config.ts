import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig } from "@playwright/test";

// The app's server runs in each worker, and Pi there loads the skills in ~/.agents/skills of whoever runs
// the tests, from HOME (see tests/setup.ts). A worker gets an empty home of its own. The runner keeps the
// real one, so workers start where Playwright's browsers are installed: Bun's homedir() keeps that HOME.
if (process.env.TEST_WORKER_INDEX !== undefined) {
  const home = mkdtempSync(join(tmpdir(), "pi-settings-home-"));
  process.env.HOME = home;
  process.on("exit", () => rmSync(home, { recursive: true, force: true }));
}

export default defineConfig({
  testDir: "./e2e", fullyParallel: false, workers: 1, retries: 0,
  // Generous: this machine often runs other agents at the same time.
  timeout: 60_000, expect: { timeout: 15_000 },
  use: { browserName: "chromium", screenshot: "only-on-failure", trace: "retain-on-failure" },
});
