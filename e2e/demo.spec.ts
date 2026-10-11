import { test, expect, type Page } from "@playwright/test";
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

test("the notice and the first tab pass the accessibility checks", async ({ page }) => {
  await expect(page.getByRole("note").filter({ hasText: "Demo with sample data" })).toBeVisible();
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations).toEqual([]);
});
