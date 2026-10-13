// Model scope (`enabledModels`, `--models`): which models a list of patterns selects, in order.
// Ported from @earendil-works/pi-coding-agent 1.1.0, re-checked against 1.2.0, dist/core/model-resolver.js (MIT, Copyright Mario
// Zechner): `resolveModelScopeFromModels` and its helpers. Pi exports only the variant that checks
// availability, which can run credential commands; this one matches over a given model list.
// tests/model-scope.test.ts compares it with Pi's own resolver.
import { minimatch } from "minimatch";
import { modelsAreEqual, type Api, type Model } from "@earendil-works/pi-ai";

const THINKING = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];
type ScopedModel = { model: Model<Api>; thinkingLevel?: string };
type Diagnostic = { type: "warning"; code: "no-match" | "invalid-thinking-level"; message: string; pattern: string };

/** Ids ending in -latest or without a -YYYYMMDD date are aliases. */
const isAlias = (id: string) => id.endsWith("-latest") || !/-\d{8}$/.test(id);

function exactMatch(reference: string, models: readonly Model<Api>[]): Model<Api> | undefined {
  const trimmed = reference.trim();
  if (!trimmed) return undefined;
  const normalized = trimmed.toLowerCase();
  const canonical = models.filter(model => `${model.provider}/${model.id}`.toLowerCase() === normalized);
  if (canonical.length) return canonical.length === 1 ? canonical[0] : undefined;
  const slash = trimmed.indexOf("/");
  if (slash !== -1) {
    const provider = trimmed.slice(0, slash).trim(), id = trimmed.slice(slash + 1).trim();
    if (provider && id) {
      const matches = models.filter(model => model.provider.toLowerCase() === provider.toLowerCase() && model.id.toLowerCase() === id.toLowerCase());
      if (matches.length) return matches.length === 1 ? matches[0] : undefined;
    }
  }
  const byId = models.filter(model => model.id.toLowerCase() === normalized);
  return byId.length === 1 ? byId[0] : undefined;
}

function tryMatch(pattern: string, models: readonly Model<Api>[]): Model<Api> | undefined {
  const exact = exactMatch(pattern, models);
  if (exact) return exact;
  const needle = pattern.toLowerCase();
  const matches = models.filter(model => model.id.toLowerCase().includes(needle) || model.name?.toLowerCase().includes(needle));
  if (!matches.length) return undefined;
  const aliases = matches.filter(model => isAlias(model.id));
  const pool = aliases.length ? aliases : matches.filter(model => !isAlias(model.id));
  return pool.sort((a, b) => b.id.localeCompare(a.id))[0];
}

function parsePattern(pattern: string, models: readonly Model<Api>[]): { model?: Model<Api>; thinkingLevel?: string; warning?: string } {
  const exact = tryMatch(pattern, models);
  if (exact) return { model: exact };
  const colon = pattern.lastIndexOf(":");
  if (colon === -1) return {};
  const prefix = pattern.slice(0, colon), suffix = pattern.slice(colon + 1);
  const result = parsePattern(prefix, models);
  if (!result.model) return result;
  if (THINKING.includes(suffix)) return { model: result.model, thinkingLevel: result.warning ? undefined : suffix, warning: result.warning };
  return { model: result.model, warning: `Invalid thinking level "${suffix}" in pattern "${pattern}". Using default instead.` };
}

export function resolveModelScope(patterns: string[], models: readonly Model<Api>[]): { scopedModels: ScopedModel[]; diagnostics: Diagnostic[] } {
  const scopedModels: ScopedModel[] = [], diagnostics: Diagnostic[] = [];
  const add = (model: Model<Api>, thinkingLevel?: string) => {
    if (!scopedModels.some(scoped => modelsAreEqual(scoped.model, model))) scopedModels.push({ model, thinkingLevel });
  };
  const noMatch = (pattern: string) => diagnostics.push({ type: "warning", code: "no-match", message: `No models match pattern "${pattern}"`, pattern });
  for (const pattern of patterns) {
    if (pattern.includes("*") || pattern.includes("?") || pattern.includes("[")) {
      const colon = pattern.lastIndexOf(":");
      let glob = pattern, thinkingLevel: string | undefined;
      if (colon !== -1 && THINKING.includes(pattern.slice(colon + 1))) { thinkingLevel = pattern.slice(colon + 1); glob = pattern.slice(0, colon); }
      const exact = exactMatch(glob, models);
      if (exact) { add(exact, thinkingLevel); continue; }
      const matching = models.filter(model => minimatch(`${model.provider}/${model.id}`, glob, { nocase: true }) || minimatch(model.id, glob, { nocase: true }));
      if (!matching.length) { noMatch(pattern); continue; }
      for (const model of matching) add(model, thinkingLevel);
      continue;
    }
    const { model, thinkingLevel, warning } = parsePattern(pattern, models);
    if (warning) diagnostics.push({ type: "warning", code: "invalid-thinking-level", message: warning, pattern });
    if (!model) { noMatch(pattern); continue; }
    add(model, thinkingLevel);
  }
  return { scopedModels, diagnostics };
}
