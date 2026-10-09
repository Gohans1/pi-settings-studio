import { describe, expect, test } from "bun:test";
import { setEnabled } from "../src/shared/enabled-models.ts";

// Models of providers that are set up, and what each pattern selects among them (the server's /scope answer).
const all = ["anthropic/claude-haiku", "anthropic/claude-sonnet", "openrouter/claude-sonnet", "opencode/big", "opencode/small"];
const selects = (table: Record<string, string[]>) => (pattern: string) => table[pattern] ?? [];

describe("turning models on and off in enabledModels", () => {
  test("turning a model on adds its exact name after the patterns already there", () => {
    expect(setEnabled(["opencode/*"], selects({ "opencode/*": ["opencode/big", "opencode/small"] }), all, ["anthropic/claude-haiku"], true))
      .toEqual(["opencode/*", "anthropic/claude-haiku"]);
  });

  test("turning a model on changes nothing while every model is enabled", () => {
    expect(setEnabled([], selects({}), all, ["opencode/big"], true)).toEqual([]);
  });

  test("turning a model off removes its exact pattern, with or without a thinking level", () => {
    expect(setEnabled(["anthropic/claude-haiku:high", "opencode/big"], selects({}), all, ["anthropic/claude-haiku"], false)).toEqual(["opencode/big"]);
  });

  test("turning off a model that a glob selects spells the glob out without it, keeping the glob's thinking level", () => {
    expect(setEnabled(["anthropic/claude-haiku", "opencode/*:low"], selects({ "opencode/*:low": ["opencode/big", "opencode/small"] }), all, ["opencode/big"], false))
      .toEqual(["anthropic/claude-haiku", "opencode/small:low"]);
  });

  test("turning a model off while every model is enabled lists all the others, as Pi's /scoped-models does", () => {
    expect(setEnabled([], selects({}), all, ["opencode/small"], false)).toEqual(["anthropic/claude-haiku", "anthropic/claude-sonnet", "openrouter/claude-sonnet", "opencode/big"]);
  });

  test("a pattern that selects nothing here, such as an extension's provider, is kept", () => {
    expect(setEnabled(["claude-bridge/*", "opencode/big", "opencode/small"], selects({}), all, ["opencode/big"], false)).toEqual(["claude-bridge/*", "opencode/small"]);
  });

  test("turning on the last missing model of a list of exact names returns to every model", () => {
    expect(setEnabled(all.slice(1), selects({}), all, [all[0]!], true)).toEqual([]);
  });

  test("turning off the only enabled model changes nothing, since an empty list means every model to Pi", () => {
    expect(setEnabled(["opencode/big"], selects({}), all, ["opencode/big"], false)).toEqual(["opencode/big"]);
  });

  test("a whole provider is turned off in one change, and a glob it shares with another provider keeps the other's models", () => {
    const table = { "*sonnet*": ["anthropic/claude-sonnet", "openrouter/claude-sonnet"] };
    expect(setEnabled(["*sonnet*", "anthropic/claude-haiku"], selects(table), all, ["anthropic/claude-haiku", "anthropic/claude-sonnet"], false))
      .toEqual(["openrouter/claude-sonnet"]);
  });

  test("a whole provider is turned on with its models' exact names", () => {
    expect(setEnabled(["anthropic/claude-haiku"], selects({}), all, ["opencode/big", "opencode/small"], true))
      .toEqual(["anthropic/claude-haiku", "opencode/big", "opencode/small"]);
  });
});
