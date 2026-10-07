import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "./components/ui/button";

type Row = { model: string; level: string; reserve: string; recent: string; extra: Record<string, unknown> };
const LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];

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
  return <fieldset className="model-map" aria-label={label} disabled={disabled}>
    {rows.map((row, index) => <div className="model-map-row" key={index}>
      <input aria-label={`Model ${index + 1}`} list="model-ids" value={row.model} placeholder="provider/modelId" spellCheck={false} autoComplete="off"
        onChange={e => set(index, { model: e.target.value })} />
      {kind === "thinkingMap"
        ? <select aria-label={`Thinking level for model ${index + 1}`} value={row.level} onChange={e => set(index, { level: e.target.value })}>
          {LEVELS.map(level => <option key={level} value={level}>{level}</option>)}</select>
        : <>
          <input aria-label={`Reserved tokens for model ${index + 1}`} type="number" min={0} value={row.reserve} placeholder="Reserved" onChange={e => set(index, { reserve: e.target.value })} />
          <input aria-label={`Recent tokens kept for model ${index + 1}`} type="number" min={0} value={row.recent} placeholder="Recent kept" onChange={e => set(index, { recent: e.target.value })} />
        </>}
      <Button type="button" variant="ghost" size="icon" aria-label={`Remove model ${row.model || index + 1}`} onClick={() => update(rows.filter((_, i) => i !== index))}><X aria-hidden="true" /></Button>
    </div>)}
    <Button type="button" variant="outline" size="sm" onClick={() => update([...rows, { model: "", level: "high", reserve: "", recent: "", extra: {} }])}>Add model</Button>
  </fieldset>;
}
