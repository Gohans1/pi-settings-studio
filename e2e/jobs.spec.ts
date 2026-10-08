import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { startServer, type RunningServer } from "../src/server/server.ts";

let root: string, agent: string, server: RunningServer;
test.beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "pi-settings-jobs-browser-"));
  agent = join(root, "agent");
  await mkdir(agent, { recursive: true });
  await writeFile(join(agent, "settings.json"), "{}");
  await writeFile(join(agent, "mcp.json"), JSON.stringify({ mcpServers: {
    echo: { command: "bun", args: [resolve("tests/fixtures/echo-mcp.ts")] },
    dead: { command: "definitely-not-a-command-xyz", args: ["--api-key", "fixture-arg-secret"] },
  } }));
  server = await startServer({ agentDir: agent, port: 0, staticDir: resolve("dist/client") });
});
test.afterEach(async () => { await server?.close(); await rm(root, { recursive: true, force: true }); });

test("Test connections shows each MCP server's state from pi mcp list", async ({ page }) => {
  test.slow();
  await page.goto(server.url + "#mcp");
  await page.getByRole("button", { name: "Test connections" }).click();
  const results = page.getByRole("region", { name: "Test MCP connections" });
  await expect(results).toContainText("Finished", { timeout: 60_000 });
  await expect(results.getByRole("listitem").filter({ hasText: "echo" })).toContainText("connected · 1 tool");
  await expect(results.getByRole("listitem").filter({ hasText: "dead" })).toContainText("failed");
  expect(await page.content()).not.toContain("fixture-arg-secret");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("a local package is installed and removed from the Plugins tab", async ({ page }) => {
  test.slow();
  const pkg = join(root, "pkg");
  await mkdir(join(pkg, "prompts"), { recursive: true });
  await writeFile(join(pkg, "package.json"), JSON.stringify({ name: "local-pkg", version: "1.0.0" }));
  await writeFile(join(pkg, "prompts", "hi.md"), "---\ndescription: Say hi\n---\nhi\n");
  await page.goto(server.url + "#plugins");
  await page.getByRole("button", { name: /^Packages/ }).click();
  await page.getByLabel("Package source").fill(pkg);
  await page.getByRole("button", { name: "Install", exact: true }).click();
  await expect(page.getByRole("region", { name: `Install ${pkg}` })).toContainText("Finished", { timeout: 60_000 });
  await expect(page.getByRole("button", { name: /^hi/ })).toBeVisible();
  expect(JSON.parse(await readFile(join(agent, "settings.json"), "utf8")).packages).toHaveLength(1);
  await page.getByRole("button", { name: `Remove package ../pkg` }).click();
  await expect(page.getByRole("region", { name: "Remove ../pkg" })).toContainText("Finished", { timeout: 60_000 });
  expect(JSON.parse(await readFile(join(agent, "settings.json"), "utf8")).packages).toEqual([]);
});

test("a provider sign-in shows Pi's questions and can be cancelled", async ({ page }) => {
  await page.goto(server.url + "#models");
  await page.getByRole("searchbox", { name: "Search providers" }).fill("anthropic");
  await page.getByRole("button", { name: /^Anthropic\b/ }).first().click();
  await page.getByRole("button", { name: "Sign in to Anthropic" }).click();
  const job = page.getByRole("region", { name: "Sign in to anthropic" });
  await expect(job.getByRole("radiogroup")).toBeVisible();
  await job.getByRole("button", { name: "Cancel" }).click();
  await expect(job).toContainText("Cancelled");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("after a connection test, each tool of a server gets its own exposure", async ({ page }) => {
  test.slow();
  await page.goto(server.url + "#mcp");
  await page.getByRole("button", { name: /^echo/ }).click();
  const detail = page.getByRole("region", { name: "echo" });
  await expect(detail).toContainText("Test connections to list");
  await page.getByRole("button", { name: "Test connections" }).click();
  await expect(page.getByRole("region", { name: "Test MCP connections" })).toContainText("Finished", { timeout: 60_000 });
  await detail.getByRole("combobox", { name: "Exposure of echo/echo" }).click();
  await page.getByRole("option", { name: "Direct", exact: true }).click();
  await expect(page.getByRole("region", { name: "Notifications" })).toContainText("echo/echo now uses Direct");
  expect(JSON.parse(await readFile(join(agent, "mcp.json"), "utf8")).mcpServers.echo.toolExposure).toEqual({ echo: "direct" });
  await detail.getByRole("combobox", { name: "Exposure of echo/echo" }).click();
  await page.getByRole("option", { name: /^Inherit:/ }).click();
  await expect(page.getByRole("region", { name: "Notifications" })).toContainText("echo/echo follows the server again");
  expect(JSON.parse(await readFile(join(agent, "mcp.json"), "utf8")).mcpServers.echo.toolExposure).toBeUndefined();
});
