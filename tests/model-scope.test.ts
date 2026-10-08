import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ModelRuntime, resolveModelScopeWithDiagnostics } from "@earendil-works/pi-coding-agent";
import type { Credential } from "@earendil-works/pi-ai";
import { resolveModelScope } from "../src/server/model-scope.ts";

// A runtime where a few providers hold a literal key, so Pi's own resolver sees their models as available.
const keys: Record<string, Credential> = Object.fromEntries(["anthropic", "openai", "openrouter", "google", "opencode"]
  .map(id => [id, { type: "api_key", key: "fixture" } as Credential]));
const agentDir = mkdtempSync(join(tmpdir(), "pi-settings-scope-"));
const runtime = await ModelRuntime.create({
  credentials: { read: async id => keys[id], list: async () => Object.keys(keys).map(providerId => ({ providerId, type: "api_key" as const })),
    modify: async () => { throw new Error("read-only"); }, delete: async () => { throw new Error("read-only"); } },
  modelsPath: join(agentDir, "models.json"), modelsStorePath: join(agentDir, "models-store.json"), allowModelNetwork: false, refreshOnCreate: false,
});
const available = await runtime.getAvailable();

describe("model scope", () => {
  const cases: string[][] = [
    ["anthropic/*"], ["*sonnet*"], ["sonnet"], ["anthropic/*:high"], ["nope/*"], ["claude-sonnet:bogus"],
    ["opencode/*", "anthropic/claude*"], ["openai/*", "openai/*"], [available[0]!.id], [`${available[1]!.provider}/${available[1]!.id}`],
    ["gpt*:xhigh", "*flash*"],
  ];
  test.each(cases.map(patterns => [patterns.join(", "), patterns] as const))("matches Pi for %s", async (_, patterns) => {
    const pi = await resolveModelScopeWithDiagnostics([...patterns], runtime);
    const ours = resolveModelScope([...patterns], available);
    expect(ours.scopedModels.map(scoped => [scoped.model.provider, scoped.model.id, scoped.thinkingLevel]))
      .toEqual(pi.scopedModels.map(scoped => [scoped.model.provider, scoped.model.id, scoped.thinkingLevel]));
    expect(ours.diagnostics).toEqual(pi.diagnostics);
  });
});
