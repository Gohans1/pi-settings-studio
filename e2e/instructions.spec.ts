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
