import { test } from "node:test";
import assert from "node:assert/strict";
import { codemodePreferenceOf, withCodemodePreference } from "../src/server/codemode.ts";

test("Always on appends +codemode; Automatic drops every codemode entry", () => {
  assert.deepEqual(withCodemodePreference(undefined, "always"), ["+codemode"]);
  assert.deepEqual(withCodemodePreference(["read", "bash"], "always"), ["read", "bash", "+codemode"]);
  assert.deepEqual(withCodemodePreference(["read", "codemode"], "automatic"), ["read"]);
  assert.deepEqual(withCodemodePreference(["-bash", "+codemode"], "automatic"), ["-bash"]);
});

test("Automatic never leaves an empty list that would disable Pi's default tools", () => {
  assert.equal(withCodemodePreference(["+codemode"], "automatic"), undefined);
  // A plain list replaces the defaults, so an emptied plain list stays empty on purpose.
  assert.deepEqual(withCodemodePreference(["codemode"], "automatic"), []);
});

test("the preference follows the resolved tool list, not the raw entries", () => {
  assert.equal(codemodePreferenceOf(undefined), "automatic");
  assert.equal(codemodePreferenceOf(["+codemode"]), "always");
  assert.equal(codemodePreferenceOf(["read", "codemode"]), "always");
  assert.equal(codemodePreferenceOf(["+codemode", "-codemode"]), "automatic");
});
