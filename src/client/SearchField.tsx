import { Search } from "lucide-react";

/** A search box. The page's main one answers to "/" (App.tsx), shown as a hint until it is used. */
export function SearchField({ label, placeholder, value, onChange, shortcut = true }: {
  label: string; placeholder: string; value: string; onChange: (value: string) => void; shortcut?: boolean;
}) {
  return <div className="search">
    <Search aria-hidden="true" />
    <input type="search" aria-label={label} placeholder={placeholder} value={value} onChange={event => onChange(event.target.value)}
      data-shortcut={shortcut || undefined} aria-keyshortcuts={shortcut ? "/" : undefined} />
    {shortcut && <kbd aria-hidden="true">/</kbd>}
  </div>;
}
