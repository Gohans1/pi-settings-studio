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
