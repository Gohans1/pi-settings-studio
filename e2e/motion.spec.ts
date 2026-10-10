import { test, expect } from "@playwright/test";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { startServer, type RunningServer } from "../src/server/server.ts";

declare global {
  interface Window { motionEvents: { slot: string | null; property: string }[] }
}
let root: string, server: RunningServer;
test.beforeEach(async ({ page }) => {
  root = await mkdtemp(join(tmpdir(), "pi-settings-motion-"));
  const agentDir = join(root, "agent");
  await mkdir(agentDir);
  server = await startServer({ agentDir, projectDir: join(root, "project"), port: 0, staticDir: resolve("dist/client") });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  // Observe real browser transitions, not the presence of a class in a source file.
  await page.addInitScript(() => {
    window.motionEvents = [];
    document.addEventListener("transitionrun", event => {
      if (event.target instanceof Element) window.motionEvents.push({ slot: event.target.getAttribute("data-slot"), property: event.propertyName });
    });
  });
});
test.afterEach(async () => { await server?.close(); await rm(root, { recursive: true, force: true }); });

/** The OAuth settings Disclosure in a new MCP server's form. */
async function oauthDisclosure(page: import("@playwright/test").Page) {
  await page.goto(server.url + "#mcp");
  await page.getByRole("button", { name: "Add server", exact: true }).click();
  // OAuth applies to servers reached by URL.
  await page.getByRole("combobox", { name: "Transport" }).click();
  await page.getByRole("option", { name: "URL (streamable HTTP)" }).click();
  const trigger = page.getByRole("button", { name: "OAuth settings" });
  return { trigger, panel: page.locator("[data-slot=collapsible]", { has: trigger }).locator("[data-slot=collapsible-content]") };
}

test("a disclosure opens at once, as shadcn's Collapsible ships, and settles after quick clicks", async ({ page }) => {
  const { trigger, panel } = await oauthDisclosure(page);
  await trigger.click();
  await expect(panel).toBeVisible();
  await expect(panel).toHaveCSS("transition-duration", "0s");
  await trigger.click();
  await expect(panel).toBeHidden();
  // Raw pointer clicks do not wait for anything between toggles.
  const box = (await trigger.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(panel).toBeVisible();
});

test("keyboard disclosure and escape stay instant even after using the pointer", async ({ page }) => {
  const { trigger, panel } = await oauthDisclosure(page);
  await trigger.click();
  await trigger.press("Enter");
  await trigger.press("Enter");
  await expect(panel).toBeVisible();
  expect(await panel.evaluate(element => element.getAnimations().length)).toBe(0);
  await page.getByRole("tab", { name: "General" }).click();
  await page.getByRole("button", { name: "File", exact: true }).focus();
  await page.keyboard.press("Enter");
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  await expect(menu).toHaveCSS("animation-name", "none");
  await expect(menu).toHaveCSS("transition-duration", "0s");
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(page.getByRole("button", { name: "File", exact: true })).toBeFocused();
});

test("pointer menu zooms in from its trigger as shadcn ships it and can close before its entrance finishes", async ({ page }) => {
  await page.goto(server.url);
  const trigger = page.getByRole("button", { name: "File", exact: true });
  await trigger.click();
  const menu = page.getByRole("menu");
  // tw-animate-css's enter keyframes, 100ms in base-nova.
  await expect(menu).toHaveCSS("animation-name", "enter");
  await expect(menu).toHaveCSS("animation-duration", "0.1s");
  expect(await menu.evaluate(element => getComputedStyle(element).getPropertyValue("--transform-origin"))).not.toBe("");
  await trigger.click();
  await expect(menu).toBeHidden();
  const box = (await trigger.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  // Base UI applies a press on the next animation frame, so a second press in the same frame still sees the menu closed.
  // One frame is well inside the 100ms entrance.
  await page.evaluate(() => new Promise(requestAnimationFrame));
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(menu).toBeHidden();
  await trigger.click();
  await expect(page.getByRole("menuitem", { name: "Edit as JSON" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
});

test("reduced motion settles a menu at once", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(server.url);
  await page.getByRole("button", { name: "File", exact: true }).click();
  const menu = page.getByRole("menu");
  await expect(menu).toHaveCSS("animation-name", "enter");
  // styles.css shortens every animation to 0.01ms, so end events still fire.
  await expect(menu).toHaveCSS("animation-duration", "1e-05s");
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
});
