import { useEffect, useState } from "react";
import { loadPi } from "./api";
import { Button } from "./components/ui/button";
import { JobPanel, useJob } from "./JobPanel";

/** The Pi this machine runs, and `pi update` on click. */
export function PiPanel() {
  const [pi, setPi] = useState<{ bin: string; installed?: string; builtFor: string }>();
  const refresh = () => void loadPi().then(setPi).catch(() => setPi(undefined));
  useEffect(refresh, []);
  const update = useJob(refresh);
  if (!pi) return null;
  return <section className="pi-panel" aria-label="Pi">
    <p>{pi.installed ? <>Pi {pi.installed} is installed</> : <>The pi command was not found</>} <code>{pi.bin}</code>
      {pi.installed && pi.installed !== pi.builtFor && <span className="notice"> This app was checked against Pi {pi.builtFor}; newer settings may be missing here.</span>}</p>
    <Button variant="outline" size="sm" disabled={update.running || !pi.installed}
      onClick={() => { if (window.confirm("Update Pi now? Open T3Code threads keep the running version until they restart.")) void update.start({ action: "pi-update" }); }}>Update Pi</Button>
    <JobPanel job={update.job} error={update.error} onAnswer={value => void update.answer(value)} onCancel={() => void update.cancel()} onDismiss={update.dismiss} />
  </section>;
}
