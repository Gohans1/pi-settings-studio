import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e", fullyParallel: false, workers: 1, retries: 0,
  timeout: 20_000, expect: { timeout: 4_000 },
  use: { browserName: "chromium", screenshot: "only-on-failure", trace: "retain-on-failure" },
});
