import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { startServer, type RunningServer } from "../src/server/server.ts";

let root: string, agent: string, project: string, file: string, server: RunningServer;
const source = `export default pi => {
  const add = (name, exposure = "direct") => pi.registerTool({ name, label: name, description: "Purpose of " + name,
    exposure, parameters: { type: "object", properties: {} }, execute: async () => ({ content: [], details: undefined }) });
  add("visible_tool"); add("script_tool", "codemode"); add("searchable_tool", "deferred"); add("hidden_tool", "hidden");
  pi.on("session_start", () => add("late_tool", "model-only"));
};`;
test.beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "pi-settings-tool-browser-"));
  agent = join(root, "agent"); project = join(root, "project"); file = join(agent, "extensions", "tools.ts");
  await mkdir(join(agent, "extensions"), { recursive: true });
  await mkdir(join(project, ".pi"), { recursive: true });
  await writeFile(file, source);
  await writeFile(join(agent, "extensions", "empty.ts"), "export default () => {};");
  await writeFile(join(agent, "settings.json"), JSON.stringify({ defaultProjectTrust: "always" }));
  await writeFile(join(project, ".pi", "settings.json"), JSON.stringify({ defaultTools: ["+codemode"], codemode: { mode: "only" } }));
  server = await startServer({ agentDir: agent, projectDir: project, port: 0, staticDir: resolve("dist/client") });
});
test.afterEach(async () => { await server?.close(); await rm(root, { recursive: true, force: true }); });

test("tools load automatically, filter model declarations, and remain catalogued when the extension is off", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(server.url + "#plugins");
  await page.getByRole("button", { name: /^tools\.ts/ }).click();
  const tools = page.getByRole("region", { name: "Extension tools" });
  await expect(tools.getByRole("button", { name: "All tools (5)", exact: true })).toBeVisible();
  await expect(tools.getByRole("list", { name: "Tools" }).getByRole("listitem")).toHaveCount(5);
  await tools.getByRole("button", { name: "Model sees (2)", exact: true }).click();
  await expect(tools.getByRole("listitem")).toHaveCount(2);
  await expect(tools).toContainText("visible_tool");
  await expect(tools).not.toContainText("hidden_tool");
  await tools.getByRole("button", { name: "All tools (5)", exact: true }).click();
  await page.getByRole("switch", { name: "Enable tools.ts", exact: true }).click();
  await expect(tools.getByRole("button", { name: "Model sees (0)", exact: true })).toBeVisible();
  await expect(tools.getByRole("listitem")).toHaveCount(5);
  expect(JSON.parse(await readFile(join(agent, "settings.json"), "utf8")).extensions).toEqual(["-extensions/tools.ts"]);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(errors).toEqual([]);
});

test("the existing project picker changes the preview, including code-mode-only on a narrow screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(server.url + "#plugins");
  await page.getByRole("combobox", { name: "Project", exact: true }).click();
  await page.getByRole("option", { name: project, exact: true }).click();
  await page.getByRole("button", { name: /^tools\.ts/ }).click();
  const tools = page.getByRole("region", { name: "Extension tools" });
  await expect(tools.getByRole("button", { name: "Model sees (1)", exact: true })).toBeVisible();
  const filter = tools.getByRole("button", { name: "Model sees (1)", exact: true });
  await filter.focus(); await page.keyboard.press("Enter");
  await expect(tools.getByRole("listitem")).toHaveCount(1);
  await expect(tools).toContainText("late_tool");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole("combobox", { name: "Project", exact: true }).click();
  await page.getByRole("option", { name: "None (global only)", exact: true }).click();
  await page.getByRole("button", { name: /^tools\.ts/ }).click();
  await expect(tools.getByRole("button", { name: "Model sees (2)", exact: true })).toBeVisible();
});

test("failed inspection is distinguishable from zero tools and Refresh tools retries", async ({ page }) => {
  await writeFile(file, 'throw new Error("fixture cannot load"); export default () => {};');
  await page.goto(server.url + "#plugins");
  await page.getByRole("button", { name: /^tools\.ts/ }).click();
  const tools = page.getByRole("region", { name: "Extension tools" });
  await expect(tools).toContainText("Could not verify all tools");
  await expect(tools).toContainText("fixture cannot load");
  await expect(tools.getByRole("button", { name: "Model sees (0)", exact: true })).toHaveCount(0);
  await writeFile(file, source);
  await tools.getByRole("button", { name: "Refresh tools", exact: true }).click();
  await expect(tools.getByRole("button", { name: "Model sees (2)", exact: true })).toBeVisible();
  await page.getByRole("button", { name: /^empty\.ts/ }).click();
  await expect(tools).toContainText("No tools registered at startup.");
  await expect(tools).not.toContainText("visible_tool");
});

test("a late inspection response never replaces the newly selected extension", async ({ page }) => {
  let release!: () => void;
  const hold = new Promise<void>(resolve => { release = resolve; });
  let received!: () => void;
  const pending = new Promise<void>(resolve => { received = resolve; });
  await page.route("**/api/plugins/tools", async route => {
    const response = await route.fetch();
    if (route.request().postDataJSON().path === file) { received(); await hold; }
    await route.fulfill({ response }).catch(() => {});
  });
  await page.goto(server.url + "#plugins");
  await page.getByRole("button", { name: /^tools\.ts/ }).click();
  await pending;
  await page.getByRole("button", { name: /^empty\.ts/ }).click();
  release();
  const tools = page.getByRole("region", { name: "Extension tools" });
  await expect(tools).toContainText("No tools registered at startup.");
  await expect(tools).not.toContainText("visible_tool");
});
