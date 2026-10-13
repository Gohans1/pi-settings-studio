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

test("the list's scroll area hides the native scrollbar, and the strict CSP blocks nothing on the page", async ({ page }) => {
  const blocked: string[] = [];
  page.on("console", message => { if (message.text().includes("Content Security Policy")) blocked.push(message.text()); });
  await page.goto(server.url + "#mcp");
  await page.getByRole("button", { name: /^docs/ }).click();
  const viewports = page.locator("[data-slot=scroll-area-viewport]");
  await expect(viewports).toHaveCount(1);
  for (const viewport of await viewports.all()) await expect(viewport).toHaveCSS("scrollbar-width", "none");
  expect(blocked).toEqual([]);
});

test("the window title names the open tab", async ({ page }) => {
  await page.goto(server.url + "#mcp");
  await expect(page).toHaveTitle("MCP · Pi Settings");
  await page.getByRole("tab", { name: "Skills" }).click();
  await expect(page).toHaveTitle("Skills · Pi Settings");
});

test("the header names the Pi version the app was built for, on every tab", async ({ page }) => {
  const { version } = JSON.parse(await readFile("node_modules/@earendil-works/pi-coding-agent/package.json", "utf8"));
  await page.goto(server.url + "#mcp");
  const label = page.getByRole("banner").getByText(`Built for Pi ${version}`);
  await expect(label).toBeVisible();
  await page.getByRole("tab", { name: "Skills" }).click();
  await expect(label).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
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

test("a list group's name reads as a label: smaller than its rows, in another colour, as written", async ({ page }) => {
  await page.goto(server.url + "#mcp");
  const look = (element: Element) => { const { fontSize, color, textTransform } = getComputedStyle(element); return { size: parseFloat(fontSize), color, textTransform }; };
  const group = await page.getByRole("heading", { name: "Global", exact: true }).evaluate(look);
  const row = await page.getByRole("button", { name: /^docs/ }).locator("[data-slot=item-title]").evaluate(look);
  expect(group.size).toBeLessThan(row.size);
  expect(group.color).not.toBe(row.color);
  expect(group.textTransform).toBe("none");
});

test("a list's rows are regular weight, and the chosen row is medium", async ({ page }) => {
  await page.goto(server.url + "#mcp");
  const weight = (name: RegExp) => page.getByRole("button", { name }).locator("[data-slot=item-title]").evaluate(element => getComputedStyle(element).fontWeight);
  expect(await weight(/^docs/)).toBe("400");
  await page.getByRole("button", { name: /^docs/ }).click();
  expect(await weight(/^docs/)).toBe("500");
  expect(await weight(/^search/)).toBe("400");
});

test("a section heading in a detail reads above the settings under it, larger than their labels", async ({ page }) => {
  await page.goto(server.url + "#general");
  await page.getByRole("region", { name: "Setting groups" }).getByRole("button", { name: /^Sessions & context/ }).click();
  const size = (element: Element) => parseFloat(getComputedStyle(element).fontSize);
  const heading = await page.getByRole("heading", { name: "Advanced", exact: true }).evaluate(size);
  const label = await page.getByText("Session directory", { exact: true }).evaluate(size);
  expect(heading).toBeGreaterThan(label);
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

test("on a wide screen the list runs down the window's left edge, and the page beside it out to the right", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 720 });
  await page.goto(server.url + "#mcp");
  const tabs = (await page.locator(".tabbar").boundingBox())!;
  const list = (await page.locator(".workbench-list").boundingBox())!;
  expect([list.x, list.y, list.y + list.height]).toEqual([0, tabs.y + tabs.height, 720]);
  const header = (await page.locator(".page-header").boundingBox())!;
  expect(header.x).toBeGreaterThanOrEqual(list.width);
  // A centred 80rem page stopped at 1600px.
  expect(header.x + header.width).toBeGreaterThan(1800);
});

test("reading down an item scrolls the page, not the list, and the next item shows from its top", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 600 });
  await page.goto(server.url + "#general");
  const groups = page.getByRole("region", { name: "Setting groups" });
  await groups.getByRole("button", { name: /^Terminal UI/ }).click();
  const list = page.locator(".workbench-list");
  const before = await list.boundingBox();
  await page.getByRole("combobox", { name: "Mermaid diagrams" }).scrollIntoViewIfNeeded();
  expect(await page.locator("main").evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  expect(await list.boundingBox()).toEqual(before);
  await groups.getByRole("button", { name: /^Network & retries/ }).click();
  await expect(page.getByRole("heading", { name: "Network & retries", level: 2 })).toBeInViewport();
});

test("the tab bar stays in view and nothing overflows sideways at any width", async ({ page }) => {
  await page.goto(server.url + "#general");
  await page.getByRole("region", { name: "Setting groups" }).getByRole("button", { name: /^Terminal UI/ }).click();
  for (const width of [1280, 900, 320]) {
    await page.setViewportSize({ width, height: 720 });
    await page.getByRole("combobox", { name: "Mermaid diagrams" }).scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page.getByRole("tablist")).toBeInViewport();
  }
});
