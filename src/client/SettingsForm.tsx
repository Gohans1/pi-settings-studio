import { Fragment, useState } from "react";
import { defaultText, fields, fileChange, isPiDefault, type Field, type SettingsChange, type SettingsView } from "../shared/settings";
import { SettingField } from "./SettingField";
import type { Suggestion } from "./SuggestInput";
import { Button } from "./components/ui/button";
import { FieldGroup, FieldSeparator } from "./components/ui/field";
import { Spinner } from "./components/ui/spinner";

const fieldOf = (key: string) => fields.find(field => field.key === key)!;

/** Moves focus to a setting's control, as Save does for a value Pi would refuse. */
export function focusSetting(key: string) {
  document.getElementById("row-" + key)?.querySelector<HTMLElement>("[data-slot=input], [data-slot=input-group-control], [data-slot=textarea], [data-slot=select-trigger], [data-slot=switch]")?.focus();
}

/**
 * Draft edits of settings.json fields over the file as last read, and their rows. What Save writes: each draft
 * edit as an edit of the file (VS Code's way: shared/settings.ts fileChange), and nothing for an edit that comes
 * to no change.
 */
export function useSettingDraft(view: SettingsView | undefined, { project, models, onEdit }: {
  project?: string; models?: readonly Suggestion[]; onEdit?: () => void;
} = {}) {
  const [draft, setDraft] = useState<Record<string, SettingsChange>>({});
  const scope = view?.scope ?? "global";
  const inFile = (key: string) => !!view && (Object.hasOwn(view.values, key) || view.invalid.includes(key));
  const changes = Object.values(draft).flatMap(change => {
    const parsed = "value" in change ? fieldOf(change.key).schema.safeParse(change.value) : undefined;
    const written = fileChange(fieldOf(change.key), parsed?.success ? { key: change.key, value: parsed.data } : change, scope, inFile(change.key));
    return written ? [written] : [];
  });
  const invalidKeys = changes.filter(change => "value" in change && !fieldOf(change.key).schema.safeParse(change.value).success).map(change => change.key);
  const unsaved = (key: string) => changes.some(change => change.key === key);
  const valueOf = (key: string) => {
    const edit = draft[key];
    return edit ? ("value" in edit ? edit.value : undefined) : view?.values[key];
  };

  function change(key: string, value: unknown) {
    onEdit?.();
    setDraft(current => {
      const next = { ...current };
      if (JSON.stringify(view?.values[key]) === JSON.stringify(value)) delete next[key];
      else next[key] = { key, value };
      return next;
    });
  }
  function reset(key: string) {
    setDraft(current => {
      const next = { ...current };
      if (view && Object.hasOwn(view.values, key)) next[key] = { key, remove: true };
      else delete next[key];
      return next;
    });
    onEdit?.();
  }
  const row = (field: Field) => {
    if (!view) return null;
    const edit = draft[field.key];
    const overridden = edit ? "value" in edit : Object.hasOwn(view.values, field.key);
    const value = edit ? "value" in edit ? edit.value : view.inherited[field.key] : view.values[field.key] ?? view.inherited[field.key];
    return <SettingField key={field.key} field={field} value={value} inherited={view.inherited[field.key]} overridden={overridden} scope={scope} project={project} models={models}
      disabled={scope === "project" && !!field.globalOnly}
      invalid={invalidKeys.includes(field.key) || (!edit && view.invalid.includes(field.key))}
      piDefault={defaultText(field, view.defaults, key => valueOf(key) ?? view.inherited[key])}
      isDefault={isPiDefault(field, valueOf(field.key))} unsaved={unsaved(field.key)}
      onChange={value => change(field.key, value)} onReset={() => reset(field.key)} />;
  };
  const rows = (list: Field[]) => <FieldGroup>{list.map((field, index) => <Fragment key={field.key}>{index > 0 && <FieldSeparator />}{row(field)}</Fragment>)}</FieldGroup>;
  return { changes, invalidKeys, unsaved, valueOf, rows, discard: () => setDraft({}) };
}

/** Unsaved edits: a bar that stays at the bottom of the pane, with Discard and Save. */
export function SaveBar({ count, busy, onDiscard, onSave }: { count: number; busy: boolean; onDiscard: () => void; onSave: () => void }) {
  return <div className="save-bar" role="region" aria-label="Unsaved changes">
    <p>{count} unsaved {count === 1 ? "change" : "changes"}</p>
    <div className="actions">
      <Button variant="outline" disabled={busy} onClick={onDiscard}>Discard</Button>
      <Button disabled={busy} onClick={onSave}>{busy && <Spinner data-icon="inline-start" aria-hidden="true" />}{busy ? "Saving…" : "Save"}</Button>
    </div>
  </div>;
}
