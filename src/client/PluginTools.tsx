import { useEffect, useState } from "react";
import { CircleAlert, RefreshCw } from "lucide-react";
import type { PluginToolsView } from "../shared/plugin-tools";
import { loadPluginTools } from "./api";
import { Alert, AlertDescription, AlertTitle } from "./components/ui/alert";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Spinner } from "./components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "./components/ui/toggle-group";
import { Disclosure } from "./Disclosure";

const states: Record<PluginToolsView["tools"][number]["visibility"], string> = {
  model: "Model declaration", callable: "Indirect only", inactive: "Inactive", hidden: "Hidden",
  disabled: "Extension off", shadowed: "Another extension takes precedence", unknown: "Unverified",
};

export function PluginTools({ path, project }: { path: string; project?: string }) {
  const [view, setView] = useState<PluginToolsView>();
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [modelOnly, setModelOnly] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setView(undefined); setError(""); setModelOnly(false);
    loadPluginTools(path, project, controller.signal).then(result => {
      if (!controller.signal.aborted) setView(result);
    }).catch(cause => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not inspect tools.");
    });
    return () => controller.abort();
  }, [path, project, attempt]);
  const loading = !view && !error;
  const declared = view?.tools.filter(tool => tool.visibility === "model") ?? [];
  const tools = modelOnly ? declared : view?.tools ?? [];
  return <section className="mt-6 grid gap-3" aria-label="Extension tools" aria-busy={loading}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3>Tools</h3>
      <Button variant="outline" size="sm" disabled={loading} onClick={() => setAttempt(value => value + 1)}><RefreshCw aria-hidden="true" data-icon="inline-start" />Refresh tools</Button>
    </div>
    <p className="muted">{project ? "Global + selected project settings, trusted for inspection." : "Global settings only."} Startup preview, not a running thread.</p>
    {loading && <p className="loading" role="status"><Spinner aria-hidden="true" />Loading tools with Pi…</p>}
    {error && <Alert variant="destructive"><CircleAlert aria-hidden="true" /><AlertTitle>Could not inspect tools</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
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
        : <ul className="divide-y divide-border" aria-label="Tools">{tools.map(tool => <li key={tool.name} className="grid min-w-0 gap-2 py-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <code translate="no" className="min-w-0 break-all">{tool.name}</code>
            <Badge variant="outline">{states[tool.visibility]}</Badge>
          </div>
          {tool.description.length > 240 ? <Disclosure label={`Description of ${tool.name}`}><p className="muted whitespace-pre-wrap break-words">{tool.description}</p></Disclosure>
            : <p className="muted whitespace-pre-wrap break-words">{tool.description}</p>}
          {tool.visibility === "callable" && <span className="muted">Callable by other tools{tool.exposure === "deferred" ? "; discoverable with tool search" : ""}.</span>}
        </li>)}</ul>}
      <p className="muted">Checked {new Date(view.checkedAt).toLocaleTimeString()}. Tools added by later commands or model turns are not included.</p>
    </>}
  </section>;
}
