import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { startServer, type RunningServer } from "../src/server/server.ts";

let root: string, agent: string, project: string, server: RunningServer;
const ECHO = resolve("tests/fixtures/echo-mcp.ts");
const lines = (...entries: object[]) => entries.map(entry => JSON.stringify(entry)).join("\n") + "\n";
const at = (n: number) => ({ timestamp: `2026-10-01T10:00:0${n}.000Z`, ms: Date.parse(`2026-10-01T10:00:0${n}.000Z`) });
const tools = `export default pi => {
  const add = (name, exposure = "direct") => pi.registerTool({ name, label: name, description: "Purpose of " + name + ".",
    exposure, parameters: { type: "object", properties: {} }, execute: async () => ({ content: [], details: undefined }) });
  add("visible_tool"); add("script_tool", "codemode");
};`;

test.beforeEach(async ({ context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  root = await mkdtemp(join(tmpdir(), "pi-settings-context-browser-"));
  agent = join(root, "agent"); project = join(root, "project");
  await mkdir(join(agent, "extensions"), { recursive: true });
  await mkdir(join(agent, "skills", "demo"), { recursive: true });
  await mkdir(join(project, ".pi"), { recursive: true });
  await writeFile(join(agent, "extensions", "tools.ts"), tools);
  await writeFile(join(agent, "extensions", "turn.ts"), `export default pi => pi.on("before_agent_start", () => {});`);
  await writeFile(join(agent, "skills", "demo", "SKILL.md"), "---\nname: demo\ndescription: Demo skill for tests.\n---\nBody");
  await writeFile(join(agent, "AGENTS.md"), "Global rules.");
  await writeFile(join(project, "AGENTS.md"), "Project rules.");
  await writeFile(join(agent, "settings.json"), JSON.stringify({ defaultProjectTrust: "always", defaultTools: ["+codemode"], codemode: { mode: "only" } }));
  await writeFile(join(agent, "mcp.json"), JSON.stringify({ mcpServers: { "echo-server": { command: "bun", args: [ECHO] } } }));
  // Pi creates auth.json on its first run; agent folders in use have one.
  await writeFile(join(agent, "auth.json"), "{}");
  const declaration = (name: string) => ({ name, description: "Purpose of " + name, parameters: {} });
  const a = at(1), b = at(2), c = at(3);
  await mkdir(join(agent, "sessions", "--project--"), { recursive: true });
  await writeFile(join(agent, "sessions", "--project--", "a_aaaa.jsonl"), lines(
    { type: "session", version: 3, id: "aaaa", timestamp: a.timestamp, cwd: project },
    { type: "message", id: "e1", parentId: null, timestamp: a.timestamp, message: { role: "system", content: "", timestamp: a.ms,
      sections: { preamble: "You are Pi.", tools: "<tools>\n- codemode: Run JavaScript\n</tools>", rules: "<rules>\nRule one.\n</rules>" }, toolsAdded: [declaration("read"), declaration("codemode")] } },
    { type: "message", id: "e2", parentId: "e1", timestamp: b.timestamp, message: { role: "user", content: "Fix the login bug", timestamp: b.ms } },
    { type: "message", id: "e3", parentId: "e2", timestamp: c.timestamp, message: { role: "system", content: "", timestamp: c.ms, toolsAdded: [declaration("docs_search")] } },
  ));
  // An older session whose SYSTEM.md replaced Pi's prompt, tool list included.
  await writeFile(join(agent, "sessions", "--project--", "o_oooo.jsonl"), lines(
    { type: "session", version: 3, id: "oooo", timestamp: at(0).timestamp, cwd: project },
    { type: "message", id: "o1", parentId: null, timestamp: at(0).timestamp, message: { role: "system", content: "", timestamp: at(0).ms,
      sections: { preamble: "Custom prompt." }, toolsAdded: [declaration("read"), declaration("codemode")] } },
    { type: "message", id: "o2", parentId: "o1", timestamp: at(0).timestamp, message: { role: "user", content: "Older session", timestamp: at(0).ms } },
  ));
  server = await startServer({ agentDir: agent, projectDir: project, port: 0, staticDir: resolve("dist/client") });
});
test.afterEach(async () => { await server?.close(); await rm(root, { recursive: true, force: true }); });

const parts = (page: Page) => page.getByRole("region", { name: "Context parts" });
const part = (page: Page, name: RegExp) => parts(page).getByRole("button", { name });
const pane = (page: Page) => page.locator(".workbench-detail");
async function chooseProject(page: Page) {
  await page.getByRole("combobox", { name: "Project", exact: true }).click();
  await page.getByRole("option", { name: project, exact: true }).click();
}

test("Context opens on a new session's first request: each part with its size, its source and where to change it", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(server.url + "#context");
  await expect(page.getByText("Choose a project at the top")).toBeVisible();
  await chooseProject(page);
  await expect(page.getByText(/^A new session here starts with/)).toContainText("1 tool declaration");
  for (const name of ["Base prompt", "Tool list", "Rules", "Pi documentation", "Instructions \\(AGENTS\\.md\\)", "Skills", "Working directory", "MCP servers", "codemode"]) {
    await expect(part(page, new RegExp("^" + name))).toBeVisible();
  }
  // Code mode only: Pi hides its direct tools from requests, so the first request declares code mode alone.
  await expect(part(page, /^visible_tool/)).toHaveCount(0);
  await part(page, /^Instructions \(AGENTS\.md\)/).click();
  await expect(pane(page).getByRole("heading", { level: 2 })).toHaveText("Instructions (AGENTS.md)");
  await expect(pane(page).getByRole("link", { name: "Edit in Instructions" })).toHaveAttribute("href", "#instructions");
  await expect(pane(page)).toContainText(join(project, "AGENTS.md"));
  await expect(pane(page)).toContainText("Project rules.");
  await expect(page.getByRole("note").filter({ hasText: "turn.ts" })).toContainText("when a turn starts");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(errors).toEqual([]);
});

test("code mode's declaration says which tools its description lists and which the model finds from scripts", async ({ page }) => {
  await page.goto(server.url + "#context");
  await chooseProject(page);
  await part(page, /^codemode/).click();
  await expect(pane(page).getByRole("heading", { level: 2 })).toHaveText("codemode");
  await expect(pane(page).getByRole("list", { name: "Listed in its description" })).toContainText("visible_tool");
  // MCP tools are deferred: code mode's description leaves them out, and scripts find them.
  await expect(pane(page).getByRole("list", { name: "Found from scripts" })).toContainText("mcp__echo_server__echo");
  await expect(pane(page).locator("pre")).toContainText('"parameters"');
});

test("a recorded session keeps its first request apart from what Pi changed later", async ({ page }) => {
  await page.goto(server.url + "#context");
  await chooseProject(page);
  await page.getByRole("button", { name: "Recorded session" }).click();
  await expect(page.getByLabel("Session", { exact: true })).toContainText("Fix the login bug");
  // Code mode only: the prompt's tool list names code mode alone, so Pi left `read` out of every request.
  await expect(page.getByText(/^The model got/)).toContainText("1 tool declaration");
  await expect(page.getByText(/^The model got/)).toContainText("left out of every request");
  await expect(parts(page).getByRole("region", { name: "Tool declarations" })).not.toContainText("read");
  const leftOut = parts(page).getByRole("region", { name: "Left out of requests" });
  await leftOut.getByRole("button", { name: /^read/ }).click();
  await expect(pane(page)).toContainText("left out of every request");
  await expect(part(page, /^docs_search/)).toHaveCount(0);
  await part(page, /1 tool added/).click();
  await expect(pane(page)).toContainText("docs_search");
  await page.getByRole("button", { name: "Copy latest prompt" }).click();
  await expect(page.getByRole("region", { name: "Notifications" })).toContainText("Copied");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("You are Pi.\n\n<tools>\n- codemode: Run JavaScript\n</tools>\n\n<rules>\nRule one.\n</rules>");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("a recorded session whose prompt has no tool list says it cannot tell what code mode left out", async ({ page }) => {
  await page.goto(server.url + "#context");
  await chooseProject(page);
  await page.getByRole("button", { name: "Recorded session" }).click();
  await page.getByLabel("Session", { exact: true }).click();
  await page.getByRole("option", { name: /Older session/ }).click();
  await expect(page.getByRole("note").filter({ hasText: "code mode" })).toContainText("cannot tell");
  await expect(parts(page).getByRole("region", { name: "Left out of requests" })).toHaveCount(0);
});

test("returning to a recorded session shows it at once while the sessions are read again", async ({ page }) => {
  await page.goto(server.url + "#context");
  await chooseProject(page);
  await page.getByRole("button", { name: "Recorded session" }).click();
  await expect(part(page, /^read/)).toBeVisible();
  let release!: () => void;
  const hold = new Promise<void>(done => { release = done; });
  await page.route("**/api/sessions**", async route => { await hold; await route.continue(); });
  await page.getByRole("tab", { name: "General" }).click();
  await page.getByRole("tab", { name: "Context" }).click();
  await page.getByRole("button", { name: "Recorded session" }).click();
  await expect(part(page, /^read/)).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Checking for changes" })).toBeVisible();
  release();
  await expect(page.getByText("Checking for changes")).toHaveCount(0);
});

test("an old System prompt bookmark opens Context", async ({ page }) => {
  await page.goto(server.url + "#system-prompt");
  await expect(page.getByRole("tab", { name: "Context" })).toHaveAttribute("aria-selected", "true");
});

test("on a narrow screen the parts lead, and a part opens with a way back", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto(server.url + "#context");
  await chooseProject(page);
  await part(page, /^Skills/).click();
  await expect(pane(page).getByRole("heading", { level: 2 })).toHaveText("Skills");
  await expect(pane(page)).toContainText("Demo skill for tests.");
  await page.getByRole("button", { name: "All parts" }).click();
  await expect(part(page, /^Skills/)).toBeVisible();
});
