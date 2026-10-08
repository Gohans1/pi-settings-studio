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
  await page.getByRole("combobox", { name: "Project", exact: true }).click();
  await page.getByRole("option", { name: project, exact: true }).click();
  await expect(page.getByText("No servers in this project's .pi/mcp.json yet.")).toBeVisible();

  await page.getByRole("button", { name: /^docs/ }).first().click();
  const here = page.getByRole("group", { name: "In this project" });
  await here.getByRole("switch", { name: "Enable docs in this project" }).click();
  await expect(page.getByRole("region", { name: "Notifications" })).toContainText("docs turned off in this project");
  expect((await projectFile()).mcpServers.docs).toEqual({ enabled: false });
  await expect(page.getByRole("region", { name: "This project's servers" }).getByRole("button", { name: /^docs/ })).toContainText("override");

  await here.getByRole("button", { name: "Use the global setting" }).click();
  await expect(page.getByRole("region", { name: "Notifications" })).toContainText("docs follows the global setting");
  expect((await projectFile()).mcpServers.docs).toBeUndefined();

  await page.getByRole("button", { name: "Add server to project" }).click();
  const form = page.getByRole("form", { name: "Add MCP server to this project" });
  await form.getByLabel("Name", { exact: true }).fill("local");
  await form.getByLabel("Command", { exact: true }).fill("uvx");
  await form.getByRole("button", { name: "Save server" }).click();
  await expect(page.getByRole("region", { name: "Notifications" })).toContainText("local added");
  expect((await projectFile()).mcpServers.local).toEqual({ command: "uvx" });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("mcp.json is edited as raw JSON with secrets shown as placeholders", async ({ page }) => {
  const globalFile = join(root, "agent", "mcp.json");
  await writeFile(globalFile, JSON.stringify({ mcpServers: { docs: { url: "https://example.com/mcp", headers: { Authorization: "Bearer fixture-raw-secret" } } } }));
  await page.goto(server.url + "#mcp");
  await page.getByRole("button", { name: "More actions for the global mcp.json" }).click();
  await page.getByRole("menuitem", { name: "Edit as JSON" }).click();
  const editor = page.getByLabel("mcp.json", { exact: true });
  await expect(editor).toHaveValue(/‹hidden 1›/);
  expect(await page.content()).not.toContain("fixture-raw-secret");
  const edited = JSON.parse(await editor.inputValue());
  edited.mcpServers.docs.toolExposure = { "search_*": "direct" };
  await editor.fill(JSON.stringify(edited, null, 2));
  await page.getByRole("button", { name: "Save JSON" }).click();
  await expect(page.getByRole("region", { name: "Notifications" })).toContainText("Saved mcp.json");
  expect(JSON.parse(await readFile(globalFile, "utf8")).mcpServers.docs).toEqual({
    url: "https://example.com/mcp", headers: { Authorization: "Bearer fixture-raw-secret" }, toolExposure: { "search_*": "direct" } });
});

test("Code mode is set for one project, then back to the global choice", async ({ page }) => {
  const settings = join(project, ".pi", "settings.json");
  await page.goto(server.url + "#mcp");
  await page.getByRole("combobox", { name: "Project", exact: true }).click();
  await page.getByRole("option", { name: project, exact: true }).click();
  await page.getByRole("button", { name: /^Code mode/ }).click();
  const panel = page.getByRole("region", { name: "Code mode" });
  await panel.getByRole("radio", { name: "This project" }).check();
  await panel.getByRole("radio", { name: /Always on/ }).check();
  await expect(page.getByRole("region", { name: "Notifications" })).toContainText("Code mode is always on in this project");
  expect(JSON.parse(await readFile(settings, "utf8"))).toEqual({ defaultTools: ["+codemode"] });
  await panel.getByLabel("Turn Code mode on automatically").selectOption("off");
  await expect(page.getByRole("region", { name: "Notifications" })).toContainText("no longer turns on automatically");
  expect(JSON.parse(await readFile(join(project, ".pi", "mcp.json"), "utf8")).autoEnableCodemode).toBe(false);
  await panel.getByRole("radio", { name: /Same as global/ }).first().check();
  await expect(page.getByRole("region", { name: "Notifications" })).toContainText("follows the global choice");
  expect(JSON.parse(await readFile(settings, "utf8"))).toEqual({});
});
