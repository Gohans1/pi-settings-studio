import { useEffect, useState } from "react";
import { loadPi } from "./api";
import { TriangleAlert } from "lucide-react";
import { Alert, AlertDescription } from "./components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "./components/ui/alert-dialog";
import { Button } from "./components/ui/button";
import { JobPanel, useJob } from "./JobPanel";
import { home } from "./PageHeader";

/** The Pi this machine runs, and `pi update` on click. */
export function PiPanel() {
  const [pi, setPi] = useState<{ bin: string; installed?: string; builtFor: string }>();
  const refresh = () => void loadPi().then(setPi).catch(() => setPi(undefined));
  useEffect(refresh, []);
  const update = useJob({ actions: ["pi-update"] }, refresh);
  const [asking, setAsking] = useState(false);
  if (!pi) return null;
  return <section className="pi-panel" aria-label="Pi">
    <p>{pi.installed ? <>Pi {pi.installed} is installed</> : <>The pi command was not found</>} <code translate="no">{home(pi.bin)}</code></p>
    <AlertDialog open={asking} onOpenChange={setAsking}>
      <AlertDialogTrigger render={<Button variant="outline" size="sm" disabled={update.running || !pi.installed} />}>Update Pi</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Update Pi now?</AlertDialogTitle>
          <AlertDialogDescription>Open Pi sessions keep the running version until they restart.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => { setAsking(false); void update.start({ action: "pi-update" }); }}>Update Pi</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    {pi.installed && pi.installed !== pi.builtFor && <Alert role="note"><TriangleAlert aria-hidden="true" /><AlertDescription>This app was checked against Pi {pi.builtFor}; newer settings may be missing here.</AlertDescription></Alert>}
    <JobPanel job={update.job} error={update.error} onAnswer={value => void update.answer(value)} onCancel={() => void update.cancel()} onDismiss={update.dismiss} />
  </section>;
}
