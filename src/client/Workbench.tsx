import { useLayoutEffect, useRef, type ComponentProps, type ReactNode } from "react";
import { ChevronLeft, Ellipsis, type LucideIcon } from "lucide-react";
import { cn } from "cn";
import { Button } from "./components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuTrigger } from "./components/ui/dropdown-menu";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "./components/ui/empty";
import { Item, ItemContent, ItemMedia, ItemTitle } from "./components/ui/item";
import { ScrollArea } from "./components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "./components/ui/tooltip";

/**
 * A list and the chosen item's details. Wide screens show both panes, each scrolling on its own;
 * narrow ones show one at a time (styles.css), with a way back to the list.
 */
export function Workbench({ list, detail, open, onBack, backLabel }: {
  list: ReactNode; detail: ReactNode; open: boolean; onBack: () => void; backLabel: string;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const back = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    const element = frame.current;
    if (!element) return;
    // On a narrow screen the pane that had focus may just have been hidden: keep the reader's place.
    if (element.getBoundingClientRect().top < 0) element.scrollIntoView({ block: "start" });
    const active = document.activeElement;
    if (active instanceof HTMLElement && element.contains(active) && !active.checkVisibility()) {
      (open ? back.current : element.querySelector<HTMLElement>(".workbench-list :is(button, input)"))?.focus();
    }
  }, [open]);
  return <div ref={frame} className="workbench" data-open={open || undefined}>
    <div className="workbench-list"><ScrollArea className="h-full"><div className="workbench-list-content">{list}</div></ScrollArea></div>
    <div className="workbench-detail"><ScrollArea className="h-full"><div className="workbench-detail-content">
      {open && <Button ref={back} variant="ghost" size="sm" className="mb-3 -ms-2 min-[56rem]:hidden" onClick={onBack}><ChevronLeft aria-hidden="true" data-icon="inline-start" />{backLabel}</Button>}
      {detail}
    </div></ScrollArea></div>
  </div>;
}

/**
 * A row of a workbench list: an Item that chooses what the detail pane shows. Its state reads after the
 * name ("off", "Tool search"); a tone marks a state Pi refuses or skips, or one that is ready to use.
 * A quiet row (nothing set up yet) recedes until it is hovered or chosen.
 */
export function ListItem({ selected, onSelect, icon: Icon, name, state, tone, quiet = false }: {
  selected: boolean; onSelect: () => void; icon?: LucideIcon; name: ReactNode; state?: ReactNode; tone?: "refused" | "shadowed" | "ready"; quiet?: boolean;
}) {
  return <Item size="xs" render={<button type="button" aria-pressed={selected} onClick={onSelect} />}
    className={cn("flex-nowrap text-start hover:bg-muted aria-pressed:bg-selected", quiet && "text-muted-foreground hover:text-foreground focus-visible:text-foreground aria-pressed:text-foreground")}>
    {Icon && <ItemMedia variant="icon"><Icon aria-hidden="true" /></ItemMedia>}
    <ItemContent className="min-w-0"><ItemTitle className="w-full">{name}</ItemTitle></ItemContent>
    {state !== undefined && <span className="item-state" data-state={tone}>{state}</span>}
  </Item>;
}

/** An icon-only button: its label is its accessible name, and a tooltip shows it. */
export function IconButton({ label, children, ...props }: Omit<ComponentProps<typeof Button>, "aria-label"> & { label: string }) {
  return <Tooltip>
    <TooltipTrigger render={<Button variant="ghost" size="icon-xs" aria-label={label} {...props} />}>{children}</TooltipTrigger>
    <TooltipContent>{label}</TooltipContent>
  </Tooltip>;
}

/** A list group's less frequent actions, behind one button. */
export function MoreMenu({ label, children }: { label: string; children: ReactNode }) {
  return <DropdownMenu>
    {/* Base UI composes the tooltip's and the menu's triggers on one button. */}
    <Tooltip>
      <TooltipTrigger render={<DropdownMenuTrigger render={<Button variant="ghost" size="icon-xs" aria-label={label} />} />}><Ellipsis aria-hidden="true" /></TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
    <DropdownMenuContent align="end" className="w-auto"><DropdownMenuGroup>{children}</DropdownMenuGroup></DropdownMenuContent>
  </DropdownMenu>;
}

/** The detail pane before anything is chosen: what goes here, and how to fill it. */
export function EmptyDetail({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children?: ReactNode }) {
  return <Empty className="min-h-full">
    <EmptyHeader>
      <EmptyMedia variant="icon"><Icon aria-hidden="true" /></EmptyMedia>
      <EmptyTitle>{title}</EmptyTitle>
      {children && <EmptyDescription>{children}</EmptyDescription>}
    </EmptyHeader>
  </Empty>;
}
