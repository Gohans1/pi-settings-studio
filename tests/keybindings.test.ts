import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { KEYBINDING_ACTIONS, KEYBINDINGS_PI_VERSION } from "../src/server/keybindings-catalogue.ts";
import { isValidKey } from "../src/shared/keys.ts";
import { ConfigStore } from "../src/server/store.ts";
import { createApp } from "../src/server/app.ts";

const SDK = "node_modules/@earendil-works/pi-coding-agent";

test("the action catalogue matches Pi's keybindings documentation and SDK version", () => {
  const docs = readFileSync(`${SDK}/docs/keybindings.md`, "utf8");
  const documented = [...docs.matchAll(/^\| `([a-zA-Z.]+)` \|/gm)].map(match => match[1]!).sort();
  assert.deepEqual(KEYBINDING_ACTIONS.map(([id]) => id).sort(), documented);
  assert.equal(JSON.parse(readFileSync(`${SDK}/package.json`, "utf8")).version, KEYBINDINGS_PI_VERSION);
});

test("keys follow Pi's documented syntax", () => {
  for (const key of ["ctrl+shift+x", "alt+ctrl+x", "super+k", "ctrl+1", "pageUp", "f12", "escape", "ctrl+/", "shift+tab", "alt+enter"]) assert.equal(isValidKey(key), true, key);
  for (const key of ["", "ctrl+", "hyper+x", "f13", "ctrl+xx", "Ctrl+X", "ctrl ++"]) assert.equal(isValidKey(key), false, key);
});

const origin = "http://127.0.0.1:43123";
const json = { origin, "content-type": "application/json" };

test("bindings are saved per action, defaults removed, unknown ids kept, bad keys refused", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "pi-settings-keys-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "agent"));
  const file = join(root, "agent", "keybindings.json");
  await writeFile(file, JSON.stringify({ "app.session.new": "ctrl+shift+n", "extension.custom": "f5" }));
  const app = createApp({ store: new ConfigStore({ global: join(root, "agent") }), agentDir: join(root, "agent"), origins: [origin] });
  const request = (path: string, init: RequestInit = {}) =>
    app.request(new Request(origin + path, { ...init, headers: { host: new URL(origin).host, ...init.headers } }));
  const view = await (await request("/api/keybindings")).json();
  const sessionNew = view.actions.find((action: { id: string }) => action.id === "app.session.new");
  assert.deepEqual([sessionNew.keys, sessionNew.defaults, view.unknown], [["ctrl+shift+n"], [], ["extension.custom"]]);
  const patch = (changes: object[]) => request("/api/keybindings", { method: "PATCH", headers: json, body: JSON.stringify({ revision: view.revision, changes }) });
  assert.equal((await patch([{ id: "app.session.tree", keys: ["ctrl+banana"] }])).status, 422);
  assert.equal((await patch([{ id: "app.nope", keys: ["f1"] }])).status, 422);
  assert.equal((await patch([{ id: "app.session.new", keys: null }, { id: "app.session.tree", keys: ["ctrl+shift+t", "alt+shift+t"] }, { id: "tui.altScreen.pageUp", keys: [] }])).status, 200);
  assert.deepEqual(JSON.parse(await readFile(file, "utf8")), { "extension.custom": "f5", "app.session.tree": ["ctrl+shift+t", "alt+shift+t"], "tui.altScreen.pageUp": [] });
});

test("the $schema editor hint is no unknown action, and saving keeps it", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "pi-settings-keys-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "agent"));
  const file = join(root, "agent", "keybindings.json");
  const hint = "https://pi.dev/schemas/keybindings.schema.json";
  await writeFile(file, JSON.stringify({ $schema: hint, "extension.custom": "f5" }));
  const app = createApp({ store: new ConfigStore({ global: join(root, "agent") }), agentDir: join(root, "agent"), origins: [origin] });
  const request = (path: string, init: RequestInit = {}) =>
    app.request(new Request(origin + path, { ...init, headers: { host: new URL(origin).host, ...init.headers } }));
  const view = await (await request("/api/keybindings")).json();
  assert.deepEqual(view.unknown, ["extension.custom"]);
  const changes = [{ id: "app.session.tree", keys: ["ctrl+shift+t"] }];
  assert.equal((await request("/api/keybindings", { method: "PATCH", headers: json, body: JSON.stringify({ revision: view.revision, changes }) })).status, 200);
  assert.deepEqual(JSON.parse(await readFile(file, "utf8")), { $schema: hint, "extension.custom": "f5", "app.session.tree": "ctrl+shift+t" });
});
