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
  await writeFile(file, JSON.stringify({ defaultProvider: "test-provider", shellCommandPrefix: "fixture-prefix", extensionSecret: "fixture-not-real" }));
  server = await startServer({ agentDir, projectDir: join(root, "project"), port: 0, staticDir: resolve("dist/client") });
  await page.goto(server.url);
});
test.afterEach(async () => { await server?.close(); await rm(root, { recursive: true, force: true }); });

test("save writes native files directly, preserves unknown values, and survives reload", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "Models & thinking" })).toBeVisible();
  await page.getByLabel("Shell command prefix", { exact: true }).fill("new-model");
  expect(JSON.parse(await readFile(file, "utf8")).shellCommandPrefix).toBe("fixture-prefix");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("status").first()).toContainText("Saved to file");
  const saved = JSON.parse(await readFile(file, "utf8"));
  expect(saved.shellCommandPrefix).toBe("new-model");
  expect(saved.extensionSecret).toBe("fixture-not-real");
  await page.reload();
  await expect(page.getByLabel("Shell command prefix", { exact: true })).toHaveValue("new-model");
});

test("stale saves retain the draft and never overwrite a concurrent update", async ({ page }) => {
  await page.getByLabel("Shell command prefix", { exact: true }).fill("my-draft");
  await writeFile(file, '{"shellCommandPrefix":"other-session","unknown":42}');
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("changed in another session");
  expect(JSON.parse(await readFile(file, "utf8")).shellCommandPrefix).toBe("other-session");
  await expect(page.getByLabel("Shell command prefix", { exact: true })).toHaveValue("my-draft");
});

test("search narrows the settings by label or key", async ({ page }) => {
  await page.getByRole("searchbox", { name: "Search settings" }).fill("npmCommand");
  await expect(page.getByLabel("npm command", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Shell command prefix", { exact: true })).toBeHidden();
});

test("backup restore is explicit and restores the original native document", async ({ page }) => {
  await page.getByLabel("Shell command prefix", { exact: true }).fill("changed");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("status").first()).toContainText("Saved to file");
  await page.getByRole("button", { name: "Restore previous file" }).click();
  await expect(page.getByRole("heading", { name: "Restore previous file?" })).toBeVisible();
  await page.getByRole("button", { name: "Confirm restore" }).click();
  await expect(page.getByLabel("Shell command prefix", { exact: true })).toHaveValue("fixture-prefix");
  expect(JSON.parse(await readFile(file, "utf8")).shellCommandPrefix).toBe("fixture-prefix");
});

test("list fields take one entry per line without losing Enter", async ({ page }) => {
  const list = page.getByLabel("npm command", { exact: true });
  await list.fill("bun");
  await list.press("End");
  await list.press("Enter");
  await expect(list).toHaveValue("bun\n");
  await list.pressSequentially("x");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("status").first()).toContainText("Saved to file");
  expect(JSON.parse(await readFile(file, "utf8")).npmCommand).toEqual(["bun", "x"]);
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
  await page.getByLabel("Shell command prefix", { exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Reset Shell command prefix to Pi's default" })).toBeFocused();
  expect(errors).toEqual([]);
});

test("a switch and a typed choice save with their JSON types", async ({ page }) => {
  await page.getByRole("switch", { name: "Automatic compaction" }).click();
  await page.getByLabel("Image protocol").selectOption("false");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("status").first()).toContainText("Saved");
  const saved = JSON.parse(await readFile(file, "utf8"));
  expect([saved.compaction, saved.terminal]).toEqual([{ enabled: false }, { images: false }]);
});

test("the raw JSON editor saves exactly what was typed and repairs a broken file", async ({ page }) => {
  await writeFile(file, '{ "shellCommandPrefix": "broken", }');
  await page.reload();
  await expect(page.getByRole("alert")).toContainText("valid JSON");
  await page.getByRole("button", { name: "Edit raw JSON" }).click();
  const editor = page.getByLabel("settings.json");
  await expect(editor).toHaveValue('{ "shellCommandPrefix": "broken", }');
  await editor.fill('{ "shellCommandPrefix": "repaired" }');
  await page.getByRole("button", { name: "Save JSON" }).click();
  await expect(page.getByRole("status").first()).toContainText("Saved");
  expect(await readFile(file, "utf8")).toBe('{ "shellCommandPrefix": "repaired" }');
  await expect(page.getByLabel("Shell command prefix", { exact: true })).toHaveValue("repaired");
  await page.getByRole("button", { name: "Edit raw JSON" }).click();
  await page.getByLabel("settings.json").fill("[1]");
  await page.getByRole("button", { name: "Save JSON" }).click();
  await expect(page.getByRole("alert")).toContainText("JSON object");
  expect(await readFile(file, "utf8")).toBe('{ "shellCommandPrefix": "repaired" }');
});

test("keyboard shortcuts are edited, disabled and reset in keybindings.json", async ({ page }) => {
  const keys = join(root, "agent", "keybindings.json");
  await writeFile(keys, JSON.stringify({ "app.model.select": "ctrl+k" }));
  await page.reload();
  const panel = page.getByRole("region", { name: "Keyboard shortcuts" });
  await panel.getByRole("searchbox", { name: "Search shortcuts" }).fill("new session");
  await panel.getByLabel("Keys for app.session.new").fill("ctrl+shift+n");
  await panel.getByRole("searchbox", { name: "Search shortcuts" }).fill("model selector");
  await panel.getByRole("button", { name: "Use default for app.model.select" }).click();
  await panel.getByRole("searchbox", { name: "Search shortcuts" }).fill("altScreen.pageUp");
  await panel.getByRole("button", { name: "Disable tui.altScreen.pageUp" }).click();
  await panel.getByRole("button", { name: "Save shortcuts" }).click();
  await expect(panel.getByRole("status")).toContainText("Saved keybindings.json");
  expect(JSON.parse(await readFile(keys, "utf8"))).toEqual({ "app.session.new": "ctrl+shift+n", "tui.altScreen.pageUp": [] });
  await panel.getByRole("searchbox", { name: "Search shortcuts" }).fill("session.tree");
  await panel.getByLabel("Keys for app.session.tree").fill("ctrl+banana");
  await expect(panel.getByText("not a key Pi understands")).toBeVisible();
  await expect(panel.getByRole("button", { name: "Save shortcuts" })).toBeDisabled();
});
