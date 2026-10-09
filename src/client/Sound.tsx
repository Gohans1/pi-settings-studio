import { useState } from "react";
import { Volume2, VolumeOff } from "lucide-react";
import { play, setEnabled, type PlayOptions, type SoundName } from "cuelume";
import { Toggle } from "./components/ui/toggle";
import { Tooltip, TooltipContent, TooltipTrigger } from "./components/ui/tooltip";

export { play };

/** On unless the reader turned it off; the choice stays in this browser. */
const STORAGE_KEY = "pi-settings:sounds";
const soundsOn = () => localStorage.getItem(STORAGE_KEY) !== "off";

const CONTROL = "button, a[href], input[type=checkbox], input[type=radio], [role=button], [role=combobox], [role=switch], [role=checkbox], "
  + "[role=radio], [role=option], [role=menuitem], [role=menuitemcheckbox], [role=menuitemradio], [role=tab]";
/** An error the page announces now (DESIGN.md: Callouts). */
const ERROR_ALERT = "[data-slot=alert][role=alert]";

/** A later choice rises and an earlier one falls, counted from the one chosen now. */
function step(control: Element, role: string): PlayOptions["direction"] {
  const items = [...(control.closest("[role=tablist], [role=listbox], [role=menu], [role=radiogroup], [role=group]")?.querySelectorAll(`[role=${role}]`) ?? [])];
  const chosen = items.findIndex(item => item.matches("[aria-selected=true], [aria-checked=true]"));
  return chosen < 0 ? undefined : items.indexOf(control) > chosen ? "forward" : "back";
}

/** The control a click is for. Base UI's hidden input (it holds the id a label points to) stands for the control beside it. */
function controlOf(target: EventTarget | null) {
  const element = target instanceof Element ? target.closest(CONTROL) : null;
  const beside = element?.matches("input[aria-hidden=true]") ? element.previousElementSibling : null;
  return beside?.matches(CONTROL) ? beside : element;
}
/**
 * The cue for a click, from what the control is: its ARIA role and state, read in the capture phase before
 * the component changes it, following cuelume's "Which cue?" table. shadcn's components keep their source.
 */
function cueFor(event: MouseEvent, control: Element | null): [SoundName, PlayOptions] | undefined {
  if (!control || control.matches(":disabled, [aria-disabled=true]")) return;
  const role = control.getAttribute("role"), slot = control.getAttribute("data-slot");
  const state = control.getAttribute("aria-checked") ?? control.getAttribute("aria-pressed");
  const expanded = control.getAttribute("aria-expanded");
  if (role === "tab") return control.getAttribute("aria-selected") === "true" ? undefined : ["navigate", { direction: step(control, "tab") }];
  if (role === "option" || role === "radio" || role === "menuitemradio") return ["select", { direction: step(control, role) }];
  if (role === "menuitem" || slot === "item" || slot === "toggle-group-item") return ["select", {}];
  if (role === "switch" || role === "checkbox" || role === "menuitemcheckbox" || state !== null) return ["toggle", { direction: state === "true" ? "back" : "forward" }];
  if (control.getAttribute("aria-haspopup") === "dialog") return ["open", {}];
  if (expanded !== null) return [expanded === "true" ? "close" : "open", { emphasis: "subtle" }];
  if (slot === "alert-dialog-cancel" || slot === "toast-close") return ["close", { emphasis: "subtle" }];
  return ["tap", { input: event.detail === 0 ? "keyboard" : undefined }];
}

/** Plays the app's interaction sounds: each click by its control, each error as it is announced. */
export function bindSounds() {
  setEnabled(soundsOn());
  // Base UI forwards a checkbox's or switch's click to its hidden input within the same task: one action, one cue.
  let sounded: Element | undefined;
  document.addEventListener("click", event => {
    const control = controlOf(event.target);
    if (control && control === sounded) return;
    const cue = cueFor(event, control);
    if (!cue) return;
    play(...cue);
    sounded = control!;
    setTimeout(() => { sounded = undefined; });
  }, true);
  new MutationObserver(records => {
    const added = records.flatMap(record => [...record.addedNodes]).filter(node => node instanceof Element);
    if (added.some(node => node.matches(ERROR_ALERT) || node.querySelector(ERROR_ALERT))) play("error");
  }).observe(document.body, { childList: true, subtree: true });
}

/** Sounds on or off for this browser, in the top bar. */
export function SoundToggle() {
  const [on, setOn] = useState(soundsOn);
  function change(next: boolean) {
    setOn(next);
    localStorage.setItem(STORAGE_KEY, next ? "on" : "off");
    setEnabled(next);
    // Turning off sounds its own switch before it goes quiet; turning on says so once it can.
    if (next) play("toggle");
  }
  return <Tooltip>
    <TooltipTrigger render={<Toggle size="sm" aria-label="Sounds" pressed={on} onPressedChange={change} />}>
      {on ? <Volume2 aria-hidden="true" /> : <VolumeOff aria-hidden="true" />}
    </TooltipTrigger>
    <TooltipContent>Sounds</TooltipContent>
  </Tooltip>;
}
