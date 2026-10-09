// Thinking levels as Pi names and orders them. clampLevel is ported from @earendil-works/pi-ai 1.1.0
// dist/models.js clampThinkingLevel (MIT, Copyright Mario Zechner) to work on a model's supported levels,
// which the browser has; tests/thinking.test.ts compares it with Pi's for every model and level.

export const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;

/** The level Pi starts a model at: the one asked for when the model offers it, else the next one up, else down. */
export function clampLevel(supported: readonly string[], level: string): string {
  if (supported.includes(level)) return level;
  const asked = THINKING_LEVELS.indexOf(level as typeof THINKING_LEVELS[number]);
  if (asked === -1) return supported[0] ?? "off";
  return THINKING_LEVELS.slice(asked + 1).find(candidate => supported.includes(candidate))
    ?? THINKING_LEVELS.slice(0, asked).reverse().find(candidate => supported.includes(candidate))
    ?? supported[0] ?? "off";
}
