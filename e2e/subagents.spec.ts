import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { startServer, type RunningServer } from "../src/server/server.ts";

let root: string, dir: string, server: RunningServer;
test.beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "pi-settings-agents-browser-"));
  const agent = join(root, "agent");
  dir = join(agent, "agents");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "scout.md"), "---\nname: scout\ndescription: Fast recon\ntools: read, grep\nthinking: high\n---\nYou are a scout.\n");
  await writeFile(join(dir, "broken.md"), "---\nname: broken\n---\nNo description.\n");
  server = await startServer({ agentDir: agent, projectDir: join(root, "project"), port: 0, staticDir: resolve("dist/client") });
});
test.afterEach(async () => { await server?.close(); await rm(root, { recursive: true, force: true }); });

test("a profile the browser would refuse says why under each field, focuses the first, and writes nothing", async ({ page }) => {
  await page.goto(server.url + "#subagents");
  await page.getByRole("button", { name: "Add profile" }).click();
  const form = page.getByRole("form", { name: "Add profile" });
  const name = form.getByLabel("Name");
  await name.fill("bad name");
  await form.getByRole("button", { name: "Save profile" }).click();
  await expect(name).toBeFocused();
  await expect(name).toHaveAttribute("aria-invalid", "true");
  await expect(form).toContainText("Use letters, digits, ., _ and -, starting with a letter or digit.");
  await expect(form).toContainText("Description is required.");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await name.fill("good-name");
  await expect(form).not.toContainText("Use letters, digits");
  await expect(name).not.toHaveAttribute("aria-invalid");
  expect((await readdir(dir)).sort()).toEqual(["broken.md", "scout.md"]);
});

test("while a profile saves, Save profile shows a spinner", async ({ page }) => {
  await page.goto(server.url + "#subagents");
  await page.getByRole("button", { name: "Add profile" }).click();
  const form = page.getByRole("form", { name: "Add profile" });
  await form.getByLabel("Name").fill("reviewer");
  await form.getByLabel("Description").fill("Reviews diffs");
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/**", route => route.request().method() === "GET" ? route.continue() : held.then(() => route.continue()));
  await form.getByRole("button", { name: "Save profile" }).click();
  const saving = page.getByRole("button", { name: "Saving…" });
  await expect(saving).toBeDisabled();
  await expect(saving.locator("[data-slot=spinner]")).toBeVisible();
  release();
  await expect(saving).toBeHidden();
  await page.unrouteAll({ behavior: "wait" });
});

test("sub-agent profiles can be read, added, edited, removed and restored", async ({ page }) => {
  await page.goto(server.url + "#subagents");
  await expect(page.getByText("No installed extension reads these profiles yet")).toBeVisible();
  await page.getByRole("button", { name: /^broken/ }).click();
  await expect(page.getByRole("region", { name: "broken" })).toContainText("Needs a name and a description");
  await page.getByRole("button", { name: /^scout/ }).click();
  const scout = page.getByRole("region", { name: "scout" });
  await expect(scout).toContainText("read, grep");
  await expect(scout).toContainText("thinking");

  await page.getByRole("button", { name: "Add profile" }).click();
  const form = page.getByRole("form", { name: "Add profile" });
  await form.getByLabel("Name").fill("reviewer");
  await form.getByLabel("Description").fill("Reviews diffs");
  await form.getByLabel("Tools").fill("read, bash");
  await form.getByLabel("System prompt").fill("Review carefully.");
  await form.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByRole("region", { name: "Notifications" })).toContainText("reviewer saved");
  expect(await readFile(join(dir, "reviewer.md"), "utf8")).toContain("tools: read, bash");

  await page.getByRole("button", { name: /^scout/ }).click();
  await page.getByRole("button", { name: "Edit scout" }).click();
  await page.getByRole("form", { name: "Edit scout" }).getByLabel("Description").fill("Recon, fast");
  await page.getByRole("form", { name: "Edit scout" }).getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByRole("region", { name: "Notifications" })).toContainText("scout saved");
  const scoutFile = await readFile(join(dir, "scout.md"), "utf8");
  expect(scoutFile).toContain("description: Recon, fast");
  expect(scoutFile).toContain("thinking: high");

  await page.getByRole("button", { name: /^reviewer/ }).click();
  await page.getByRole("button", { name: "Remove reviewer" }).click();
  await expect(page.getByRole("region", { name: "Notifications" })).toContainText("Removed reviewer.md");
  await expect(stat(join(dir, "reviewer.md"))).rejects.toThrow();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("region", { name: "Notifications" })).toContainText("Restored reviewer.md");
  expect(await readFile(join(dir, "reviewer.md"), "utf8")).toContain("Reviews diffs");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("a project profile is added in the project's .pi/agents and replaces a global one of the same name there", async ({ page }) => {
  const project = join(root, "webapp");
  await mkdir(project);
  await server.close();
  server = await startServer({ agentDir: join(root, "agent"), projectDir: project, port: 0, staticDir: resolve("dist/client") });
  await page.goto(server.url + "#subagents");
  await page.getByRole("combobox", { name: "Project", exact: true }).click();
  await page.getByRole("option", { name: project, exact: true }).click();
  await page.getByRole("button", { name: "Add profile to project" }).click();
  const form = page.getByRole("form", { name: "Add profile to this project" });
  await form.getByLabel("Name").fill("scout");
  await form.getByLabel("Description").fill("Project recon");
  await form.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByRole("region", { name: "Notifications" })).toContainText("scout saved");
  expect(await readFile(join(project, ".pi", "agents", "scout.md"), "utf8")).toContain("description: Project recon");
  await expect(page.getByRole("region", { name: "Global profiles" }).getByRole("button", { name: /^scout/ })).toContainText("replaced here");
});
