import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { startServer, type RunningServer } from "../src/server/server.ts";

let root: string, agent: string, project: string, server: RunningServer;
test.beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "pi-settings-projects-browser-"));
  agent = join(root, "agent");
  project = join(root, "webapp");
  await mkdir(project, { recursive: true });
  const iso = "2026-10-01T10:00:00.000Z";
  await mkdir(join(agent, "sessions", "--webapp--"), { recursive: true });
  await writeFile(join(agent, "sessions", "--webapp--", "s.jsonl"), [
    { type: "session", version: 3, id: "s1", timestamp: iso, cwd: project },
    { type: "message", id: "m1", parentId: null, timestamp: iso, message: { role: "user", content: "hi", timestamp: Date.parse(iso) } },
  ].map(entry => JSON.stringify(entry)).join("\n") + "\n");
  await writeFile(join(agent, "settings.json"), JSON.stringify({ retry: { maxRetries: 3 } }));
  server = await startServer({ agentDir: agent, port: 0, staticDir: resolve("dist/client") });
});
test.afterEach(async () => { await server?.close(); await rm(root, { recursive: true, force: true }); });

test("a project is picked, trusted, and its own settings.json edited", async ({ page }) => {
  await page.goto(server.url + "#general");
  await page.getByRole("combobox", { name: "Project", exact: true }).click();
  await page.getByRole("option", { name: project, exact: true }).click();
  const trust = page.getByRole("region", { name: "Project trust" });
  await expect(trust).toContainText("Pi may ignore this project's .pi folder");
  await expect(trust.getByRole("button", { name: "Do not trust" })).toHaveCount(0);
  await trust.getByRole("button", { name: "Trust this project" }).click();
  await expect(trust).toHaveCount(0);
  expect(JSON.parse(await readFile(join(agent, "trust.json"), "utf8"))[project]).toBe(true);

  await page.getByRole("radio", { name: "This project" }).check();
  await page.getByRole("region", { name: "Setting groups" }).getByRole("button", { name: /^Network & retries/ }).click();
  await expect(page.getByLabel("HTTP proxy", { exact: true })).toBeDisabled();
  const retries = page.getByLabel("Retry attempts", { exact: true });
  await expect(retries).toHaveValue("3");
  await retries.fill("5");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("region", { name: "Notifications" })).toContainText("Saved");
  expect(JSON.parse(await readFile(join(project, ".pi", "settings.json"), "utf8"))).toEqual({ retry: { maxRetries: 5 } });
  expect(JSON.parse(await readFile(join(agent, "settings.json"), "utf8"))).toEqual({ retry: { maxRetries: 3 } });
  await page.reload();
  await expect(page.getByRole("combobox", { name: "Project", exact: true })).toContainText(project);
  await expect(trust).toHaveCount(0);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

for (const source of ["default", "project", "parent"] as const) {
  test(`trusted projects have no trust banner or opt-out action (${source})`, async ({ page }) => {
    await writeFile(join(agent, "settings.json"), JSON.stringify({ defaultProjectTrust: source === "default" ? "always" : "ask" }));
    if (source !== "default") await writeFile(join(agent, "trust.json"), JSON.stringify({ [source === "project" ? project : root]: true }));
    await page.goto(server.url + "#general");
    await page.getByRole("combobox", { name: "Project", exact: true }).click();
    await page.getByRole("option", { name: project, exact: true }).click();
    await expect(page.getByRole("radio", { name: "This project" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Project trust" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Do not trust" })).toHaveCount(0);
    await page.getByRole("tab", { name: "MCP", exact: true }).click();
    await expect(page.getByRole("region", { name: "Project trust" })).toHaveCount(0);
  });
}

test("an explicit block still warns even when projects are trusted by default", async ({ page }) => {
  await writeFile(join(agent, "settings.json"), JSON.stringify({ defaultProjectTrust: "always" }));
  await writeFile(join(agent, "trust.json"), JSON.stringify({ [project]: false }));
  await page.goto(server.url + "#general");
  await page.getByRole("combobox", { name: "Project", exact: true }).click();
  await page.getByRole("option", { name: project, exact: true }).click();
  const trust = page.getByRole("region", { name: "Project trust" });
  await expect(trust).toContainText("Pi may ignore this project's .pi folder");
  await expect(trust).toContainText("Not trusted in Pi's trust.json");
  await trust.getByRole("button", { name: "Trust this project" }).click();
  await expect(trust).toHaveCount(0);
  expect(JSON.parse(await readFile(join(agent, "trust.json"), "utf8"))[project]).toBe(true);
});

test("project model defaults and raw JSON write the project's settings.json", async ({ page }) => {
  await page.goto(server.url + "#models");
  await page.getByRole("combobox", { name: "Project", exact: true }).click();
  await page.getByRole("option", { name: project, exact: true }).click();
  await page.getByRole("button", { name: /^Defaults/ }).click();
  const panel = page.getByRole("region", { name: "Defaults" });
  await panel.getByRole("radio", { name: "This project" }).check();
  await panel.getByRole("combobox", { name: "Thinking level" }).click();
  await page.getByRole("option", { name: "high", exact: true }).click();
  await panel.getByRole("button", { name: "Save defaults" }).click();
  await expect(page.getByRole("region", { name: "Notifications" })).toContainText("Defaults saved");
  expect(JSON.parse(await readFile(join(project, ".pi", "settings.json"), "utf8"))).toEqual({ defaultThinkingLevel: "high" });

  await page.getByRole("tab", { name: "General" }).click();
  await page.getByRole("radio", { name: "This project" }).check();
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "Edit as JSON" }).click();
  await page.getByLabel("settings.json", { exact: true }).fill('{ "defaultThinkingLevel": "low" }');
  await page.getByRole("button", { name: "Save JSON" }).click();
  await expect(page.getByRole("region", { name: "Notifications" })).toContainText("Saved");
  expect(await readFile(join(project, ".pi", "settings.json"), "utf8")).toBe('{ "defaultThinkingLevel": "low" }');
  expect(JSON.parse(await readFile(join(agent, "settings.json"), "utf8"))).toEqual({ retry: { maxRetries: 3 } });
});
