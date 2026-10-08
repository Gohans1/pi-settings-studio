import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { Button } from "./components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./components/ui/collapsible";

/** Content behind a toggle: a shadcn Collapsible whose trigger is a ghost button with a turning chevron. */
export function Disclosure({ label, defaultOpen, open, onOpenChange, hiddenUntilFound, className, children }: {
  label: ReactNode; defaultOpen?: boolean; open?: boolean; onOpenChange?: (open: boolean) => void; hiddenUntilFound?: boolean; className?: string; children: ReactNode;
}) {
  return <Collapsible defaultOpen={defaultOpen} open={open} onOpenChange={onOpenChange} className={className}>
    <CollapsibleTrigger render={<Button variant="ghost" size="sm" className="-ms-2" />}>
      <ChevronRight aria-hidden="true" className="transition-transform duration-200 ease-out group-data-panel-open/button:rotate-90" />{label}
    </CollapsibleTrigger>
    {/* The panel clips its overflow to animate its height; the inset keeps room for focus rings. */}
    <CollapsibleContent hiddenUntilFound={hiddenUntilFound} className="-m-1 p-1">{children}</CollapsibleContent>
  </Collapsible>;
}
