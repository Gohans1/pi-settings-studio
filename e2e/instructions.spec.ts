import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdtemp, mkdir, writeFile, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { startServer, type RunningServer } from "../src/server/server.ts";

let root: string, agent: string, project: string, server: RunningServer;
test.beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "pi-settings-instructions-browser-"));
  agent = join(root, "agent");
  project = join(root, "webapp");
  await mkdir(agent, { recursive: true });
  await mkdir(project, { recursive: true });
  await writeFile(join(agent, "AGENTS.md"), "# Global rules\n");
  server = await startServer({ agentDir: agent, projectDir: project, port: 0, staticDir: resolve("dist/client") });
});
test.afterEach(async () => { await server?.close(); await rm(root, { recursive: true, force: true }); });

test("while an instruction file saves, Save file shows a spinner", async ({ page }) => {
  await page.goto(server.url + "#instructions");
  await page.getByRole("button", { name: /^Instructions/ }).first().click();
  await page.getByLabel("Contents of AGENTS.md").fill("# Global rules\n- Be brief.\n");
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/**", route => route.request().method() === "GET" ? route.continue() : held.then(() => route.continue()));
  await page.getByRole("button", { name: "Save file" }).click();
  const saving = page.getByRole("button", { name: "Saving…" });
  await expect(saving).toBeDisabled();
  await expect(saving.locator("[data-slot=spinner]")).toBeVisible();
  release();
  await expect(saving).toBeHidden();
  await page.unrouteAll({ behavior: "wait" });
});

test("on a wide screen a file's editor stops at 60rem", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 900 });
  await page.goto(server.url + "#instructions");
  await page.getByRole("button", { name: /^Instructions/ }).first().click();
  expect((await page.getByLabel("Contents of AGENTS.md").boundingBox())!.width).toBeLessThanOrEqual(960);
});

test("instruction files are edited, created and removed with undo", async ({ page }) => {
  await page.goto(server.url + "#instructions");
  await page.getByRole("button", { name: /^Instructions/ }).first().click();
  const editor = page.getByLabel("Contents of AGENTS.md");
  await expect(editor).toHaveValue("# Global rules\n");
  await editor.fill("# Global rules\n- Be brief.\n");
  await page.getByRole("button", { name: "Save file" }).click();
  await expect(page.getByRole("region", { name: "Notifications" })).toContainText("Saved AGENTS.md");
  expect(await readFile(join(agent, "AGENTS.md"), "utf8")).toBe("# Global rules\n- Be brief.\n");

  await page.getByRole("combobox", { name: "Project", exact: true }).click();
  await page.getByRole("option", { name: project, exact: true }).click();
  await page.getByRole("button", { name: /^\.pi\/SYSTEM\.md/ }).click();
  await expect(page.getByText("Not created yet")).toBeVisible();
  await page.getByLabel("Contents of SYSTEM.md").fill("You review code.\n");
  await page.getByRole("button", { name: "Create file" }).click();
  await expect(page.getByRole("region", { name: "Notifications" })).toContainText("Saved SYSTEM.md");
  expect(await readFile(join(project, ".pi", "SYSTEM.md"), "utf8")).toBe("You review code.\n");

  await page.getByRole("button", { name: "Delete file" }).click();
  await expect(page.getByRole("region", { name: "Notifications" })).toContainText("Deleted SYSTEM.md");
  await expect(stat(join(project, ".pi", "SYSTEM.md"))).rejects.toThrow();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("region", { name: "Notifications" })).toContainText("Restored SYSTEM.md");
  expect(await readFile(join(project, ".pi", "SYSTEM.md"), "utf8")).toBe("You review code.\n");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

const exactDraft = "  # Unsaved instructions\n\nKeep tabs\tand Unicode: π 🧪\nTrailing spaces  \n";

for (const width of [1280, 390]) {
  test(`instruction drafts survive cancelled sibling navigation at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(server.url + "#instructions");
    const original = page.getByRole("button", { name: /^Instructions/ }).first();
    const sibling = page.getByRole("button", { name: /^SYSTEM\.md/ });
    await original.click();
    const editor = page.getByLabel("Contents of AGENTS.md");
    await editor.fill(exactDraft);
    await page.screenshot({ path: testInfo.outputPath("dirty-before-navigation.png") });
    if (width < 896) await page.getByRole("button", { name: "All files" }).click();
    await sibling.focus();
    await sibling.press("Enter");
    const dialog = page.getByRole("alertdialog", { name: "Discard the unsaved changes?" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Keep editing" })).toBeFocused();
    await page.screenshot({ path: testInfo.outputPath("draft-navigation-guard.png") });
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await dialog.getByRole("button", { name: "Keep editing" }).click();
    await expect(dialog).toBeHidden();
    await expect(sibling).toBeFocused();
    if (width < 896) await original.click();
    await expect(editor).toHaveValue(exactDraft);

    if (width < 896) await page.getByRole("button", { name: "All files" }).click();
    await sibling.click();
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(sibling).toBeFocused();
    if (width < 896) await original.click();
    await expect(editor).toHaveValue(exactDraft);

    if (width < 896) await page.getByRole("button", { name: "All files" }).click();
    await sibling.click();
    await dialog.getByRole("button", { name: "Discard", exact: true }).click();
    await expect(page.getByLabel("Contents of SYSTEM.md")).toBeVisible();
    if (width < 896) await page.getByRole("button", { name: "All files" }).click();
    await original.click();
    await expect(editor).toHaveValue("# Global rules\n");
    expect(await readFile(join(agent, "AGENTS.md"), "utf8")).toBe("# Global rules\n");
  });
}

test("instruction drafts guard app tabs and restore the navigation control on cancel", async ({ page }) => {
  await page.goto(server.url + "#instructions");
  await page.getByRole("button", { name: /^Instructions/ }).first().click();
  const editor = page.getByLabel("Contents of AGENTS.md");
  await editor.fill(exactDraft);
  const general = page.getByRole("tab", { name: "General", exact: true });
  await general.focus();
  await general.press("Enter");
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(/#instructions$/);
  await dialog.getByRole("button", { name: "Keep editing" }).click();
  await expect(general).toBeFocused();
  await expect(editor).toHaveValue(exactDraft);
  await general.press("Enter");
  await dialog.getByRole("button", { name: "Discard", exact: true }).click();
  await expect(page).toHaveURL(/#general$/);
  await expect(page.getByRole("heading", { name: "General", exact: true })).toBeVisible();
});

test("instruction drafts guard project changes without changing scope on cancel", async ({ page }) => {
  await page.goto(server.url + "#instructions");
  await page.getByRole("button", { name: /^Instructions/ }).first().click();
  const editor = page.getByLabel("Contents of AGENTS.md");
  await editor.fill(exactDraft);
  const picker = page.getByRole("combobox", { name: "Project", exact: true });
  await picker.click();
  await page.getByRole("option", { name: project, exact: true }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Keep editing" }).click();
  await expect(picker).toBeFocused();
  await expect(picker).toContainText("None (global only)");
  await expect(editor).toHaveValue(exactDraft);
  await picker.click();
  await page.getByRole("option", { name: project, exact: true }).click();
  await dialog.getByRole("button", { name: "Discard", exact: true }).click();
  await expect(picker).toContainText(project);
  await expect(editor).toHaveValue("# Global rules\n");
  await expect(page.getByRole("button", { name: "Save file" })).toBeDisabled();
});

test("instruction drafts guard hash navigation and preserve the fragment on cancel", async ({ page }) => {
  await page.goto(server.url + "#instructions");
  await page.getByLabel("Contents of AGENTS.md").fill(exactDraft);
  await page.evaluate(() => { location.hash = "#general/messages"; });
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(/#instructions$/);
  await dialog.getByRole("button", { name: "Keep editing" }).click();
  await expect(page.getByLabel("Contents of AGENTS.md")).toHaveValue(exactDraft);
  await page.evaluate(() => { location.hash = "#general/messages"; });
  await dialog.getByRole("button", { name: "Discard", exact: true }).click();
  await expect(page).toHaveURL(/#general\/messages$/);
});

test("instruction drafts survive failed saves including a concurrent file revision", async ({ page }) => {
  await page.goto(server.url + "#instructions");
  const editor = page.getByLabel("Contents of AGENTS.md");
  await editor.fill(exactDraft);
  await writeFile(join(agent, "AGENTS.md"), "# Changed elsewhere\n");
  await page.getByRole("button", { name: "Save file" }).click();
  await expect(page.getByRole("alert")).toContainText("changed");
  await expect(editor).toHaveValue(exactDraft);
  await page.getByRole("button", { name: /^SYSTEM\.md/ }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.getByRole("button", { name: "Keep editing" }).click();
  await expect(editor).toHaveValue(exactDraft);
  expect(await readFile(join(agent, "AGENTS.md"), "utf8")).toBe("# Changed elsewhere\n");
});

test("native reload warns for instruction drafts and cancel preserves exact text", async ({ page }) => {
  await page.goto(server.url + "#instructions");
  await page.getByLabel("Contents of AGENTS.md").fill(exactDraft);
  const cdp = await page.context().newCDPSession(page);
  const warning = page.waitForEvent("dialog");
  const reload = cdp.send("Page.reload");
  const dialog = await warning;
  expect(dialog.type()).toBe("beforeunload");
  await dialog.dismiss();
  await reload;
  await cdp.detach();
  await expect(page.getByLabel("Contents of AGENTS.md")).toHaveValue(exactDraft);
  await page.getByRole("button", { name: "Discard changes", exact: true }).click();
  await page.reload();
  await expect(page.getByLabel("Contents of AGENTS.md")).toHaveValue("# Global rules\n");
});

test("saved instruction drafts allow clean file, tab and project navigation", async ({ page }) => {
  await page.goto(server.url + "#instructions");
  await page.getByLabel("Contents of AGENTS.md").fill(exactDraft);
  await page.getByRole("button", { name: "Save file" }).click();
  await expect(page.getByRole("button", { name: "Save file" })).toBeDisabled();
  await page.getByRole("button", { name: /^SYSTEM\.md/ }).click();
  await expect(page.getByLabel("Contents of SYSTEM.md")).toBeVisible();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await page.getByRole("tab", { name: "General", exact: true }).click();
  await expect(page).toHaveURL(/#general$/);
  await page.getByRole("combobox", { name: "Project", exact: true }).click();
  await page.getByRole("option", { name: project, exact: true }).click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await page.reload();
  expect(await readFile(join(agent, "AGENTS.md"), "utf8")).toBe(exactDraft);
});
