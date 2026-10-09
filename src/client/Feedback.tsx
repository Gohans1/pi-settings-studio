import { useEffect, useRef } from "react";
import { toast } from "./components/ui/toast";
import { play } from "./Sound";

export type FeedbackAction = { label: string; onClick: () => void; disabled?: boolean };

/**
 * The page's confirmation, as a toast in the app's Toaster (a polite "Notifications" region). A new message
 * replaces the last; it stays until dismissed or replaced, so an Undo inside it never times out.
 */
export function Feedback({ message, action, onDismiss }: { message: string; action?: FeedbackAction | false; onDismiss: () => void }) {
  // The toast on screen. Replacing or clearing it also closes it, but only the reader's close dismisses.
  const shown = useRef<string>(undefined);
  const latest = useRef({ action, onDismiss });
  latest.current = { action, onDismiss };
  useEffect(() => {
    if (!message) return;
    // A confirmation: cuelume's cue for what a toast reports, quietly.
    play("success", { emphasis: "subtle" });
    const id = toast.add({ title: message, timeout: 0, onClose: () => { if (shown.current === id) latest.current.onDismiss(); } });
    shown.current = id;
    return () => { shown.current = undefined; toast.close(id); };
  }, [message]);
  const label = action ? action.label : undefined, disabled = action ? action.disabled : undefined;
  useEffect(() => {
    if (!shown.current) return;
    toast.update(shown.current, { actionProps: label ? { children: label, disabled, onClick: () => { if (latest.current.action) latest.current.action.onClick(); } } : undefined });
  }, [message, label, disabled]);
  return null;
}
