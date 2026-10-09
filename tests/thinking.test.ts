import { expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { clampThinkingLevel, getSupportedThinkingLevels, InMemoryCredentialStore } from "@earendil-works/pi-ai";
import { clampLevel, THINKING_LEVELS } from "../src/shared/thinking.ts";

const dir = mkdtempSync(join(tmpdir(), "pi-settings-thinking-"));
const runtime = await ModelRuntime.create({ credentials: new InMemoryCredentialStore(), modelsPath: null, modelsStorePath: join(dir, "models-store.json"), allowModelNetwork: false, refreshOnCreate: false });

test("the level a model starts at matches Pi's clamp for every model in the catalog and every level", () => {
  const ours: string[] = [], pi: string[] = [];
  for (const model of runtime.getModels()) for (const level of THINKING_LEVELS) {
    ours.push(`${model.provider}/${model.id}:${level} → ${clampLevel(getSupportedThinkingLevels(model), level)}`);
    pi.push(`${model.provider}/${model.id}:${level} → ${clampThinkingLevel(model, level)}`);
  }
  expect(ours).toEqual(pi);
});
