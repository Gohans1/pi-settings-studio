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
  await expect(page.getByRole("status")).toContainText("mcp turned off");
  expect((await settings()).extensions).toEqual(["-builtin:mcp"]);
  await page.getByRole("button", { name: /^review/ }).click();
  await expect(page.getByRole("region", { name: "review" })).toContainText("Review the diff");
  await page.getByRole("switch", { name: "Enable tool.ts" }).click();
  await expect(page.getByRole("status")).toContainText("tool.ts turned off");
  expect((await settings()).packages[0]).toEqual({ source: "./pkgs/my-pack", extensions: ["-extensions/tool.ts"] });
  const packages = page.getByRole("region", { name: "Packages" });
  await expect(packages).toContainText("./pkgs/my-pack");
  await expect(packages).toContainText("npm:not-installed-pkg");
  await expect(packages).toContainText("Not installed");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
