import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { startServer, type RunningServer } from "../src/server/server.ts";

let root: string, file: string, server: RunningServer;
test.beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "pi-settings-shell-browser-"));
  const agentDir = join(root, "agent");
  await mkdir(agentDir);
  file = join(agentDir, "mcp.json");
  await writeFile(file, JSON.stringify({ mcpServers: {
    search: { command: "uvx", args: ["search-mcp"], enabled: false },
    docs: { url: "https://example.com/mcp", description: "Product docs" },
  } }, null, 2));
  server = await startServer({ agentDir, projectDir: join(root, "project"), port: 0, staticDir: resolve("dist/client") });
});
test.afterEach(async () => { await server?.close(); await rm(root, { recursive: true, force: true }); });

test("the window title names the open tab", async ({ page }) => {
  await page.goto(server.url + "#mcp");
  await expect(page).toHaveTitle("MCP · Pi Settings");
  await page.getByRole("tab", { name: "Skills" }).click();
  await expect(page).toHaveTitle("Skills · Pi Settings");
});

test("a saved change is confirmed until dismissed, and dismissing changes no file", async ({ page }) => {
  await page.goto(server.url + "#mcp");
  await page.getByRole("switch", { name: "Enable search" }).click();
  await expect(page.getByRole("region", { name: "Notifications" })).toContainText("search turned on");
  const saved = await readFile(file, "utf8");
  // Base UI reveals the close button once the reader is in the notifications (hover, focus or F6).
  await page.getByRole("region", { name: "Notifications" }).getByRole("dialog").hover();
  await page.getByRole("button", { name: "Close toast" }).click();
  await expect(page.getByRole("region", { name: "Notifications" })).toHaveText("");
  expect(await readFile(file, "utf8")).toBe(saved);
});

test("on a narrow screen the list and the chosen item take turns, with a way back", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(server.url + "#mcp");
  await page.getByRole("button", { name: /^docs/ }).click();
  await expect(page.getByRole("region", { name: "docs" })).toBeInViewport();
  await expect(page.getByRole("button", { name: /^search/ })).toBeHidden();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole("button", { name: "All servers" }).click();
  await expect(page.getByRole("button", { name: /^search/ })).toBeVisible();
  await expect(page.getByRole("region", { name: "docs" })).toBeHidden();
});

test("the tab bar stays in view and nothing overflows sideways at any width", async ({ page }) => {
  await page.goto(server.url + "#general");
  await expect(page.getByRole("heading", { name: "Models & thinking" })).toBeVisible();
  for (const width of [1280, 900, 320]) {
    await page.setViewportSize({ width, height: 720 });
    await page.getByRole("heading", { name: "Terminal UI" }).scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page.getByRole("tablist")).toBeInViewport();
  }
});
