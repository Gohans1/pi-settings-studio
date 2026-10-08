import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { startServer, type RunningServer } from "../src/server/server.ts";

let root: string, agent: string, server: RunningServer;
test.beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "pi-settings-plugins-browser-"));
  agent = join(root, "agent");
  for (const [file, body] of <[string, string][]>[
    ["extensions/hello.ts", "export default function () {}\n"],
    ["prompts/review.md", "---\ndescription: Review the diff\n---\nReview it.\n"],
    ["pkgs/my-pack/package.json", JSON.stringify({ name: "my-pack" })],
    ["pkgs/my-pack/extensions/tool.ts", "export default function () {}\n"],
  ]) {
    await mkdir(join(agent, file, ".."), { recursive: true });
    await writeFile(join(agent, file), body);
  }
  await writeFile(join(agent, "settings.json"), JSON.stringify({ packages: ["./pkgs/my-pack", "npm:not-installed-pkg"] }));
  server = await startServer({ agentDir: agent, projectDir: join(root, "project"), port: 0, staticDir: resolve("dist/client") });
});
test.afterEach(async () => { await server?.close(); await rm(root, { recursive: true, force: true }); });

test("plugins list built-ins, user files and packages, and switch them in settings.json", async ({ page }) => {
  const settings = async () => JSON.parse(await readFile(join(agent, "settings.json"), "utf8"));
  await page.goto(server.url + "#plugins");
  await expect(page.getByRole("heading", { name: "Built-in" })).toBeVisible();
  await page.getByRole("button", { name: /^mcp/ }).click();
  await expect(page.getByRole("region", { name: "mcp" })).toContainText("turns off Pi's MCP support");
  await page.getByRole("switch", { name: "Enable mcp" }).click();
  await expect(page.getByRole("region", { name: "Notifications" })).toContainText("mcp turned off");
  expect((await settings()).extensions).toEqual(["-builtin:mcp"]);
  await page.getByRole("button", { name: /^review/ }).click();
  await expect(page.getByRole("region", { name: "review" })).toContainText("Review the diff");
  await page.getByRole("switch", { name: "Enable tool.ts" }).click();
  await expect(page.getByRole("region", { name: "Notifications" })).toContainText("tool.ts turned off");
  expect((await settings()).packages[0]).toEqual({ source: "./pkgs/my-pack", extensions: ["-extensions/tool.ts"] });
  await page.getByRole("button", { name: /^Packages/ }).click();
  const packages = page.getByRole("region", { name: "Packages" });
  await expect(packages).toContainText("./pkgs/my-pack");
  await expect(packages).toContainText("npm:not-installed-pkg");
  await expect(packages).toContainText("Not installed");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("a package's resource filters are edited in settings.json", async ({ page }) => {
  const settings = async () => JSON.parse(await readFile(join(agent, "settings.json"), "utf8"));
  await page.goto(server.url + "#plugins");
  await page.getByRole("button", { name: /^Packages/ }).click();
  await page.getByRole("button", { name: "Filters for ./pkgs/my-pack" }).click();
  const form = page.getByRole("form", { name: "Filters for ./pkgs/my-pack" });
  await form.getByRole("combobox", { name: "Extensions", exact: true }).click();
  await page.getByRole("option", { name: "Only these patterns", exact: true }).click();
  await form.getByLabel("Extension patterns").fill("extensions/*.ts\n!extensions/legacy.ts");
  await form.getByRole("combobox", { name: "Prompts", exact: true }).click();
  await page.getByRole("option", { name: "None", exact: true }).click();
  await form.getByRole("button", { name: "Save filters" }).click();
  await expect(page.getByRole("region", { name: "Notifications" })).toContainText("Filters saved for ./pkgs/my-pack");
  expect((await settings()).packages[0]).toEqual({ source: "./pkgs/my-pack", extensions: ["extensions/*.ts", "!extensions/legacy.ts"], prompts: [] });
  await page.getByRole("button", { name: "Filters for ./pkgs/my-pack" }).click();
  await form.getByRole("combobox", { name: "Extensions", exact: true }).click();
  await page.getByRole("option", { name: "Everything the package allows", exact: true }).click();
  await form.getByRole("combobox", { name: "Prompts", exact: true }).click();
  await page.getByRole("option", { name: "Everything the package allows", exact: true }).click();
  await form.getByRole("button", { name: "Save filters" }).click();
  await expect(page.getByRole("region", { name: "Notifications" })).toContainText("Filters saved");
  expect((await settings()).packages[0]).toBe("./pkgs/my-pack");
});

test("prompts and extensions are edited or viewed, and a new theme is created", async ({ page }) => {
  await page.goto(server.url + "#plugins");
  await page.getByRole("button", { name: /^review/ }).click();
  await page.getByRole("button", { name: "Edit review" }).click();
  const editor = page.getByRole("form", { name: "Edit review" });
  await editor.getByLabel("Content of review.md").fill("---\ndescription: Review the diff\n---\nReview it twice.\n");
  await editor.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("region", { name: "Notifications" })).toContainText("Saved review.md");
  expect(await readFile(join(agent, "prompts/review.md"), "utf8")).toContain("Review it twice.");
  await editor.getByRole("button", { name: "Close" }).click();

  await page.getByRole("button", { name: /^tool\.ts/ }).click();
  await page.getByRole("button", { name: "View tool.ts" }).click();
  await expect(page.getByRole("form", { name: "View tool.ts" }).getByLabel("Content of tool.ts")).toHaveAttribute("readonly", "");
  await page.getByRole("form", { name: "View tool.ts" }).getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: /^mcp/ }).click();
  await expect(page.getByRole("button", { name: /^(Edit|View) mcp$/ })).toHaveCount(0);

  await page.getByRole("button", { name: "New", exact: true }).click();
  await page.getByRole("menuitem", { name: "Theme" }).click();
  const create = page.getByRole("form", { name: "New theme" });
  await create.getByLabel("Name").fill("ocean");
  await create.getByRole("button", { name: "Create theme" }).click();
  await expect(page.getByRole("form", { name: "Edit ocean.json" })).toBeVisible();
  expect(JSON.parse(await readFile(join(agent, "themes/ocean.json"), "utf8")).name).toBe("ocean");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("extra folders of prompt templates are added from the Plugins tab", async ({ page }) => {
  const shared = join(root, "shared-prompts");
  await mkdir(shared, { recursive: true });
  await writeFile(join(shared, "triage.md"), "---\ndescription: Triage an issue\n---\nTriage.\n");
  await page.goto(server.url + "#plugins");
  await page.getByRole("button", { name: /^Folders/ }).click();
  const prompts = page.getByRole("region", { name: "Prompt template folders" });
  await prompts.getByLabel("Folder or file").fill(shared);
  await prompts.getByRole("button", { name: "Add" }).click();
  await expect(page.getByRole("region", { name: "Notifications" })).toContainText("Added");
  await expect(page.getByRole("button", { name: /^triage/ })).toBeVisible();
  expect(JSON.parse(await readFile(join(agent, "settings.json"), "utf8")).prompts).toEqual([shared]);
});
