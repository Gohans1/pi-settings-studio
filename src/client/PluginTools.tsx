import { useEffect, useState } from "react";
import { CircleAlert, RefreshCw } from "lucide-react";
import type { PluginToolsView } from "../shared/plugin-tools";
import { loadPluginTools } from "./api";
import { Alert, AlertDescription, AlertTitle } from "./components/ui/alert";
import { Button } from "./components/ui/button";
import { Spinner } from "./components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "./components/ui/toggle-group";
import { ToolList } from "./ToolList";
import { useCached } from "./useCached";

export function PluginTools({ path, project }: { path: string; project?: string }) {
  const { data: view, error, loading, refresh } = useCached<PluginToolsView>(`plugin-tools\0${project ?? ""}\0${path}`,
    (signal, fresh) => loadPluginTools(path, project, signal, fresh));
  const [modelOnly, setModelOnly] = useState(false);
  useEffect(() => setModelOnly(false), [path, project]);
  const declared = view?.tools.filter(tool => tool.visibility === "model") ?? [];
  const tools = modelOnly ? declared : view?.tools ?? [];
  return <section className="mt-6 grid gap-3" aria-label="Extension tools" aria-busy={loading}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3>Tools</h3>
      <Button variant="outline" size="sm" disabled={loading} onClick={refresh}><RefreshCw aria-hidden="true" data-icon="inline-start" />Refresh tools</Button>
    </div>
    <p className="muted">{project ? "Global + selected project settings, trusted for inspection." : "Global settings only."} Startup preview, not a running thread.</p>
    {loading && <p className="loading" role="status"><Spinner aria-hidden="true" />{view ? "Checking for changes…" : "Loading tools with Pi…"}</p>}
    {error && <Alert variant="destructive"><CircleAlert aria-hidden="true" /><AlertTitle>{view ? "Could not check again" : "Could not inspect tools"}</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
    {view && <>
      {!view.complete && <Alert variant="destructive"><CircleAlert aria-hidden="true" /><AlertTitle>Could not verify all tools</AlertTitle>
        <AlertDescription><p>The list may be incomplete. Fix the extension or connection, then refresh.</p>
          {view.issues.map((issue, index) => <p key={index} className="break-words">{issue}</p>)}
        </AlertDescription></Alert>}
      {!view.enabled && <p className="muted">Loaded only to inspect its catalogue. It remains off in your settings.</p>}
      {/* One choice at a time: pressing the chosen one leaves it chosen. */}
      <ToggleGroup aria-label="Filter tools" variant="outline" size="sm" value={[modelOnly ? "declared" : "all"]}
        onValueChange={next => { if (next.length) setModelOnly(next[0] === "declared"); }}>
        <ToggleGroupItem value="all">All tools ({view.tools.length}{view.complete ? "" : " found"})</ToggleGroupItem>
        <ToggleGroupItem value="declared">Model sees ({view.complete ? declared.length : "unverified"})</ToggleGroupItem>
      </ToggleGroup>
      <p className="muted">“Model sees” counts direct declarations. Indirect tools can also be listed inside codemode.</p>
      {!tools.length ? <p role="status" className="muted">{!view.complete ? "No verified tools in this view."
        : modelOnly ? "No direct tool declarations for this extension in this preview." : "No tools registered at startup."}</p>
        : <ToolList label="Tools" tools={tools} />}
      <p className="muted">Checked {new Date(view.checkedAt).toLocaleTimeString()}. Tools added by later commands or model turns are not included.</p>
    </>}
  </section>;
}
