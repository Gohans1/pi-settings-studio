import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "./components/ui/button";
import { FieldSet } from "./components/ui/field";
import { Input } from "./components/ui/input";
import { OptionSelect } from "./OptionSelect";

type Row = { model: string; level: string; reserve: string; recent: string; extra: Record<string, unknown> };
const LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"].map(level => ({ value: level, label: level }));

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

/** Per-model settings keyed by provider/modelId, edited as rows. Model ids come from Pi's catalog as suggestions. */
export function ModelMapField({ kind, label, value, disabled, onChange }: {
  kind: "thinkingMap" | "compactionMap"; label: string; value: unknown; disabled?: boolean; onChange: (value: unknown) => void;
}) {
  const [rows, setRows] = useState(() => toRows(value, kind));
  // Follow outside changes (reload, reset) without fighting the rows being typed.
  useEffect(() => {
    if (JSON.stringify(toValue(rows, kind) ?? null) !== JSON.stringify(value ?? null)) setRows(toRows(value, kind));
  }, [value]);
  const update = (next: Row[]) => { setRows(next); onChange(toValue(next, kind)); };
  const set = (index: number, patch: Partial<Row>) => update(rows.map((row, i) => i === index ? { ...row, ...patch } : row));
  return <FieldSet className="model-map gap-2" aria-label={label} disabled={disabled}>
    {rows.map((row, index) => <div className="model-map-row" key={index}>
      <Input aria-label={`Model ${index + 1}`} list="model-ids" value={row.model} placeholder="provider/modelId" spellCheck={false} autoComplete="off"
        onChange={e => set(index, { model: e.target.value })} />
      {kind === "thinkingMap"
        ? <OptionSelect aria-label={`Thinking level for model ${index + 1}`} options={LEVELS} value={row.level} disabled={disabled} onChange={level => set(index, { level })} />
        : <>
          <Input aria-label={`Reserved tokens for model ${index + 1}`} type="number" min={0} className="w-28" value={row.reserve} placeholder="Reserved" onChange={e => set(index, { reserve: e.target.value })} />
          <Input aria-label={`Recent tokens kept for model ${index + 1}`} type="number" min={0} className="w-28" value={row.recent} placeholder="Recent kept" onChange={e => set(index, { recent: e.target.value })} />
        </>}
      <Button type="button" variant="ghost" size="icon" aria-label={`Remove model ${row.model || index + 1}`} onClick={() => update(rows.filter((_, i) => i !== index))}><X aria-hidden="true" /></Button>
    </div>)}
    <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => update([...rows, { model: "", level: "high", reserve: "", recent: "", extra: {} }])}>Add model</Button>
  </FieldSet>;
}
