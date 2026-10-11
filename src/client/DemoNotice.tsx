import { useEffect } from "react";
import { Info } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "./components/ui/alert";
import { toast } from "./components/ui/toast";
import { play } from "./Sound";

/** The one note of the demo build (vite --mode demo): what it shows, where the real thing runs, and a toast when a change is refused. */
export function DemoNotice() {
  useEffect(() => {
    let shown: string | undefined;
    void import("./demo").then(({ whenRefused, READ_ONLY }) => whenRefused(() => {
      if (shown) toast.close(shown);
      play("error", { emphasis: "subtle" });
      shown = toast.add({ title: READ_ONLY, timeout: 6000 });
    }));
  }, []);
  return <Alert role="note" className="mb-5">
    <Info aria-hidden="true" />
    <AlertTitle>Demo with sample data</AlertTitle>
    <AlertDescription>Everything here is read-only. To change your own Pi settings,{" "}
      <a href="https://github.com/Gohans1/pi-settings-studio#run" target="_blank" rel="noreferrer noopener">run Pi Settings Studio on your machine</a>.</AlertDescription>
  </Alert>;
}
