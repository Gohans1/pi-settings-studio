// Model scope (`enabledModels`, `--models`): which models a list of patterns selects, in order.
// Ported from @earendil-works/pi-coding-agent 1.3.0, dist/core/model-resolver.js (MIT, Copyright Mario
// Zechner): `resolveModelScopeFromModels` and its helpers. Pi exports only the variant that checks
// availability, which can run credential commands; this one matches over a given model list.
// tests/model-scope.test.ts compares it with Pi's own resolver.
import { minimatch } from "minimatch";
import { modelsAreEqual, type Api, type Model } from "@earendil-works/pi-ai";

const THINKING = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];
type ScopedModel = { model: Model<Api>; thinkingLevel?: string };
type Diagnostic = { type: "warning"; code: "no-match" | "invalid-thinking-level" | "ambiguous"; message: string; pattern: string };
/** What a pattern resolves to; ambiguous when the same pick is on several providers, which then all count. */
type Found = { models: Model<Api>[]; ambiguous?: true; thinkingLevel?: string; warning?: string };

/** Ids ending in -latest or without a -YYYYMMDD date are aliases. */
const isAlias = (id: string) => id.endsWith("-latest") || !/-\d{8}$/.test(id);
const providersOf = (models: readonly Model<Api>[]) => new Set(models.map(model => model.provider));
const matching = (text: string, models: readonly Model<Api>[]) =>
  models.filter(model => model.id.toLowerCase().includes(text.toLowerCase()) || model.name?.toLowerCase().includes(text.toLowerCase()));

/** Aliases before dated versions, then the latest. */
function best(models: readonly Model<Api>[]): Model<Api> | undefined {
  const aliases = models.filter(model => isAlias(model.id));
  return [...(aliases.length ? aliases : models)].sort((a, b) => b.id.localeCompare(a.id))[0];
}

function splitThinking(text: string) {
  const colon = text.lastIndexOf(":"), level = text.slice(colon + 1);
  return colon !== -1 && THINKING.includes(level) ? { base: text.slice(0, colon), level } : undefined;
}

/**
 * An exact id, or `provider/rest`, which names its provider but may also be a whole id on another provider
 * (a gateway's `zai/glm-5`). Every model in a scope is usable, so credentials never break a tie: the named
 * provider wins, and the same id on several providers selects each of them.
 */
function reference(text: string, models: readonly Model<Api>[], fuzzy: boolean): Found | undefined {
  const raw = models.filter(model => model.id.toLowerCase() === text.toLowerCase());
  const slash = text.indexOf("/"), prefix = text.slice(0, slash).trim().toLowerCase(), rest = text.slice(slash + 1).trim();
  const provider = slash !== -1 && prefix && rest ? models.find(model => model.provider.toLowerCase() === prefix)?.provider : undefined;
  const own = models.filter(model => model.provider === provider);
  const named = provider && (own.find(model => model.id.toLowerCase() === rest.toLowerCase()) ?? raw.find(model => model.provider === provider)
    ?? (fuzzy ? best(matching(rest, own)) : undefined));
  if (named) return { models: [named] };
  if (!raw.length) return undefined;
  return providersOf(raw).size === 1 ? { models: [raw[0]!] } : { models: raw, ambiguous: true };
}

/** The best fuzzy match; the same id on several providers selects each of them. */
function fuzzy(text: string, models: readonly Model<Api>[]): Found | undefined {
  const found = matching(text, models), pick = best(found);
  if (!pick) return undefined;
  const tied = found.filter(model => model.id === pick.id);
  return providersOf(tied).size === 1 ? { models: [pick] } : { models: tied, ambiguous: true };
}

/** Lenient: fuzzy matches and a `:<thinking>` suffix, an invalid one dropped with a warning. Otherwise exact only. */
function resolve(text: string, models: readonly Model<Api>[], lenient: boolean): Found | undefined {
  const found = reference(text, models, lenient) ?? (lenient ? fuzzy(text, models) : undefined);
  if (found || !lenient) return found;
  const thinking = splitThinking(text);
  if (thinking) {
    const inner = resolve(thinking.base, models, true);
    return inner && { ...inner, thinkingLevel: inner.warning ? undefined : thinking.level };
  }
  const colon = text.lastIndexOf(":");
  if (colon === -1) return undefined;
  const inner = resolve(text.slice(0, colon), models, true);
  return inner && { ...inner, thinkingLevel: undefined, warning: `Invalid thinking level "${text.slice(colon + 1)}" in pattern "${text}". Using default instead.` };
}

const find = (pattern: string, models: readonly Model<Api>[], lenient: boolean) => pattern.trim() ? resolve(pattern.trim(), models, lenient) : undefined;

export function resolveModelScope(patterns: string[], models: readonly Model<Api>[]): { scopedModels: ScopedModel[]; diagnostics: Diagnostic[] } {
  const scopedModels: ScopedModel[] = [], diagnostics: Diagnostic[] = [];
  const add = (model: Model<Api>, thinkingLevel?: string) => {
    if (!scopedModels.some(scoped => modelsAreEqual(scoped.model, model))) scopedModels.push({ model, thinkingLevel });
  };
  const noMatch = (pattern: string) => diagnostics.push({ type: "warning", code: "no-match", message: `No models match pattern "${pattern}"`, pattern });
  const ambiguous = (pattern: string, candidates: Model<Api>[]) => diagnostics.push({ type: "warning", code: "ambiguous", pattern,
    message: `Pattern "${pattern}" matches several providers: ${[...providersOf(candidates)].sort((a, b) => a.localeCompare(b)).join(", ")}. Use provider/id to choose one.` });
  for (const pattern of patterns) {
    if (pattern.includes("*") || pattern.includes("?") || pattern.includes("[")) {
      const thinking = splitThinking(pattern), glob = thinking?.base ?? pattern;
      // Ids such as `bracketed-model[1m]` are not globs
      const exact = find(glob, models, false);
      if (exact?.ambiguous) ambiguous(pattern, exact.models);
      const selected = exact?.models ?? models.filter(model => minimatch(`${model.provider}/${model.id}`, glob, { nocase: true }) || minimatch(model.id, glob, { nocase: true }));
      if (!selected.length) noMatch(pattern);
      for (const model of selected) add(model, thinking?.level);
      continue;
    }
    const found = find(pattern, models, true);
    if (!found) { noMatch(pattern); continue; }
    if (found.warning) diagnostics.push({ type: "warning", code: "invalid-thinking-level", message: found.warning, pattern });
    if (found.ambiguous) ambiguous(pattern, found.models);
    for (const model of found.models) add(model, found.thinkingLevel);
  }
  return { scopedModels, diagnostics };
}
