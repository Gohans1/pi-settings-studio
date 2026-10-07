import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { startServer, type RunningServer } from "../src/server/server.ts";

let root: string, file: string, server: RunningServer;
test.beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "pi-settings-mcp-browser-"));
  const agentDir = join(root, "agent");
  await mkdir(agentDir);
  file = join(agentDir, "mcp.json");
  await writeFile(file, JSON.stringify({ mcpServers: {
    search: { command: "uvx", args: ["search-mcp"], env: { SEARCH_API_KEY: "fixture-secret-value" }, enabled: false },
    docs: { url: "https://example.com/mcp", headers: { Authorization: "Bearer fixture-token" }, exposure: "deferred", description: "Product docs" },
    broken: { url: "ftp://nope" },
  } }, null, 2));
  server = await startServer({ agentDir, projectDir: join(root, "project"), port: 0, staticDir: resolve("dist/client") });
});
test.afterEach(async () => { await server?.close(); await rm(root, { recursive: true, force: true }); });

test("MCP tab lists servers and shows details without secret values", async ({ page }) => {
  await page.goto(server.url + "#mcp");
  await expect(page.getByRole("tab", { name: "MCP" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("1 of 3 servers on")).toBeVisible();
  await page.getByRole("button", { name: /^search/ }).click();
  const details = page.getByRole("region", { name: "search" });
  await expect(details.getByText("Turned off in the file")).toBeVisible();
  await expect(details.getByText("SEARCH_API_KEY")).toBeVisible();
  await expect(details.getByText("uvx search-mcp")).toBeVisible();
  await page.getByRole("button", { name: /^broken/ }).click();
  await expect(page.getByRole("region", { name: "broken" })).toContainText('url must be an http or https URL');
  await page.getByRole("button", { name: /^docs/ }).click();
  await expect(page.getByRole("region", { name: "docs" })).toContainText("Product docs");
  expect(await page.content()).not.toMatch(/fixture-secret-value|fixture-token/);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.emulateMedia({ colorScheme: "dark" });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("switches and the exposure choice save to mcp.json immediately", async ({ page }) => {
  await page.goto(server.url + "#mcp");
  const readServers = async () => JSON.parse(await readFile(file, "utf8")).mcpServers;
  await page.getByRole("switch", { name: "Enable search" }).click();
  await expect(page.getByRole("status")).toContainText("search turned on");
  expect((await readServers()).search.enabled).toBeUndefined();
  expect((await readServers()).search.env.SEARCH_API_KEY).toBe("fixture-secret-value");
  await page.getByRole("button", { name: /^docs/ }).click();
  await page.getByLabel("Tool exposure for docs").selectOption("direct");
  await expect(page.getByRole("status")).toContainText("docs now uses Direct");
  expect((await readServers()).docs.exposure).toBe("direct");
  await expect(page.getByText("2 of 3 servers on")).toBeVisible();
});

test("add a server, edit it without seeing its secret, remove it and undo", async ({ page }) => {
  await page.goto(server.url + "#mcp");
  const readServers = async () => JSON.parse(await readFile(file, "utf8")).mcpServers;
  await page.getByRole("button", { name: "Add server" }).click();
  const form = page.getByRole("form", { name: "Add MCP server" });
  await form.getByLabel("Name", { exact: true }).fill("files");
  await form.getByLabel("Command", { exact: true }).fill("npx");
  await form.getByLabel("Arguments").fill("-y\nserver-filesystem");
  await form.getByRole("button", { name: "Add variable" }).click();
  await form.getByLabel("Variable name 1").fill("TOKEN");
  await form.getByLabel("Value of variable 1").fill("fixture-new-secret");
  await form.getByRole("button", { name: "Save server" }).click();
  await expect(page.getByRole("status")).toContainText("files added");
  expect((await readServers()).files).toEqual({ command: "npx", args: ["-y", "server-filesystem"], env: { TOKEN: "fixture-new-secret" } });

  await page.getByRole("button", { name: "Edit files" }).click();
  const edit = page.getByRole("form", { name: "Edit files" });
  await expect(edit.getByLabel("Value of variable 1")).toHaveValue("");
  await edit.getByLabel("Command", { exact: true }).fill("bunx");
  await edit.getByRole("button", { name: "Save server" }).click();
  await expect(page.getByRole("status")).toContainText("files saved");
  expect((await readServers()).files).toEqual({ command: "bunx", args: ["-y", "server-filesystem"], env: { TOKEN: "fixture-new-secret" } });
  expect(await page.content()).not.toContain("fixture-new-secret");

  await page.getByRole("button", { name: "Remove files" }).click();
  await expect(page.getByRole("status")).toContainText("Removed files");
  expect((await readServers()).files).toBeUndefined();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("status")).toContainText("Restored");
  expect((await readServers()).files.command).toBe("bunx");
});

test("a server Pi would refuse is not saved and the form keeps the draft", async ({ page }) => {
  await page.goto(server.url + "#mcp");
  await page.getByRole("button", { name: "Add server" }).click();
  const form = page.getByRole("form", { name: "Add MCP server" });
  await form.getByLabel("Name", { exact: true }).fill("web");
  await form.getByLabel("Transport").selectOption("http");
  await form.getByLabel("URL", { exact: true }).fill("ftp://nope");
  await form.getByRole("button", { name: "Save server" }).click();
  await expect(form.getByRole("alert")).toContainText("url must be an http or https URL");
  await expect(form.getByLabel("URL", { exact: true })).toHaveValue("ftp://nope");
  expect(JSON.parse(await readFile(file, "utf8")).mcpServers.web).toBeUndefined();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
