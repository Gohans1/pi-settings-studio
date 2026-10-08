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

test("pointer disclosure expands and collapses continuously, including a quick reversal", async ({ page }) => {
  await page.goto(server.url);
  const trigger = page.getByRole("button", { name: "Not editable here" });
  const panel = page.locator(".not-here [data-slot=collapsible-content]");
  await trigger.click();
  await expect.poll(() => page.evaluate(() => window.motionEvents.filter(event => event.slot === "collapsible-content").map(event => event.property)), { timeout: 3000 }).toContain("height");
  await expect(panel).toBeVisible();
  await expect.poll(() => panel.evaluate(element => Math.abs(element.clientHeight - element.scrollHeight))).toBeLessThanOrEqual(1);
  await trigger.click();
  await expect(panel).toBeHidden();
  // Raw pointer clicks do not wait for animation stability between toggles.
  const box = (await trigger.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect.poll(() => panel.evaluate(element => Math.abs(element.clientHeight - element.scrollHeight))).toBeLessThanOrEqual(1);
});

test("keyboard disclosure and escape stay instant even after using the pointer", async ({ page }) => {
  await page.goto(server.url);
  const trigger = page.getByRole("button", { name: "Not editable here" });
  await trigger.click();
  await trigger.press("Enter");
  await trigger.press("Enter");
  const panel = page.locator(".not-here [data-slot=collapsible-content]");
  await expect(panel).toBeVisible();
  expect(await panel.evaluate(element => element.getAnimations().length)).toBe(0);
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
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(menu).toBeHidden();
  await trigger.click();
  await expect(page.getByRole("menuitem", { name: "Edit as JSON" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
});

test("buttons compress only during a pointer press, without moving surrounding layout", async ({ page }) => {
  await page.goto(server.url + "#mcp");
  const button = page.getByRole("button", { name: "Add server", exact: true });
  await button.hover();
  const box = (await button.boundingBox())!;
  await page.mouse.down();
  await expect(button).toHaveCSS("transform", "matrix(0.97, 0, 0, 0.97, 0, 0)", { timeout: 3000 });
  expect(await button.evaluate(element => getComputedStyle(element).translate)).toBe("none");
  await page.mouse.move(box.x - 20, box.y);
  await page.mouse.up();
  await expect(button).toHaveCSS("transform", "none");
  expect(await button.boundingBox()).toEqual(box);
  await button.focus();
  await page.keyboard.down("Space");
  await expect(button).toHaveCSS("transform", "none");
  await page.keyboard.up("Space");
  await expect(page.getByRole("heading", { name: "Add MCP server", exact: true })).toBeVisible();
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

test("reduced motion keeps only a short opacity fade on disclosures", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(server.url);
  const trigger = page.getByRole("button", { name: "Not editable here" });
  await trigger.click();
  const panel = page.locator(".not-here [data-slot=collapsible-content]");
  await expect.poll(() => page.evaluate(() => window.motionEvents.filter(event => event.slot === "collapsible-content").map(event => event.property)), { timeout: 3000 }).toEqual(["opacity"]);
  await expect(panel).toHaveCSS("transition-duration", "0.125s");
  await expect(panel).toHaveCSS("transform", "none");
  await trigger.click();
  await expect(panel).toBeHidden();
});
