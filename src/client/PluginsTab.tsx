import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import type { PluginsView, ResourceView } from "../shared/resources";
import { loadPlugins, savePackageFilters, savePlugins } from "./api";
import { PackageFilterForm, type FilterPatch } from "./PackageFilterForm";
import { Button } from "./components/ui/button";
import { Switch } from "./components/ui/switch";
import { JobPanel, useJob } from "./JobPanel";

const typeLabels: Record<string, string> = { extensions: "extension", prompts: "prompt", themes: "theme" };
const builtinNotes: Record<string, string> = {
  mcp: "Turning it off turns off Pi's MCP support: no mcp.json server connects.",
  codemode: "Turning it off removes the codemode tool, so MCP tools with codemode exposure cannot be called.",
  "tool-search": "Turning it off removes tool_search, so deferred MCP tools cannot be loaded.",
  "llama.cpp": "Local llama.cpp provider support.",
};

function PluginDetail({ item }: { item: ResourceView }) {
  const builtin = item.group.startsWith("Built-in");
  return <section className="detail" aria-labelledby="plugin-title">
    <h2 id="plugin-title">{item.name}</h2>
    {!item.enabled && <p className="notice">Turned off, so Pi does not load it.</p>}
    {builtin && builtinNotes[item.name] && <p className="notice">{builtinNotes[item.name]}</p>}
    <dl className="detail-list">
      <div><dt>Type</dt><dd>{builtin ? "built-in extension" : typeLabels[item.type]}</dd></div>
      {item.description && <div><dt>Description</dt><dd>{item.description}</dd></div>}
      <div><dt>Source</dt><dd>{item.group}</dd></div>
      <div><dt>{builtin ? "Name" : "File"}</dt><dd><code>{item.path}</code></dd></div>
    </dl>
  </section>;
}

export function PluginsTab({ project }: { project?: string }) {
  const [view, setView] = useState<PluginsView>();
  const [selected, setSelected] = useState<string>();
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [source, setSource] = useState("");
  const [filtering, setFiltering] = useState<string>();
  const [installScope, setInstallScope] = useState<"global" | "project">("global");
  // pi install / remove / update run on click; the list reloads when they finish.
  const job = useJob(() => void refresh());

  async function refresh() {
    setError("");
    try { setView(await loadPlugins(project)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not read the plugins."); }
  }
  useEffect(() => { setSelected(undefined); void refresh(); }, [project]);

  async function toggle(items: ResourceView[], enabled: boolean, label = items[0]?.name) {
    if (!view || !items.length) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const scope = items[0]!.scope === "project" ? "project" : "global";
      setView(await savePlugins(scope, scope === "project" ? view.projectRevision! : view.revision, items.map(item => ({ type: item.type, path: item.path })), enabled, project));
      setMessage(`${label} turned ${enabled ? "on" : "off"}. Applies to new T3Code threads, or after /reload.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not change the plugins.");
      await refresh();
    } finally { setBusy(false); }
  }

  async function saveFilters(scope: "global" | "project", pkgSource: string, filters: FilterPatch) {
    if (!view) return;
    setBusy(true); setError(""); setMessage("");
    try {
      setView(await savePackageFilters(scope, scope === "project" ? view.projectRevision! : view.revision, pkgSource, filters, project));
      setFiltering(undefined);
      setMessage(`Filters saved for ${pkgSource}. Applies to new T3Code threads, or after /reload.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save the filters."); }
    finally { setBusy(false); }
  }
  const resources = view?.resources ?? [];
  const needle = query.trim().toLowerCase();
  const visible = resources.filter(item => !needle || `${item.name} ${item.description ?? ""} ${item.group}`.toLowerCase().includes(needle));
  const groups = [...new Set(resources.map(item => item.group))].filter(group => visible.some(item => item.group === group));
  const current = resources.find(item => item.path === selected);
  return <>
    <div className="page-heading"><div><h1>Plugins</h1><p>Extensions, prompt templates and themes, including Pi's built-ins and installed packages. Package skills are in the Skills tab.</p></div>
      <div className="search"><Search aria-hidden="true" /><input type="search" aria-label="Search plugins" placeholder="Search plugins…" value={query} onChange={event => setQuery(event.target.value)} /></div></div>
    <div role="status" className="feedback">{message}</div>
    {error && <div role="alert" className="error"><strong>Could not complete the change</strong><p>{error}</p><Button variant="outline" onClick={() => void refresh()}>Reload</Button></div>}
    {!view ? !error && <div className="loading" aria-busy="true">Reading plugins…</div> : <>
      <div className="master-detail">
        <section className="master" aria-label="Plugin list">
          {!visible.length && <p className="empty">{resources.length ? "No matching plugins." : "No plugins found."}</p>}
          {groups.map(group => {
            const members = visible.filter(item => item.group === group);
            return <div key={group} className="item-group">
              <div className="list-header"><h2>{group}</h2>
                <Switch aria-label={`Enable everything in ${group}`} checked={members.every(item => item.enabled)} disabled={busy}
                  onCheckedChange={enabled => void toggle(members.filter(item => item.enabled !== enabled), enabled, `Everything in ${group}`)} /></div>
              <ul className="item-list">{members.map(item => <li key={item.type + item.path}>
                <button type="button" aria-pressed={item.path === selected} onClick={() => setSelected(item.path)}>
                  <span className="item-name">{item.name}</span><span className="item-state">{item.enabled ? typeLabels[item.type] : "off"}</span>
                </button>
                <Switch aria-label={`Enable ${item.name}`} checked={item.enabled} disabled={busy} onCheckedChange={enabled => void toggle([item], enabled)} />
              </li>)}</ul>
            </div>;
          })}
        </section>
        {current ? <PluginDetail item={current} /> : <section className="detail"><p className="empty">Select a plugin to see its details.</p></section>}
      </div>
      <section className="packages" aria-labelledby="packages-title">
        <h2 id="packages-title">Packages</h2>
        <form className="install-form" onSubmit={event => { event.preventDefault(); void job.start({ action: "package-install", source: source.trim(), ...(installScope === "project" && project ? { project } : {}) }); }}>
          <label>Package source<input value={source} placeholder="npm:@scope/name, git:github.com/user/repo or ./path" autoComplete="off" spellCheck={false} onChange={event => setSource(event.target.value)} /></label>
          {project && <label>For<select aria-label="Install for" value={installScope} onChange={event => setInstallScope(event.target.value as "global" | "project")}>
            <option value="global">Every project</option><option value="project">This project only</option></select></label>}
          <Button type="submit" disabled={job.running || !source.trim()}>Install</Button>
          <Button type="button" variant="outline" disabled={job.running || !view.packages.length} onClick={() => void job.start({ action: "packages-update" })}>Update all</Button>
        </form>
        <p className="muted">Runs pi install in this environment. Packages can run code: install only sources you trust.</p>
        <JobPanel job={job.job} error={job.error} onAnswer={value => void job.answer(value)} onCancel={() => void job.cancel()} onDismiss={job.dismiss} />
        {view.packages.length ? <ul className="package-list">{view.packages.map(pkg => <li key={pkg.scope + pkg.source}>
          <code>{pkg.source}</code>
          <span className="muted">{pkg.scope === "project" ? "This project · " : ""}{pkg.installed ? "Installed" : "Not installed"}{pkg.filtered ? " · has resource filters" : ""}</span>
          <span className="actions">
            <Button variant="ghost" size="sm" disabled={busy} aria-label={`Filters for ${pkg.source}`} onClick={() => setFiltering(pkg.scope + pkg.source)}>Filters</Button>
            <Button variant="ghost" size="sm" disabled={job.running} aria-label={`Update package ${pkg.source}`} onClick={() => void job.start({ action: "package-update", source: pkg.source })}>Update</Button>
            <Button variant="ghost" size="sm" disabled={job.running} aria-label={`Remove package ${pkg.source}`} onClick={() => void job.start({ action: "package-remove", source: pkg.source, ...(pkg.scope === "project" ? { project } : {}) })}>Remove</Button>
          </span>
          {filtering === pkg.scope + pkg.source && <PackageFilterForm pkg={pkg} busy={busy} onCancel={() => setFiltering(undefined)}
            onSave={patch => void saveFilters(pkg.scope, pkg.source, patch)} />}
        </li>)}</ul> : <p className="empty">No packages in settings.json.</p>}
      </section>
    </>}
  </>;
}
