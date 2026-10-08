import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { ProjectTrustStore } from "@earendil-works/pi-coding-agent";
import { startServer, type RunningServer } from "../src/server/server.ts";
import { packageRegistry } from "../tests/fixtures/package-registry.ts";

let root: string, agent: string, project: string, server: RunningServer, registry: Awaited<ReturnType<typeof packageRegistry>>;
test.beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "pss-update-browser-"));
  agent = join(root, "agent"); project = join(root, "project");
  registry = await packageRegistry(root);
  await registry.configure(agent); await registry.configure(project);
  await mkdir(join(project, ".pi"));
  new ProjectTrustStore(agent).set(project, true);
  await registry.installed(agent, "old-package");
  await registry.installed(agent, "pinned-package");
  await writeFile(join(agent, "settings.json"), JSON.stringify({ packages: ["npm:old-package", "npm:pinned-package@1.0.0"] }));
  await writeFile(join(project, ".pi/settings.json"), JSON.stringify({ packages: ["npm:old-package"] }));
  await registry.installed(join(project, ".pi"), "old-package", "2.0.0");
  server = await startServer({ agentDir: agent, projectDir: project, port: 0, staticDir: resolve("dist/client") });
});
test.afterEach(async () => { await server?.close(); registry?.close(); await rm(root, { recursive: true, force: true }); });


test("while a check runs, its button shows a spinner and keeps its name", async ({ page }) => {
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/plugins/updates", async route => { const response = await route.fetch(); await held; await route.fulfill({ response }); });
  await page.goto(server.url + "#plugins");
  await page.getByRole("button", { name: /^Packages/ }).click();
  const button = page.getByRole("button", { name: "Check for updates", exact: true });
  await button.click();
  await expect(button).toBeDisabled();
  await expect(button.locator("[data-slot=spinner]")).toBeVisible();
  release();
  await expect(button).toBeEnabled();
  await expect(button.locator("[data-slot=spinner]")).toHaveCount(0);
  await page.unrouteAll({ behavior: "wait" });
});

test("an explicit keyboard check shows package notices, retains them on reload and replaces them on recheck", async ({ page }) => {
  const settings = await readFile(join(agent, "settings.json"), "utf8");
  await page.goto(server.url + "#plugins");
  await page.getByRole("button", { name: /^Packages/ }).click();
  const packages = page.getByRole("region", { name: "Packages", exact: true });
  await expect(packages.getByRole("status")).toContainText("Not checked yet");
  expect(registry.requests).toEqual([]);
  const button = packages.getByRole("button", { name: "Check for updates" });
  await button.focus(); await page.keyboard.press("Enter");
  await expect(packages.getByRole("status")).toContainText("1 package update found");
  await expect(packages.getByText("Update available", { exact: true })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Packages 1 update" })).toBeVisible();
  await expect(packages).toContainText("Last checked");
  expect(await readFile(join(agent, "settings.json"), "utf8")).toBe(settings);
  expect(JSON.parse(await readFile(join(agent, "npm/node_modules/old-package/package.json"), "utf8")).version).toBe("1.0.0");
  const requests = registry.requests.length;
  await page.reload();
  await page.getByRole("button", { name: "Packages 1 update" }).click();
  await expect(packages.getByText("Update available", { exact: true })).toBeVisible();
  expect(registry.requests.length).toBe(requests);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await registry.installed(agent, "old-package", "2.0.0");
  await button.click();
  await expect(packages.getByRole("status")).toContainText("No updates reported by Pi");
  await expect(packages.getByText("Update available", { exact: true })).toHaveCount(0);
  await expect(packages).toContainText("failed lookups");
});

test("checking errors explain recovery without clearing the previous result", async ({ page }) => {
  await page.goto(server.url + "#plugins");
  await page.getByRole("button", { name: /^Packages/ }).click();
  await page.getByRole("button", { name: "Check for updates" }).click();
  await expect(page.getByText("Update available", { exact: true })).toBeVisible();
  await page.route("**/api/plugins/updates", route => route.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ error: "Could not check package updates. Check your connection and package sources, then try again." }) }));
  await page.getByRole("button", { name: "Check for updates" }).click();
  await expect(page.getByRole("alert")).toContainText("Check your connection");
  await expect(page.getByText("Update available", { exact: true })).toBeVisible();
  await page.unroute("**/api/plugins/updates");
  await page.getByRole("button", { name: "Check for updates" }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("a delayed global check cannot replace a selected project's results", async ({ page }) => {
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  let started!: () => void;
  const checking = new Promise<void>(resolve => { started = resolve; });
  await page.route("**/api/plugins/updates", async route => {
    const response = await route.fetch();
    started(); await held;
    await route.fulfill({ response });
  });
  await page.goto(server.url + "#plugins");
  await page.getByRole("button", { name: /^Packages/ }).click();
  await page.getByRole("button", { name: "Check for updates" }).click();
  await checking;
  await page.getByRole("combobox", { name: "Project", exact: true }).click();
  await page.getByRole("option", { name: project, exact: true }).click();
  await page.getByRole("button", { name: /^Packages/ }).click();
  const delivered = page.waitForResponse(response => response.url().endsWith("/api/plugins/updates"));
  release();
  await delivered;
  await page.unrouteAll({ behavior: "wait" });
  await expect(page.getByRole("region", { name: "Packages", exact: true }).getByRole("status")).toContainText("Not checked yet");
  await page.getByRole("button", { name: "Check for updates" }).click();
  await expect(page.getByRole("region", { name: "Packages", exact: true }).getByRole("status")).toContainText("No updates reported by Pi");
  await expect(page.getByText("Update available", { exact: true })).toHaveCount(0);
});
