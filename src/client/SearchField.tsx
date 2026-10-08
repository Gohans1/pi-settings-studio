import { Search } from "lucide-react";
import { InputGroup, InputGroupAddon, InputGroupInput } from "./components/ui/input-group";
import { Kbd } from "./components/ui/kbd";

/** A search box. The page's main one answers to "/" (App.tsx), shown as a hint until it is used. */
export function SearchField({ label, placeholder, value, onChange, shortcut = true, className }: {
  label: string; placeholder: string; value: string; onChange: (value: string) => void; shortcut?: boolean; className?: string;
}) {
  return <InputGroup className={className}>
    <InputGroupInput type="search" aria-label={label} placeholder={placeholder} value={value} onChange={event => onChange(event.target.value)}
      data-shortcut={shortcut || undefined} aria-keyshortcuts={shortcut ? "/" : undefined} />
    <InputGroupAddon><Search aria-hidden="true" /></InputGroupAddon>
    {shortcut && !value && <InputGroupAddon align="inline-end" className="group-focus-within/input-group:hidden"><Kbd aria-hidden="true">/</Kbd></InputGroupAddon>}
  </InputGroup>;
}
