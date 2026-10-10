import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { startServer, type RunningServer } from "../src/server/server.ts";

let root: string, agent: string, project: string, file: string, server: RunningServer;
const ECHO = resolve("tests/fixtures/echo-mcp.ts");
const source = `export default pi => {
  const add = (name, exposure = "direct") => pi.registerTool({ name, label: name, description: "Purpose of " + name + ". More about it.",
    exposure, parameters: { type: "object", properties: {} }, execute: async () => ({ content: [], details: undefined }) });
  add("visible_tool"); add("script_tool", "codemode");
};`;
test.beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "pi-settings-all-tools-browser-"));
  agent = join(root, "agent"); project = join(root, "project"); file = join(agent, "extensions", "tools.ts");
  await mkdir(join(agent, "extensions"), { recursive: true });
  await mkdir(join(project, ".pi"), { recursive: true });
  await writeFile(file, source);
  await writeFile(join(agent, "extensions", "todo.ts"), source.replace(/_tool/g, "_todo"));
  await writeFile(join(agent, "extensions", "claude-bridge.ts"), "export default () => {};");
  await writeFile(join(agent, "settings.json"), JSON.stringify({ defaultProjectTrust: "always", extensions: ["-extensions/todo.ts"] }));
  await writeFile(join(agent, "mcp.json"), JSON.stringify({ mcpServers: {
    "echo-server": { command: "bun", args: [ECHO] }, "off-server": { command: "bun", args: [ECHO], enabled: false },
  } }));
  await writeFile(join(project, ".pi", "settings.json"), JSON.stringify({ defaultTools: ["+grep"] }));
  // Pi creates auth.json on its first run; agent folders in use have one.
  await writeFile(join(agent, "auth.json"), "{}");
  server = await startServer({ agentDir: agent, projectDir: project, port: 0, staticDir: resolve("dist/client") });
});
test.afterEach(async () => { await server?.close(); await rm(root, { recursive: true, force: true }); });

const views = (page: Page) => page.getByRole("region", { name: "Tool views and sources" });
const pane = (page: Page) => page.locator(".workbench-detail");
const row = (page: Page, name: RegExp) => views(page).getByRole("button", { name });

test("Tools opens on what the model sees, grouped by source, beside every source and its state", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(server.url + "#tools");
  await expect(row(page, /^What the model sees/)).toHaveAttribute("aria-pressed", "true");
  await expect(pane(page).getByRole("heading", { level: 2 })).toHaveText("What the model sees");
  await expect(pane(page).getByRole("region", { name: "Core tools" }).getByRole("listitem")).toHaveCount(4);
  await expect(pane(page).getByRole("region", { name: "tools.ts" })).toContainText("visible_tool");
  await expect(pane(page)).not.toContainText("script_tool");
  await expect(row(page, /^tools\.ts/)).toContainText("1 seen");
  await expect(row(page, /^echo-server/)).toContainText("1 on demand");
  await expect(row(page, /^todo\.ts/)).toContainText("Off");
  await expect(row(page, /^claude-bridge\.ts/)).toContainText("No tools");
  await expect(row(page, /^off-server/)).toContainText("Off");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(errors).toEqual([]);
});

test("a source's name reads as a label over its tools: smaller than their names, in another colour", async ({ page }) => {
  await page.goto(server.url + "#tools");
  await row(page, /^What the model sees/).click();
  const look = (element: Element) => { const { fontSize, color } = getComputedStyle(element); return { size: parseFloat(fontSize), color }; };
  const source = await pane(page).getByRole("heading", { name: /^tools\.ts/ }).evaluate(look);
  const tool = await pane(page).getByText("visible_tool", { exact: true }).evaluate(look);
  expect(source.size).toBeLessThan(tool.size);
  expect(source.color).not.toBe(tool.color);
});

test("what the model doesn't see keeps on-demand tools apart from off ones, which stay folded", async ({ page }) => {
  await page.goto(server.url + "#tools");
  await row(page, /^What the model doesn't see/).click();
  const demand = pane(page).getByRole("region", { name: "On demand" });
  await expect(demand).toContainText("code mode");
  await expect(demand.getByRole("region", { name: "tools.ts" })).toContainText("script_tool");
  // MCP tools drop their mcp__<server>__ prefix under their server.
  await expect(demand.getByRole("region", { name: "echo-server" }).getByText("echo", { exact: true })).toBeVisible();
  const off = pane(page).getByRole("region", { name: "Off" });
  await expect(off.getByText("grep", { exact: true })).toBeHidden();
  await off.getByRole("button", { name: /^Show \d+ off tools$/ }).click();
  await expect(off.getByRole("region", { name: "Core tools" })).toContainText("grep");
  await expect(off.getByRole("link", { name: "Turn on in MCP" })).toHaveAttribute("href", "#mcp");
  await expect(off.getByRole("link", { name: "Turn on in Plugins" })).toHaveAttribute("href", "#plugins");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("a source shows every reach of its tools and where to change it; a tool opens to its full description", async ({ page }) => {
  await page.goto(server.url + "#tools");
  await row(page, /^tools\.ts/).click();
  await expect(pane(page).getByRole("heading", { level: 2 })).toHaveText("tools.ts");
  await expect(pane(page).getByRole("link", { name: "Change in Plugins" })).toHaveAttribute("href", "#plugins");
  await expect(pane(page)).toContainText("1 seen");
  await expect(pane(page)).toContainText("1 on demand");
  const tool = pane(page).getByRole("button", { name: /^script_tool/ });
  await expect(tool).toContainText("Purpose of script_tool.");
  await expect(pane(page)).not.toContainText("More about it.");
  await tool.click();
  await expect(tool).toHaveAttribute("aria-expanded", "true");
  await expect(pane(page)).toContainText("More about it.");
  await expect(pane(page)).toContainText("Called as");
});

test("search narrows the list and every view to the tools that match", async ({ page }) => {
  await page.goto(server.url + "#tools");
  await page.getByRole("searchbox", { name: "Search tools" }).fill("echo");
  await expect(row(page, /^echo-server/)).toContainText("1 match");
  await expect(row(page, /^tools\.ts/)).toHaveCount(0);
  await expect(row(page, /^What the model doesn't see/)).toContainText("1 tool");
  await expect(pane(page)).toContainText("No tools here match “echo”");
  await row(page, /^What the model doesn't see/).click();
  await expect(pane(page)).toContainText("Showing tools that match “echo”");
  await expect(pane(page).getByRole("region", { name: "echo-server" })).toBeVisible();
});

test("the project picker applies the project's settings; at 320px the list and a view take turns", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto(server.url + "#tools");
  await expect(row(page, /^Core tools/)).toContainText("4 seen");
  await page.getByRole("combobox", { name: "Project", exact: true }).click();
  await page.getByRole("option", { name: project, exact: true }).click();
  await expect(row(page, /^Core tools/)).toContainText("5 seen");
  await row(page, /^Core tools/).click();
  await expect(page.getByRole("button", { name: "All views" })).toBeVisible();
  await expect(pane(page).getByRole("region", { name: "Model sees" })).toContainText("grep");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole("button", { name: "All views" }).click();
  await expect(row(page, /^What the model sees/)).toBeVisible();
});

test("returning to Tools shows the last result at once and checks again behind it; Refresh tools asks for a fresh one", async ({ page }) => {
  await page.goto(server.url + "#tools");
  await expect(pane(page).getByRole("region", { name: "tools.ts" })).toContainText("visible_tool");
  let release!: () => void;
  const hold = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/tools*", async route => { await hold; await route.continue(); });
  await page.getByRole("tab", { name: "General" }).click();
  await page.getByRole("tab", { name: "Tools" }).click();
  await expect(pane(page).getByRole("region", { name: "tools.ts" })).toContainText("visible_tool");
  await expect(page.getByRole("status").filter({ hasText: "Checking for changes" })).toBeVisible();
  release();
  await expect(page.getByText("Checking for changes")).toHaveCount(0);
  await page.unroute("**/api/tools*");
  const fresh = page.waitForRequest(request => request.url().includes("/api/tools") && request.postDataJSON()?.fresh === true);
  await page.getByRole("button", { name: "Refresh tools", exact: true }).click();
  await fresh;
});

test("leaving Tools before its first load ends lets the load finish; coming back does not start over", async ({ page }) => {
  const log = join(root, "starts.log");
  await writeFile(join(agent, "mcp.json"), JSON.stringify({ mcpServers: { "echo-server": { command: "bun", args: [ECHO], env: { ECHO_LOG: log, ECHO_DELAY_MS: "2000" } } } }));
  const starts = async () => (await readFile(log, "utf8").catch(() => "")).split("\n").filter(Boolean).length;
  await page.goto(server.url + "#tools");
  await expect.poll(starts).toBe(1);
  await page.getByRole("tab", { name: "General" }).click();
  await page.getByRole("tab", { name: "Tools" }).click();
  await expect(row(page, /^echo-server/)).toContainText("1 on demand");
  expect(await starts()).toBe(1);
});

test("a failed inspection says the list may be incomplete, and Refresh tools retries", async ({ page }) => {
  await writeFile(file, 'throw new Error("fixture cannot load"); export default () => {};');
  await page.goto(server.url + "#tools");
  await expect(page.getByRole("alert").filter({ hasText: "Could not verify all tools" })).toContainText("fixture cannot load");
  await writeFile(file, source);
  await page.getByRole("button", { name: "Refresh tools", exact: true }).click();
  await expect(pane(page).getByRole("region", { name: "tools.ts" })).toContainText("visible_tool");
  await expect(page.getByText("Could not verify all tools")).toHaveCount(0);
});

test("an MCP server's tools are listed as soon as it is opened, each with its own exposure", async ({ page }) => {
  test.slow();
  await page.goto(server.url + "#mcp");
  await page.getByRole("button", { name: /^echo-server/ }).click();
  const detail = page.getByRole("region", { name: "echo-server" });
  const exposure = detail.getByRole("combobox", { name: "Exposure of echo-server/echo" });
  await expect(exposure).toBeVisible({ timeout: 60_000 });
  const toolExposure = async () => JSON.parse(await readFile(join(agent, "mcp.json"), "utf8")).mcpServers["echo-server"].toolExposure;
  await exposure.click();
  await page.getByRole("option", { name: "Direct", exact: true }).click();
  await expect(page.getByRole("region", { name: "Notifications" })).toContainText("echo-server/echo now uses Direct");
  expect(await toolExposure()).toEqual({ echo: "direct" });
  await exposure.click();
  await page.getByRole("option", { name: /^Inherit:/ }).click();
  await expect(page.getByRole("region", { name: "Notifications" })).toContainText("echo-server/echo follows the server again");
  expect(await toolExposure()).toBeUndefined();
});

test("a server that is off lists its tools once it is turned on", async ({ page }) => {
  test.slow();
  await page.goto(server.url + "#mcp");
  await page.getByRole("button", { name: /^off-server/ }).click();
  const detail = page.getByRole("region", { name: "off-server" });
  await expect(detail.getByRole("region", { name: "Tools" })).toContainText("Turn the server on to list its tools.", { timeout: 60_000 });
  await page.getByRole("switch", { name: "Enable off-server" }).click();
  await expect(detail.getByRole("combobox", { name: "Exposure of off-server/echo" })).toBeVisible({ timeout: 60_000 });
});

test("each MCP server says whether it connected or failed, with no click; a tool keeps its name on the server", async ({ page }) => {
  test.slow();
  await writeFile(join(agent, "mcp.json"), JSON.stringify({ mcpServers: {
    "echo-server": { command: "bun", args: [ECHO, "say-it.v2"] }, dead: { command: "definitely-not-a-command-xyz" },
  } }));
  await page.goto(server.url + "#mcp");
  await expect(page.getByRole("button", { name: /^echo-server/ })).toHaveAccessibleName(/connected/, { timeout: 60_000 });
  await expect(page.getByRole("button", { name: /^dead/ })).toContainText("failed");
  await page.getByRole("button", { name: /^dead/ }).click();
  await expect(page.getByRole("region", { name: "dead" })).toContainText("Pi could not connect");
  await page.getByRole("button", { name: /^echo-server/ }).click();
  await page.getByRole("combobox", { name: "Exposure of echo-server/say-it.v2" }).click();
  await page.getByRole("option", { name: "Direct", exact: true }).click();
  await expect(page.getByRole("region", { name: "Notifications" })).toContainText("echo-server/say-it.v2 now uses Direct");
  expect(JSON.parse(await readFile(join(agent, "mcp.json"), "utf8")).mcpServers["echo-server"].toolExposure).toEqual({ "say-it.v2": "direct" });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("a built-in extension that is turned off says to turn it on in Plugins, where it is switched", async ({ page }) => {
  await writeFile(join(agent, "settings.json"), JSON.stringify({ defaultProjectTrust: "always", extensions: ["-extensions/todo.ts", "-builtin:llama.cpp"] }));
  await page.goto(server.url + "#tools");
  await expect(row(page, /^llama\.cpp/)).toContainText("Off");
  await row(page, /^llama\.cpp/).click();
  await expect(pane(page).getByRole("link", { name: "Turn on in Plugins" })).toHaveAttribute("href", "#plugins");
});

test("startup tools are a checklist in Tools that saves modifiers against Pi's defaults, and the views follow", async ({ page }) => {
  const settings = async () => JSON.parse(await readFile(join(agent, "settings.json"), "utf8"));
  const save = async () => {
    await page.getByRole("region", { name: "Unsaved changes" }).getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("region", { name: "Notifications" })).toContainText("Saved to settings.json");
  };
  await page.goto(server.url + "#tools");
  await row(page, /^Startup tools/).click();
  await expect(row(page, /^Startup tools/)).toHaveAttribute("aria-pressed", "true");
  await expect(row(page, /^What the model sees/)).toHaveAttribute("aria-pressed", "false");
  const tools = page.getByRole("group", { name: "Startup tools" });
  await expect(tools.getByRole("checkbox", { name: "read", exact: true })).toBeChecked();
  await expect(tools.getByText("Automatic.", { exact: true })).toBeVisible();
  await tools.getByRole("checkbox", { name: "grep", exact: true }).check();
  await save();
  expect((await settings()).defaultTools).toEqual(["+grep"]);
  await expect(row(page, /^Core tools/)).toContainText("5 seen");
  await tools.getByRole("checkbox", { name: "grep", exact: true }).uncheck();
  await tools.getByRole("checkbox", { name: "write", exact: true }).uncheck();
  await save();
  expect((await settings()).defaultTools).toEqual(["-write"]);
  await expect(row(page, /^Core tools/)).toContainText("3 seen");
  await tools.getByRole("checkbox", { name: "write", exact: true }).check();
  await save();
  expect((await settings()).defaultTools).toBeUndefined();
  await expect(row(page, /^Core tools/)).toContainText("4 seen");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("startup tools show Code mode's state in words, and its link opens MCP › Code mode", async ({ page }) => {
  await writeFile(join(agent, "settings.json"), JSON.stringify({ defaultProjectTrust: "always", extensions: ["-extensions/todo.ts"], defaultTools: ["+codemode"] }));
  await page.goto(server.url + "#tools/startup");
  const tools = page.getByRole("group", { name: "Startup tools" });
  await expect(tools.getByRole("checkbox", { name: "codemode", exact: true })).toHaveCount(0);
  await expect(tools.getByText("Always on here; Pi's default is automatic.", { exact: true })).toBeVisible();
  await tools.getByRole("link", { name: "MCP › Code mode" }).click();
  await expect(page).toHaveURL(/#mcp\/codemode$/);
  await expect(page.getByRole("region", { name: "Code mode" }).getByRole("radio", { name: /Always on/ })).toBeChecked();
});

test("Pi's own tools are changed in Startup tools, a link away from their source and from each tool", async ({ page }) => {
  await page.goto(server.url + "#tools");
  await row(page, /^Core tools/).click();
  await pane(page).getByRole("link", { name: "Change in Startup tools" }).click();
  await expect(row(page, /^Startup tools/)).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("group", { name: "Startup tools" })).toBeVisible();
  await row(page, /^What the model sees/).click();
  const read = pane(page).getByRole("button", { name: /^read/ });
  await read.click();
  await pane(page).getByRole("link", { name: "Change in Startup tools" }).click();
  await expect(page.getByRole("group", { name: "Startup tools" })).toBeVisible();
  await page.getByRole("tab", { name: "General" }).click();
  await page.getByRole("searchbox", { name: "Search settings" }).fill("defaultTools");
  await expect(page.getByText("No settings match")).toBeVisible();
});

test("the overview counts in words: one declared tool is one tool", async ({ page }) => {
  // Code mode only leaves code mode the one declaration.
  await writeFile(join(project, ".pi", "settings.json"), JSON.stringify({ codemode: { mode: "only" } }));
  await page.goto(server.url + "#tools");
  await page.getByRole("combobox", { name: "Project", exact: true }).click();
  await page.getByRole("option", { name: project, exact: true }).click();
  await expect(page.locator(".tools-overview")).toContainText("A new session declares 1 tool to the model.");
});
