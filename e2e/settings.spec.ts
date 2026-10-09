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

test("while the settings load, a spinner says so", async ({ page }) => {
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/settings/global", async route => { await held; await route.continue(); });
  await page.reload();
  await expect(page.getByText("Reading settings…")).toBeVisible();
  await expect(page.getByRole("status", { name: "Loading" })).toBeVisible();
  release();
  await expect(page.getByRole("heading", { name: "Models & thinking" })).toBeVisible();
  await expect(page.getByRole("status", { name: "Loading" })).toHaveCount(0);
  await page.unrouteAll({ behavior: "wait" });
});

test("save writes native files directly, preserves unknown values, and survives reload", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "Models & thinking" })).toBeVisible();
  await page.getByLabel("Shell command prefix", { exact: true }).fill("new-model");
  expect(JSON.parse(await readFile(file, "utf8")).shellCommandPrefix).toBe("fixture-prefix");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("region", { name: "Notifications" })).toContainText("Saved to file");
  const saved = JSON.parse(await readFile(file, "utf8"));
  expect(saved.shellCommandPrefix).toBe("new-model");
  expect(saved.extensionSecret).toBe("fixture-not-real");
  await page.reload();
  await expect(page.getByLabel("Shell command prefix", { exact: true })).toHaveValue("new-model");
});

test("while the settings save, Save shows a spinner", async ({ page }) => {
  await page.getByLabel("Shell command prefix", { exact: true }).fill("held");
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/**", route => route.request().method() === "GET" ? route.continue() : held.then(() => route.continue()));
  await page.getByRole("region", { name: "Unsaved changes" }).getByRole("button", { name: "Save", exact: true }).click();
  const saving = page.getByRole("button", { name: "Saving…" });
  await expect(saving).toBeDisabled();
  await expect(saving.locator("[data-slot=spinner]")).toBeVisible();
  release();
  await expect(saving).toBeHidden();
  await page.unrouteAll({ behavior: "wait" });
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
  await expect(page.getByRole("region", { name: "Notifications" })).toContainText("Saved to file");
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "Restore previous file" }).click();
  const ask = page.getByRole("alertdialog", { name: "Restore previous file?" });
  await expect(ask).toContainText("replaces the whole file with its latest backup");
  // The settings stay in view behind the question.
  await expect(page.getByLabel("Shell command prefix", { exact: true })).toHaveValue("changed");
  await ask.getByRole("button", { name: "Restore previous file" }).click();
  await expect(ask).toBeHidden();
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
  await expect(page.getByRole("region", { name: "Notifications" })).toContainText("Saved to file");
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
  await expect(page.getByRole("button", { name: "Use default for Shell command prefix" })).toBeFocused();
  expect(errors).toEqual([]);
});

test("a switch and a typed choice save with their JSON types", async ({ page }) => {
  await page.getByRole("switch", { name: "Automatic compaction" }).click();
  await page.getByRole("region", { name: "Terminal UI" }).getByRole("button", { name: /advanced settings/ }).click();
  await page.getByRole("combobox", { name: "Image protocol" }).click();
  await page.getByRole("option", { name: "false", exact: true }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("region", { name: "Notifications" })).toContainText("Saved");
  const saved = JSON.parse(await readFile(file, "utf8"));
  expect([saved.compaction, saved.terminal]).toEqual([{ enabled: false }, { images: false }]);
});

test("the raw JSON editor saves exactly what was typed and repairs a broken file", async ({ page }) => {
  await writeFile(file, '{ "shellCommandPrefix": "broken", }');
  await page.reload();
  await expect(page.getByRole("alert")).toContainText("valid JSON");
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "Edit as JSON" }).click();
  const editor = page.getByLabel("settings.json", { exact: true });
  await expect(editor).toHaveValue('{ "shellCommandPrefix": "broken", }');
  await editor.fill('{ "shellCommandPrefix": "repaired" }');
  await page.getByRole("button", { name: "Save JSON" }).click();
  await expect(page.getByRole("region", { name: "Notifications" })).toContainText("Saved");
  expect(await readFile(file, "utf8")).toBe('{ "shellCommandPrefix": "repaired" }');
  await expect(page.getByLabel("Shell command prefix", { exact: true })).toHaveValue("repaired");
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "Edit as JSON" }).click();
  await page.getByLabel("settings.json", { exact: true }).fill("[1]");
  await page.getByRole("button", { name: "Save JSON" }).click();
  await expect(page.getByRole("alert")).toContainText("JSON object");
  expect(await readFile(file, "utf8")).toBe('{ "shellCommandPrefix": "repaired" }');
});

test("while the shortcuts save, their Save shows a spinner", async ({ page }) => {
  const panel = page.getByRole("region", { name: "Keyboard shortcuts" });
  await panel.getByRole("searchbox", { name: "Search shortcuts" }).fill("new session");
  await panel.getByLabel("Keys for app.session.new").fill("ctrl+shift+n");
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/**", route => route.request().method() === "GET" ? route.continue() : held.then(() => route.continue()));
  await panel.getByRole("button", { name: "Save shortcuts" }).click();
  const saving = page.getByRole("button", { name: "Saving…" });
  await expect(saving).toBeDisabled();
  await expect(saving.locator("[data-slot=spinner]")).toBeVisible();
  release();
  await expect(saving).toBeHidden();
  await page.unrouteAll({ behavior: "wait" });
});

test("while the raw JSON saves, Save JSON shows a spinner", async ({ page }) => {
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "Edit as JSON" }).click();
  await expect(page.getByLabel("settings.json", { exact: true })).toBeVisible();
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/**", route => route.request().method() === "GET" ? route.continue() : held.then(() => route.continue()));
  await page.getByRole("button", { name: "Save JSON" }).click();
  const saving = page.getByRole("button", { name: "Saving…" });
  await expect(saving).toBeDisabled();
  await expect(saving.locator("[data-slot=spinner]")).toBeVisible();
  release();
  await expect(saving).toBeHidden();
  await page.unrouteAll({ behavior: "wait" });
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
  await expect(page.getByRole("region", { name: "Notifications" })).toContainText("Saved keybindings.json");
  expect(JSON.parse(await readFile(keys, "utf8"))).toEqual({ "app.session.new": "ctrl+shift+n", "tui.altScreen.pageUp": [] });
  await panel.getByRole("searchbox", { name: "Search shortcuts" }).fill("session.tree");
  await panel.getByLabel("Keys for app.session.tree").fill("ctrl+banana");
  await expect(panel.getByText("not a key Pi understands")).toBeVisible();
  await panel.getByRole("button", { name: "Save shortcuts" }).click();
  await expect(panel.getByLabel("Keys for app.session.tree")).toBeFocused();
  expect(JSON.parse(await readFile(keys, "utf8"))).toEqual({ "app.session.new": "ctrl+shift+n", "tui.altScreen.pageUp": [] });
});

test("per-model thinking levels and compaction overrides are edited as rows", async ({ page }) => {
  const thinking = page.getByRole("group", { name: "Thinking level per model" });
  await thinking.getByRole("button", { name: "Add model" }).click();
  await thinking.getByLabel("Model 1", { exact: true }).fill("anthropic/claude-sonnet");
  await thinking.getByRole("combobox", { name: "Thinking level for model 1" }).click();
  await page.getByRole("option", { name: "high", exact: true }).click();
  await page.getByRole("region", { name: "Sessions & context" }).getByRole("button", { name: /advanced settings/ }).click();
  const compaction = page.getByRole("group", { name: "Compaction per model" });
  await compaction.getByRole("button", { name: "Add model" }).click();
  await compaction.getByLabel("Model 1", { exact: true }).fill("openai/gpt");
  await compaction.getByLabel("Reserved tokens for model 1").fill("8000");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("region", { name: "Notifications" })).toContainText("Saved");
  const saved = JSON.parse(await readFile(file, "utf8"));
  expect([saved.modelThinkingLevels, saved.compaction]).toEqual([{ "anthropic/claude-sonnet": "high" }, { modelOverrides: { "openai/gpt": { reserveTokens: 8000 } } }]);
  await thinking.getByLabel("Model 1", { exact: true }).fill("no-slash");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(thinking.getByLabel("Model 1", { exact: true })).toBeFocused();
  expect(JSON.parse(await readFile(file, "utf8")).modelThinkingLevels).toEqual({ "anthropic/claude-sonnet": "high" });
});

test("the theme is chosen from Pi's themes: one theme, or a light and a dark one", async ({ page }) => {
  await mkdir(join(root, "agent", "themes"), { recursive: true });
  await writeFile(join(root, "agent", "themes", "ocean.json"), JSON.stringify({ name: "ocean", appearance: "dark", colors: {} }));
  await page.reload();
  const theme = page.getByRole("group", { name: "Theme" });
  await theme.getByRole("combobox", { name: "Theme mode" }).click();
  await page.getByRole("option", { name: "One theme" }).click();
  await theme.getByRole("combobox", { name: "Theme name" }).click();
  await page.getByRole("option", { name: /^ocean / }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("region", { name: "Notifications" })).toContainText("Saved");
  expect(JSON.parse(await readFile(file, "utf8")).theme).toBe("ocean");
  await theme.getByRole("combobox", { name: "Theme mode" }).click();
  await page.getByRole("option", { name: "A light and a dark theme" }).click();
  await theme.getByRole("combobox", { name: "Light terminals" }).click();
  await page.getByRole("option", { name: /^light / }).click();
  await theme.getByRole("combobox", { name: "Dark terminals" }).click();
  await page.getByRole("option", { name: /^ocean / }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("region", { name: "Notifications" })).toContainText("Saved");
  expect(JSON.parse(await readFile(file, "utf8")).theme).toBe("light/ocean");
});

test("the installed Pi version is shown with an Update Pi action that asks first", async ({ page }) => {
  const pi = page.getByRole("region", { name: "Pi" });
  await expect(pi).toContainText(/Pi \d+\.\d+\.\d+ is installed/);
  const update = pi.getByRole("button", { name: "Update Pi" });
  await update.click();
  const ask = page.getByRole("alertdialog", { name: "Update Pi now?" });
  await expect(ask).toContainText("Open Pi sessions keep the running version until they restart.");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  // Only ever cancelled: confirming would update the real Pi on this machine.
  await ask.getByRole("button", { name: "Cancel" }).click();
  await expect(ask).toBeHidden();
  await expect(update).toBeFocused();
  await expect(pi.getByRole("region")).toHaveCount(0);
});

test("unsaved changes keep their save action in view while scrolling", async ({ page }) => {
  await page.getByLabel("Shell command prefix", { exact: true }).fill("x");
  await page.getByRole("heading", { name: "Models & thinking" }).scrollIntoViewIfNeeded();
  const bar = page.getByRole("region", { name: "Unsaved changes" });
  await expect(bar).toContainText("1 unsaved change");
  await expect(bar.getByRole("button", { name: "Save", exact: true })).toBeInViewport();
  await bar.getByRole("button", { name: "Discard" }).click();
  await expect(bar).toBeHidden();
  await expect(page.getByLabel("Shell command prefix", { exact: true })).toHaveValue("fixture-prefix");
});

test("the section index jumps to a group and marks where the reader is", async ({ page }) => {
  const index = page.getByRole("navigation", { name: "Setting groups" });
  await index.getByRole("link", { name: "Network & retries" }).click();
  await expect(page.getByRole("heading", { name: "Network & retries" })).toBeInViewport();
  await expect(index.getByRole("link", { name: "Network & retries" })).toHaveAttribute("aria-current", "true");
});

test("emptying a number field returns it to Pi's default", async ({ page }) => {
  await page.getByRole("region", { name: "Models & thinking" }).getByRole("button", { name: /advanced settings/ }).click();
  const budget = page.getByLabel("Thinking budget: minimal", { exact: true });
  await budget.fill("500");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("region", { name: "Notifications" })).toContainText("Saved to file");
  expect(JSON.parse(await readFile(file, "utf8")).thinkingBudgets).toEqual({ minimal: 500 });
  await budget.fill("");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("region", { name: "Notifications" })).toContainText("Saved to file");
  expect(JSON.parse(await readFile(file, "utf8")).thinkingBudgets?.minimal).toBeUndefined();
});

test("the section index counts the settings each group sets and marks unsaved edits", async ({ page }) => {
  const index = page.getByRole("navigation", { name: "Setting groups" });
  await expect(index.getByRole("link", { name: "Shell & packages (1 set)" })).toBeVisible();
  await page.getByRole("switch", { name: "Cache notices" }).click();
  await expect(index.getByRole("link", { name: "Models & thinking (unsaved changes)" })).toBeVisible();
});

test("slash moves to the search field unless the reader is typing", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "Models & thinking" })).toBeVisible();
  await page.keyboard.press("/");
  await expect(page.getByRole("searchbox", { name: "Search settings" })).toBeFocused();
  await page.getByLabel("Shell command prefix", { exact: true }).fill("a");
  await page.getByLabel("Shell command prefix", { exact: true }).press("/");
  await expect(page.getByLabel("Shell command prefix", { exact: true })).toHaveValue("a/");
});

test("startup tools are a checklist that saves modifiers against Pi's defaults", async ({ page }) => {
  const tools = page.getByRole("group", { name: "Startup tools" });
  await expect(tools.getByRole("checkbox", { name: "read", exact: true })).toBeChecked();
  await expect(tools.getByRole("checkbox", { name: "grep", exact: true })).not.toBeChecked();
  await tools.getByRole("checkbox", { name: "grep", exact: true }).check();
  await tools.getByRole("checkbox", { name: "write", exact: true }).uncheck();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("region", { name: "Notifications" })).toContainText("Saved to file");
  expect(JSON.parse(await readFile(file, "utf8")).defaultTools).toEqual(["+grep", "-write"]);
  await tools.getByRole("checkbox", { name: "grep", exact: true }).uncheck();
  await tools.getByRole("checkbox", { name: "write", exact: true }).check();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("region", { name: "Notifications" })).toContainText("Saved to file");
  expect(JSON.parse(await readFile(file, "utf8")).defaultTools).toBeUndefined();
  expect((await new AxeBuilder({ page }).include("#row-defaultTools").analyze()).violations).toEqual([]);
});

test("the page opens on everyday groups, with the terminal-only ones last", async ({ page }) => {
  const index = page.getByRole("navigation", { name: "Setting groups" });
  await expect(index.getByRole("link")).toHaveText([/^Tools/, /^Messages & interaction/, /^Models & thinking/, /^Sessions & context/, /^Shell & packages/,
    /^Images/, /^Updates, telemetry & warnings/, /^Network & retries/, /^Terminal UI/, /^Keyboard shortcuts/]);
});

test("advanced settings wait behind their group's toggle", async ({ page }) => {
  const models = page.getByRole("region", { name: "Models & thinking" });
  await expect(models.getByRole("group", { name: "Thinking level per model" })).toBeVisible();
  await expect(models.getByLabel("Thinking budget: minimal", { exact: true })).toBeHidden();
  await models.getByRole("button", { name: "5 advanced settings" }).click();
  await expect(models.getByLabel("Thinking budget: minimal", { exact: true })).toBeVisible();
});

test("a group's advanced settings start open when the file sets one of them", async ({ page }) => {
  // The fixture sets shellCommandPrefix; nothing in Network & retries.
  await expect(page.getByLabel("Shell command prefix", { exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Transport" })).toBeHidden();
});

test("search reaches advanced settings without opening their group", async ({ page }) => {
  await page.getByRole("searchbox", { name: "Search settings" }).fill("budget");
  await expect(page.getByLabel("Thinking budget: minimal", { exact: true })).toBeVisible();
});

test("save opens a folded group to reach a value Pi would refuse", async ({ page }) => {
  const models = page.getByRole("region", { name: "Models & thinking" });
  const toggle = models.getByRole("button", { name: "5 advanced settings" });
  const budget = models.getByLabel("Thinking budget: minimal", { exact: true });
  await toggle.click();
  await budget.fill("-1");
  await toggle.click();
  await expect(budget).toBeHidden();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(budget).toBeFocused();
  expect(JSON.parse(await readFile(file, "utf8")).thinkingBudgets).toBeUndefined();
});
