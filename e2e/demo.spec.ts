import { test, expect, type Locator, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { startServer, type RunningServer } from "../src/server/server.ts";
import { READ_ONLY } from "../src/client/demo.ts";

// dist/demo is static. The app's own server serves it here, under its strict CSP, over an empty agent folder it never reads:
// the demo build must answer by itself.
let root: string, server: RunningServer, apiCalls: string[], problems: string[];

test.beforeEach(async ({ page }) => {
  root = await mkdtemp(join(tmpdir(), "pi-settings-demo-browser-"));
  server = await startServer({ agentDir: join(root, "agent"), port: 0, staticDir: resolve("dist/demo") });
  apiCalls = []; problems = [];
  page.on("request", request => { if (new URL(request.url()).pathname.startsWith("/api/")) apiCalls.push(request.url()); });
  page.on("console", message => { if (message.type() === "error") problems.push(message.text()); });
  page.on("pageerror", error => problems.push(error.message));
  await page.goto(server.url);
});
test.afterEach(async () => { await server?.close(); await rm(root, { recursive: true, force: true }); });

// What each tab shows of the sample home (src/demo/seed.ts).
const tabs: [name: string, shows: string][] = [
  ["General", "Messages & interaction"], ["Models", "anthropic"], ["Skills", "code-review"], ["Sub-agents", "scout"], ["Plugins", "todo.ts"],
  ["MCP", "docs"], ["Tools", "todo_add"], ["Instructions", "AGENTS.md"], ["Context", "Base prompt"],
];
const panel = (page: Page) => page.getByRole("tabpanel");

test("opens on the sample project and says it is a demo with read-only sample data", async ({ page }) => {
  await expect(page.getByRole("combobox", { name: "Project", exact: true })).toContainText("~/projects/my-app");
  const notice = page.getByRole("note").filter({ hasText: "Demo with sample data" });
  await expect(notice).toBeVisible();
  await expect(notice.getByRole("link", { name: "run Pi Settings Studio on your machine" })).toHaveAttribute("href", /github\.com\/Gohans1\/pi-settings-studio/);
});

for (const [name, shows] of tabs) {
  test(`${name} shows the sample data, with no error and no request to a server`, async ({ page }) => {
    await page.getByRole("tab", { name, exact: true }).click();
    await expect(panel(page).getByText(shows, { exact: false }).first()).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);
    expect(apiCalls).toEqual([]);
    expect(problems).toEqual([]);
  });
}

// A row opens what the tab loads for it; a read that readEverything (src/demo/reads.ts) lacks would fail here.
test("every row of every list opens without an error", async ({ page }) => {
  for (const [name] of tabs) {
    await page.getByRole("tab", { name, exact: true }).click();
    if (name === "Context") await page.getByRole("button", { name: "Recorded session" }).click();
    const rows = panel(page).locator(".workbench button[aria-pressed]");
    await expect(rows.first()).toBeVisible();
    for (let row = 0; row < await rows.count(); row++) {
      await rows.nth(row).click();
      // A resource opens its files from Edit or View; a skill's folder lists more than one.
      const open = panel(page).locator(".workbench-detail").getByRole("button", { name: /^(Edit|View)( files of)? / });
      if (await open.count()) {
        await open.first().click();
        const files = panel(page).getByRole("navigation", { name: "Files" }).getByRole("button");
        for (let file = 0; file < await files.count(); file++) await files.nth(file).click();
      }
      await expect(panel(page).locator("[aria-busy=true]")).toHaveCount(0);
      await expect(page.getByRole("alert"), `${name}, row ${row}`).toHaveCount(0);
    }
  }
  expect(apiCalls).toEqual([]);
  expect(problems).toEqual([]);
});

test("a change is refused, and the page says the demo is read-only", async ({ page }) => {
  await page.getByRole("tab", { name: "Skills", exact: true }).click();
  await page.getByRole("switch").first().click();
  await expect(page.getByText(READ_ONLY).first()).toBeVisible();
});

test("custom-model fields reflow before their identifiers get squeezed by the detail pane", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 800 });
  await page.getByRole("tab", { name: "Models", exact: true }).click();
  await page.getByRole("button", { name: /^ollama/ }).click();
  const form = page.getByRole("form", { name: "Edit ollama" });
  const modelId = form.getByLabel("Model ID 1", { exact: true });
  const context = form.getByLabel("Context window 1", { exact: true });
  await modelId.scrollIntoViewIfNeeded();
  expect((await modelId.boundingBox())!.width).toBeGreaterThan(120);
  expect(await context.evaluate((element: HTMLInputElement) => element.labels![0]!.getBoundingClientRect().height)).toBeGreaterThan(10);
  expect(await page.locator("main").evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(form.locator(".model-row-head")).toBeVisible();
});

test("invalid custom-model limits explain the refusal and errors stay with their model after removal", async ({ page }) => {
  await page.getByRole("tab", { name: "Models", exact: true }).click();
  await page.getByRole("button", { name: /^ollama/ }).click();
  const form = page.getByRole("form", { name: "Edit ollama" });
  const context = form.getByLabel("Context window 1", { exact: true });
  const output = form.getByLabel("Max output tokens 2", { exact: true });
  await context.fill("0");
  await output.fill("-1");
  await form.getByRole("button", { name: "Save provider", exact: true }).click();
  await expect(context).toBeFocused();
  await expect(context).toHaveAttribute("aria-invalid", "true");
  await expect(context).toHaveAccessibleDescription(/must be at least 1/);
  await expect(output).toHaveAccessibleDescription(/must be at least 1/);
  await context.fill("128000");
  await expect(context).not.toHaveAttribute("aria-invalid", "true");
  await form.getByRole("button", { name: "Remove model qwen2.5-coder:7b", exact: true }).click();
  const remaining = form.getByLabel("Max output tokens 1", { exact: true });
  await expect(remaining).toHaveValue("-1");
  await expect(remaining).toHaveAttribute("aria-invalid", "true");
  await expect(remaining).toHaveAccessibleDescription(/must be at least 1/);
  await remaining.fill("16384");
  await expect(remaining).not.toHaveAttribute("aria-invalid", "true");
  await expect(form.locator("[data-slot=field-error]")).toHaveCount(0);
});

test("destructive decisions and the project value keep AA contrast in their rendered interactive states", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  expect(await page.evaluate(() => matchMedia("(hover: hover)").matches)).toBe(true);
  const ratio = (control: Locator) => control.evaluate(element => {
    const canvas = document.createElement("canvas").getContext("2d")!;
    const chain: Element[] = [];
    for (let node: Element | null = element; node; node = node.parentElement) chain.unshift(node);
    for (const node of chain) {
      canvas.fillStyle = getComputedStyle(node).backgroundColor;
      canvas.fillRect(0, 0, 1, 1);
    }
    const background = [...canvas.getImageData(0, 0, 1, 1).data].slice(0, 3);
    canvas.fillStyle = getComputedStyle(element).color;
    canvas.fillRect(0, 0, 1, 1);
    const foreground = [...canvas.getImageData(0, 0, 1, 1).data].slice(0, 3);
    const luminance = (rgb: number[]) => rgb.map(value => value / 255)
      .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
      .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index]!, 0);
    const [a, b] = [luminance(foreground), luminance(background)];
    return (Math.max(a!, b!) + 0.05) / (Math.min(a!, b!) + 0.05);
  });
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    const picker = page.getByRole("combobox", { name: "Project", exact: true });
    await expect.poll(() => ratio(picker)).toBeGreaterThanOrEqual(4.5);
    await picker.hover();
    await expect.poll(() => ratio(picker)).toBeGreaterThanOrEqual(4.5);
    await picker.focus();
    await expect.poll(() => ratio(picker)).toBeGreaterThanOrEqual(4.5);
    await page.getByRole("tab", { name: "Plugins", exact: true }).click();
    await page.getByRole("button", { name: "review prompt", exact: true }).click();
    await page.getByRole("button", { name: "Edit review", exact: true }).click();
    const editor = page.getByRole("form", { name: "Edit review", exact: true });
    await editor.getByRole("textbox").fill("An unsaved draft for the contrast check.");
    await editor.getByRole("button", { name: "Close", exact: true }).click();
    const discard = page.getByRole("alertdialog").getByRole("button", { name: "Discard", exact: true });
    await expect.poll(() => ratio(discard)).toBeGreaterThanOrEqual(4.5);
    await page.screenshot({ path: test.info().outputPath(`discard-${colorScheme}-rest.png`) });
    await discard.hover();
    await expect.poll(() => ratio(discard)).toBeGreaterThanOrEqual(4.5);
    await page.screenshot({ path: test.info().outputPath(`discard-${colorScheme}-hover.png`) });
    await discard.focus();
    await expect.poll(() => ratio(discard)).toBeGreaterThanOrEqual(4.5);
    await page.getByRole("button", { name: "Keep editing", exact: true }).click();
    await editor.getByRole("button", { name: "Discard changes", exact: true }).click();
    await editor.getByRole("button", { name: "Close", exact: true }).click();
  }
});

test("the notice and the first tab pass the accessibility checks", async ({ page }) => {
  await expect(page.getByRole("note").filter({ hasText: "Demo with sample data" })).toBeVisible();
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations).toEqual([]);
});
