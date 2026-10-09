import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { startServer, type RunningServer } from "../src/server/server.ts";

let root: string, projA: string, projB: string, server: RunningServer;
const lines = (...entries: object[]) => entries.map(entry => JSON.stringify(entry)).join("\n") + "\n";
const t = (iso: string) => ({ timestamp: iso, ms: Date.parse(iso) });

test.beforeEach(async ({ context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  root = await mkdtemp(join(tmpdir(), "pi-settings-prompt-browser-"));
  const agent = join(root, "agent");
  projA = join(root, "proj-a"); projB = join(root, "proj-b");
  await mkdir(projA); await mkdir(projB);
  const a = t("2026-10-01T10:00:01.000Z"), b = t("2026-10-02T10:00:01.000Z");
  await mkdir(join(agent, "sessions", "--tmp-proj-a--"), { recursive: true });
  await mkdir(join(agent, "sessions", "--tmp-proj-b--"), { recursive: true });
  await writeFile(join(agent, "sessions", "--tmp-proj-a--", "a_aaaa.jsonl"), lines(
    { type: "session", version: 3, id: "aaaa", timestamp: a.timestamp, cwd: projA },
    { type: "message", id: "e1", parentId: null, timestamp: a.timestamp, message: { role: "system", content: "", timestamp: a.ms,
      sections: { preamble: "You are Pi.", rules: "Rule one." },
      toolsAdded: [{ name: "read", description: "Read files", parameters: {} }, { name: "write", description: "Write files", parameters: {} }] } },
    { type: "message", id: "e2", parentId: "e1", timestamp: a.timestamp, message: { role: "user", content: "Fix the login bug", timestamp: a.ms } },
    { type: "message", id: "e3", parentId: "e2", timestamp: a.timestamp, message: { role: "system", content: "", timestamp: a.ms,
      sections: { rules: "Rule two." }, toolsRemoved: [{ name: "write" }] } },
  ));
  await writeFile(join(agent, "sessions", "--tmp-proj-b--", "b_bbbb.jsonl"), lines(
    { type: "session", version: 3, id: "bbbb", timestamp: b.timestamp, cwd: projB },
    { type: "message", id: "f1", parentId: null, timestamp: b.timestamp, message: { role: "user", content: "Newest session", timestamp: b.ms } },
  ));
  server = await startServer({ agentDir: agent, projectDir: join(root, "project"), port: 0, staticDir: resolve("dist/client") });
});
test.afterEach(async () => { await server?.close(); await rm(root, { recursive: true, force: true }); });

test("shows the recorded system prompt of a chosen project and session", async ({ page }) => {
  await page.goto(server.url + "#system-prompt");
  await expect(page.getByText("Choose a project at the top")).toBeVisible();
  await page.getByRole("combobox", { name: "Project", exact: true }).click();
  await page.getByRole("option", { name: projB, exact: true }).click();
  await expect(page.getByText("This session has no recorded system prompt")).toBeVisible();
  await page.getByRole("combobox", { name: "Project", exact: true }).click();
  await page.getByRole("option", { name: projA, exact: true }).click();
  await expect(page.getByLabel("Session")).toContainText("Fix the login bug");
  await page.getByRole("button", { name: /^rules/ }).click();
  await expect(page.getByRole("region", { name: /^rules/ })).toContainText("Rule two.");
  await expect(page.getByText("Rule one.")).toHaveCount(0);
  await page.getByText(/^Tools \(1\)/).click();
  await expect(page.getByRole("list", { name: "Tools" })).toContainText("read");
  await expect(page.getByRole("list", { name: "Tools" })).not.toContainText("write");
  await page.getByRole("button", { name: "Copy full prompt" }).click();
  await expect(page.getByRole("region", { name: "Notifications" })).toContainText("Copied");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("You are Pi.\n\nRule two.");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("returning to System prompt shows the last prompt at once while it reads the sessions again", async ({ page }) => {
  await page.goto(server.url + "#system-prompt");
  await page.getByRole("combobox", { name: "Project", exact: true }).click();
  await page.getByRole("option", { name: projA, exact: true }).click();
  await expect(page.getByRole("button", { name: "Copy full prompt" })).toBeVisible();
  let release!: () => void;
  const hold = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/sessions**", async route => { await hold; await route.continue(); });
  await page.getByRole("tab", { name: "General" }).click();
  await page.getByRole("tab", { name: "System prompt" }).click();
  await expect(page.getByLabel("Session")).toContainText("Fix the login bug");
  await expect(page.getByRole("button", { name: "Copy full prompt" })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Checking for changes" })).toBeVisible();
  release();
  await expect(page.getByText("Checking for changes")).toHaveCount(0);
});
