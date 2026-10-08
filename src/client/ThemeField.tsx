import { useEffect, useState } from "react";
import type { ThemeView } from "../shared/themes";
import { loadThemes } from "./api";
import { Field, FieldError, FieldLabel, FieldSet } from "./components/ui/field";
import { OptionSelect } from "./OptionSelect";

const modes: { value: Mode; label: string }[] = [
  { value: "system", label: "System: follow the terminal" }, { value: "single", label: "One theme" }, { value: "pair", label: "A light and a dark theme" },
];

type Mode = "system" | "single" | "pair";
const modeOf = (value: string) => value === "system" || !value ? "system" : value.includes("/") ? "pair" : "single";

/** Pi's theme setting: "system", one theme name, or "light/dark" names (docs/themes.md). */
export function ThemeField({ value, project, disabled, onChange }: { value: unknown; project?: string; disabled?: boolean; onChange: (value: string) => void }) {
  const [themes, setThemes] = useState<ThemeView[]>([]);
  useEffect(() => { loadThemes(project).then(setThemes).catch(() => setThemes([])); }, [project]);
  const text = typeof value === "string" ? value : "system";
  const mode = modeOf(text);
  const [light = "light", dark = "dark"] = mode === "pair" ? text.split("/") : [];
  const names = themes.filter(theme => !theme.error).map(theme => theme.name);
  const options = (current: string) => [...new Set([current, ...names])].filter(Boolean).map(name => {
    const theme = themes.find(entry => entry.name === name);
    return { value: name, label: `${name}${theme ? ` (${theme.source}${theme.appearance ? `, ${theme.appearance}` : ""})` : " (not found)"}` };
  });
  const setMode = (next: Mode) => onChange(next === "system" ? "system" : next === "single" ? (mode === "single" ? text : "dark") : `${light}/${dark}`);
  return <FieldSet className="gap-2" aria-label="Theme" disabled={disabled}>
    <OptionSelect aria-label="Theme mode" className="w-full" options={modes} value={mode} disabled={disabled} onChange={setMode} />
    {mode === "single" && <OptionSelect aria-label="Theme name" className="w-full" options={options(text)} value={text} disabled={disabled} onChange={onChange} />}
    {mode === "pair" && <>
      <Field className="gap-1"><FieldLabel htmlFor="theme-light">Light terminals</FieldLabel>
        <OptionSelect id="theme-light" className="w-full" options={options(light)} value={light} disabled={disabled} onChange={name => onChange(`${name}/${dark}`)} /></Field>
      <Field className="gap-1"><FieldLabel htmlFor="theme-dark">Dark terminals</FieldLabel>
        <OptionSelect id="theme-dark" className="w-full" options={options(dark)} value={dark} disabled={disabled} onChange={name => onChange(`${light}/${name}`)} /></Field>
    </>}
    {themes.filter(theme => theme.error).map(theme => <FieldError key={theme.path}>{theme.name}: {theme.error}</FieldError>)}
  </FieldSet>;
}
