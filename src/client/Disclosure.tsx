import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { Button } from "./components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./components/ui/collapsible";

/** Content behind a toggle: a shadcn Collapsible whose trigger is a ghost button with a turning chevron. */
export function Disclosure({ label, defaultOpen, className, children }: { label: ReactNode; defaultOpen?: boolean; className?: string; children: ReactNode }) {
  return <Collapsible defaultOpen={defaultOpen} className={className}>
    <CollapsibleTrigger render={<Button variant="ghost" size="sm" className="-ms-2" />}>
      <ChevronRight aria-hidden="true" className="transition-transform duration-200 ease-out group-data-panel-open/button:rotate-90" />{label}
    </CollapsibleTrigger>
    <CollapsibleContent>{children}</CollapsibleContent>
  </Collapsible>;
}
