import { useId, useState, type FormEvent } from "react";
import type { PackageFilters, PackageView } from "../shared/resources";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "./components/ui/card";
import { Field, FieldGroup, FieldLabel } from "./components/ui/field";
import { Textarea } from "./components/ui/textarea";
import { OptionSelect } from "./OptionSelect";

const choiceOptions = [{ value: "all", label: "Everything the package allows" }, { value: "none", label: "None" }, { value: "only", label: "Only these patterns" }] as const;
const autoloadOptions = [{ value: "default", label: "Default" }, { value: "on", label: "true" }, { value: "off", label: "false: in a project, filter the global package instead of replacing it" }];

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
  const id = useId();
  function submit(event: FormEvent) {
    event.preventDefault();
    const patch: FilterPatch = { autoload: autoload === "default" ? null : autoload === "on" };
    for (const [key] of TYPES) {
      const lines = patterns[key]!.split("\n").map(line => line.trim()).filter(Boolean);
      patch[key] = choices[key] === "all" ? null : choices[key] === "none" ? [] : lines;
    }
    onSave(patch);
  }
  return <form className="mt-1 mb-2 basis-full" aria-label={title} onSubmit={submit}><Card size="sm">
    <CardHeader>
      <CardTitle role="heading" aria-level={3}>{title}</CardTitle>
      <CardDescription>Filters narrow what the package declares; they cannot add resources. Patterns are relative to the package root: globs, <code>!pattern</code> to exclude, <code>+path</code> or <code>-path</code> for one exact file.</CardDescription>
    </CardHeader>
    <CardContent><FieldGroup>
    {TYPES.map(([key, label, singular]) => <Field key={key}>
      <FieldLabel htmlFor={id + key}>{label}</FieldLabel>
      <OptionSelect id={id + key} className="w-full" options={choiceOptions} value={choices[key]!} onChange={choice => setChoices(old => ({ ...old, [key]: choice }))} />
      {choices[key] === "only" && <Textarea aria-label={`${singular} patterns`} className="font-mono" rows={3} spellCheck={false} value={patterns[key]}
        placeholder={`${key}/*`} onChange={event => setPatterns(old => ({ ...old, [key]: event.target.value }))} />}
    </Field>)}
    <Field><FieldLabel htmlFor={id + "autoload"}>Autoload</FieldLabel>
      <OptionSelect id={id + "autoload"} className="w-full" options={autoloadOptions} value={autoload} onChange={setAutoload} /></Field>
    </FieldGroup></CardContent>
    <CardFooter><div className="actions"><Button type="submit" disabled={busy}>Save filters</Button><Button type="button" variant="outline" disabled={busy} onClick={onCancel}>Cancel</Button></div></CardFooter>
  </Card></form>;
}
