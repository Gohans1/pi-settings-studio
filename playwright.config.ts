import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e", fullyParallel: false, workers: 1, retries: 0,
  // Generous: this machine often runs other agents at the same time.
  timeout: 60_000, expect: { timeout: 15_000 },
  use: { browserName: "chromium", screenshot: "only-on-failure", trace: "retain-on-failure" },
});
