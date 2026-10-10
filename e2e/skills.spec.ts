import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { startServer, type RunningServer } from "../src/server/server.ts";

let root: string, agent: string, server: RunningServer;
const skill = (name: string, description: string, extra = "") => `---\nname: ${name}\ndescription: ${description}\n${extra}---\n# ${name}\n`;
test.beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "pi-settings-skills-browser-"));
  agent = join(root, "agent");
  for (const [dir, body] of <[string, string][]>[
    ["skills/alpha", skill("alpha", "Alpha does things.")],
    ["skills/beta", skill("beta", "Beta only by command.", "disable-model-invocation: true\n")],
    ["pkgs/my-pack/skills/gamma", skill("gamma", "Gamma from a package.")],
  ]) {
    await mkdir(join(agent, dir), { recursive: true });
    await writeFile(join(agent, dir, "SKILL.md"), body);
  }
  await writeFile(join(agent, "pkgs/my-pack/package.json"), JSON.stringify({ name: "my-pack" }));
  await writeFile(join(agent, "settings.json"), JSON.stringify({ packages: ["./pkgs/my-pack"] }));
  server = await startServer({ agentDir: agent, projectDir: join(root, "project"), port: 0, staticDir: resolve("dist/client") });
});
test.afterEach(async () => { await server?.close(); await rm(root, { recursive: true, force: true }); });

test("skills can be inspected, searched and switched one by one or by group", async ({ page }) => {
  const settings = async () => JSON.parse(await readFile(join(agent, "settings.json"), "utf8"));
  await page.goto(server.url + "#skills");
  await expect(page.getByText("3 of 3 skills on")).toBeVisible();
  await page.getByRole("button", { name: /^beta/ }).click();
  await expect(page.getByRole("region", { name: "beta" })).toContainText("Only /skill:beta loads it");
  await page.getByRole("button", { name: /^alpha/ }).click();
  await expect(page.getByRole("region", { name: "alpha" })).toContainText("Alpha does things.");
  await page.getByRole("switch", { name: "Enable alpha" }).click();
  await expect(page.getByRole("region", { name: "Notifications" })).toContainText("alpha turned off");
  expect((await settings()).skills).toEqual(["-skills/alpha/SKILL.md"]);
  await page.getByRole("switch", { name: "Enable every skill in ./pkgs/my-pack (user)" }).click();
  await expect(page.getByRole("region", { name: "Notifications" })).toContainText("All skills in ./pkgs/my-pack (user) turned off");
  expect((await settings()).packages).toEqual([{ source: "./pkgs/my-pack", skills: ["-skills/gamma/SKILL.md"] }]);
  await expect(page.getByText("1 of 3 skills on")).toBeVisible();
  await page.getByRole("searchbox", { name: "Search skills" }).fill("gam");
  await expect(page.getByRole("button", { name: /^alpha/ })).toBeHidden();
  await expect(page.getByRole("button", { name: /^gamma/ })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("closing a file with unsaved changes asks first, and only Discard throws the draft away", async ({ page }) => {
  await page.goto(server.url + "#skills");
  await page.getByRole("button", { name: /^alpha/ }).click();
  await page.getByRole("button", { name: "Edit files of alpha" }).click();
  const editor = page.getByRole("form", { name: "Edit alpha" });
  await editor.getByLabel("Content of SKILL.md").fill("Draft.\n");
  const close = editor.getByRole("button", { name: "Close" });
  await close.click();
  const ask = page.getByRole("alertdialog", { name: "Discard the unsaved changes?" });
  await expect(ask).toContainText("SKILL.md");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await ask.getByRole("button", { name: "Keep editing" }).click();
  await expect(ask).toBeHidden();
  await expect(close).toBeFocused();
  await expect(editor.getByLabel("Content of SKILL.md")).toHaveValue("Draft.\n");
  await close.click();
  await ask.getByRole("button", { name: "Discard" }).click();
  await expect(editor).toBeHidden();
  expect(await readFile(join(agent, "skills/alpha/SKILL.md"), "utf8")).toBe(skill("alpha", "Alpha does things."));
});

test("a new skill without a name or description says so under each field and creates nothing", async ({ page }) => {
  await page.goto(server.url + "#skills");
  await page.getByRole("button", { name: "New skill" }).click();
  const create = page.getByRole("form", { name: "New skill" });
  await create.getByRole("button", { name: "Create skill" }).click();
  await expect(create.getByLabel("Name")).toBeFocused();
  await expect(create).toContainText("Name is required.");
  await expect(create).toContainText("Description is required.");
  await expect(page.getByText("3 of 3 skills on")).toBeVisible();
});

test("while a file has unsaved changes, the skill's other files wait and say why", async ({ page }) => {
  await mkdir(join(agent, "skills/alpha/references"), { recursive: true });
  await writeFile(join(agent, "skills/alpha/references/notes.md"), "Old notes.\n");
  await page.goto(server.url + "#skills");
  await page.getByRole("button", { name: /^alpha/ }).click();
  await page.getByRole("button", { name: "Edit files of alpha" }).click();
  const editor = page.getByRole("form", { name: "Edit alpha" });
  await expect(editor).not.toContainText("Save or discard the changes to open another file.");
  await editor.getByLabel("Content of SKILL.md").fill("Draft.\n");
  await expect(editor.getByRole("button", { name: "references/notes.md" })).toBeDisabled();
  await expect(editor).toContainText("Save or discard the changes to open another file.");
});

test("a skill and its files are edited, package skills are read-only, and a new skill is created", async ({ page }) => {
  await mkdir(join(agent, "skills/alpha/references"), { recursive: true });
  await writeFile(join(agent, "skills/alpha/references/notes.md"), "Old notes.\n");
  await page.goto(server.url + "#skills");
  await page.getByRole("button", { name: /^alpha/ }).click();
  await page.getByRole("button", { name: "Edit files of alpha" }).click();
  const editor = page.getByRole("form", { name: "Edit alpha" });
  await expect(editor.getByLabel("Content of SKILL.md")).toHaveValue(/Alpha does things/);
  await editor.getByRole("button", { name: "references/notes.md" }).click();
  await editor.getByLabel("Content of references/notes.md").fill("New notes.\n");
  await editor.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("region", { name: "Notifications" })).toContainText("Saved references/notes.md");
  expect(await readFile(join(agent, "skills/alpha/references/notes.md"), "utf8")).toBe("New notes.\n");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await editor.getByRole("button", { name: "Close" }).click();

  await page.getByRole("button", { name: /^gamma/ }).click();
  await page.getByRole("button", { name: "View files of gamma" }).click();
  const viewer = page.getByRole("form", { name: "View gamma" });
  await expect(viewer.getByLabel("Content of SKILL.md")).toHaveAttribute("readonly", "");
  await expect(viewer).toContainText("From the package ./pkgs/my-pack");
  await viewer.getByRole("button", { name: "Close" }).click();

  await page.getByRole("button", { name: "New skill" }).click();
  const create = page.getByRole("form", { name: "New skill" });
  await create.getByLabel("Name").fill("delta");
  await create.getByLabel("Description").fill("Delta: handles the fourth case.");
  await create.getByRole("button", { name: "Create skill" }).click();
  await expect(page.getByRole("form", { name: "Edit delta" })).toBeVisible();
  expect(await readFile(join(agent, "skills/delta/SKILL.md"), "utf8")).toBe('---\nname: delta\ndescription: "Delta: handles the fourth case."\n---\n\n');
  await expect(page.getByText("4 of 4 skills on")).toBeVisible();
});

test("a folder of skills from another tool is added, its skills appear, and removing it can be undone", async ({ page }) => {
  const other = join(root, "other-tool", "skills");
  await mkdir(join(other, "delta"), { recursive: true });
  await writeFile(join(other, "delta", "SKILL.md"), skill("delta", "Delta from another tool."));
  const settings = async () => JSON.parse(await readFile(join(agent, "settings.json"), "utf8"));
  await page.goto(server.url + "#skills");
  await page.getByRole("button", { name: /^Folders/ }).click();
  const folders = page.getByRole("region", { name: "Skill folders" });
  await expect(folders).toContainText(join(agent, "skills").replace(/^\/home\/[^/]+/, "~"));
  await folders.getByLabel("Folder or file").fill(other);
  await folders.getByRole("button", { name: "Add" }).click();
  await expect(page.getByRole("region", { name: "Notifications" })).toContainText("Added");
  await expect(folders.getByRole("listitem").filter({ hasText: "other-tool" })).toContainText("1 skill");
  await expect(page.getByRole("button", { name: /^delta/ })).toBeVisible();
  expect((await settings()).skills).toEqual([other]);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await folders.getByRole("button", { name: `Remove ${other}` }).click();
  await expect(page.getByRole("region", { name: "Notifications" })).toContainText("Removed");
  await expect(page.getByRole("button", { name: /^delta/ })).toBeHidden();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("region", { name: "Notifications" })).toContainText("Restored");
  expect((await settings()).skills).toEqual([other]);
  await expect(page.getByRole("button", { name: /^delta/ })).toBeVisible();
});

test("a skill Pi skips because another of the same name comes first says so and names the winner", async ({ page }) => {
  const other = join(root, "other-tool", "skills");
  await mkdir(join(other, "alpha"), { recursive: true });
  await writeFile(join(other, "alpha", "SKILL.md"), skill("alpha", "Another alpha."));
  await writeFile(join(agent, "settings.json"), JSON.stringify({ packages: ["./pkgs/my-pack"], skills: [other] }));
  await page.goto(server.url + "#skills");
  const skipped = page.getByRole("button", { name: /^alpha.*not loaded/ });
  await expect(skipped).toHaveCount(1);
  await expect(page.getByText("4 of 4 skills on, 1 not loaded (same name)")).toBeVisible();
  await page.getByRole("button", { name: /^Folders/ }).click();
  await expect(page.getByRole("region", { name: "Skill folders" }).getByRole("listitem").filter({ hasText: "other-tool" })).toContainText("1 replaces a skill of the same name");
  await skipped.click();
  const detail = page.getByRole("region", { name: "alpha" });
  await expect(detail).toContainText("Pi does not load this copy");
  await expect(detail).toContainText(join(other, "alpha", "SKILL.md"));
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("whether the model may load a skill on its own is a switch in the skill's details", async ({ page }) => {
  await page.goto(server.url + "#skills");
  await page.getByRole("button", { name: /^alpha/ }).click();
  const detail = page.getByRole("region", { name: "alpha" });
  await detail.getByRole("switch", { name: "Let the model load it" }).click();
  await expect(page.getByRole("region", { name: "Notifications" })).toContainText("Only /skill:alpha loads alpha now");
  expect(await readFile(join(agent, "skills/alpha/SKILL.md"), "utf8")).toContain("disable-model-invocation: true");
  await expect(page.getByRole("button", { name: /^alpha.*command only/ })).toBeVisible();
  await expect(detail.getByRole("switch", { name: "Let the model load it" })).not.toBeChecked();
  await page.getByRole("button", { name: /^gamma/ }).click();
  await expect(page.getByRole("region", { name: "gamma" }).getByRole("switch")).toHaveCount(0);
});

test("a group's skills become command only from its menu, and Undo restores each one as it was", async ({ page }) => {
  const read = (name: string) => readFile(join(agent, "skills", name, "SKILL.md"), "utf8");
  const before = { alpha: await read("alpha"), beta: await read("beta") };
  // The Undo of the toast that names the change: a replaced toast keeps its own while it leaves.
  const undo = (change: string) => page.getByRole("region", { name: "Notifications" }).getByRole("dialog").filter({ hasText: change }).getByRole("button", { name: "Undo" }).click();
  await page.goto(server.url + "#skills");
  const menu = page.getByRole("button", { name: /^More actions for User/ });
  await expect(page.getByRole("button", { name: "More actions for ./pkgs/my-pack (user)" })).toHaveCount(0);
  await menu.click();
  await page.getByRole("menuitem", { name: "Make all command only" }).click();
  // beta was command only already: one skill changes.
  await expect(page.getByRole("region", { name: "Notifications" })).toContainText("1 skill in User");
  await expect(page.getByRole("button", { name: /^alpha.*command only/ })).toBeVisible();
  expect(await read("alpha")).toContain("disable-model-invocation: true");
  expect(await read("beta")).toBe(before.beta);
  await menu.click();
  await expect(page.getByRole("menuitem", { name: "Make all command only" })).toHaveAttribute("aria-disabled", "true");
  await page.keyboard.press("Escape");
  await undo("command only now");
  await expect(page.getByRole("region", { name: "Notifications" })).toContainText("Restored how the model reaches 1 skill");
  expect(await read("alpha")).toBe(before.alpha);
  await menu.click();
  await page.getByRole("menuitem", { name: "Let the model load all" }).click();
  await expect(page.getByRole("region", { name: "Notifications" })).toContainText("The model may now load 1 skill in User");
  expect(await read("beta")).not.toContain("disable-model-invocation");
  await undo("The model may now load");
  await expect(page.getByRole("region", { name: "Notifications" })).toContainText("Restored how the model reaches 1 skill");
  expect({ alpha: await read("alpha"), beta: await read("beta") }).toEqual(before);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("a user skill is removed with its folder and Undo brings it back; package skills cannot be removed", async ({ page }) => {
  await mkdir(join(agent, "skills/alpha/references"), { recursive: true });
  await writeFile(join(agent, "skills/alpha/references/notes.md"), "Notes.\n");
  const original = await readFile(join(agent, "skills/alpha/SKILL.md"), "utf8");
  await page.goto(server.url + "#skills");
  await page.getByRole("button", { name: /^gamma/ }).click();
  await expect(page.getByRole("region", { name: "gamma" }).getByRole("button", { name: /^Remove/ })).toHaveCount(0);
  await page.getByRole("button", { name: /^alpha/ }).click();
  await page.getByRole("region", { name: "alpha" }).getByRole("button", { name: "Remove alpha" }).click();
  await expect(page.getByRole("region", { name: "Notifications" })).toContainText("Removed alpha and its folder");
  await expect(page.getByRole("button", { name: /^alpha/ })).toBeHidden();
  await expect(page.getByText("2 of 2 skills on")).toBeVisible();
  await expect(readFile(join(agent, "skills/alpha/SKILL.md"), "utf8")).rejects.toThrow();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("region", { name: "Notifications" })).toContainText("Restored alpha");
  await expect(page.getByRole("region", { name: "alpha" })).toContainText("Alpha does things.");
  expect(await readFile(join(agent, "skills/alpha/SKILL.md"), "utf8")).toBe(original);
  expect(await readFile(join(agent, "skills/alpha/references/notes.md"), "utf8")).toBe("Notes.\n");
});

test("Skill commands is set in the Skills tab, and General no longer lists it", async ({ page }) => {
  await page.goto(server.url + "#skills");
  await page.getByRole("button", { name: /^Skill commands/ }).click();
  const pane = page.getByRole("region", { name: "Skill commands" });
  const commands = pane.getByRole("switch", { name: "Skill commands" });
  await expect(commands).toBeChecked();
  await expect(pane.locator('[id="row-enableSkillCommands"]')).toContainText("Default");
  await commands.click();
  await pane.getByRole("region", { name: "Unsaved changes" }).getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("region", { name: "Notifications" })).toContainText("Saved to settings.json");
  expect(JSON.parse(await readFile(join(agent, "settings.json"), "utf8"))).toEqual({ packages: ["./pkgs/my-pack"], enableSkillCommands: false });
  await expect(pane.locator('[id="row-enableSkillCommands"]')).toContainText("Custom · Pi's default is on");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole("tab", { name: "General" }).click();
  await page.getByRole("searchbox", { name: "Search settings" }).fill("enableSkillCommands");
  await expect(page.getByText("No settings match")).toBeVisible();
});

test("an unsaved change to skill commands asks before the page is left, as General does", async ({ page }) => {
  await page.goto(server.url + "#skills");
  await page.getByRole("button", { name: /^Skill commands/ }).click();
  await page.getByRole("region", { name: "Skill commands" }).getByRole("switch", { name: "Skill commands" }).click();
  await expect(page.getByRole("region", { name: "Unsaved changes" })).toBeVisible();
  const asked = page.waitForEvent("dialog");
  await page.close({ runBeforeUnload: true });
  const dialog = await asked;
  expect(dialog.type()).toBe("beforeunload");
  await dialog.accept();
});

