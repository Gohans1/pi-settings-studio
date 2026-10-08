import { useId } from "react";
import { cn } from "cn";
import { Field, FieldLabel, FieldLegend, FieldSet } from "./components/ui/field";
import { RadioGroup, RadioGroupItem } from "./components/ui/radio-group";

export type Scope = "global" | "project";

/** Which file a page edits when a project is chosen: the global one or the project's own. */
export function ScopeChoice({ value, globalLabel, disabled, onChange, className }: {
  value: Scope; globalLabel: string; disabled?: boolean; onChange: (scope: Scope) => void; className?: string;
}) {
  const id = useId();
  const choices: [Scope, string][] = [["global", globalLabel], ["project", "This project"]];
  return <FieldSet className={cn("flex-row flex-wrap items-center", className)}>
    <FieldLegend id={id} variant="label" className="float-start mb-0">Edit</FieldLegend>
    <RadioGroup aria-labelledby={id} value={value} disabled={disabled} onValueChange={next => onChange(next as Scope)} className="flex flex-1 flex-wrap">
      {choices.map(([scope, label]) => <Field key={scope} orientation="horizontal" className="w-auto">
        <RadioGroupItem id={id + scope} value={scope} /><FieldLabel htmlFor={id + scope}>{label}</FieldLabel>
      </Field>)}
    </RadioGroup>
  </FieldSet>;
}
