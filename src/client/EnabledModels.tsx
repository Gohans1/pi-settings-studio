import { Fragment, useId, useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import type { AvailableModel, ModelScopeView, ProviderView } from "../shared/models";
import { selected, setEnabled } from "../shared/enabled-models";
import { Button } from "./components/ui/button";
import { Checkbox } from "./components/ui/checkbox";
import { Field, FieldDescription, FieldLabel, FieldLegend, FieldSet } from "./components/ui/field";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemSeparator, ItemTitle } from "./components/ui/item";
import { ScrollArea } from "./components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "./components/ui/tooltip";
import { Disclosure } from "./Disclosure";
import { SearchField } from "./SearchField";
import { modelSuggestions, SuggestInput } from "./SuggestInput";
import { IconButton } from "./Workbench";

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
const misses = {
  "no-credential": "No credential for this provider here, so Pi skips it",
  "unknown-provider": "Pi has no provider by this name here, in its catalog or from an enabled extension",
  "no-match": "No model matches",
};
const refOf = (model: AvailableModel) => `${model.provider}/${model.id}`;

/**
 * enabledModels as Pi's /scoped-models shows it: the models of providers that are set up, ticked by provider,
 * then the patterns behind the ticks. Ticking writes exact names; a glob is spelled out only when a model it
 * selects is turned off (shared/enabled-models.ts).
 */
export function EnabledModels({ patterns, scope, available, providers, inherited, onChange }: {
  patterns: string[]; scope?: ModelScopeView; available: AvailableModel[]; providers: Pick<ProviderView, "id" | "name">[]; inherited?: string[];
  onChange: (patterns: string[]) => void;
}) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const [text, setText] = useState("");
  // In a project without a list of its own the global one is in effect, and a change starts from it.
  const base = patterns.length ? patterns : inherited ?? [];
  const all = available.map(refOf);
  const selects = (pattern: string) => scope?.patterns.find(entry => entry.pattern === pattern)?.models ?? [];
  const on = selected(base, selects, all);
  const turn = (refs: string[], value: boolean) => onChange(setEnabled(base, selects, all, refs, value));
  const needle = query.trim().toLowerCase();
  const groups = [...new Set(available.map(model => model.provider))].map(provider => available.filter(model => model.provider === provider)).map(models => ({
    provider: models[0]!.provider, name: providers.find(entry => entry.id === models[0]!.provider)?.name ?? models[0]!.provider, models,
    shown: models.filter(model => !needle || `${model.name} ${model.id}`.toLowerCase().includes(needle)),
  })).filter(group => group.shown.length);
  function add() {
    const pattern = text.trim();
    if (pattern && !patterns.includes(pattern)) onChange([...patterns, pattern]);
    setText("");
  }
  // Enter adds the pattern here instead of submitting the whole form; on a highlighted suggestion it fills that in first.
  const onKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && !event.currentTarget.hasAttribute("aria-activedescendant")) { event.preventDefault(); add(); }
  };
  const matched = (pattern: string) => scope?.patterns.find(entry => entry.pattern === pattern);
  return <FieldSet>
    <FieldLegend variant="label">Enabled models</FieldLegend>
    <FieldDescription>Models for startup selection and Ctrl+P cycling. {base.length ? `${on.size} of ${plural(all.length, "model", "models")} with a credential.`
      : `Every model with a credential (${all.length}).`}{!patterns.length && inherited?.length ? " The global list applies here." : ""}</FieldDescription>
    {available.length > 0 && <div className="model-checklist">
      <SearchField label="Search enabled models" placeholder="Search models…" shortcut={false} value={query} onChange={setQuery} />
      <ScrollArea className="flex max-h-96 flex-col"><ul>{groups.map(group => {
        const count = group.models.filter(model => on.has(refOf(model))).length;
        return <li key={group.provider} className="model-group">
          <Checkbox aria-label={`All ${group.name} models`} checked={count === group.models.length} onCheckedChange={value => turn(group.models.map(refOf), value)} />
          <Disclosure label={<>{group.name}<span className="muted">{count} of {group.models.length}</span></>} open={!!needle || open.has(group.provider)}
            onOpenChange={next => setOpen(current => { const set = new Set(current); if (next) set.add(group.provider); else set.delete(group.provider); return set; })}>
            <ul>{group.shown.map(model => <li key={model.id}><Field orientation="horizontal">
              <Checkbox id={`${id}-${refOf(model)}`} checked={on.has(refOf(model))} onCheckedChange={value => turn([refOf(model)], value)} />
              <FieldLabel htmlFor={`${id}-${refOf(model)}`} className="flex-wrap">{model.name}<code translate="no" className="muted">{model.id}</code></FieldLabel>
            </Field></li>)}</ul>
          </Disclosure>
        </li>;
      })}</ul></ScrollArea>
      {!groups.length && <p className="muted">No models match “{query.trim()}”.</p>}
    </div>}
    <FieldSet>
      <FieldLegend variant="label">Patterns</FieldLegend>
      {patterns.length ? <ItemGroup>{patterns.map((pattern, index) => {
        const match = matched(pattern);
        const count = match && (match.matches ? plural(match.matches, "model", "models") : misses[match.reason ?? "no-match"]);
        return <Fragment key={pattern}>{index > 0 && <ItemSeparator aria-hidden="true" />}<Item size="xs" role="listitem">
          <ItemContent>
            <ItemTitle><code translate="no">{pattern}</code></ItemTitle>
            <ItemDescription>{match?.models.length
              ? <Tooltip><TooltipTrigger render={<span />}>{count}</TooltipTrigger><TooltipContent>{match.models.slice(0, 3).join(", ")}</TooltipContent></Tooltip>
              : count}</ItemDescription>
          </ItemContent>
          <ItemActions><IconButton type="button" label={`Remove ${pattern}`} onClick={() => onChange(patterns.filter(entry => entry !== pattern))}><X aria-hidden="true" /></IconButton></ItemActions>
        </Item></Fragment>;
      })}</ItemGroup> : <FieldDescription>{inherited?.length ? `None here, so the global list applies: ${inherited.join(", ")}.` : "None: every model that has a credential."}</FieldDescription>}
      <div className="pattern-add">
        <SuggestInput aria-label="Model or pattern" value={text} placeholder="anthropic/* or provider/model" suggestions={modelSuggestions(available)} onChange={setText} onKeyDown={onKey} />
        <Button type="button" variant="outline" onClick={add}>Add</Button>
      </div>
      <FieldDescription>Pi's --models format: anthropic/* or *sonnet* selects several, and :high adds a thinking level. Ticking a model adds its exact name.</FieldDescription>
    </FieldSet>
  </FieldSet>;
}
