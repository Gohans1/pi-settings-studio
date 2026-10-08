import { useState, type FormEvent } from "react";

type Control = HTMLInputElement | HTMLTextAreaElement;
const keyOf = (control: Element) => control.id || control.getAttribute("aria-label") || "";

/**
 * The browser's own checks (required, pattern, min, maxlength) shown as shadcn FieldErrors under each field
 * instead of its bubble. The form sets noValidate, sends only when check() passes, and passes clear as its
 * onInput, so an edit clears that field's message. Controls are keyed by id, or aria-label when they have none.
 */
export function useFieldErrors(patterns: Record<string, string> = {}) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  function message(control: Control) {
    const label = control.labels?.[0]?.textContent || control.getAttribute("aria-label") || "This field";
    if (control.validity.valueMissing) return `${label} is required.`;
    if (control.validity.patternMismatch) return patterns[keyOf(control)] ?? control.validationMessage;
    if (control.validity.rangeUnderflow && control instanceof HTMLInputElement) return `${label} must be at least ${control.min}.`;
    return control.validationMessage;
  }
  /** Whether the form may be sent; if not, each invalid control gets its message and the first one focus. */
  function check(form: HTMLFormElement) {
    const invalid = [...form.elements].filter((element): element is Control =>
      (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) && !element.validity.valid);
    setErrors(Object.fromEntries(invalid.map(control => [keyOf(control), message(control)])));
    invalid[0]?.focus();
    return !invalid.length;
  }
  function clear(event: FormEvent) {
    const key = keyOf(event.target as Element);
    if (errors[key]) setErrors(current => { const next = { ...current }; delete next[key]; return next; });
  }
  /** Props for a control: invalid while it has a message, which it is described by (after its own hint). */
  const describe = (key: string, hint?: string) => ({
    "aria-invalid": !!errors[key] || undefined,
    "aria-describedby": [hint, errors[key] ? key + "-error" : ""].filter(Boolean).join(" ") || undefined,
  });
  return { errors, check, clear, describe };
}
