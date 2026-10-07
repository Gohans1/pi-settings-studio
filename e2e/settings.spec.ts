import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { startServer, type RunningServer } from "../src/server/server.ts";

let root: string, file: string, server: RunningServer;
test.beforeEach(async ({ page }) => {
  root = await mkdtemp(join(tmpdir(), "pi-settings-browser-"));
  const agentDir = join(root, "agent");
  await mkdir(agentDir);
  file = join(agentDir, "settings.json");
  await writeFile(file, JSON.stringify({ defaultProvider: "test-provider", defaultModel: "fixture-model", extensionSecret: "fixture-not-real" }));
  server = await startServer({ agentDir, projectDir: join(root, "project"), staticDir: resolve("dist/client") });
  await page.goto(server.url);
});
test.afterEach(async () => { await server?.close(); await rm(root, { recursive: true, force: true }); });

test("save writes native files directly, preserves unknown values, and survives reload", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "Models & thinking" })).toBeVisible();
  await page.getByLabel("Default model", { exact: true }).fill("new-model");
  expect(JSON.parse(await readFile(file, "utf8")).defaultModel).toBe("fixture-model");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Saved to file");
  const saved = JSON.parse(await readFile(file, "utf8"));
  expect(saved.defaultModel).toBe("new-model");
  expect(saved.extensionSecret).toBe("fixture-not-real");
  await page.reload();
  await expect(page.getByLabel("Default model", { exact: true })).toHaveValue("new-model");
});

test("stale saves retain the draft and never overwrite a concurrent update", async ({ page }) => {
  await page.getByLabel("Default model", { exact: true }).fill("my-draft");
  await writeFile(file, '{"defaultModel":"other-session","unknown":42}');
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("changed in another session");
  expect(JSON.parse(await readFile(file, "utf8")).defaultModel).toBe("other-session");
  await expect(page.getByLabel("Default model", { exact: true })).toHaveValue("my-draft");
});

test("search narrows the settings by label or key", async ({ page }) => {
  await page.getByRole("searchbox", { name: "Search settings" }).fill("enabledModels");
  await expect(page.getByLabel("Enabled models", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Default model", { exact: true })).toBeHidden();
});

test("backup restore is explicit and restores the original native document", async ({ page }) => {
  await page.getByLabel("Default model", { exact: true }).fill("changed");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Saved to file");
  await page.getByRole("button", { name: "Restore previous file" }).click();
  await expect(page.getByRole("heading", { name: "Restore previous file?" })).toBeVisible();
  await page.getByRole("button", { name: "Confirm restore" }).click();
  await expect(page.getByLabel("Default model", { exact: true })).toHaveValue("fixture-model");
  expect(JSON.parse(await readFile(file, "utf8")).defaultModel).toBe("fixture-model");
});

test("model patterns can be entered as separate lines without losing Enter", async ({ page }) => {
  const list = page.getByLabel("Enabled models", { exact: true });
  await list.fill("provider/first");
  await list.press("End");
  await list.press("Enter");
  await expect(list).toHaveValue("provider/first\n");
  await list.pressSequentially("provider/second");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Saved to file");
  expect(JSON.parse(await readFile(file, "utf8")).enabledModels).toEqual(["provider/first", "provider/second"]);
});

test("desktop and narrow layouts are accessible, keyboard usable and error-free", async ({ page }) => {
  test.slow(); // Four axe passes over the full General page.
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  await expect(page.getByRole("heading", { name: "Models & thinking" })).toBeVisible();
  for (const width of [1440, 768, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  }
  await page.emulateMedia({ colorScheme: "dark" });
  // Colour transitions must settle, or axe may measure a half-faded colour.
  await page.waitForFunction(() => document.getAnimations().every(animation => animation.playState !== "running"));
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.emulateMedia({ colorScheme: "light" });
  await page.getByLabel("Default model", { exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Reset Default model to Pi's default" })).toBeFocused();
  expect(errors).toEqual([]);
});

test("a switch and a typed choice save with their JSON types", async ({ page }) => {
  await page.getByRole("switch", { name: "Automatic compaction" }).click();
  await page.getByLabel("Image protocol").selectOption("false");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Saved");
  const saved = JSON.parse(await readFile(file, "utf8"));
  expect([saved.compaction, saved.terminal]).toEqual([{ enabled: false }, { images: false }]);
});
