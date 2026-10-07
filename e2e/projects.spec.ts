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
  await page.getByLabel("Project", { exact: true }).selectOption(project);
  const trust = page.getByRole("region", { name: "Project trust" });
  await expect(trust).toContainText("T3Code ignores this project's .pi folder");
  await trust.getByRole("button", { name: "Trust this project" }).click();
  await expect(trust).toContainText("loads in T3Code");
  expect(JSON.parse(await readFile(join(agent, "trust.json"), "utf8"))[project]).toBe(true);

  await page.getByRole("radio", { name: "This project" }).check();
  await expect(page.getByLabel("HTTP proxy", { exact: true })).toBeDisabled();
  const retries = page.getByLabel("Retry attempts", { exact: true });
  await expect(retries).toHaveValue("3");
  await retries.fill("5");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Saved");
  expect(JSON.parse(await readFile(join(project, ".pi", "settings.json"), "utf8"))).toEqual({ retry: { maxRetries: 5 } });
  expect(JSON.parse(await readFile(join(agent, "settings.json"), "utf8"))).toEqual({ retry: { maxRetries: 3 } });
  await page.reload();
  await expect(page.getByLabel("Project", { exact: true })).toHaveValue(project);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
