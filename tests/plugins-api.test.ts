import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConfigStore } from "../src/server/store.ts";
import { createApp } from "../src/server/app.ts";
import { BUILTIN_EXTENSIONS } from "../src/server/resources.ts";

const origin = "http://127.0.0.1:43123";
const json = { origin, "content-type": "application/json" };

async function fixture(t: import("node:test").TestContext) {
  const root = await mkdtemp(join(tmpdir(), "pi-settings-plugins-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const agent = join(root, "agent");
  const marker = join(root, "extension-ran");
  // If anything executed this extension, the marker file would appear.
  const hostile = `require("node:fs").writeFileSync(${JSON.stringify(marker)}, "ran");\nexport default function () {}\n`;
  for (const [file, body] of <[string, string][]>[
    ["extensions/hello.ts", hostile],
    ["prompts/review.md", "---\ndescription: Review the diff\n---\nReview it.\n"],
    ["pkgs/my-pack/package.json", JSON.stringify({ name: "my-pack" })],
    ["pkgs/my-pack/extensions/tool.ts", hostile],
  ]) {
    await mkdir(join(agent, file, ".."), { recursive: true });
    await writeFile(join(agent, file), body);
  }
  await writeFile(join(agent, "settings.json"), JSON.stringify({ packages: ["./pkgs/my-pack"] }));
  const app = createApp({ store: new ConfigStore({ global: agent, project: join(root, "p", ".pi") }), agentDir: agent, origins: [origin] });
  const request = (path: string, init: RequestInit = {}) =>
    app.request(new Request(origin + path, { ...init, headers: { host: new URL(origin).host, ...init.headers } }));
  const settings = async () => JSON.parse(await readFile(join(agent, "settings.json"), "utf8"));
  const plugins = async () => (await (await request("/api/plugins")).json()) as { revision: string; resources: Array<Record<string, string | boolean>>; packages: Array<Record<string, unknown>> };
  const toggle = async (name: string, enabled: boolean) => {
    const view = await plugins();
    const item = view.resources.find(entry => entry.name === name)!;
    return request("/api/plugins", { method: "PATCH", headers: json, body: JSON.stringify({ revision: view.revision, items: [{ type: item.type, path: item.path }], enabled }) });
  };
  return { marker, settings, plugins, toggle };
}

test("built-in, user and package resources are listed without running any extension", async (t) => {
  const { marker, plugins } = await fixture(t);
  const view = await plugins();
  const names = view.resources.map(entry => `${entry.type}:${entry.name}:${entry.group}`).sort();
  assert.deepEqual(names.filter(name => name.includes("Built-in")), BUILTIN_EXTENSIONS.map(name => `extensions:${name}:Built-in`).sort());
  assert.ok(names.some(name => name.startsWith("extensions:hello.ts:User")));
  assert.ok(names.includes("extensions:tool.ts:./pkgs/my-pack (user)"));
  assert.equal(view.resources.find(entry => entry.name === "review")!.description, "Review the diff");
  assert.deepEqual(view.packages.map(pkg => [pkg.source, pkg.installed]), [["./pkgs/my-pack", true]]);
  assert.equal(existsSync(marker), false);
});

test("turning a built-in off writes -builtin:<name>, as pi config does", async (t) => {
  const { settings, plugins, toggle } = await fixture(t);
  assert.equal((await toggle("mcp", false)).status, 200);
  assert.deepEqual((await settings()).extensions, ["-builtin:mcp"]);
  assert.equal((await plugins()).resources.find(entry => entry.name === "mcp")!.enabled, false);
});

test("a package extension is turned off in the package's own filter", async (t) => {
  const { settings, toggle } = await fixture(t);
  assert.equal((await toggle("tool.ts", false)).status, 200);
  assert.deepEqual((await settings()).packages, [{ source: "./pkgs/my-pack", extensions: ["-extensions/tool.ts"] }]);
});

test("the built-in extension names match Pi's settings documentation", () => {
  const docs = readFileSync("node_modules/@earendil-works/pi-coding-agent/docs/settings.md", "utf8");
  const documented = [...new Set([...docs.matchAll(/`builtin:([\w.-]+)`/g)].map(match => match[1]!).filter(name => name !== "<name>"))];
  assert.deepEqual([...BUILTIN_EXTENSIONS].sort(), documented.sort());
});
