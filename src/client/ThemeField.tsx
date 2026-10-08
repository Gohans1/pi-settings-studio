import { useEffect, useState } from "react";
import type { ThemeView } from "../shared/themes";
import { loadThemes } from "./api";

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
    return <option key={name} value={name}>{name}{theme ? ` (${theme.source}${theme.appearance ? `, ${theme.appearance}` : ""})` : " (not found)"}</option>;
  });
  const setMode = (next: Mode) => onChange(next === "system" ? "system" : next === "single" ? (mode === "single" ? text : "dark") : `${light}/${dark}`);
  return <fieldset className="theme-field" aria-label="Theme" disabled={disabled}>
    <select aria-label="Theme mode" value={mode} onChange={event => setMode(event.target.value as Mode)}>
      <option value="system">System: follow the terminal</option>
      <option value="single">One theme</option>
      <option value="pair">A light and a dark theme</option>
    </select>
    {mode === "single" && <select aria-label="Theme name" value={text} onChange={event => onChange(event.target.value)}>{options(text)}</select>}
    {mode === "pair" && <>
      <label>Light terminals<select aria-label="Light terminal theme" value={light} onChange={event => onChange(`${event.target.value}/${dark}`)}>{options(light)}</select></label>
      <label>Dark terminals<select aria-label="Dark terminal theme" value={dark} onChange={event => onChange(`${light}/${event.target.value}`)}>{options(dark)}</select></label>
    </>}
    {themes.filter(theme => theme.error).map(theme => <p key={theme.path} className="field-error">{theme.name}: {theme.error}</p>)}
  </fieldset>;
}
