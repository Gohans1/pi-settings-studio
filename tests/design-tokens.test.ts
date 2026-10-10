import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Guardrails for the design system in src/client: Flexoki primitives -> semantic tokens -> components.
// components/ui holds shadcn's registry code as installed, so these checks read the app's own CSS.
const read = (path: string) => readFileSync(resolve(import.meta.dir, "..", path), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const palette = read("src/client/flexoki.css");
const styles = read("src/client/styles.css");

type Declaration = { selector: string; property: string; value: string };
// Innermost `selector { declarations }` blocks; an enclosing @media prelude never reaches the selector.
function declarations(css: string): Declaration[] {
  const found: Declaration[] = [];
  for (const block of css.matchAll(/(?<selector>[^{}]+)\{(?<body>[^{}]*)\}/g)) {
    const { body = "" } = block.groups ?? {};
    // Statements such as @import end with ";" and are not part of the selector that follows them.
    const selector = (block.groups?.selector ?? "").split(";").pop()!.trim();
    for (const part of body.split(";")) {
      const { property, value } = part.match(/^\s*(?<property>[\w-]+)\s*:\s*(?<value>[\s\S]+?)\s*$/)?.groups ?? {};
      if (property && value) found.push({ selector, property, value });
    }
  }
  return found;
}
const tokens = new Map(declarations(palette + styles).filter((d) => d.property.startsWith("--")).map((d) => [d.property, d.value]));

function hex(token: string, scheme: "light" | "dark"): string {
  const value = tokens.get(token);
  if (value === undefined) throw new Error(`${token} is not defined`);
  const side = value.match(/^light-dark\(\s*(?<light>.+?)\s*,\s*(?<dark>.+?)\s*\)$/)?.groups?.[scheme] ?? value;
  const alias = side.match(/^var\((?<name>--[\w-]+)\)$/)?.groups?.name;
  if (alias) return hex(alias, scheme);
  if (!/^#[0-9a-f]{6}$/i.test(side)) throw new Error(`${token} resolves to ${side}, not a colour`);
  return side;
}
function luminance(color: string) {
  const channel = (at: number) => {
    const c = parseInt(color.slice(at, at + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}
function contrast(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

describe("colour system", () => {
  test("colours exist only as Flexoki primitives in flexoki.css", () => {
    const literal = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch)\(/i;
    expect(styles.split("\n").filter((line) => literal.test(line))).toEqual([]);
    expect(declarations(palette).every((d) => /^--flexoki-[\w-]+$/.test(d.property) && /^#[0-9a-f]{6}$/i.test(d.value))).toBe(true);
  });

  test("only semantic tokens read Flexoki primitives", () => {
    const readers = declarations(styles).filter((d) => d.value.includes("--flexoki-"));
    expect(readers.length).toBeGreaterThan(0);
    expect(readers.filter((d) => d.selector !== ":root" || !d.property.startsWith("--"))).toEqual([]);
  });

  test("every semantic colour has a light and a dark value", () => {
    const semantic = declarations(styles).filter((d) => d.selector === ":root" && d.value.includes("--flexoki-"));
    for (const d of semantic) expect({ token: d.property, value: d.value }).toMatchObject({ value: expect.stringMatching(/^light-dark\(/) });
    expect(semantic.length).toBeGreaterThan(10);
  });

  test("light and dark follow the OS through one mechanism", () => {
    expect(declarations(styles)).toContainEqual({ selector: ":root", property: "color-scheme", value: "light dark" });
    // Nothing sets a .dark class, so a class-based dark variant would silently disable every dark: utility.
    expect(styles).not.toMatch(/@custom-variant\s+dark\b/);
    expect(styles).not.toMatch(/prefers-color-scheme/);
  });

  test("every custom property the styles read is defined", () => {
    const tailwind = readFileSync(resolve(import.meta.dir, "../node_modules/tailwindcss/theme.css"), "utf8");
    const defined = new Set([...tokens.keys(), ...[...tailwind.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1])]);
    const used = [...new Set([...styles.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]))];
    expect(used.filter((name) => !defined.has(name))).toEqual([]);
  });

  // [foreground, background, minimum WCAG 2 ratio]: 4.5 for text, 3 for focus rings and control boundaries.
  const pairs: [string, string, number][] = [
    ["--foreground", "--background", 4.5], ["--foreground", "--sidebar", 4.5], ["--foreground", "--muted", 4.5],
    ["--muted-foreground", "--background", 4.5], ["--muted-foreground", "--sidebar", 4.5], ["--muted-foreground", "--muted", 4.5],
    ["--muted-foreground", "--secondary", 4.5],
    ["--primary-foreground", "--primary", 4.5], ["--secondary-foreground", "--secondary", 4.5],
    // shadcn's surfaces: callouts on --card, menu and select highlights on --accent, floating layers on --popover.
    ["--card-foreground", "--card", 4.5], ["--muted-foreground", "--card", 4.5], ["--destructive", "--card", 4.5],
    ["--accent-foreground", "--accent", 4.5], ["--popover-foreground", "--popover", 4.5],
    ["--destructive", "--background", 4.5], ["--destructive", "--secondary", 4.5],
    ["--ring", "--background", 3], ["--ring", "--sidebar", 3],
    ["--input", "--background", 3], ["--input", "--sidebar", 3], ["--warning", "--background", 3],
    // The ready mark is an icon beside its words: 3:1 on the list pane, its hovered and chosen rows and the detail pane.
    ["--success", "--sidebar", 3], ["--success", "--muted", 3], ["--success", "--selected", 3], ["--success", "--background", 3],
    // The selected list row and floating layers (menus) keep body and muted text readable.
    ["--foreground", "--selected", 4.5], ["--muted-foreground", "--selected", 4.5],
    ["--foreground", "--popover", 4.5], ["--muted-foreground", "--popover", 4.5],
    ["--foreground", "--secondary", 4.5],
  ];
  for (const scheme of ["light", "dark"] as const) {
    test.each(pairs)(`${scheme}: %s on %s meets %d:1`, (fg, bg, minimum) => {
      expect(contrast(hex(fg, scheme), hex(bg, scheme))).toBeGreaterThanOrEqual(minimum);
    });
  }

  // shadcn's Button hovers with bg-primary/80: the primary colour at 80% over whatever is behind it.
  const over = (top: string, under: string, alpha: number) => "#" + [1, 3, 5].map((at) =>
    Math.round(alpha * parseInt(top.slice(at, at + 2), 16) + (1 - alpha) * parseInt(under.slice(at, at + 2), 16)).toString(16).padStart(2, "0")).join("");
  for (const scheme of ["light", "dark"] as const) {
    test.each(["--background", "--card", "--sidebar"])(`${scheme}: a hovered primary button on %s keeps 4.5:1`, (under) => {
      const hovered = over(hex("--primary", scheme), hex(under, scheme), 0.8);
      expect(contrast(hex("--primary-foreground", scheme), hovered)).toBeGreaterThanOrEqual(4.5);
    });
  }

  // shadcn marks the hovered or keyboard-highlighted row of a menu, select or combobox with --accent alone, and a
  // hovered ghost button (a toast's close among them) and an AlertDialog's footer with --muted. Where one matches the
  // surface under it, the pointer and the keyboard leave no trace. Every colour is a Flexoki step, so differing is
  // at least one step.
  const highlights: [string, string][] = [
    ["--accent", "--popover"],
    ["--muted", "--background"], ["--muted", "--sidebar"], ["--muted", "--card"], ["--muted", "--popover"],
  ];
  for (const scheme of ["light", "dark"] as const) {
    test.each(highlights)(`${scheme}: %s stands out from %s`, (highlight, surface) => {
      expect(hex(highlight, scheme)).not.toBe(hex(surface, scheme));
    });
  }
});

describe("typography", () => {
  const rules = declarations(styles);

  test("font sizes come from the type scale", () => {
    const sizes = rules.filter((d) => d.property === "font-size" || d.property === "font");
    expect(sizes.length).toBeGreaterThan(0);
    expect(sizes.filter((d) => d.value !== "inherit" && !d.value.includes("var(--text-"))).toEqual([]);
  });

  test("font weights and families come from tokens", () => {
    expect(rules.filter((d) => d.property === "font-weight" && !/^var\(--font-weight-[a-z]+\)$/.test(d.value))).toEqual([]);
    expect(rules.filter((d) => /system-ui|monospace|sans-serif/.test(d.value))).toEqual([]);
  });

  test("the scale descends from page title to caption", () => {
    const steps = ["display", "heading", "title", "body", "small", "caption"].map((step) => tokens.get(`--text-${step}`));
    const rem = steps.map((value) => Number(value?.match(/^([\d.]+)rem$/)?.[1]));
    expect(rem.every((size, i) => size > 0 && (i === 0 || size < (rem[i - 1] ?? 0)))).toBe(true);
  });
});

describe("space and shape", () => {
  const rules = declarations(styles);
  // Everything a length can be built from once the scale's own expressions are taken out.
  const raw = (value: string) => value.replace(/--spacing\([\d.]+\)|var\(--[\w-]+\)/g, "").match(/\d*\.?\d+(?:px|rem|em)\b/g);

  test("padding, margins and gaps come from the spacing scale", () => {
    const spacing = rules.filter((d) => /^(padding|margin|gap|row-gap|column-gap|scroll-margin)(-[a-z-]+)?$/.test(d.property));
    expect(spacing.length).toBeGreaterThan(50);
    expect(spacing.filter((d) => raw(d.value))).toEqual([]);
  });

  test("corners come from the radius scale", () => {
    expect(rules.filter((d) => d.property === "border-radius" && !/^var\(--radius(-[a-z]+)?\)$|^calc\(infinity \* 1px\)$/.test(d.value))).toEqual([]);
  });

  test("controls share one height and sticky offsets share the header's", () => {
    expect(rules.filter((d) => d.property === "min-height" && d.value === "40px")).toEqual([]);
    expect(rules.filter((d) => /(?<![\d.])(128|148|60)px/.test(d.value))).toEqual([]);
  });
});

describe("cascade and motion", () => {
  test("only the reduced-motion override uses !important", () => {
    const outsideReducedMotion = styles.replace(/@media \(prefers-reduced-motion: reduce\) \{[^\n]*\}\s*\}/, "");
    expect(outsideReducedMotion.split("\n").filter((line) => line.includes("!important"))).toEqual([]);
  });

  test("transitions name the properties they animate", () => {
    expect(declarations(styles).filter((d) => /^transition(-property)?$/.test(d.property) && /\ball\b/.test(d.value))).toEqual([]);
  });
});

