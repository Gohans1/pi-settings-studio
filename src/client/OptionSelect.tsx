import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "./components/ui/select";

export type Option<Value> = { value: Value; label: string };

/**
 * A shadcn Select built from labelled options; the trigger shows the chosen option's label. Label it with
 * aria-label, or with a FieldLabel whose htmlFor is this id.
 */
export function OptionSelect<Value>({ options, value, onChange, placeholder, disabled, id, className, ...aria }: {
  options: readonly Option<Value>[]; value: Value | null; onChange: (value: Value) => void; placeholder?: string;
  disabled?: boolean; id?: string; className?: string;
  "aria-label"?: string; "aria-describedby"?: string; "aria-invalid"?: boolean;
}) {
  return <Select items={options} value={value} onValueChange={next => { if (next !== null) onChange(next); }} disabled={disabled}>
    <SelectTrigger id={id} className={className} {...aria}><SelectValue placeholder={placeholder} /></SelectTrigger>
    <SelectContent><SelectGroup>{options.map(option => <SelectItem key={JSON.stringify(option.value)} value={option.value}>{option.label}</SelectItem>)}</SelectGroup></SelectContent>
  </Select>;
}
