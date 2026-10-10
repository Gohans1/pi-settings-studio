import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { startServer, type RunningServer } from "../src/server/server.ts";

let root: string, agent: string, server: RunningServer;
const fixtureModel = (id: string, name: string, reasoning: boolean) =>
  `{ id: "${id}", name: "${name}", reasoning: ${reasoning}, input: ["text"], cost: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0 }, contextWindow: 100000, maxTokens: 8000 }`;
// Providers as an extension such as pi-claude-bridge registers them: one Pi has a key for, one that needs a sign-in.
const BRIDGE = `export default function (pi) {
  pi.registerProvider("bridge", { name: "Bridge Fixture", baseUrl: "http://localhost:9/v1", apiKey: "not-used", api: "openai-completions",
    models: [${fixtureModel("bridge-large", "Bridge Large", true)}, ${fixtureModel("bridge-small", "Bridge Small", false)}] });
  pi.registerProvider("needs-login", { name: "Needs Login", baseUrl: "http://localhost:9/v1", api: "openai-completions",
    oauth: { name: "Fixture SSO", async login() { throw new Error("not here"); }, async refreshToken(credentials) { return credentials; }, getApiKey(credentials) { return credentials.access; } },
    models: [${fixtureModel("locked", "Locked", false)}] });
}`;
test.beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "pi-settings-models-browser-"));
  agent = join(root, "agent");
  await mkdir(agent, { recursive: true });
  await writeFile(join(agent, "auth.json"), JSON.stringify({ anthropic: { type: "api_key", key: "fixture-secret-anthropic" } }));
  server = await startServer({ agentDir: agent, projectDir: join(root, "project"), port: 0, staticDir: resolve("dist/client") });
});
test.afterEach(async () => { await server?.close(); await rm(root, { recursive: true, force: true }); });

test("on a wide screen the provider list scrolls on its own and keeps its search in view", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(server.url + "#models");
  const rows = page.getByRole("region", { name: "Providers" }).getByRole("listitem");
  await expect(rows.last()).not.toBeInViewport();
  await rows.first().hover();
  await page.mouse.wheel(0, 10_000);
  await expect(rows.last()).toBeInViewport();
  await expect(page.getByRole("searchbox", { name: "Search providers" })).toBeInViewport();
  expect(await page.locator("main").evaluate(element => element.scrollTop)).toBe(0);
});

test("a select drops its options beside its field, never over it, whichever option is chosen", async ({ page }) => {
  // Measured once the list has opened and settled; a list that covers its field never passes.
  const clear = async (field: import("@playwright/test").Locator) => {
    await expect(page.getByRole("listbox")).toHaveCount(1);
    await expect.poll(async () => {
      const trigger = (await field.boundingBox())!;
      const list = (await page.getByRole("listbox").boundingBox())!;
      return list.y >= trigger.y + trigger.height || list.y + list.height <= trigger.y;
    }).toBe(true);
  };
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(server.url + "#models");
  await page.getByRole("button", { name: /^Defaults/ }).click();
  const thinking = page.getByRole("region", { name: "Defaults" }).getByRole("combobox", { name: "Thinking level" });
  await thinking.click();
  await clear(thinking);
  await page.getByRole("option", { name: "high", exact: true }).click();
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await thinking.click();
  await clear(thinking);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await page.getByRole("button", { name: "Add custom provider" }).click();
  const api = page.getByRole("form", { name: "Add custom provider" }).getByRole("combobox", { name: "API", exact: true });
  await api.click();
  await clear(api);
});

test("an API key is set up with Pi's own question, removed and restored without ever being shown", async ({ page }) => {
  const auth = async () => JSON.parse(await readFile(join(agent, "auth.json"), "utf8"));
  await page.goto(server.url + "#models");
  await page.getByRole("searchbox", { name: "Search providers" }).fill("openai");
  await page.getByRole("button", { name: /^OpenAI\b/ }).first().click();
  const detail = page.getByRole("region", { name: "OpenAI" });
  // Every key goes through Pi's own setup, which asks only what that provider needs.
  await expect(detail).not.toContainText("Needs more than a key");
  await detail.getByRole("button", { name: "Set up OpenAI API key" }).click();
  const job = page.getByRole("region", { name: "Set up OpenAI API key" });
  await job.getByLabel("Enter OpenAI API key").fill("fixture-new-key");
  await job.getByRole("button", { name: "Continue" }).click();
  await expect(job).toContainText("Finished");
  expect((await auth()).openai).toEqual({ type: "api_key", key: "fixture-new-key" });
  await expect(detail.getByRole("button", { name: "Replace OpenAI API key" })).toBeVisible();
  expect(await page.content()).not.toContain("fixture-");

  await page.getByRole("searchbox", { name: "Search providers" }).fill("anthropic");
  await page.getByRole("button", { name: /^Anthropic\b/ }).first().click();
  await page.getByRole("region", { name: "Anthropic" }).getByRole("button", { name: "Remove stored key" }).click();
  await expect(page.getByRole("region", { name: "Notifications" })).toContainText("Removed the stored credential for Anthropic");
  expect((await auth()).anthropic).toBeUndefined();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("region", { name: "Notifications" })).toContainText("Restored");
  expect((await auth()).anthropic.key).toBe("fixture-secret-anthropic");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("a signed-in provider offers to sign in again or sign out, in Pi's words", async ({ page }) => {
  await writeFile(join(agent, "auth.json"), JSON.stringify({ "github-copilot": { type: "oauth", refresh: "fixture-refresh", access: "fixture-access", expires: 1 } }));
  await page.goto(server.url + "#models");
  await page.getByRole("searchbox", { name: "Search providers" }).fill("copilot");
  await page.getByRole("button", { name: /^GitHub Copilot/ }).click();
  const detail = page.getByRole("region", { name: "GitHub Copilot" });
  await expect(detail.getByRole("button", { name: "Sign in again to GitHub Copilot" })).toBeVisible();
  // A key is another way in, and says that it replaces the sign-in.
  await expect(detail.getByRole("button", { name: "Set up GitHub Copilot token" })).toBeVisible();
  await expect(detail).toContainText("A key replaces the sign-in.");
  await detail.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("region", { name: "Notifications" })).toContainText("Signed out of GitHub Copilot");
  expect(JSON.parse(await readFile(join(agent, "auth.json"), "utf8"))["github-copilot"]).toBeUndefined();
});

test("a provider lists its models with what Pi knows of each, and one becomes the default in a click", async ({ page }) => {
  await page.goto(server.url + "#models");
  await page.getByRole("button", { name: /^Anthropic\b/ }).first().click();
  const models = page.getByRole("region", { name: "Anthropic" }).getByRole("region", { name: "Models" });
  const catalog = await page.evaluate(() => fetch("/api/models/providers/anthropic/models").then(response => response.json()));
  await expect(models.getByRole("listitem")).toHaveCount(catalog.length);
  await models.getByRole("searchbox", { name: "Search Anthropic models" }).fill("haiku-4-5");
  const haiku = models.getByRole("listitem").filter({ hasText: "claude-haiku-4-5" }).first();
  // Its limits, image input, the thinking levels Pi offers for it and its price, in words.
  await expect(haiku).toContainText(/\d+K context · \d+K output · images · thinking off–high · \$\d+(\.\d+)? in, \$\d+(\.\d+)? out per 1M tokens/);
  const id = (await haiku.locator("code").textContent())!;
  await haiku.getByRole("button", { name: /^Use as default model/ }).click();
  const defaults = page.getByRole("region", { name: "Defaults" });
  await expect(defaults.getByLabel("Default provider")).toHaveValue("anthropic");
  await expect(defaults.getByLabel("Default model")).toHaveValue(id);
  await defaults.getByRole("button", { name: "Save defaults" }).click();
  await expect(page.getByRole("region", { name: "Notifications" })).toContainText("Defaults saved");
  const settings = JSON.parse(await readFile(join(agent, "settings.json"), "utf8"));
  expect([settings.defaultProvider, settings.defaultModel]).toEqual(["anthropic", id]);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("a provider names its models that do not chat, which scripts reach through codemode", async ({ page }) => {
  await page.goto(server.url + "#models");
  await page.getByRole("searchbox", { name: "Search providers" }).fill("openrouter");
  await page.getByRole("button", { name: /^OpenRouter/ }).click();
  await expect(page.getByRole("region", { name: "OpenRouter" }).getByRole("region", { name: "Models" }))
    .toContainText(/Also \d+ image and \d+ classifier models, which scripts reach through codemode/);
  // TypeSafe has only a classifier: no chat model to start a session with, and the list says so rather than "0".
  await page.getByRole("searchbox", { name: "Search providers" }).fill("typesafe");
  await page.getByRole("button", { name: /^TypeSafe/ }).click();
  const typesafe = page.getByRole("region", { name: "TypeSafe" }).getByRole("region", { name: "Models" });
  await expect(typesafe).toContainText("1 classifier model, which scripts reach through codemode");
  await expect(typesafe).toContainText("No chat models");
});

test("the list names its groups and says which providers are ready, and the chosen one says it too", async ({ page }) => {
  await writeFile(join(agent, "models.json"), JSON.stringify({ providers: { ollama: { baseUrl: "http://localhost:1/v1", api: "openai-completions", apiKey: "ollama", models: [{ id: "llama-3" }] } } }));
  await page.goto(server.url + "#models");
  const custom = page.getByRole("region", { name: "Custom providers" });
  await expect(custom.getByRole("heading")).toHaveText("Custom providers");
  await expect(custom.getByRole("button", { name: /^ollama/ })).toHaveAccessibleName("ollama 1 model");
  await page.getByRole("button", { name: /^Anthropic\b/ }).first().click();
  await expect(page.getByRole("region", { name: "Anthropic" })).toHaveAccessibleDescription("API key");
  await page.getByRole("searchbox", { name: "Search providers" }).fill("openai");
  await page.getByRole("button", { name: /^OpenAI\b/ }).first().click();
  await expect(page.getByRole("region", { name: "OpenAI" })).toHaveAccessibleDescription("not set up");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("while the defaults save, Save defaults shows a spinner", async ({ page }) => {
  await page.goto(server.url + "#models");
  await page.getByRole("button", { name: /^Defaults/ }).click();
  await page.getByRole("region", { name: "Defaults" }).getByLabel("Default provider").fill("anthropic");
  await page.getByRole("region", { name: "Defaults" }).getByLabel("Default provider").press("Tab");
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/**", route => route.request().method() === "GET" ? route.continue() : held.then(() => route.continue()));
  await page.getByRole("button", { name: "Save defaults" }).click();
  const saving = page.getByRole("button", { name: "Saving…" });
  await expect(saving).toBeDisabled();
  await expect(saving.locator("[data-slot=spinner]")).toBeVisible();
  release();
  await expect(saving).toBeHidden();
  await page.unrouteAll({ behavior: "wait" });
});

test("while a custom provider saves, Save provider shows a spinner", async ({ page }) => {
  await page.goto(server.url + "#models");
  await page.getByRole("button", { name: "Add custom provider" }).click();
  await page.getByRole("form", { name: "Add custom provider" }).getByLabel("Provider ID").fill("lmstudio");
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/**", route => route.request().method() === "GET" ? route.continue() : held.then(() => route.continue()));
  await page.getByRole("button", { name: "Save provider" }).click();
  const saving = page.getByRole("button", { name: "Saving…" });
  await expect(saving).toBeDisabled();
  await expect(saving.locator("[data-slot=spinner]")).toBeVisible();
  release();
  await expect(saving).toBeHidden();
  await page.unrouteAll({ behavior: "wait" });
});

test("defaults are chosen from Pi's catalog and saved to settings.json", async ({ page }) => {
  await page.goto(server.url + "#models");
  await page.getByRole("button", { name: /^Defaults/ }).click();
  const panel = page.getByRole("region", { name: "Defaults" });
  await panel.getByRole("combobox", { name: "Default provider" }).click();
  await page.getByRole("option", { name: /^Anthropic\b/ }).click();
  // Suggestions come from Pi's catalog for the chosen provider.
  const model = panel.getByRole("combobox", { name: "Default model" });
  await model.click();
  await page.getByRole("option").first().click();
  const chosen = await model.inputValue();
  expect(chosen).not.toBe("");
  await expect(panel).not.toContainText("not in the catalog");
  await panel.getByRole("combobox", { name: "Thinking level" }).click();
  await page.getByRole("option", { name: "high", exact: true }).click();
  const enabled = panel.getByRole("group", { name: "Enabled models" });
  await enabled.getByLabel("Model or pattern").fill("anthropic/*");
  await enabled.getByLabel("Model or pattern").press("Enter");
  await expect(enabled.getByRole("listitem").filter({ hasText: "anthropic/*" })).toContainText(/\d+ models/);
  // The count names a few of the models it matched.
  await enabled.getByText(/^\d+ models$/).hover();
  await expect(page.locator("[data-slot=tooltip-content]")).toContainText("claude");
  await panel.getByRole("button", { name: "Save defaults" }).click();
  await expect(page.getByRole("region", { name: "Notifications" })).toContainText("Defaults saved");
  const settings = JSON.parse(await readFile(join(agent, "settings.json"), "utf8"));
  expect(settings).toEqual({ defaultProvider: "anthropic", defaultModel: chosen, defaultThinkingLevel: "high", enabledModels: ["anthropic/*"] });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("the thinking level offers what the default model supports, and says the level Pi starts it at", async ({ page }) => {
  await writeFile(join(agent, "settings.json"), JSON.stringify({ defaultProvider: "anthropic", defaultModel: "claude-haiku-4-5", defaultThinkingLevel: "max" }));
  await page.goto(server.url + "#models");
  await page.getByRole("button", { name: /^Defaults/ }).click();
  const panel = page.getByRole("region", { name: "Defaults" });
  const thinking = panel.getByRole("combobox", { name: "Thinking level" });
  await expect(thinking).toHaveAccessibleDescription(/^Claude Haiku 4\.5.* offers off to high\. Pi starts it at high instead\.$/);
  await thinking.click();
  await expect(page.getByRole("option")).toHaveText(["Pi's default (medium)", "off", "minimal", "low", "medium", "high", "max (not offered)"]);
  await page.getByRole("option", { name: "high", exact: true }).click();
  await expect(thinking).not.toHaveAccessibleDescription(/instead/);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("thinking levels per model sit beside the default, each offering its own model's levels", async ({ page }) => {
  await page.goto(server.url + "#models");
  await page.getByRole("button", { name: /^Defaults/ }).click();
  const panel = page.getByRole("region", { name: "Defaults" });
  const perModel = panel.getByRole("group", { name: "Thinking level per model" });
  await perModel.getByRole("button", { name: "Add model" }).click();
  await perModel.getByLabel("Model 1", { exact: true }).fill("haiku-4-5");
  await page.getByRole("option", { name: /anthropic\/claude-haiku-4-5$/ }).click();
  await expect(perModel.getByLabel("Model 1", { exact: true })).toHaveValue("anthropic/claude-haiku-4-5");
  await perModel.getByRole("combobox", { name: "Thinking level for model 1" }).click();
  await expect(page.getByRole("option", { name: "xhigh" })).toHaveCount(0);
  await page.getByRole("option", { name: "low", exact: true }).click();
  await panel.getByRole("button", { name: "Save defaults" }).click();
  await expect(page.getByRole("region", { name: "Notifications" })).toContainText("Defaults saved");
  expect(JSON.parse(await readFile(join(agent, "settings.json"), "utf8")).modelThinkingLevels).toEqual({ "anthropic/claude-haiku-4-5": "low" });
});

test("Defaults also holds prompt caching and thinking budgets, which General no longer lists", async ({ page }) => {
  await page.goto(server.url + "#models/defaults");
  const panel = page.getByRole("region", { name: "Defaults" });
  const tuning = panel.getByRole("region", { name: "Prompt caching and thinking budgets" });
  await expect(tuning.getByRole("switch", { name: "Cache notices" })).not.toBeChecked();
  await expect(tuning.locator('[id="row-thinkingBudgets.low"]')).toContainText("Default");
  await tuning.getByLabel("Thinking budget: low", { exact: true }).fill("4096");
  await panel.getByRole("button", { name: "Save defaults" }).click();
  await expect(page.getByRole("region", { name: "Notifications" })).toContainText("Defaults saved");
  expect(JSON.parse(await readFile(join(agent, "settings.json"), "utf8")).thinkingBudgets).toEqual({ low: 4096 });
  await expect(tuning.locator('[id="row-thinkingBudgets.low"]')).toContainText("Custom · Pi's default is 2,048");
  await expect(panel.getByRole("link", { name: /General/ })).toHaveCount(0);
  expect((await new AxeBuilder({ page }).include("form").analyze()).violations).toEqual([]);
  await page.getByRole("tab", { name: "General" }).click();
  await expect(page.getByRole("region", { name: "Setting groups" }).getByRole("button", { name: /^Models & thinking/ })).toHaveCount(0);
});

test("Save defaults takes the reader to a budget Pi would refuse, and writes nothing", async ({ page }) => {
  await page.goto(server.url + "#models/defaults");
  const panel = page.getByRole("region", { name: "Defaults" });
  const budget = panel.getByLabel("Thinking budget: minimal", { exact: true });
  await budget.fill("-1");
  await panel.getByRole("button", { name: "Save defaults" }).click();
  await expect(budget).toBeFocused();
  await expect(panel.getByText("Enter a whole number, 0 or more.")).toBeVisible();
  await expect(readFile(join(agent, "settings.json"), "utf8")).rejects.toThrow();
});

test("enabled models are ticked in a checklist by provider, and patterns it does not touch stay", async ({ page }) => {
  await writeFile(join(agent, "settings.json"), JSON.stringify({ enabledModels: ["anthropic/*", "claude-bridge/*"] }));
  await page.goto(server.url + "#models");
  await page.getByRole("button", { name: /^Defaults/ }).click();
  const panel = page.getByRole("region", { name: "Defaults" });
  const enabled = panel.getByRole("group", { name: "Enabled models" });
  const anthropic: string[] = await page.evaluate(() => fetch("/api/models/available").then(response => response.json())
    .then((models: { provider: string; id: string }[]) => models.filter(model => model.provider === "anthropic").map(model => `anthropic/${model.id}`)));
  const all = enabled.getByRole("checkbox", { name: "All Anthropic models" });
  await expect(all).toBeChecked();
  await expect(enabled).toContainText(`${anthropic.length} of ${anthropic.length}`);
  await enabled.getByRole("searchbox", { name: "Search enabled models" }).fill("claude-haiku-4-5");
  await enabled.getByRole("checkbox", { name: /claude-haiku-4-5$/ }).uncheck();
  await expect(all).not.toBeChecked();
  await expect(enabled).toContainText(`${anthropic.length - 1} of ${anthropic.length}`);
  await panel.getByRole("button", { name: "Save defaults" }).click();
  await expect(page.getByRole("region", { name: "Notifications" })).toContainText("Defaults saved");
  // anthropic/* is spelled out without the model turned off; the extension's pattern is kept as written.
  expect(JSON.parse(await readFile(join(agent, "settings.json"), "utf8")).enabledModels)
    .toEqual([...anthropic.filter(ref => ref !== "anthropic/claude-haiku-4-5"), "claude-bridge/*"]);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("a whole provider is turned off and back on with its checkbox", async ({ page }) => {
  await writeFile(join(agent, "auth.json"), JSON.stringify({ anthropic: { type: "api_key", key: "fixture-a" }, openai: { type: "api_key", key: "fixture-o" } }));
  await page.goto(server.url + "#models");
  await page.getByRole("button", { name: /^Defaults/ }).click();
  const panel = page.getByRole("region", { name: "Defaults" });
  const enabled = panel.getByRole("group", { name: "Enabled models" });
  const openai: string[] = await page.evaluate(() => fetch("/api/models/available").then(response => response.json())
    .then((models: { provider: string; id: string }[]) => models.filter(model => model.provider === "openai").map(model => `openai/${model.id}`)));
  const settings = async () => JSON.parse(await readFile(join(agent, "settings.json"), "utf8"));
  await enabled.getByRole("checkbox", { name: "All Anthropic models" }).uncheck();
  await panel.getByRole("button", { name: "Save defaults" }).click();
  await expect(page.getByRole("region", { name: "Notifications" })).toContainText("Defaults saved");
  expect((await settings()).enabledModels).toEqual(openai);
  await enabled.getByRole("checkbox", { name: "All Anthropic models" }).check();
  await panel.getByRole("button", { name: "Save defaults" }).click();
  await expect(page.getByRole("region", { name: "Notifications" })).toContainText("Defaults saved");
  // Every model again: Pi's empty list.
  expect((await settings()).enabledModels).toBeUndefined();
});

test("the custom provider form says what each API is for, lists models only where it can, and labels each model column", async ({ page }) => {
  await page.goto(server.url + "#models");
  await page.getByRole("button", { name: "Add custom provider" }).click();
  const form = page.getByRole("form", { name: "Add custom provider" });
  const api = form.getByRole("combobox", { name: "API", exact: true });
  await form.getByLabel("Base URL").fill("http://localhost:1/v1");
  await api.click();
  await page.getByRole("option", { name: "Anthropic Messages", exact: true }).click();
  await expect(api).toHaveAccessibleDescription(/^Writes api: anthropic-messages\. Anthropic's API, and proxies that speak it/);
  await expect(form.getByRole("button", { name: "List models from the endpoint" })).toBeEnabled();
  await api.click();
  await page.getByRole("option", { name: "Amazon Bedrock Converse", exact: true }).click();
  await expect(form.getByRole("button", { name: "List models from the endpoint" })).toBeDisabled();
  await expect(form).toContainText("Listing models works for OpenAI Chat Completions, OpenAI Responses, Anthropic Messages, Google Generative AI and Mistral Conversations.");
  await form.getByRole("button", { name: "Add model" }).click();
  await expect(form.locator(".model-row-head")).toHaveText(["Model ID", "Display name", "Context", "Max output"].join(""));
  await expect(form).toContainText("Empty context and output use Pi's defaults");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("a custom provider is listed once, and a provider Pi ships has its endpoint changed in models.json", async ({ page }) => {
  await writeFile(join(agent, "models.json"), JSON.stringify({ providers: { ollama: { baseUrl: "http://localhost:1/v1", api: "openai-completions", apiKey: "ollama", models: [{ id: "llama-3" }] } } }));
  await page.goto(server.url + "#models");
  const list = page.getByRole("region", { name: "Providers" });
  await expect(list.getByRole("button", { name: /^ollama/ })).toHaveCount(1);
  await list.getByRole("button", { name: /^Anthropic\b/ }).click();
  const detail = page.getByRole("region", { name: "Anthropic" });
  await expect(detail).toContainText("https://api.anthropic.com");
  await detail.getByRole("button", { name: "Change in models.json" }).click();
  const form = page.getByRole("form", { name: "Change Anthropic" });
  await expect(form.getByLabel("Provider ID")).toHaveValue("anthropic");
  await form.getByLabel("Base URL").fill("http://localhost:9/proxy");
  await form.getByRole("button", { name: "Save provider" }).click();
  await expect(page.getByRole("region", { name: "Notifications" })).toContainText("anthropic saved");
  expect(JSON.parse(await readFile(join(agent, "models.json"), "utf8")).providers.anthropic).toEqual({ baseUrl: "http://localhost:9/proxy" });
  // The change sits in models.json; Anthropic stays Pi's provider, now saying where it sends requests.
  await expect(page.getByRole("region", { name: "Custom providers" }).getByRole("button", { name: /^anthropic/ })).toHaveAccessibleName("anthropic changes Anthropic");
  await list.getByRole("button", { name: /^Anthropic\b/ }).click();
  await expect(detail).toContainText("changed in models.json");
  await expect(detail).toContainText("http://localhost:9/proxy");
  await detail.getByRole("button", { name: "Edit in models.json" }).click();
  await expect(page.getByRole("form", { name: "Edit anthropic" })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("a custom provider the browser would refuse says why under its field and writes nothing", async ({ page }) => {
  await page.goto(server.url + "#models");
  await page.getByRole("button", { name: "Add custom provider" }).click();
  const form = page.getByRole("form", { name: "Add custom provider" });
  const providerId = form.getByLabel("Provider ID");
  await providerId.fill("bad id");
  await form.getByRole("button", { name: "Save provider" }).click();
  await expect(providerId).toBeFocused();
  await expect(form).toContainText("Use letters, digits, ., _ and -, starting with a letter or digit.");
  await expect(readFile(join(agent, "models.json"), "utf8")).rejects.toThrow();
});

test("a custom provider is added to models.json, edited without seeing its key, removed and restored", async ({ page }) => {
  const models = async () => JSON.parse(await readFile(join(agent, "models.json"), "utf8")).providers;
  await page.goto(server.url + "#models");
  await page.getByRole("button", { name: "Add custom provider" }).click();
  const form = page.getByRole("form", { name: "Add custom provider" });
  await form.getByLabel("Provider ID").fill("lmstudio");
  await form.getByLabel("Base URL").fill("http://localhost:1234/v1");
  await form.getByRole("combobox", { name: "API", exact: true }).click();
  await page.getByRole("option", { name: "OpenAI Chat Completions", exact: true }).click();
  await form.getByLabel("API key", { exact: true }).fill("fixture-lm-key");
  await form.getByRole("button", { name: "Add model" }).click();
  await form.getByLabel("Model ID 1").fill("llama-3");
  await form.getByLabel("Context window 1").fill("8192");
  await form.getByRole("button", { name: "Save provider" }).click();
  await expect(page.getByRole("region", { name: "Notifications" })).toContainText("lmstudio saved");
  expect((await models()).lmstudio).toEqual({ baseUrl: "http://localhost:1234/v1", api: "openai-completions", apiKey: "fixture-lm-key", models: [{ id: "llama-3", contextWindow: 8192 }] });

  const edit = page.getByRole("form", { name: "Edit lmstudio" });
  await expect(edit.getByLabel("API key", { exact: true })).toHaveValue("");
  await edit.getByLabel("Base URL").fill("http://localhost:4321/v1");
  await edit.getByRole("button", { name: "Save provider" }).click();
  await expect(page.getByRole("region", { name: "Notifications" })).toContainText("lmstudio saved");
  expect((await models()).lmstudio.apiKey).toBe("fixture-lm-key");
  expect((await models()).lmstudio.baseUrl).toBe("http://localhost:4321/v1");
  expect(await page.content()).not.toContain("fixture-lm-key");

  await page.getByRole("button", { name: "Remove lmstudio" }).click();
  await expect(page.getByRole("region", { name: "Notifications" })).toContainText("Removed lmstudio");
  expect((await models()).lmstudio).toBeUndefined();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("region", { name: "Notifications" })).toContainText("Restored");
  expect((await models()).lmstudio.baseUrl).toBe("http://localhost:4321/v1");
});

test("a provider Pi would refuse is not saved and the form keeps the draft", async ({ page }) => {
  await page.goto(server.url + "#models");
  await page.getByRole("button", { name: "Add custom provider" }).click();
  const form = page.getByRole("form", { name: "Add custom provider" });
  await form.getByLabel("Provider ID").fill("broken");
  await form.getByLabel("Base URL").fill("http://localhost:1/v1");
  await form.getByRole("button", { name: "Add model" }).click();
  await form.getByLabel("Model ID 1").fill("m");
  await form.getByRole("button", { name: "Save provider" }).click();
  await expect(form.getByRole("alert")).toContainText('no "api" specified');
  await expect(form.getByLabel("Base URL")).toHaveValue("http://localhost:1/v1");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("models.json is edited as raw JSON; keys stay hidden and a file Pi rejects is not saved", async ({ page }) => {
  const file = join(agent, "models.json");
  await writeFile(file, JSON.stringify({ providers: { o: { baseUrl: "http://localhost:1/v1", api: "openai-completions", apiKey: "fixture-raw-key", models: [{ id: "m" }] } } }));
  await page.goto(server.url + "#models");
  await page.getByRole("button", { name: "More actions for models.json" }).click();
  await page.getByRole("menuitem", { name: "Edit as JSON" }).click();
  const editor = page.getByLabel("models.json", { exact: true });
  await expect(editor).toHaveValue(/‹hidden 1›/);
  const broken = JSON.parse(await editor.inputValue());
  broken.providers.o.baseUrl = 5;
  await editor.fill(JSON.stringify(broken));
  await page.getByRole("button", { name: "Save JSON" }).click();
  await expect(page.getByRole("alert")).toContainText("baseUrl");
  const edited = JSON.parse(await editor.inputValue());
  edited.providers.o.baseUrl = "http://localhost:1/v1";
  edited.providers.o.modelOverrides = { "x/y": { name: "Y" } };
  await editor.fill(JSON.stringify(edited));
  await page.getByRole("button", { name: "Save JSON" }).click();
  await expect(page.getByRole("region", { name: "Notifications" })).toContainText("Saved models.json");
  const saved = JSON.parse(await readFile(file, "utf8")).providers.o;
  expect([saved.apiKey, saved.modelOverrides]).toEqual(["fixture-raw-key", { "x/y": { name: "Y" } }]);
  expect(await page.content()).not.toContain("fixture-raw-key");
});

test("models are listed from the endpoint and the chosen ones added to the form", async ({ page }) => {
  const endpoint = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: request => new URL(request.url).pathname === "/v1/models"
    ? Response.json({ data: [{ id: "llama-3" }, { id: "qwen3-coder", context_length: 65536 }, { id: "phi-4" }] }) : new Response("nope", { status: 404 }) });
  try {
    const base = `http://127.0.0.1:${endpoint.port}/v1`;
    await writeFile(join(agent, "models.json"), JSON.stringify({ providers: { ollama: { baseUrl: base, api: "openai-completions", apiKey: "ollama", models: [{ id: "llama-3" }] } } }));
    await page.goto(server.url + "#models");
    await page.getByRole("region", { name: "Custom providers" }).getByRole("button", { name: /^ollama/ }).click();
    const form = page.getByRole("form", { name: "Edit ollama" });
    await form.getByRole("button", { name: "List models from the endpoint" }).click();
    const found = form.getByRole("group", { name: "Models the endpoint offers" });
    await expect(found.getByRole("checkbox", { name: "llama-3" })).toBeDisabled();
    await found.getByRole("checkbox", { name: "qwen3-coder" }).check();
    await found.getByRole("button", { name: "Add 1 model" }).click();
    await expect(form.getByLabel("Model ID 2")).toHaveValue("qwen3-coder");
    await expect(form.getByLabel("Context window 2")).toHaveValue("65536");
    await form.getByRole("button", { name: "Save provider" }).click();
    await expect(page.getByRole("region", { name: "Notifications" })).toContainText("ollama saved");
    const saved = JSON.parse(await readFile(join(agent, "models.json"), "utf8")).providers.ollama;
    expect(saved.models).toEqual([{ id: "llama-3" }, { id: "qwen3-coder", contextWindow: 65536 }]);
  } finally { endpoint.stop(true); }
});

test("Check credential shows Pi's verdict for a provider", async ({ page }) => {
  await page.goto(server.url + "#models");
  await page.getByRole("searchbox", { name: "Search providers" }).fill("anthropic");
  await page.getByRole("button", { name: /^Anthropic\b/ }).first().click();
  const detail = page.getByRole("region", { name: "Anthropic" });
  await detail.getByRole("button", { name: "Check credential" }).click();
  await expect(detail.getByText("Pi can use it: API key.")).toBeVisible({ timeout: 30_000 });
  expect(await page.content()).not.toContain("fixture-secret-anthropic");
});

test("a provider Pi's catalog does not list, such as one from an extension, is typed in with a warning", async ({ page }) => {
  await page.goto(server.url + "#models");
  await page.getByRole("button", { name: /^Defaults/ }).click();
  const panel = page.getByRole("region", { name: "Defaults" });
  await panel.getByLabel("Default provider").fill("claude-bridge");
  await panel.getByLabel("Default model").fill("opus");
  await expect(panel.getByLabel("Default provider")).toHaveAccessibleDescription(/^claude-bridge is not a provider Pi has here: neither its catalog nor an enabled extension has one by that name\./);
  await panel.getByRole("button", { name: "Save defaults" }).click();
  await expect(page.getByRole("region", { name: "Notifications" })).toContainText("Defaults saved");
  const settings = JSON.parse(await readFile(join(agent, "settings.json"), "utf8"));
  expect([settings.defaultProvider, settings.defaultModel]).toEqual(["claude-bridge", "opus"]);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("the default provider is picked from a list like a select, set-up providers first, and any name can still be typed", async ({ page }) => {
  await page.goto(server.url + "#models");
  await page.getByRole("button", { name: /^Defaults/ }).click();
  const panel = page.getByRole("region", { name: "Defaults" });
  const provider = panel.getByRole("combobox", { name: "Default provider" });
  await provider.click();
  const list = page.getByRole("listbox");
  // Below the field, never over it.
  await expect.poll(async () => (await list.boundingBox())!.y >= (await provider.boundingBox())!.y + (await provider.boundingBox())!.height).toBe(true);
  // Set-up providers first, each by its name and ID.
  await expect(list.getByRole("group").first()).toHaveAccessibleName("Set up");
  await expect(list.getByRole("group", { name: "Set up" }).getByRole("option", { name: /^Anthropic\s*anthropic$/ })).toBeVisible();
  await list.getByRole("group", { name: "Not set up" }).getByRole("option", { name: /^OpenAI\s*openai$/ }).click();
  await expect(provider).toHaveValue("openai");
  await expect(list).toBeHidden();
  // Opened again on the chosen one, it lists every provider rather than that one alone.
  await provider.click();
  await expect(list.getByRole("option", { name: /^Anthropic\b/ })).toBeVisible();
  // Typing narrows the list; a name it does not have is kept as typed.
  await provider.fill("bedrock");
  await expect(list.getByRole("option", { name: /^Amazon Bedrock\b/ })).toBeVisible();
  await expect(list.getByRole("option", { name: /^Anthropic\b/ })).toHaveCount(0);
  await provider.fill("claude-bridge");
  await expect(page.getByText("Nothing listed matches; kept as typed.")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(list).toBeHidden();
  await expect(provider).toHaveValue("claude-bridge");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("a provider an extension registers is chosen like any other, with its models and the levels they offer", async ({ page }) => {
  await mkdir(join(agent, "extensions"), { recursive: true });
  await writeFile(join(agent, "extensions", "bridge.ts"), BRIDGE);
  await page.goto(server.url + "#models");
  await page.getByRole("button", { name: /^Defaults/ }).click();
  const panel = page.getByRole("region", { name: "Defaults" });
  const provider = panel.getByRole("combobox", { name: "Default provider" });
  await provider.click();
  const list = page.getByRole("listbox");
  // Pi has its key, so it is set up; the other waits for a sign-in.
  await expect(list.getByRole("group", { name: "Not set up" }).getByRole("option", { name: /^Needs Login\s*needs-login$/ })).toBeVisible();
  await list.getByRole("group", { name: "Set up" }).getByRole("option", { name: /^Bridge Fixture\s*bridge$/ }).click();
  await expect(provider).toHaveValue("bridge");
  await expect(provider).toHaveAccessibleDescription("");
  const model = panel.getByRole("combobox", { name: "Default model" });
  await model.click();
  await expect(list.getByRole("option")).toHaveText([/^Bridge Large\s*bridge-large$/, /^Bridge Small\s*bridge-small$/]);
  await list.getByRole("option", { name: /^Bridge Large/ }).click();
  await expect(panel.getByRole("combobox", { name: "Thinking level" })).toHaveAccessibleDescription(/^Bridge Large offers /);
  // Enabled models list its models under its name, and a pattern for them counts them.
  const enabled = panel.getByRole("group", { name: "Enabled models" });
  await expect(enabled.getByRole("checkbox", { name: "All Bridge Fixture models" })).toBeVisible();
  await enabled.getByLabel("Model or pattern").fill("bridge/*");
  await enabled.getByLabel("Model or pattern").press("Enter");
  await expect(enabled.getByRole("listitem").filter({ hasText: "bridge/*" })).toContainText("2 models");
  await panel.getByRole("button", { name: "Save defaults" }).click();
  await expect(page.getByRole("region", { name: "Notifications" })).toContainText("Defaults saved");
  const settings = JSON.parse(await readFile(join(agent, "settings.json"), "utf8"));
  expect([settings.defaultProvider, settings.defaultModel, settings.enabledModels]).toEqual(["bridge", "bridge-large", ["bridge/*"]]);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("a name from Enabled models that Pi has no provider for is listed after the set-up providers, before the others", async ({ page }) => {
  await writeFile(join(agent, "settings.json"), JSON.stringify({ enabledModels: ["ghost/*"] }));
  await page.goto(server.url + "#models");
  await page.getByRole("button", { name: /^Defaults/ }).click();
  await page.getByRole("region", { name: "Defaults" }).getByRole("combobox", { name: "Default provider" }).click();
  const groups = page.getByRole("listbox").getByRole("group");
  await expect(groups).toHaveCount(3);
  await expect(groups.nth(0)).toHaveAccessibleName("Set up");
  await expect(groups.nth(1)).toHaveAccessibleName("Named in Enabled models");
  await expect(groups.nth(1).getByRole("option")).toHaveText(["ghost"]);
  await expect(groups.nth(2)).toHaveAccessibleName("Not set up");
});

test("an enabled model pattern can be picked from the models that have a credential", async ({ page }) => {
  await page.goto(server.url + "#models");
  await page.getByRole("button", { name: /^Defaults/ }).click();
  const enabled = page.getByRole("region", { name: "Defaults" }).getByRole("group", { name: "Enabled models" });
  const pattern = enabled.getByRole("combobox", { name: "Model or pattern" });
  // The suggestions are the checklist's models: once it shows, they are there.
  await expect(enabled.getByRole("checkbox", { name: "All Anthropic models" })).toBeVisible();
  await pattern.fill("haiku-4-5");
  await pattern.press("ArrowDown");
  // Enter on a suggestion fills it in; Enter again adds it.
  await pattern.press("Enter");
  await expect(pattern).toHaveValue(/^anthropic\/claude-haiku-4-5/);
  const ref = await pattern.inputValue();
  await pattern.press("Enter");
  await expect(enabled.getByRole("listitem").filter({ hasText: ref })).toContainText("1 model");
  await expect(pattern).toHaveValue("");
});

test("a default model outside the enabled models is added to them on save, as Pi does", async ({ page }) => {
  await writeFile(join(agent, "settings.json"), JSON.stringify({ enabledModels: ["anthropic/claude-sonnet-4-5"] }));
  await page.goto(server.url + "#models");
  await page.getByRole("button", { name: /^Defaults/ }).click();
  const panel = page.getByRole("region", { name: "Defaults" });
  await panel.getByLabel("Default provider").fill("anthropic");
  await panel.getByLabel("Default provider").press("Tab");
  const model = panel.getByRole("combobox", { name: "Default model" });
  await model.click();
  await page.getByRole("option").filter({ hasNotText: "claude-sonnet-4-5" }).first().click();
  const other = await model.inputValue();
  await expect(panel).toContainText("Not in Enabled models");
  await panel.getByRole("button", { name: "Save defaults" }).click();
  await expect(page.getByRole("region", { name: "Notifications" })).toContainText("added to Enabled models");
  const settings = JSON.parse(await readFile(join(agent, "settings.json"), "utf8"));
  expect(settings.enabledModels).toEqual(["anthropic/claude-sonnet-4-5", `anthropic/${other}`]);
});

test("a provider whose key comes with more fields is set up with Pi's own questions", async ({ page }) => {
  await page.goto(server.url + "#models");
  await page.getByRole("searchbox", { name: "Search providers" }).fill("workers");
  await page.getByRole("button", { name: /^Cloudflare Workers AI/ }).click();
  await page.getByRole("button", { name: "Set up Cloudflare API key" }).click();
  const job = page.getByRole("region", { name: "Set up Cloudflare API key" });
  await job.getByLabel("Enter Cloudflare API key").fill("fixture-cloudflare-key");
  await job.getByRole("button", { name: "Continue" }).click();
  await job.getByLabel("Enter Cloudflare account ID").fill("acct-1");
  await job.getByRole("button", { name: "Continue" }).click();
  await expect(job).toContainText("Finished");
  expect(JSON.parse(await readFile(join(agent, "auth.json"), "utf8"))["cloudflare-workers-ai"])
    .toEqual({ type: "api_key", key: "fixture-cloudflare-key", env: { CLOUDFLARE_ACCOUNT_ID: "acct-1" } });
  await expect(page.getByRole("region", { name: "Cloudflare Workers AI" })).toContainText("Stored in auth.json");
  expect(await page.content()).not.toContain("fixture-cloudflare-key");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
