import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultText, fields, fileChange, isPiDefault } from "../src/shared/settings.ts";

const field = (key: string) => fields.find(entry => entry.key === key)!;
const none = () => undefined;

test("a key the file leaves out is Pi's default", () => {
  assert.equal(isPiDefault(field("steeringMode"), undefined), true);
});

test("a value equal to Pi's documented default is Pi's default", () => {
  assert.equal(isPiDefault(field("compaction.enabled"), true), true);
});

test("a value that differs from Pi's default is not", () => {
  assert.equal(isPiDefault(field("steeringMode"), "all"), false);
});

test("an empty text field is Pi's default where empty means the default", () => {
  assert.equal(isPiDefault(field("shellPath"), ""), true);
});

test("a list is compared as Pi reads it, without empty lines", () => {
  assert.equal(isPiDefault(field("npmCommand"), ["npm", ""]), true);
});

test("an empty per-model map is Pi's default", () => {
  assert.equal(isPiDefault(field("modelThinkingLevels"), {}), true);
});

test("startup tools are Pi's default when they resolve to Pi's tools", () => {
  assert.equal(isPiDefault(field("defaultTools"), ["+read"]), true);
  assert.equal(isPiDefault(field("defaultTools"), ["+grep"]), false);
});

test("a value Pi would refuse is never Pi's default", () => {
  assert.equal(isPiDefault(field("retry.maxRetries"), -1), false);
});

test("in the global file, choosing Pi's default removes the key, as VS Code does", () => {
  assert.deepEqual(fileChange(field("steeringMode"), { key: "steeringMode", value: "one-at-a-time" }, "global", true), { key: "steeringMode", remove: true });
});

test("in the global file, choosing Pi's default for a key it lacks writes nothing", () => {
  assert.equal(fileChange(field("steeringMode"), { key: "steeringMode", value: "one-at-a-time" }, "global", false), undefined);
});

test("in the global file, a value that differs from Pi's default is written", () => {
  assert.deepEqual(fileChange(field("steeringMode"), { key: "steeringMode", value: "all" }, "global", false), { key: "steeringMode", value: "all" });
});

test("in a project file, Pi's default is written, since it overrides the global value", () => {
  assert.deepEqual(fileChange(field("steeringMode"), { key: "steeringMode", value: "one-at-a-time" }, "project", false), { key: "steeringMode", value: "one-at-a-time" });
});

test("using the default removes a key the file has and does nothing for one it lacks", () => {
  assert.deepEqual(fileChange(field("shellPath"), { key: "shellPath", remove: true }, "global", true), { key: "shellPath", remove: true });
  assert.equal(fileChange(field("shellPath"), { key: "shellPath", remove: true }, "global", false), undefined);
});

test("a value Pi would refuse is kept, so Save can point at it", () => {
  assert.deepEqual(fileChange(field("retry.maxRetries"), { key: "retry.maxRetries", value: -1 }, "global", false), { key: "retry.maxRetries", value: -1 });
});

test("a fixed default reads as Pi shows it: switches on or off, numbers grouped", () => {
  assert.deepEqual(defaultText(field("compaction.enabled"), {}, none), { value: "on" });
  assert.deepEqual(defaultText(field("httpIdleTimeoutMs"), {}, none), { value: "300,000" });
});

test("a default made of spaces says how many", () => {
  assert.deepEqual(defaultText(field("markdown.codeBlockIndent"), {}, none), { value: "2 spaces" });
});

test("thinking budgets show Pi's built-in token counts", () => {
  assert.deepEqual(["minimal", "low", "medium", "high"].map(level => field(`thinkingBudgets.${level}`).defaultValue), [1024, 2048, 8192, 16384]);
});

test("a default that is no value says what Pi does instead", () => {
  assert.deepEqual(defaultText(field("httpProxy"), {}, none), { value: "none" });
});

test("a default that depends on this machine comes from the server", () => {
  assert.deepEqual(defaultText(field("shellPath"), { shellPath: { value: "/bin/bash", note: "found on this machine" } }, none), { value: "/bin/bash", note: "found on this machine" });
});

test("the provider timeout defaults to the HTTP idle timeout, whatever that is set to", () => {
  const valueOf = (key: string) => key === "httpIdleTimeoutMs" ? 120000 : undefined;
  assert.deepEqual(defaultText(field("retry.provider.timeoutMs"), {}, valueOf), { value: "120,000", note: "same as the HTTP idle timeout" });
  assert.deepEqual(defaultText(field("retry.provider.timeoutMs"), {}, none), { value: "300,000", note: "same as the HTTP idle timeout" });
});

test("every General field without one fixed default says what Pi uses", () => {
  const machine = ["shellPath", "externalEditor", "sessionDir"];
  const silent = fields.filter(entry => entry.section !== "modelDefaults" && entry.defaultValue === undefined && !machine.includes(entry.key)
    && defaultText(entry, {}, none).value === "none" && !entry.defaultText);
  assert.deepEqual(silent.map(entry => entry.key), []);
});
