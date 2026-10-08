import { useLayoutEffect, useRef, type ReactNode } from "react";
import { ChevronLeft, Ellipsis, type LucideIcon } from "lucide-react";
import { Button } from "./components/ui/button";
import { Menu, MenuContent, MenuTrigger } from "./components/ui/menu";

/**
 * A list and the chosen item's details. Wide screens show both panes, each scrolling on its own;
 * narrow ones show one at a time (styles.css), with a way back to the list.
 */
export function Workbench({ list, detail, open, onBack, backLabel }: {
  list: ReactNode; detail: ReactNode; open: boolean; onBack: () => void; backLabel: string;
}) {
  const frame = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = frame.current;
    if (!element) return;
    // On a narrow screen the pane that had focus may just have been hidden: keep the reader's place.
    if (element.getBoundingClientRect().top < 0) element.scrollIntoView({ block: "start" });
    const active = document.activeElement;
    if (active instanceof HTMLElement && element.contains(active) && !active.checkVisibility()) {
      element.querySelector<HTMLElement>(open ? ".workbench-back" : ".workbench-list :is(button, input)")?.focus();
    }
  }, [open]);
  return <div ref={frame} className="workbench" data-open={open || undefined}>
    <div className="workbench-list">{list}</div>
    <div className="workbench-detail">
      {open && <Button variant="ghost" size="sm" className="workbench-back min-[56rem]:hidden" onClick={onBack}><ChevronLeft aria-hidden="true" />{backLabel}</Button>}
      {detail}
    </div>
  </div>;
}

/** A list group's less frequent actions, behind one button. */
export function MoreMenu({ label, children }: { label: string; children: ReactNode }) {
  return <Menu>
    <MenuTrigger render={<Button variant="ghost" size="icon-xs" aria-label={label} title={label} />}><Ellipsis aria-hidden="true" /></MenuTrigger>
    <MenuContent>{children}</MenuContent>
  </Menu>;
}

/** The detail pane before anything is chosen: what goes here, and how to fill it. */
export function EmptyDetail({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children?: ReactNode }) {
  return <div className="detail detail-empty">
    <Icon aria-hidden="true" />
    <strong>{title}</strong>
    {children && <p>{children}</p>}
  </div>;
}
