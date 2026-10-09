import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { startServer, type RunningServer } from "../src/server/server.ts";

let root: string, file: string, server: RunningServer;
test.beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "pi-settings-mcp-browser-"));
  const agentDir = join(root, "agent");
  await mkdir(agentDir);
  file = join(agentDir, "mcp.json");
  await writeFile(file, JSON.stringify({ mcpServers: {
    search: { command: "uvx", args: ["search-mcp", "--api-key", "fixture-arg-secret"], env: { SEARCH_API_KEY: "fixture-secret-value" }, enabled: false },
    docs: { url: "https://example.com/mcp", headers: { Authorization: "Bearer fixture-token" }, exposure: "deferred", description: "Product docs" },
    broken: { url: "ftp://nope" },
  } }, null, 2));
  server = await startServer({ agentDir, projectDir: join(root, "project"), port: 0, staticDir: resolve("dist/client") });
});
test.afterEach(async () => { await server?.close(); await rm(root, { recursive: true, force: true }); });

test("icon-only buttons and file paths say more in a tooltip", async ({ page }) => {
  // Base UI's tooltip is for sighted users and has no role; the buttons carry their names themselves.
  const tooltip = (text: string) => page.locator("[data-slot=tooltip-content]", { hasText: text });
  await page.goto(server.url + "#mcp");
  await page.getByRole("button", { name: "Add server", exact: true }).hover();
  await expect(tooltip("Add server")).toBeVisible();
  // A tooltip on a menu's trigger: both still work.
  const more = page.getByRole("button", { name: "More actions for the global mcp.json" });
  await more.hover();
  await expect(tooltip("More actions for the global mcp.json")).toBeVisible();
  await more.click();
  await expect(page.getByRole("menuitem", { name: "Edit as JSON" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.locator(".page-header .file-path").first().hover();
  await expect(tooltip(file)).toBeVisible();
});

test("a server the browser would refuse says why under each field and is not added", async ({ page }) => {
  const before = await readFile(file, "utf8");
  await page.goto(server.url + "#mcp");
  await page.getByRole("button", { name: "Add server", exact: true }).click();
  const form = page.getByRole("form", { name: "Add MCP server" });
  const name = form.getByLabel("Name", { exact: true });
  await name.fill("has space");
  await form.getByRole("button", { name: "Save server" }).click();
  await expect(name).toBeFocused();
  await expect(form).toContainText("Use letters, digits, _ and -.");
  await expect(form).toContainText("Command is required.");
  await expect(form.getByLabel("Command", { exact: true })).toHaveAttribute("aria-invalid", "true");
  expect(await readFile(file, "utf8")).toBe(before);
});

test("MCP tab lists servers and shows details without secret values", async ({ page }) => {
  await page.goto(server.url + "#mcp");
  await expect(page.getByRole("tab", { name: "MCP" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("1 of 3 servers on")).toBeVisible();
  await page.getByRole("button", { name: /^search/ }).click();
  const details = page.getByRole("region", { name: "search" });
  await expect(details.getByText("Turned off in the file")).toBeVisible();
  await expect(details.getByText("SEARCH_API_KEY")).toBeVisible();
  await expect(details.getByText("uvx search-mcp")).toBeVisible();
  await page.getByRole("button", { name: /^broken/ }).click();
  await expect(page.getByRole("region", { name: "broken" })).toContainText('url must be an http or https URL');
  await page.getByRole("button", { name: /^docs/ }).click();
  await expect(page.getByRole("region", { name: "docs" })).toContainText("Product docs");
  await expect(page.getByRole("region", { name: "docs" })).toBeVisible();
  await page.getByRole("button", { name: /^search/ }).click();
  await expect(page.getByRole("region", { name: "search" })).toContainText("--api-key ‹hidden 1›");
  expect(await page.content()).not.toMatch(/fixture-secret-value|fixture-token|fixture-arg-secret/);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.emulateMedia({ colorScheme: "dark" });
  // Colour transitions must settle, or axe may measure a half-faded colour.
  await page.waitForFunction(() => document.getAnimations().every(animation => animation.playState !== "running"));
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("switches and the exposure choice save to mcp.json immediately", async ({ page }) => {
  await page.goto(server.url + "#mcp");
  const readServers = async () => JSON.parse(await readFile(file, "utf8")).mcpServers;
  await page.getByRole("switch", { name: "Enable search" }).click();
  await expect(page.getByRole("region", { name: "Notifications" })).toContainText("search turned on");
  expect((await readServers()).search.enabled).toBeUndefined();
  expect((await readServers()).search.env.SEARCH_API_KEY).toBe("fixture-secret-value");
  await page.getByRole("button", { name: /^docs/ }).click();
  await page.getByRole("combobox", { name: "Tool exposure for docs" }).click();
  await page.getByRole("option", { name: "Direct", exact: true }).click();
  await expect(page.getByRole("region", { name: "Notifications" })).toContainText("docs now uses Direct");
  expect((await readServers()).docs.exposure).toBe("direct");
  await expect(page.getByText("2 of 3 servers on")).toBeVisible();
});

test("while a server saves, Save server shows a spinner", async ({ page }) => {
  await page.goto(server.url + "#mcp");
  await page.getByRole("button", { name: "Add server", exact: true }).click();
  const form = page.getByRole("form", { name: "Add MCP server" });
  await form.getByLabel("Name", { exact: true }).fill("files");
  await form.getByLabel("Command", { exact: true }).fill("npx");
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/**", route => route.request().method() === "GET" ? route.continue() : held.then(() => route.continue()));
  await form.getByRole("button", { name: "Save server" }).click();
  const saving = page.getByRole("button", { name: "Saving…" });
  await expect(saving).toBeDisabled();
  await expect(saving.locator("[data-slot=spinner]")).toBeVisible();
  release();
  await expect(saving).toBeHidden();
  await page.unrouteAll({ behavior: "wait" });
});

test("a long form in the detail pane keeps its save row in view on a wide screen", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(server.url + "#mcp");
  await page.getByRole("button", { name: "Add server", exact: true }).click();
  const form = page.getByRole("form", { name: "Add MCP server" });
  await expect(form.getByRole("button", { name: "Save server" })).toBeInViewport();
  await form.getByLabel("Timeout (seconds)").scrollIntoViewIfNeeded();
  await expect(form.getByRole("button", { name: "Save server" })).toBeInViewport();
  expect(await page.locator("main").evaluate(element => element.scrollTop)).toBe(0);
});

test("on a narrow screen the page scrolls the form, and its save row stays in view", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(server.url + "#mcp");
  await page.getByRole("button", { name: "Add server", exact: true }).click();
  const form = page.getByRole("form", { name: "Add MCP server" });
  await form.getByLabel("Timeout (seconds)").scrollIntoViewIfNeeded();
  expect(await page.locator("main").evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  await expect(form.getByRole("button", { name: "Save server" })).toBeInViewport();
});

test("add a server, edit it without seeing its secret, remove it and undo", async ({ page }) => {
  await page.goto(server.url + "#mcp");
  const readServers = async () => JSON.parse(await readFile(file, "utf8")).mcpServers;
  await page.getByRole("button", { name: "Add server" }).click();
  const form = page.getByRole("form", { name: "Add MCP server" });
  await form.getByLabel("Name", { exact: true }).fill("files");
  await form.getByLabel("Command", { exact: true }).fill("npx");
  await form.getByLabel("Arguments").fill("-y\nserver-filesystem");
  await form.getByRole("button", { name: "Add variable" }).click();
  await form.getByLabel("Variable name 1").fill("TOKEN");
  await form.getByLabel("Value of variable 1").fill("fixture-new-secret");
  await form.getByRole("button", { name: "Save server" }).click();
  await expect(page.getByRole("region", { name: "Notifications" })).toContainText("files added");
  expect((await readServers()).files).toEqual({ command: "npx", args: ["-y", "server-filesystem"], env: { TOKEN: "fixture-new-secret" } });

  await page.getByRole("button", { name: "Edit files" }).click();
  const edit = page.getByRole("form", { name: "Edit files" });
  await expect(edit.getByLabel("Value of variable 1")).toHaveValue("");
  await edit.getByLabel("Command", { exact: true }).fill("bunx");
  await edit.getByRole("button", { name: "Save server" }).click();
  await expect(page.getByRole("region", { name: "Notifications" })).toContainText("files saved");
  expect((await readServers()).files).toEqual({ command: "bunx", args: ["-y", "server-filesystem"], env: { TOKEN: "fixture-new-secret" } });
  expect(await page.content()).not.toContain("fixture-new-secret");

  await page.getByRole("button", { name: "Remove files" }).click();
  await expect(page.getByRole("region", { name: "Notifications" })).toContainText("Removed files");
  expect((await readServers()).files).toBeUndefined();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("region", { name: "Notifications" })).toContainText("Restored");
  expect((await readServers()).files.command).toBe("bunx");
});

test("a server Pi would refuse is not saved and the form keeps the draft", async ({ page }) => {
  await page.goto(server.url + "#mcp");
  await page.getByRole("button", { name: "Add server" }).click();
  const form = page.getByRole("form", { name: "Add MCP server" });
  await form.getByLabel("Name", { exact: true }).fill("web");
  await form.getByRole("combobox", { name: "Transport" }).click();
  await page.getByRole("option", { name: "URL (streamable HTTP)" }).click();
  await form.getByLabel("URL", { exact: true }).fill("ftp://nope");
  await form.getByRole("button", { name: "Save server" }).click();
  await expect(form.getByRole("alert")).toContainText("url must be an http or https URL");
  await expect(form.getByLabel("URL", { exact: true })).toHaveValue("ftp://nope");
  expect(JSON.parse(await readFile(file, "utf8")).mcpServers.web).toBeUndefined();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("Code mode choices save at once; the tool list budget saves on Save", async ({ page }) => {
  const settings = async () => JSON.parse(await readFile(join(root, "agent", "settings.json"), "utf8"));
  await page.goto(server.url + "#mcp");
  await page.getByRole("button", { name: /^Code mode/ }).click();
  const panel = page.getByRole("region", { name: "Code mode" });
  await panel.getByRole("radio", { name: /Always on/ }).check();
  await expect(page.getByRole("region", { name: "Notifications" })).toContainText("Code mode is always on");
  expect((await settings()).defaultTools).toEqual(["+codemode"]);
  await panel.getByRole("radio", { name: /In scripts/ }).check();
  await expect(page.getByRole("region", { name: "Notifications" })).toContainText("Built-in tools are called from scripts");
  expect((await settings()).codemode).toEqual({ mode: "only" });
  const budget = panel.getByLabel("Tool list budget");
  await budget.fill("-1");
  await panel.getByRole("button", { name: "Save budget" }).click();
  await expect(budget).toBeFocused();
  await expect(budget).toHaveAttribute("aria-invalid", "true");
  expect((await settings()).codemode).toEqual({ mode: "only" });
  await budget.fill("1200");
  await panel.getByRole("button", { name: "Save budget" }).click();
  await expect(page.getByRole("region", { name: "Notifications" })).toContainText("Tool list budget saved");
  expect((await settings()).codemode).toEqual({ mode: "only", inlineBudget: 1200 });
  await panel.getByRole("switch", { name: "Turn Code mode on automatically" }).click();
  await expect(page.getByRole("region", { name: "Notifications" })).toContainText("no longer turns on automatically");
  expect(JSON.parse(await readFile(file, "utf8")).autoEnableCodemode).toBe(false);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("tool exposure rules, OAuth settings and provider sign-in are edited in the form", async ({ page }) => {
  const readDocs = async () => JSON.parse(await readFile(file, "utf8")).mcpServers.docs;
  await page.goto(server.url + "#mcp");
  await page.getByRole("button", { name: /^docs/ }).click();
  await page.getByRole("button", { name: "Edit docs" }).click();
  const form = page.getByRole("form", { name: "Edit docs" });
  await form.getByRole("button", { name: "Add rule" }).click();
  await form.getByLabel("Tool or pattern 1").fill("search_*");
  await form.getByRole("combobox", { name: "Exposure of rule 1" }).click();
  await page.getByRole("option", { name: "Direct", exact: true }).click();
  await form.getByText("OAuth settings").click();
  await expect(form.getByText("OAuth is not used while an Authorization header is set.")).toBeVisible();
  await form.getByLabel("Client ID").fill("my-client");
  await form.getByLabel("Client secret", { exact: true }).fill("fixture-client-secret");
  await form.getByLabel("Callback port").fill("8765");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await form.getByRole("button", { name: "Save server" }).click();
  await expect(page.getByRole("region", { name: "Notifications" })).toContainText("docs saved");
  expect(await readDocs()).toMatchObject({ toolExposure: { "search_*": "direct" }, oauth: { clientId: "my-client", clientSecret: "fixture-client-secret", callbackPort: 8765 } });
  await expect(page.getByRole("region", { name: "docs" })).toContainText("search_* → Direct");

  await page.getByRole("button", { name: "Edit docs" }).click();
  await expect(form.getByLabel("Client secret", { exact: true })).toHaveValue("");
  await expect(form.getByLabel("Client ID")).toHaveValue("my-client");
  await form.getByRole("combobox", { name: "Client registration" }).click();
  await page.getByRole("option", { name: /^cimd:/ }).click();
  await form.getByLabel("Client ID").fill("");
  await form.getByRole("checkbox", { name: "Remove the stored client secret" }).check();
  await form.getByRole("combobox", { name: "Pi provider" }).click();
  await page.getByRole("option", { name: /^Anthropic\s*anthropic$/ }).click();
  await form.getByRole("button", { name: "Remove rule search_*" }).click();
  await form.getByRole("button", { name: "Save server" }).click();
  await expect(page.getByRole("region", { name: "Notifications" })).toContainText("docs saved");
  const docs = await readDocs();
  expect([docs.toolExposure, docs.oauth, docs.auth]).toEqual([undefined, { callbackPort: 8765, clientRegistration: "cimd" }, { provider: "anthropic" }]);
  expect(await page.content()).not.toContain("fixture-client-secret");
});

test("servers pasted from another client are previewed, then the chosen ones imported", async ({ page }) => {
  const readServers = async () => JSON.parse(await readFile(file, "utf8")).mcpServers;
  await page.goto(server.url + "#mcp");
  await page.getByRole("button", { name: "More actions for the global mcp.json" }).click();
  await page.getByRole("menuitem", { name: "Import servers" }).click();
  const panel = page.getByRole("form", { name: "Import MCP servers" });
  await panel.getByLabel("Pasted configuration").fill(`[mcp_servers.context7]
command = "npx"
args = ["-y", "@upstash/context7-mcp"]
env = { CONTEXT7_KEY = "fixture-codex-secret" }

[mcp_servers.docs]
url = "https://docs2.example.com/mcp"
startup_timeout_sec = 20`);
  await panel.getByRole("button", { name: "Preview" }).click();
  await expect(panel).toContainText("Read as Codex");
  await expect(panel).toContainText("docs: dropped startup_timeout_sec");
  await expect(panel.getByRole("checkbox", { name: "context7", exact: true })).toBeChecked();
  await expect(panel.getByRole("checkbox", { name: "docs", exact: true })).not.toBeChecked();
  await expect(panel).toContainText("Replaces the server of the same name");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await panel.getByRole("button", { name: "Import 1 server" }).click();
  await expect(page.getByRole("region", { name: "Notifications" })).toContainText("Imported context7");
  const servers = await readServers();
  expect(servers.context7).toEqual({ command: "npx", args: ["-y", "@upstash/context7-mcp"], env: { CONTEXT7_KEY: "fixture-codex-secret" } });
  expect(servers.docs.url).toBe("https://example.com/mcp");
  expect(await page.content()).not.toContain("fixture-codex-secret");
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("region", { name: "Notifications" })).toContainText("Restored");
  expect((await readServers()).context7).toBeUndefined();
});

test("a long mcp.log scrolls inside its frame, from the keyboard too", async ({ page }) => {
  const lines = Array.from({ length: 300 }, (_, i) => `2026-10-08T06:00:00.000Z [echo] line ${i + 1}`);
  await writeFile(join(root, "agent", "mcp.log"), lines.join("\n") + "\n");
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(server.url + "#mcp");
  await page.getByRole("button", { name: "View mcp.log" }).click();
  const contents = page.getByLabel("mcp.log contents");
  await expect(contents).toContainText("line 300");
  // 32rem at most; the rest scrolls.
  expect((await contents.boundingBox())!.height).toBeLessThanOrEqual(512);
  const scrolled = () => contents.evaluate(element => [element, ...element.querySelectorAll("*")]
    .find(node => node.scrollHeight > node.clientHeight + 1 && getComputedStyle(node).overflowY !== "visible")?.scrollTop ?? -1);
  expect(await scrolled()).toBe(0);
  for (let i = 0; i < 20 && !(await contents.evaluate(element => element.contains(document.activeElement))); i++) await page.keyboard.press("Tab");
  expect(await contents.evaluate(element => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("End");
  await expect.poll(scrolled).toBeGreaterThan(0);
});

test("an OAuth server shows its sign-in state, and mcp.log is shown with secrets hidden", async ({ page }) => {
  const servers = JSON.parse(await readFile(file, "utf8"));
  servers.mcpServers.sentry = { url: "https://mcp.sentry.dev/mcp" };
  servers.mcpServers.linear = { url: "https://mcp.linear.app/mcp" };
  await writeFile(file, JSON.stringify(servers));
  await writeFile(join(root, "agent", "mcp-auth.json"), JSON.stringify({ "mcp__sentry|https://mcp.sentry.dev/mcp": { tokens: { access_token: "fixture-oauth-token" } } }));
  await writeFile(join(root, "agent", "mcp.log"), "2026-10-08T06:00:00.000Z [search] error key fixture-secret-value rejected\n");
  await page.goto(server.url + "#mcp");
  await page.getByRole("button", { name: /^sentry/ }).click();
  await expect(page.getByRole("region", { name: "sentry" })).toContainText("Signed in.");
  await page.getByRole("button", { name: /^linear/ }).click();
  await expect(page.getByRole("region", { name: "linear" })).toContainText("Not signed in yet.");
  await page.getByRole("button", { name: "View mcp.log" }).click();
  const log = page.getByRole("region", { name: "mcp.log" });
  await expect(log).toContainText("[search] error key ‹hidden› rejected");
  expect(await page.content()).not.toMatch(/fixture-secret-value|fixture-oauth-token/);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
