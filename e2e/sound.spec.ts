import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { startServer, type RunningServer } from "../src/server/server.ts";

let root: string, server: RunningServer;
test.beforeEach(async ({ page }) => {
  root = await mkdtemp(join(tmpdir(), "pi-settings-sound-browser-"));
  const agent = join(root, "agent");
  await mkdir(agent);
  await writeFile(join(agent, "settings.json"), JSON.stringify({ shellCommandPrefix: "fixture-prefix" }));
  await writeFile(join(agent, "mcp.json"), JSON.stringify({ mcpServers: { echo: { command: "bun", args: [resolve("tests/fixtures/echo-mcp.ts")] } } }));
  server = await startServer({ agentDir: agent, projectDir: join(root, "project"), port: 0, staticDir: resolve("dist/client") });
  // A sound is Web Audio starting sources: count them at that boundary. A buffer source has its own start().
  await page.addInitScript(() => {
    (window as unknown as { sounds: number }).sounds = 0;
    for (const prototype of [AudioScheduledSourceNode.prototype, AudioBufferSourceNode.prototype]) {
      const start = prototype.start;
      prototype.start = function (this: AudioScheduledSourceNode, ...args: unknown[]) {
        (window as unknown as { sounds: number }).sounds++;
        return (start as (...args: unknown[]) => void).apply(this, args);
      };
    }
  });
});
test.afterEach(async () => { await server?.close(); await rm(root, { recursive: true, force: true }); });

/** Chooses a group of General's list, so its settings show. */
const group = (page: Page, name: string) => page.getByRole("region", { name: "Setting groups" }).getByRole("button", { name: new RegExp(`^${name}`) }).click();
const sounds = (page: Page) => page.evaluate(() => (window as unknown as { sounds: number }).sounds);
/** The count once nothing has played for a moment. */
async function settled(page: Page) {
  let last = -1, now = await sounds(page);
  while (now !== last) { await page.waitForTimeout(250); last = now; now = await sounds(page); }
  return now;
}

test("controls sound when used, from the pointer and the keyboard, and hovering stays silent", async ({ page }) => {
  await page.goto(server.url);
  await group(page, "Sessions & context");
  await page.getByRole("heading", { name: "General", level: 1 }).click();
  const hovered = await settled(page);
  await page.getByRole("button", { name: "File", exact: true }).hover();
  expect(await settled(page)).toBe(hovered);
  await page.getByRole("switch", { name: "Automatic compaction" }).click();
  await expect.poll(() => sounds(page)).toBeGreaterThan(hovered);
  const switched = await settled(page);
  await page.getByRole("button", { name: "File", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect.poll(() => sounds(page)).toBeGreaterThan(switched);
  await page.keyboard.press("Escape");
  await group(page, "Messages & interaction");
  const keyed = await settled(page);
  const delivery = page.getByRole("combobox", { name: "Follow-up delivery" });
  await delivery.click();
  await expect.poll(() => sounds(page)).toBeGreaterThan(keyed);
  const listed = await settled(page);
  await page.getByRole("option", { name: "all", exact: true }).click();
  await expect.poll(() => sounds(page)).toBeGreaterThan(listed);
  const chosen = await settled(page);
  await page.getByRole("tab", { name: "MCP", exact: true }).click();
  await expect.poll(() => sounds(page)).toBeGreaterThan(chosen);
});

test("one action plays one cue, from the control or from its label", async ({ page }) => {
  await page.goto(server.url);
  const toggle = page.getByRole("button", { name: "Sounds" });
  await toggle.click();
  const quiet = await settled(page);
  await toggle.click();
  // Turning sounds on plays a single toggle cue: the size of one.
  const one = (await settled(page)) - quiet;
  expect(one).toBeGreaterThan(0);
  const delta = async (act: () => Promise<void>) => { const before = await settled(page); await act(); return (await settled(page)) - before; };
  await group(page, "Sessions & context");
  expect(await delta(() => page.getByRole("switch", { name: "Automatic compaction" }).click())).toBe(one);
  expect(await delta(() => page.getByRole("switch", { name: "Automatic compaction" }).press("Space"))).toBe(one);
  await group(page, "Tools");
  expect(await delta(() => page.getByRole("checkbox", { name: "grep" }).click())).toBe(one);
  expect(await delta(() => page.locator("label[for='tool-grep']").click())).toBe(one);
});

test("the Sounds toggle silences the app, is remembered, and says so when turned back on", async ({ page }) => {
  await page.goto(server.url);
  const toggle = page.getByRole("button", { name: "Sounds" });
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await group(page, "Sessions & context");
  const off = await settled(page);
  await page.getByRole("switch", { name: "Automatic compaction" }).click();
  expect(await settled(page)).toBe(off);
  await page.reload();
  await expect(page.getByRole("button", { name: "Sounds" })).toHaveAttribute("aria-pressed", "false");
  await group(page, "Sessions & context");
  await page.getByRole("switch", { name: "Automatic compaction" }).click();
  expect(await settled(page)).toBe(0);
  await page.getByRole("button", { name: "Sounds" }).click();
  await expect.poll(() => sounds(page)).toBeGreaterThan(0);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("a save sounds when its answer arrives, whether it lands or fails", async ({ page }) => {
  let answer!: (status: number) => void;
  await page.route("**/api/settings/global", async route => {
    if (route.request().method() === "GET") return route.continue();
    const status = await new Promise<number>(done => { answer = done; });
    if (status === 200) return route.continue();
    return route.fulfill({ status, contentType: "application/json", body: JSON.stringify({ error: "The file changed in another session." }) });
  });
  await page.goto(server.url);
  await group(page, "Shell");
  await page.getByLabel("Shell command prefix", { exact: true }).fill("saved");
  await page.getByRole("region", { name: "Unsaved changes" }).getByRole("button", { name: "Save", exact: true }).click();
  const tapped = await settled(page);
  answer(200);
  await expect(page.getByRole("region", { name: "Notifications" })).toContainText("Saved");
  await expect.poll(() => sounds(page)).toBeGreaterThan(tapped);
  await page.getByLabel("Shell command prefix", { exact: true }).fill("refused");
  await page.getByRole("region", { name: "Unsaved changes" }).getByRole("button", { name: "Save", exact: true }).click();
  const tappedAgain = await settled(page);
  answer(409);
  await expect(page.getByRole("alert")).toContainText("changed in another session");
  await expect.poll(() => sounds(page)).toBeGreaterThan(tappedAgain);
});

test("a job sounds when it finishes", async ({ page }) => {
  test.slow();
  await page.goto(server.url + "#mcp");
  await page.getByRole("button", { name: "Test connections" }).click();
  const results = page.getByRole("region", { name: "Test MCP connections" });
  await expect(results).toContainText("Running");
  const started = await settled(page);
  await expect(results).toContainText("Finished", { timeout: 60_000 });
  await expect.poll(() => sounds(page)).toBeGreaterThan(started);
});
