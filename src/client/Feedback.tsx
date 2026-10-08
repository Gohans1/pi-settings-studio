import { X } from "lucide-react";
import { Button } from "./components/ui/button";

export type FeedbackAction = { label: string; onClick: () => void; disabled?: boolean };

/**
 * The page's confirmation, as a toast. The polite live region is always rendered, so every new
 * message is announced. It stays until dismissed or replaced: an Undo inside it never times out.
 */
export function Feedback({ message, action, onDismiss }: { message: string; action?: FeedbackAction | false; onDismiss: () => void }) {
  return <div role="status" className="toaster">
    {message && <div className="toast" key={message}>
      <p>{message}</p>
      {action && <Button variant="ghost" size="sm" className="text-inverse-foreground hover:bg-inverse-hover" disabled={action.disabled} onClick={action.onClick}>{action.label}</Button>}
      <Button variant="ghost" size="icon-sm" className="text-inverse-muted-foreground hover:bg-inverse-hover hover:text-inverse-foreground" aria-label="Dismiss" onClick={onDismiss}><X aria-hidden="true" /></Button>
    </div>}
  </div>;
}
