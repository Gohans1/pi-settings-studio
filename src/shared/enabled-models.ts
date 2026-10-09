// enabledModels edited as a checklist, the way Pi's /scoped-models edits it: an empty list means every
// model; turning one off spells out what is left. Patterns the change does not touch stay as written.

const LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];

/** A pattern and its thinking-level suffix (":high"), which Pi reads off the end. */
function split(pattern: string): [string, string] {
  const colon = pattern.lastIndexOf(":");
  return colon > 0 && LEVELS.includes(pattern.slice(colon + 1)) ? [pattern.slice(0, colon), pattern.slice(colon)] : [pattern, ""];
}

/**
 * enabledModels after turning models on or off. `all` lists provider/modelId of every available model and
 * `selects` what a pattern matches among them; a pattern that names one model exactly needs no lookup.
 */
export function setEnabled(patterns: string[], selects: (pattern: string) => string[], all: string[], refs: string[], on: boolean): string[] {
  const exact = (pattern: string) => all.find(ref => ref.toLowerCase() === split(pattern)[0].toLowerCase());
  const picks = (pattern: string) => { const ref = exact(pattern); return ref ? [ref] : selects(pattern); };
  if (on) {
    if (!patterns.length) return patterns;
    const enabled = new Set(patterns.flatMap(picks));
    const next = [...patterns, ...refs.filter(ref => !enabled.has(ref))];
    // Every available model by name, and nothing else: that is what an empty list says.
    const named = new Set(next.map(exact));
    return next.every(exact) && all.every(ref => named.has(ref)) ? [] : next;
  }
  const off = new Set(refs);
  const next = [...new Set((patterns.length ? patterns : all).flatMap(pattern => {
    const chosen = picks(pattern);
    if (!chosen.some(ref => off.has(ref))) return [pattern];
    if (exact(pattern)) return [];
    const [, level] = split(pattern);
    return chosen.filter(ref => !off.has(ref)).map(ref => ref + level);
  }))];
  // An empty list would turn every model back on.
  return next.length ? next : patterns;
}
