import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fields, settingHomes } from "../src/shared/settings.ts";

const SDK = "node_modules/@earendil-works/pi-coding-agent";

/** Leaf keys of Pi's `Settings` interface, nested setting objects flattened to dotted keys. */
function piSettingKeys(): string[] {
  const source = readFileSync(`${SDK}/dist/core/settings-manager.d.ts`, "utf8");
  const interfaces = new Map<string, [string, string][]>();
  for (const [, name, body] of source.matchAll(/export interface (\w+) \{\n([\s\S]*?)\n\}/g)) {
    interfaces.set(name!, [...body!.matchAll(/^ {4}(\w+)\??: (.+);$/gm)].map(([, key, type]) => [key!, type!.trim()]));
  }
  const flatten = (name: string, prefix: string): string[] => interfaces.get(name)!.flatMap(([key, type]) =>
    interfaces.has(type) ? flatten(type, `${prefix}${key}.`) : [`${prefix}${key}`]);
  return flatten("Settings", "");
}

test("every Pi setting has a home: a General field, another tab, raw JSON or internal", () => {
  const known = new Set([...fields.map(field => field.key), ...Object.keys(settingHomes)]);
  const missing = piSettingKeys().filter(key => !known.has(key));
  assert.deepEqual(missing, [], `Pi has settings this app does not cover yet. Add a field or a home for: ${missing.join(", ")}`);
});

test("no field or home names a setting Pi no longer has", () => {
  const pi = new Set(piSettingKeys());
  const stale = [...fields.map(field => field.key), ...Object.keys(settingHomes)].filter(key => !pi.has(key));
  assert.deepEqual(stale, [], `Remove or rename: ${stale.join(", ")}`);
});

test("the Pi SDK pin matches the pi installed on this machine", (t) => {
  const pi = Bun.which("pi");
  if (!pi) return t.skip("pi is not on PATH");
  const installed = Bun.spawnSync([pi, "--version"]).stdout.toString().trim();
  const pinned = JSON.parse(readFileSync(`${SDK}/package.json`, "utf8")).version;
  assert.equal(pinned, installed, `Run: bun add --exact @earendil-works/pi-coding-agent@${installed} @earendil-works/pi-ai@${installed}`);
});
