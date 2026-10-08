import { test, expect } from "@playwright/test";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { startServer, type RunningServer } from "../src/server/server.ts";

let root: string, project: string, server: RunningServer;
const skill = (name: string) => `---\nname: ${name}\ndescription: ${name} skill.\n---\n# ${name}\n`;
test.beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "pi-settings-resources-project-browser-"));
  project = join(root, "webapp");
  for (const [file, body] of <[string, string][]>[
    ["agent/skills/alpha/SKILL.md", skill("alpha")],
    ["agent/settings.json", "{}"],
    ["webapp/.pi/skills/delta/SKILL.md", skill("delta")],
    ["webapp/.pi/prompts/ship.md", "---\ndescription: Ship it\n---\nShip.\n"],
  ]) {
    await mkdir(join(root, file, ".."), { recursive: true });
    await writeFile(join(root, file), body);
  }
  server = await startServer({ agentDir: join(root, "agent"), projectDir: project, port: 0, staticDir: resolve("dist/client") });
});
test.afterEach(async () => { await server?.close(); await rm(root, { recursive: true, force: true }); });

test("project skills and prompts switch in the project's .pi/settings.json", async ({ page }) => {
  const projectSettings = async () => JSON.parse(await readFile(join(project, ".pi", "settings.json"), "utf8"));
  await page.goto(server.url + "#skills");
  await expect(page.getByRole("button", { name: /^delta/ })).toHaveCount(0);
  await page.getByRole("combobox", { name: "Project", exact: true }).click();
  await page.getByRole("option", { name: project, exact: true }).click();
  await page.getByRole("switch", { name: "Enable delta" }).click();
  await expect(page.getByRole("region", { name: "Notifications" })).toContainText("delta turned off");
  expect(await projectSettings()).toEqual({ skills: ["-skills/delta/SKILL.md"] });
  expect(JSON.parse(await readFile(join(root, "agent", "settings.json"), "utf8"))).toEqual({});

  await page.getByRole("tab", { name: "Plugins" }).click();
  await page.getByRole("switch", { name: "Enable ship" }).click();
  await expect(page.getByRole("region", { name: "Notifications" })).toContainText("ship turned off");
  expect(await projectSettings()).toEqual({ skills: ["-skills/delta/SKILL.md"], prompts: ["-prompts/ship.md"] });
});
