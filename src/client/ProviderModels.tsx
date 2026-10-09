import { Fragment, useEffect, useState } from "react";
import { CircleAlert } from "lucide-react";
import type { ModelSummary, ProviderView } from "../shared/models";
import { loadModels } from "./api";
import { Alert, AlertDescription } from "./components/ui/alert";
import { Button } from "./components/ui/button";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemSeparator, ItemTitle } from "./components/ui/item";
import { Spinner } from "./components/ui/spinner";
import { SearchField } from "./SearchField";

const tokens = new Intl.NumberFormat("en", { notation: "compact" });
const usd = new Intl.NumberFormat("en", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 3 });

/** What Pi's catalog says of a model, in words: limits, image input, thinking levels, price. */
export function modelFacts(model: ModelSummary): string {
  const levels = model.thinkingLevels.filter(level => level !== "off");
  const thinking = levels.length && `thinking ${model.thinkingLevels[0]}${model.thinkingLevels.length > 1 ? "–" + model.thinkingLevels.at(-1) : ""}`;
  return [
    model.contextWindow && `${tokens.format(model.contextWindow)} context`,
    model.maxTokens && `${tokens.format(model.maxTokens)} output`,
    model.image && "images",
    thinking,
    model.cost && `${usd.format(model.cost.input)} in, ${usd.format(model.cost.output)} out per 1M tokens`,
  ].filter(Boolean).join(" · ");
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** A provider's chat models from Pi's catalog; any of them can be filled in as the default. */
export function ProviderModels({ provider, onUse }: { provider: ProviderView; onUse: (model: ModelSummary) => void }) {
  const [models, setModels] = useState<ModelSummary[]>();
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  useEffect(() => {
    setModels(undefined); setError("");
    loadModels(provider.id).then(setModels).catch(cause => setError(cause instanceof Error ? cause.message : "Could not read the models."));
  }, [provider.id, provider.models]);
  const needle = query.trim().toLowerCase();
  const shown = (models ?? []).filter(model => !needle || `${model.name} ${model.id}`.toLowerCase().includes(needle));
  const { image = 0, classifier = 0 } = provider.otherModels ?? {};
  const others = [image && plural(image, "image", "image"), classifier && plural(classifier, "classifier", "classifier")].filter(Boolean).join(" and ");
  return <section className="provider-models" aria-labelledby="provider-models-title">
    <header><h3 id="provider-models-title">Models</h3>{models && <span>{models.length}</span>}</header>
    {others && <p className="muted">{models?.length ? "Also " : ""}{others} {image + classifier === 1 ? "model" : "models"}, which scripts reach through codemode. Pi does not start a session with {image + classifier === 1 ? "it" : "them"}.</p>}
    {error ? <Alert variant="destructive"><CircleAlert aria-hidden="true" /><AlertDescription>{error}</AlertDescription></Alert>
      : !models ? <div className="loading" aria-busy="true"><Spinner />Reading models…</div>
      : !models.length ? <p className="muted">{others ? "No chat models." : "None in the catalog this app reads. Refresh the model catalogs to look again."}</p>
      : <>
        {models.length > 8 && <SearchField label={`Search ${provider.name} models`} placeholder="Search models…" shortcut={false} value={query} onChange={setQuery} />}
        <ItemGroup>{shown.map((model, index) => <Fragment key={model.id}>{index > 0 && <ItemSeparator aria-hidden="true" />}<Item size="sm" role="listitem">
          <ItemContent>
            <ItemTitle>{model.name}</ItemTitle>
            <ItemDescription><code translate="no">{model.id}</code>{modelFacts(model) && <> · {modelFacts(model)}</>}</ItemDescription>
          </ItemContent>
          <ItemActions><Button variant="outline" size="xs" aria-label={`Use as default model: ${model.name}`} onClick={() => onUse(model)}>Use as default</Button></ItemActions>
        </Item></Fragment>)}</ItemGroup>
        {!shown.length && <p className="muted">No models match “{query.trim()}”.</p>}
      </>}
  </section>;
}
