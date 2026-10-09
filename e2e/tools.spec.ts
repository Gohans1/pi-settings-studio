import { test, expect, type Locator } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { startServer, type RunningServer } from "../src/server/server.ts";

let root: string, agent: string, project: string, file: string, server: RunningServer;
const ECHO = resolve("tests/fixtures/echo-mcp.ts");
const source = `export default pi => {
  const add = (name, exposure = "direct") => pi.registerTool({ name, label: name, description: "Purpose of " + name,
    exposure, parameters: { type: "object", properties: {} }, execute: async () => ({ content: [], details: undefined }) });
  add("visible_tool"); add("script_tool", "codemode");
};`;
test.beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "pi-settings-all-tools-browser-"));
  agent = join(root, "agent"); project = join(root, "project"); file = join(agent, "extensions", "tools.ts");
  await mkdir(join(agent, "extensions"), { recursive: true });
  await mkdir(join(project, ".pi"), { recursive: true });
  await writeFile(file, source);
  await writeFile(join(agent, "settings.json"), JSON.stringify({ defaultProjectTrust: "always" }));
  await writeFile(join(agent, "mcp.json"), JSON.stringify({ mcpServers: { "echo-server": { command: "bun", args: [ECHO] } } }));
  await writeFile(join(project, ".pi", "settings.json"), JSON.stringify({ defaultTools: ["+grep"] }));
  server = await startServer({ agentDir: agent, projectDir: project, port: 0, staticDir: resolve("dist/client") });
});
test.afterEach(async () => { await server?.close(); await rm(root, { recursive: true, force: true }); });

const tool = (group: Locator, name: string) => group.getByRole("listitem").filter({ has: group.page().getByText(name, { exact: true }) });

test("Tools groups every tool by where it comes from and says how the model reaches it", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(server.url + "#tools");
  const pi = page.getByRole("region", { name: "Pi built-in" });
  await expect(tool(pi, "read")).toContainText("Model declaration");
  await expect(tool(pi, "grep")).toContainText("Inactive");
  const extension = page.getByRole("region", { name: "Extension: tools.ts" });
  await expect(extension.getByRole("listitem")).toHaveCount(2);
  await expect(tool(extension, "visible_tool")).toContainText("Model declaration");
  await expect(tool(extension, "script_tool")).toContainText("Indirect only");
  const mcp = page.getByRole("region", { name: "MCP server: echo-server" });
  await expect(tool(mcp, "mcp__echo_server__echo")).toContainText("Indirect only");
  await expect(tool(page.getByRole("region", { name: "Extension: codemode" }), "codemode")).toContainText("Model declaration");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(errors).toEqual([]);
});

test("Model sees keeps only direct declarations, across every source", async ({ page }) => {
  await page.goto(server.url + "#tools");
  await page.getByRole("button", { name: /^Model sees \(\d+\)$/ }).click();
  await expect(tool(page.getByRole("region", { name: "Extension: tools.ts" }), "visible_tool")).toBeVisible();
  await expect(page.getByText("script_tool", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "MCP server: echo-server" })).toHaveCount(0);
  await page.getByRole("button", { name: /^All tools \(\d+\)$/ }).click();
  await expect(page.getByText("script_tool", { exact: true })).toBeVisible();
});

test("the project picker applies the project's settings, on a narrow screen without sideways scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(server.url + "#tools");
  const pi = page.getByRole("region", { name: "Pi built-in" });
  await expect(tool(pi, "grep")).toContainText("Inactive");
  await page.getByRole("combobox", { name: "Project", exact: true }).click();
  await page.getByRole("option", { name: project, exact: true }).click();
  await expect(tool(pi, "grep")).toContainText("Model declaration");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("a failed inspection says the list may be incomplete, and Refresh tools retries", async ({ page }) => {
  await writeFile(file, 'throw new Error("fixture cannot load"); export default () => {};');
  await page.goto(server.url + "#tools");
  await expect(page.getByRole("alert").filter({ hasText: "Could not verify all tools" })).toContainText("fixture cannot load");
  await writeFile(file, source);
  await page.getByRole("button", { name: "Refresh tools", exact: true }).click();
  await expect(tool(page.getByRole("region", { name: "Extension: tools.ts" }), "visible_tool")).toBeVisible();
  await expect(page.getByText("Could not verify all tools")).toHaveCount(0);
});
