import { describe, expect, test } from "bun:test";
import { SettingsManager } from "@earendil-works/pi-coding-agent";
import { DEFAULT_TOOLS, effectiveTools, toggleTool } from "../src/shared/tools.ts";

/** Pi's own answer: the startup tools a session gets from these settings files. */
function piTools(global?: string[], project?: string[]): string[] {
  const texts = { global: JSON.stringify(global ? { defaultTools: global } : {}), project: project && JSON.stringify({ defaultTools: project }) };
  const storage: Parameters<typeof SettingsManager.fromStorage>[0] = { withLock: (scope, read) => { read(texts[scope]); } };
  return SettingsManager.fromStorage(storage, { projectTrusted: project !== undefined }).getDefaultTools() ?? [...DEFAULT_TOOLS];
}
const inGlobal = (list?: readonly string[]) => effectiveTools(list);

describe("effective startup tools", () => {
  const cases: [string, string[] | undefined, string[] | undefined][] = [
    ["nothing set", undefined, undefined],
    ["a global modifier", ["+codemode"], undefined],
    ["global modifiers that add and remove", ["+grep", "-write", "+find"], undefined],
    ["a global replacement", ["read", "grep"], undefined],
    ["an empty global list", [], undefined],
    ["a replacement with modifiers after it", ["read", "+ls", "-read"], undefined],
    ["project modifiers on global modifiers", ["+codemode"], ["-bash", "+grep"]],
    ["project modifiers without a global list", undefined, ["+tool_search"]],
    ["a project replacement", ["+codemode"], ["read", "ls"]],
    ["project modifiers on a global replacement", ["read", "grep"], ["+find", "-grep"]],
    ["an empty project list", ["+grep"], []],
    ["an empty project list without a global list", undefined, []],
  ];
  test.each(cases)("match Pi with %s", (_, global, project) => {
    expect(effectiveTools(global, project)).toEqual(piTools(global, project));
  });
});

describe("switching one tool", () => {
  test("adds a modifier against the defaults and keeps the others", () => {
    expect(toggleTool(["+codemode"], "grep", true, inGlobal)).toEqual(["+codemode", "+grep"]);
    expect(toggleTool(undefined, "write", false, inGlobal)).toEqual(["-write"]);
  });

  test("returning a tool to the inherited state drops its entry, never leaving an empty list", () => {
    // An empty list would turn every built-in tool off, so no list at all is the way back.
    expect(toggleTool(["+grep"], "grep", false, inGlobal)).toBeUndefined();
    expect(toggleTool(["-write", "+grep"], "write", true, inGlobal)).toEqual(["+grep"]);
  });

  test("in a project, modifiers are relative to what the global file gives", () => {
    const inProject = (list?: readonly string[]) => effectiveTools(["+grep"], list);
    expect(toggleTool(undefined, "grep", false, inProject)).toEqual(["-grep"]);
    expect(toggleTool(undefined, "ls", true, inProject)).toEqual(["+ls"]);
    // Pi adds an empty project list to the global one, so it changes nothing there.
    expect(toggleTool([], "ls", true, inProject)).toEqual(["+ls"]);
  });

  test("a list that replaces the defaults stays a plain list of the resulting tools", () => {
    expect(toggleTool(["read", "bash"], "grep", true, inGlobal)).toEqual(["read", "bash", "grep"]);
    expect(toggleTool(["read", "+grep"], "read", false, inGlobal)).toEqual(["grep"]);
    expect(toggleTool(["read"], "read", false, inGlobal)).toEqual([]);
  });

  test("the result is what Pi then starts with, the other tools unchanged", () => {
    const cases: [string[] | undefined, string[] | undefined, string, boolean][] = [
      [["+codemode"], undefined, "grep", true], [["read", "+ls"], undefined, "ls", false], [undefined, undefined, "bash", false],
      [[], ["+grep"], "read", true], [["read"], [], "bash", true], [["+grep"], ["read", "ls"], "ls", false],
    ];
    for (const [global, project, tool, on] of cases) {
      const before = piTools(global, project);
      const next = project === undefined ? toggleTool(global, tool, on, inGlobal) : toggleTool(project, tool, on, list => effectiveTools(global, list));
      const after = project === undefined ? piTools(next) : piTools(global, next);
      expect(new Set(after)).toEqual(new Set([...before.filter(name => name !== tool), ...(on ? [tool] : [])]));
    }
  });
});
