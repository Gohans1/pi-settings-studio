import { useEffect, useState } from "react";
import { CircleAlert, RefreshCw } from "lucide-react";
import type { ToolSource, ToolsView } from "../shared/plugin-tools";
import { loadTools } from "./api";
import { Alert, AlertDescription, AlertTitle } from "./components/ui/alert";
import { Button } from "./components/ui/button";
import { Spinner } from "./components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "./components/ui/toggle-group";
import { PageHeader } from "./PageHeader";
import { ToolList } from "./ToolList";

const KINDS: ToolSource["kind"][] = ["pi", "extension", "mcp"];

function titleOf(source: ToolSource) {
  return source.kind === "pi" ? "Pi built-in" : source.kind === "mcp" ? `MCP server: ${source.server}` : `Extension: ${source.name}`;
}

/** One group per source, in Pi's registration order: Pi's own tools, then extensions, then MCP servers. */
function bySource(tools: ToolsView["tools"]) {
  const groups = new Map<string, { key: string; title: string; detail?: string; kind: ToolSource["kind"]; tools: ToolsView["tools"] }>();
  for (const tool of tools) {
    const { source } = tool, key = JSON.stringify(source);
    const group = groups.get(key) ?? { key, title: titleOf(source), detail: source.kind === "extension" ? source.group : undefined, kind: source.kind, tools: [] };
    group.tools.push(tool);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind));
}

export function ToolsTab({ project }: { project?: string }) {
  const [view, setView] = useState<ToolsView>();
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [modelOnly, setModelOnly] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setView(undefined); setError("");
    loadTools(project, controller.signal).then(result => {
      if (!controller.signal.aborted) setView(result);
    }).catch(cause => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not inspect tools.");
    });
    return () => controller.abort();
  }, [project, attempt]);
  const loading = !view && !error;
  const declared = view?.tools.filter(tool => tool.visibility === "model") ?? [];
  const shown = modelOnly ? declared : view?.tools ?? [];
  const found = view?.complete ? "" : " found";
  return <>
    <PageHeader title="Tools" description="Every tool a new session starts with, grouped by where it comes from: Pi itself, an extension or an MCP server, and whether the model sees it directly. Read-only."
      actions={<Button variant="outline" size="sm" disabled={loading} onClick={() => setAttempt(value => value + 1)}><RefreshCw aria-hidden="true" data-icon="inline-start" />Refresh tools</Button>} />
    <div className="grid gap-3" aria-busy={loading}>
      <p className="muted">{project ? "Global + selected project settings, trusted for inspection." : "Global settings only."} Startup preview, not a running thread.</p>
      {loading && <p className="loading" role="status"><Spinner aria-hidden="true" />Loading tools with Pi…</p>}
      {error && <Alert variant="destructive"><CircleAlert aria-hidden="true" /><AlertTitle>Could not inspect tools</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
      {view && <>
        {!view.complete && <Alert variant="destructive"><CircleAlert aria-hidden="true" /><AlertTitle>Could not verify all tools</AlertTitle>
          <AlertDescription><p>The list may be incomplete. Fix the extension or MCP server, then refresh.</p>
            {view.issues.map((issue, index) => <p key={index} className="break-words">{issue}</p>)}
          </AlertDescription></Alert>}
        {/* One choice at a time: pressing the chosen one leaves it chosen. */}
        <ToggleGroup aria-label="Filter tools" variant="outline" size="sm" value={[modelOnly ? "declared" : "all"]}
          onValueChange={next => { if (next.length) setModelOnly(next[0] === "declared"); }}>
          <ToggleGroupItem value="all">All tools ({view.tools.length}{found})</ToggleGroupItem>
          <ToggleGroupItem value="declared">Model sees ({declared.length}{found})</ToggleGroupItem>
        </ToggleGroup>
        <p className="muted">“Model sees” counts direct declarations. Indirect tools are reached through codemode or tool search.</p>
        {!shown.length ? <p role="status" className="muted">{modelOnly ? "No direct tool declarations in this preview." : "No tools registered at startup."}</p>
          : bySource(shown).map(group => <section key={group.key} className="mt-3 grid gap-2" aria-label={group.title}>
            <h2>{group.title} <span className="muted">{group.detail ? `${group.detail} · ` : ""}{group.tools.length}</span></h2>
            <ToolList label={group.title} tools={group.tools} />
          </section>)}
        <p className="muted">Checked {new Date(view.checkedAt).toLocaleTimeString()}. Tools added by later commands or model turns are not included.</p>
      </>}
    </div>
  </>;
}
