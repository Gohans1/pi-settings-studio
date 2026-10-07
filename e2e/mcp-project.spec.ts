import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { startServer, type RunningServer } from "../src/server/server.ts";

let root: string, project: string, server: RunningServer;
test.beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "pi-settings-mcp-project-browser-"));
  const agent = join(root, "agent");
  project = join(root, "webapp");
  await mkdir(agent, { recursive: true });
  await mkdir(project, { recursive: true });
  await writeFile(join(agent, "mcp.json"), JSON.stringify({ mcpServers: { docs: { url: "https://example.com/mcp" }, files: { command: "npx" } } }));
  server = await startServer({ agentDir: agent, projectDir: project, port: 0, staticDir: resolve("dist/client") });
});
test.afterEach(async () => { await server?.close(); await rm(root, { recursive: true, force: true }); });

test("a global server is switched off for one project, then a project server is added", async ({ page }) => {
  const projectFile = async () => JSON.parse(await readFile(join(project, ".pi", "mcp.json"), "utf8"));
  await page.goto(server.url + "#mcp");
  await page.getByLabel("Project", { exact: true }).selectOption(project);
  await expect(page.getByText("No servers in this project's .pi/mcp.json yet.")).toBeVisible();

  await page.getByRole("button", { name: /^docs/ }).first().click();
  const here = page.getByRole("group", { name: "In this project" });
  await here.getByRole("switch", { name: "Enable docs in this project" }).click();
  await expect(page.getByRole("status")).toContainText("docs turned off in this project");
  expect((await projectFile()).mcpServers.docs).toEqual({ enabled: false });
  await expect(page.getByRole("region", { name: "This project's servers" }).getByRole("button", { name: /^docs/ })).toContainText("override");

  await here.getByRole("button", { name: "Use the global setting" }).click();
  await expect(page.getByRole("status")).toContainText("docs follows the global setting");
  expect((await projectFile()).mcpServers.docs).toBeUndefined();

  await page.getByRole("button", { name: "Add server to project" }).click();
  const form = page.getByRole("form", { name: "Add MCP server to this project" });
  await form.getByLabel("Name", { exact: true }).fill("local");
  await form.getByLabel("Command", { exact: true }).fill("uvx");
  await form.getByRole("button", { name: "Save server" }).click();
  await expect(page.getByRole("status")).toContainText("local added");
  expect((await projectFile()).mcpServers.local).toEqual({ command: "uvx" });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
