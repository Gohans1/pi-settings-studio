import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fields, settingHomes } from "../src/shared/settings.ts";

const SDK = "node_modules/@earendil-works/pi-coding-agent";

type SchemaNode = { properties?: Record<string, SchemaNode & { deprecated?: boolean }> };

/**
 * Leaf keys of Pi's published settings schema (schemas/settings.schema.json), nested setting objects flattened
 * to dotted keys. Deprecated keys are old names Pi migrates when it reads the file, so they need no row.
 */
function piSettingKeys(): string[] {
  const schema: SchemaNode = JSON.parse(readFileSync(`${SDK}/schemas/settings.schema.json`, "utf8"));
  const flatten = (node: SchemaNode, prefix: string): string[] => Object.entries(node.properties ?? {}).flatMap(([key, child]) =>
    child.deprecated ? [] : child.properties ? flatten(child, `${prefix}${key}.`) : [`${prefix}${key}`]);
  return flatten(schema, "");
}

test("every Pi setting has a home: a settings row, another tab, raw JSON or internal", () => {
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
