import { describe, expect, test } from "bun:test";
import { codemodeListed, sectionInfo, tokens } from "../src/client/prompt-parts.ts";

describe("prompt sections", () => {
  test("Pi's sections read as what they are, each with the tab that changes it", () => {
    expect(sectionInfo("project_context")).toMatchObject({ label: "Instructions (AGENTS.md)", tab: "instructions" });
    expect(sectionInfo("skills")).toMatchObject({ label: "Skills", tab: "skills" });
    expect(sectionInfo("mcp_servers")).toMatchObject({ label: "MCP servers", tab: "mcp" });
    expect(sectionInfo("addendum")).toMatchObject({ label: "APPEND_SYSTEM.md", tab: "instructions" });
  });

  test("a section Pi does not know comes from an extension and keeps its name", () => {
    const { label, about, tab } = sectionInfo("memory");
    expect([label, tab]).toEqual(["memory", undefined]);
    expect(about).toContain("extension");
  });
});

describe("code mode's catalog", () => {
  // Pi 1.1.0 renders each listed tool as a heading (dist/extensions/codemode/tool.js renderToolSection).
  const description = [
    "Run JavaScript that calls other tools.", "Nested tools:",
    "### `write`\nWrite a file.\n```ts\ndeclare const tools: {};\n```",
    "## t3-code (some tools not listed)",
    "### `mcp__t3_code__device_close` (`mcp__t3-code__device_close`)\nClose a device.",
  ].join("\n\n");

  test("names the tools whose declarations its description carries, by the name the tool is called", () => {
    expect(codemodeListed(description)).toEqual(["write", "mcp__t3-code__device_close"]);
  });

  test("lists nothing when the description has no tool headings", () => {
    expect(codemodeListed("Run JavaScript that calls other tools.")).toEqual([]);
  });
});

describe("token counts", () => {
  test("read short: exact below a thousand, then in thousands", () => {
    expect([tokens(1), tokens(42), tokens(9340), tokens(13_172)]).toEqual(["1 token", "42 tokens", "9.3k tokens", "13.2k tokens"]);
  });
});
