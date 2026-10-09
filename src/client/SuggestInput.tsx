import { useState, type KeyboardEvent } from "react";
import { Autocomplete } from "@base-ui/react/autocomplete";
import type { AvailableModel, ProviderView } from "../shared/models";
import { ComboboxCollection, ComboboxContent, ComboboxEmpty, ComboboxGroup, ComboboxItem, ComboboxLabel, ComboboxList, ComboboxTrigger } from "./components/ui/combobox";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "./components/ui/input-group";

/** A value to suggest, with the name to show beside it; consecutive suggestions of one group are listed under its name. */
export type Suggestion = { value: string; label?: string; group?: string };
type Group = { value: string; items: Suggestion[] };

/** Pi's providers by ID, the set-up ones first. */
export const providerSuggestions = (providers: ProviderView[]): Suggestion[] => [true, false].flatMap(ready => providers
  .filter(provider => provider.auth.configured === ready).map(provider => ({ value: provider.id, label: provider.name, group: ready ? "Set up" : "Not set up" })));

/** provider/modelId of the models of set-up providers, by provider. */
export const modelSuggestions = (models: AvailableModel[]): Suggestion[] =>
  models.map(model => ({ value: `${model.provider}/${model.id}`, label: model.name, group: model.provider }));

/**
 * Free text with suggestions: shadcn's Combobox parts on Base UI's Autocomplete, whose parts they are, since Base UI's
 * Combobox keeps only listed values. Opened by a click or the arrow keys it lists every suggestion, as a Select does;
 * typing narrows it by ID or name. The row is ComboboxInput's, with its trigger named, which ComboboxInput cannot pass on.
 */
export function SuggestInput({ value, suggestions, onChange, ...input }: {
  value: string; suggestions: readonly Suggestion[]; onChange: (value: string) => void;
  id?: string; placeholder?: string; onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
  "aria-label"?: string; "aria-describedby"?: string; "aria-invalid"?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [browsing, setBrowsing] = useState(false);
  const { contains } = Autocomplete.useFilter();
  const groups = suggestions.reduce<Group[]>((list, item) => {
    const last = list.at(-1);
    if (last && last.value === (item.group ?? "")) last.items.push(item); else list.push({ value: item.group ?? "", items: [item] });
    return list;
  }, []);
  const listed = suggestions.length > 0;
  // Without suggestions it stays a plain field: the warnings under it say what the catalog lacks.
  return <Autocomplete.Root items={groups} value={value} open={open && listed} openOnInputClick itemToStringValue={(item: Suggestion) => item.value}
    filter={browsing ? null : (item: Suggestion, query: string) => contains(item.value, query) || (!!item.label && contains(item.label, query))}
    onOpenChange={(next, details) => { setOpen(next && listed); setBrowsing(next && details.reason !== "input-change"); }}
    onValueChange={(next, details) => { if (details.reason === "input-change") setBrowsing(false); onChange(next); }}>
    <InputGroup className="w-full">
      <Autocomplete.Input render={<InputGroupInput />} {...input} spellCheck={false} />
      {listed && <InputGroupAddon align="inline-end">
        <InputGroupButton size="icon-xs" variant="ghost" render={<ComboboxTrigger />} aria-label="Show suggestions" />
      </InputGroupAddon>}
    </InputGroup>
    <ComboboxContent>
      <ComboboxEmpty>Not in the catalog this app reads; kept as typed.</ComboboxEmpty>
      <ComboboxList>{(group: Group) => <ComboboxGroup key={group.value} items={group.items}>
        {group.value && <ComboboxLabel>{group.value}</ComboboxLabel>}
        <ComboboxCollection>{(item: Suggestion) => <ComboboxItem key={item.value} value={item}>
          {item.label ?? item.value}{item.label && item.label !== item.value && <code translate="no" className="muted">{item.value}</code>}
        </ComboboxItem>}</ComboboxCollection>
      </ComboboxGroup>}</ComboboxList>
    </ComboboxContent>
  </Autocomplete.Root>;
}
