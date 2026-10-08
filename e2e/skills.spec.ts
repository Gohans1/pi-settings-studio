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
  await expect(page.getByRole("region", { name: "beta" })).toContainText("Only through /skill:beta");
  await page.getByRole("button", { name: /^alpha/ }).click();
  await expect(page.getByRole("region", { name: "alpha" })).toContainText("Alpha does things.");
  await page.getByRole("switch", { name: "Enable alpha" }).click();
  await expect(page.getByRole("status")).toContainText("alpha turned off");
  expect((await settings()).skills).toEqual(["-skills/alpha/SKILL.md"]);
  await page.getByRole("switch", { name: "Enable every skill in ./pkgs/my-pack (user)" }).click();
  await expect(page.getByRole("status")).toContainText("All skills in ./pkgs/my-pack (user) turned off");
  expect((await settings()).packages).toEqual([{ source: "./pkgs/my-pack", skills: ["-skills/gamma/SKILL.md"] }]);
  await expect(page.getByText("1 of 3 skills on")).toBeVisible();
  await page.getByRole("searchbox", { name: "Search skills" }).fill("gam");
  await expect(page.getByRole("button", { name: /^alpha/ })).toBeHidden();
  await expect(page.getByRole("button", { name: /^gamma/ })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
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
  await expect(page.getByRole("status")).toContainText("Saved references/notes.md");
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
