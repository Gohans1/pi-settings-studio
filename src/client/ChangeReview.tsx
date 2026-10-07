import type { SettingsChange, SettingsView } from "../shared/settings";
import { fields } from "../shared/settings";
import { Button } from "./components/ui/button";

export function ChangeReview({ changes, view, busy, onSave, onBack }: {
  changes: SettingsChange[]; view: SettingsView; busy: boolean;
  onSave: () => void; onBack: () => void;
}) {
  return <section className="review" aria-labelledby="review-heading">
    <h2 id="review-heading" tabIndex={-1} ref={element => { element?.focus(); }}>Review changes</h2>
    <p>Only these keys will change. Other settings stay untouched. A private copy of the previous file is kept beside it.</p>
    <ul className="change-list">{changes.map(change => <li key={change.key}>
      <strong>{fields.find(f => f.key === change.key)?.label}</strong>
      <code>{change.key}</code>
      <span>Before: <code>{JSON.stringify(view.values[change.key]) ?? "Inherited"}</code></span>
      <span>After: <code>{"remove" in change ? "Use inherited value" : JSON.stringify(change.value)}</code></span>
    </li>)}</ul>
    <p className="muted">Target: <code>{view.path}</code></p>
    <div className="actions"><Button variant="outline" onClick={onBack} disabled={busy}>Back to editing</Button>
      <Button onClick={onSave} disabled={busy}>{busy ? "Saving…" : "Save to file"}</Button></div>
  </section>;
}
