import { useState, type FormEvent } from "react";
import type { PackageFilters, PackageView } from "../shared/resources";
import { Button } from "./components/ui/button";

const TYPES = [["extensions", "Extensions", "Extension"], ["skills", "Skills", "Skill"], ["prompts", "Prompts", "Prompt"], ["themes", "Themes", "Theme"]] as const;
type Choice = "all" | "none" | "only";
export type FilterPatch = { autoload?: boolean | null } & Partial<Record<(typeof TYPES)[number][0], string[] | null>>;

const choiceOf = (value: string[] | undefined): Choice => value === undefined ? "all" : value.length ? "only" : "none";

/** Pi's package filters (docs/packages.md): omitted loads everything the package allows, [] loads none. */
export function PackageFilterForm({ pkg, busy, onSave, onCancel }: { pkg: PackageView; busy: boolean; onSave: (patch: FilterPatch) => void; onCancel: () => void }) {
  const filters: PackageFilters = pkg.filters;
  const [choices, setChoices] = useState(() => Object.fromEntries(TYPES.map(([key]) => [key, choiceOf(filters[key])])) as Record<string, Choice>);
  const [patterns, setPatterns] = useState(() => Object.fromEntries(TYPES.map(([key]) => [key, (filters[key] ?? []).join("\n")])) as Record<string, string>);
  const [autoload, setAutoload] = useState(filters.autoload === undefined ? "default" : filters.autoload ? "on" : "off");
  const title = `Filters for ${pkg.source}`;
  function submit(event: FormEvent) {
    event.preventDefault();
    const patch: FilterPatch = { autoload: autoload === "default" ? null : autoload === "on" };
    for (const [key] of TYPES) {
      const lines = patterns[key]!.split("\n").map(line => line.trim()).filter(Boolean);
      patch[key] = choices[key] === "all" ? null : choices[key] === "none" ? [] : lines;
    }
    onSave(patch);
  }
  return <form className="package-filters" aria-label={title} onSubmit={submit}>
    <h3>{title}</h3>
    <p className="muted">Filters narrow what the package declares; they cannot add resources. Patterns are relative to the package root: globs, <code>!pattern</code> to exclude, <code>+path</code> or <code>-path</code> for one exact file.</p>
    {TYPES.map(([key, label, singular]) => <div className="filter-row" key={key}>
      <label>{label}<select aria-label={label} value={choices[key]} onChange={event => setChoices(old => ({ ...old, [key]: event.target.value as Choice }))}>
        <option value="all">Everything the package allows</option><option value="none">None</option><option value="only">Only these patterns</option>
      </select></label>
      {choices[key] === "only" && <textarea aria-label={`${singular} patterns`} rows={3} spellCheck={false} value={patterns[key]}
        placeholder={`${key}/*`} onChange={event => setPatterns(old => ({ ...old, [key]: event.target.value }))} />}
    </div>)}
    <label>Autoload<select aria-label="Autoload" value={autoload} onChange={event => setAutoload(event.target.value)}>
      <option value="default">Default</option><option value="on">true</option><option value="off">false: in a project, filter the global package instead of replacing it</option>
    </select></label>
    <div className="actions"><Button type="submit" disabled={busy}>Save filters</Button><Button type="button" variant="outline" disabled={busy} onClick={onCancel}>Cancel</Button></div>
  </form>;
}
