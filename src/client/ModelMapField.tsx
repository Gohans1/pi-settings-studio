import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "./components/ui/button";
import { FieldSet } from "./components/ui/field";
import { Input } from "./components/ui/input";
import { OptionSelect } from "./OptionSelect";
import { SuggestInput, type Suggestion } from "./SuggestInput";
import { THINKING_LEVELS } from "../shared/thinking";

type Row = { model: string; level: string; reserve: string; recent: string; extra: Record<string, unknown> };
/** Thinking levels for a select: those the model offers when known, and the chosen one in any case. */
export function levelOptions(offered: readonly string[] | undefined, chosen: string) {
  return THINKING_LEVELS.filter(level => !offered || offered.includes(level) || level === chosen)
    .map(level => ({ value: level as string, label: offered && !offered.includes(level) ? `${level} (not offered)` : level }));
}

function toRows(value: unknown, kind: "thinkingMap" | "compactionMap"): Row[] {
  const entries = value && typeof value === "object" ? Object.entries(value as Record<string, unknown>) : [];
  return entries.map(([model, item]) => {
    if (kind === "thinkingMap") return { model, level: String(item), reserve: "", recent: "", extra: {} };
    const { reserveTokens, keepRecentTokens, ...extra } = (item ?? {}) as Record<string, unknown>;
    return { model, level: "", reserve: reserveTokens === undefined ? "" : String(reserveTokens), recent: keepRecentTokens === undefined ? "" : String(keepRecentTokens), extra };
  });
}

function toValue(rows: Row[], kind: "thinkingMap" | "compactionMap"): Record<string, unknown> | undefined {
  const kept = rows.filter(row => row.model.trim());
  if (!kept.length) return undefined;
  return Object.fromEntries(kept.map(row => [row.model.trim(), kind === "thinkingMap" ? row.level
    : { ...(row.reserve ? { reserveTokens: Number(row.reserve) } : {}), ...(row.recent ? { keepRecentTokens: Number(row.recent) } : {}), ...row.extra }]));
}

/**
 * Per-model settings keyed by provider/modelId, edited as rows, with Pi's catalog as `suggestions`; `levels` gives
 * the thinking levels a model offers, where the catalog knows it.
 */
export function ModelMapField({ kind, label, value, disabled, suggestions, levels, onChange }: {
  kind: "thinkingMap" | "compactionMap"; label: string; value: unknown; disabled?: boolean; suggestions: readonly Suggestion[];
  levels?: (model: string) => readonly string[] | undefined; onChange: (value: unknown) => void;
}) {
  const [rows, setRows] = useState(() => toRows(value, kind));
  // Follow outside changes (reload, reset) without fighting the rows being typed.
  useEffect(() => {
    if (JSON.stringify(toValue(rows, kind) ?? null) !== JSON.stringify(value ?? null)) setRows(toRows(value, kind));
  }, [value]);
  const update = (next: Row[]) => { setRows(next); onChange(toValue(next, kind)); };
  const set = (index: number, patch: Partial<Row>) => update(rows.map((row, i) => i === index ? { ...row, ...patch } : row));
  return <FieldSet aria-label={label} disabled={disabled}>
    {rows.map((row, index) => <div className="model-map-row" key={index}>
      <SuggestInput aria-label={`Model ${index + 1}`} value={row.model} placeholder="provider/modelId" suggestions={suggestions} onChange={model => set(index, { model })} />
      {kind === "thinkingMap"
        ? <OptionSelect aria-label={`Thinking level for model ${index + 1}`} options={levelOptions(levels?.(row.model.trim()), row.level)} value={row.level} disabled={disabled} onChange={level => set(index, { level })} />
        : <>
          <Input aria-label={`Reserved tokens for model ${index + 1}`} type="number" min={0} className="w-28" value={row.reserve} placeholder="Reserved" onChange={e => set(index, { reserve: e.target.value })} />
          <Input aria-label={`Recent tokens kept for model ${index + 1}`} type="number" min={0} className="w-28" value={row.recent} placeholder="Recent kept" onChange={e => set(index, { recent: e.target.value })} />
        </>}
      <Button type="button" variant="ghost" size="icon" aria-label={`Remove model ${row.model || index + 1}`} onClick={() => update(rows.filter((_, i) => i !== index))}><X aria-hidden="true" /></Button>
    </div>)}
    <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => update([...rows, { model: "", level: "high", reserve: "", recent: "", extra: {} }])}>Add model</Button>
  </FieldSet>;
}
