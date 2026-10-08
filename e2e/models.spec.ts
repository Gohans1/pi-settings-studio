import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { startServer, type RunningServer } from "../src/server/server.ts";

let root: string, agent: string, server: RunningServer;
test.beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "pi-settings-models-browser-"));
  agent = join(root, "agent");
  await mkdir(agent, { recursive: true });
  await writeFile(join(agent, "auth.json"), JSON.stringify({ anthropic: { type: "api_key", key: "fixture-secret-anthropic" } }));
  server = await startServer({ agentDir: agent, projectDir: join(root, "project"), port: 0, staticDir: resolve("dist/client") });
});
test.afterEach(async () => { await server?.close(); await rm(root, { recursive: true, force: true }); });

test("API keys are stored, removed and restored without ever being shown", async ({ page }) => {
  const auth = async () => JSON.parse(await readFile(join(agent, "auth.json"), "utf8"));
  await page.goto(server.url + "#models");
  await page.getByRole("searchbox", { name: "Search providers" }).fill("openai");
  await page.getByRole("button", { name: /^OpenAI\b/ }).first().click();
  const detail = page.getByRole("region", { name: "OpenAI" });
  await detail.getByLabel("API key").fill("fixture-new-key");
  await detail.getByRole("button", { name: "Save key" }).click();
  await expect(page.getByRole("status")).toContainText("API key saved for OpenAI");
  expect((await auth()).openai).toEqual({ type: "api_key", key: "fixture-new-key" });
  await expect(detail.getByLabel("API key")).toHaveValue("");
  expect(await page.content()).not.toContain("fixture-");

  await page.getByRole("searchbox", { name: "Search providers" }).fill("anthropic");
  await page.getByRole("button", { name: /^Anthropic\b/ }).first().click();
  await page.getByRole("region", { name: "Anthropic" }).getByRole("button", { name: "Remove credential" }).click();
  await expect(page.getByRole("status")).toContainText("Removed the stored credential for Anthropic");
  expect((await auth()).anthropic).toBeUndefined();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("status")).toContainText("Restored");
  expect((await auth()).anthropic.key).toBe("fixture-secret-anthropic");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("defaults are chosen from Pi's catalog and saved to settings.json", async ({ page }) => {
  await page.goto(server.url + "#models");
  await page.getByRole("button", { name: /^Defaults/ }).click();
  const panel = page.getByRole("region", { name: "Defaults" });
  await panel.getByLabel("Default provider").selectOption("anthropic");
  const model = panel.getByLabel("Default model");
  await expect(model.locator("option")).not.toHaveCount(1);
  const chosen = await model.locator("option").nth(1).getAttribute("value");
  await model.selectOption(chosen!);
  await panel.getByLabel("Thinking level").selectOption("high");
  await panel.getByLabel("Enabled models").fill("anthropic/*");
  await panel.getByRole("button", { name: "Save defaults" }).click();
  await expect(page.getByRole("status")).toContainText("Defaults saved");
  const settings = JSON.parse(await readFile(join(agent, "settings.json"), "utf8"));
  expect(settings).toEqual({ defaultProvider: "anthropic", defaultModel: chosen, defaultThinkingLevel: "high", enabledModels: ["anthropic/*"] });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("a custom provider is added to models.json, edited without seeing its key, removed and restored", async ({ page }) => {
  const models = async () => JSON.parse(await readFile(join(agent, "models.json"), "utf8")).providers;
  await page.goto(server.url + "#models");
  await page.getByRole("button", { name: "Add custom provider" }).click();
  const form = page.getByRole("form", { name: "Add custom provider" });
  await form.getByLabel("Provider ID").fill("lmstudio");
  await form.getByLabel("Base URL").fill("http://localhost:1234/v1");
  await form.getByLabel("API", { exact: true }).selectOption("openai-completions");
  await form.getByLabel("API key", { exact: true }).fill("fixture-lm-key");
  await form.getByRole("button", { name: "Add model" }).click();
  await form.getByLabel("Model ID 1").fill("llama-3");
  await form.getByLabel("Context window 1").fill("8192");
  await form.getByRole("button", { name: "Save provider" }).click();
  await expect(page.getByRole("status")).toContainText("lmstudio saved");
  expect((await models()).lmstudio).toEqual({ baseUrl: "http://localhost:1234/v1", api: "openai-completions", apiKey: "fixture-lm-key", models: [{ id: "llama-3", contextWindow: 8192 }] });

  const edit = page.getByRole("form", { name: "Edit lmstudio" });
  await expect(edit.getByLabel("API key", { exact: true })).toHaveValue("");
  await edit.getByLabel("Base URL").fill("http://localhost:4321/v1");
  await edit.getByRole("button", { name: "Save provider" }).click();
  await expect(page.getByRole("status")).toContainText("lmstudio saved");
  expect((await models()).lmstudio.apiKey).toBe("fixture-lm-key");
  expect((await models()).lmstudio.baseUrl).toBe("http://localhost:4321/v1");
  expect(await page.content()).not.toContain("fixture-lm-key");

  await page.getByRole("button", { name: "Remove lmstudio" }).click();
  await expect(page.getByRole("status")).toContainText("Removed lmstudio");
  expect((await models()).lmstudio).toBeUndefined();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("status")).toContainText("Restored");
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
  await page.getByRole("button", { name: "Edit models.json as JSON" }).click();
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
  await expect(page.getByRole("status").first()).toContainText("Saved models.json");
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
    await expect(page.getByRole("status")).toContainText("ollama saved");
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
