import { useEffect, useState } from "react";
import { ChevronDown, FolderOpen, Package, Plus, Puzzle } from "lucide-react";
import type { PluginsView, ResourceType, ResourceView } from "../shared/resources";
import { loadPlugins, restoreSettings, savePackageFilters, savePlugins } from "./api";
import { PackageFilterForm, type FilterPatch } from "./PackageFilterForm";
import { NewResourceForm, ResourceEditor } from "./ResourceEditor";
import { Button } from "./components/ui/button";
import { Switch } from "./components/ui/switch";
import { JobPanel, useJob } from "./JobPanel";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./components/ui/dropdown-menu";
import { Feedback } from "./Feedback";
import { PageHeader } from "./PageHeader";
import { EmptyDetail, Workbench } from "./Workbench";
import { SearchField } from "./SearchField";
import { ResourceFolders, type FolderChange } from "./ResourceFolders";

const typeLabels: Record<string, string> = { extensions: "extension", prompts: "prompt", themes: "theme" };
const newLabels = { prompts: "Prompt template", themes: "Theme", extensions: "Extension" } as const;
const builtinNotes: Record<string, string> = {
  mcp: "Turning it off turns off Pi's MCP support: no mcp.json server connects.",
  codemode: "Turning it off removes the codemode tool, so MCP tools with codemode exposure cannot be called.",
  "tool-search": "Turning it off removes tool_search, so deferred MCP tools cannot be loaded.",
  "llama.cpp": "Local llama.cpp provider support.",
};

function PluginDetail({ item, onOpen }: { item: ResourceView; onOpen: () => void }) {
  const builtin = item.group.startsWith("Built-in");
  const editable = item.origin === "top-level";
  return <section className="detail" aria-labelledby="plugin-title">
    <header className="detail-header"><h2 id="plugin-title">{item.name}</h2>
      {!builtin && <div className="actions"><Button variant="outline" aria-label={`${editable ? "Edit" : "View"} ${item.name}`} onClick={onOpen}>{editable ? "Edit" : "View"}</Button></div>}</header>
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
  const [mode, setMode] = useState<"edit" | ResourceType>();
  const [installScope, setInstallScope] = useState<"global" | "project">("global");
  // A pinned entry of the list: Packages, or the folders Pi loads plugins from.
  const [pinned, setPinned] = useState<"packages" | "folders">();
  const [undo, setUndo] = useState<FolderChange["undo"]>();
  const [folders, setFolders] = useState(0);
  // pi install / remove / update run on click; the list reloads when they finish.
  const job = useJob(() => void refresh());

  async function refresh() {
    setError("");
    try { setView(await loadPlugins(project)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not read the plugins."); }
  }
  useEffect(() => { setSelected(undefined); setMode(undefined); setPinned(undefined); void refresh(); }, [project]);

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
  const open = !!pinned || !!mode || !!current;
  const folderChanged = (change: FolderChange) => { setMessage(change.message); setUndo(change.undo); void refresh(); };
  async function restore(target: NonNullable<FolderChange["undo"]>) {
    setBusy(true);
    try {
      await restoreSettings(target.scope, target.revision, target.scope === "project" ? project : undefined);
      setUndo(undefined); setMessage("Restored the previous settings.json."); setFolders(version => version + 1); await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not restore the file."); }
    finally { setBusy(false); }
  }
  const back = () => { setSelected(undefined); setMode(undefined); setPinned(undefined); };
  const packages = view && <section className="detail packages" aria-labelledby="packages-title">
    <header><h2 id="packages-title">Packages</h2>
      <p className="muted">Installed with pi install in this environment. Packages can run code: install only sources you trust.</p></header>
    <form className="install-form" onSubmit={event => { event.preventDefault(); void job.start({ action: "package-install", source: source.trim(), ...(installScope === "project" && project ? { project } : {}) }); }}>
      <label>Package source<input value={source} placeholder="npm:@scope/name, git:github.com/user/repo or ./path" autoComplete="off" spellCheck={false} onChange={event => setSource(event.target.value)} /></label>
      {project && <label>For<select aria-label="Install for" value={installScope} onChange={event => setInstallScope(event.target.value as "global" | "project")}>
        <option value="global">Every project</option><option value="project">This project only</option></select></label>}
      <Button type="submit" disabled={job.running || !source.trim()}>Install</Button>
    </form>
    <JobPanel job={job.job} error={job.error} onAnswer={value => void job.answer(value)} onCancel={() => void job.cancel()} onDismiss={job.dismiss} />
    <div className="list-header package-list-header"><h3>In settings.json</h3><span>{view.packages.length}</span>
      <Button variant="ghost" size="sm" disabled={job.running || !view.packages.length} onClick={() => void job.start({ action: "packages-update" })}>Update all</Button></div>
    {view.packages.length ? <ul className="package-list">{view.packages.map(pkg => <li key={pkg.scope + pkg.source}>
      <code translate="no">{pkg.source}</code>
      <span className="muted">{pkg.scope === "project" ? "This project · " : ""}{pkg.installed ? "Installed" : "Not installed"}{pkg.filtered ? " · has resource filters" : ""}</span>
      <span className="actions">
        <Button variant="ghost" size="xs" disabled={busy} aria-label={`Filters for ${pkg.source}`} onClick={() => setFiltering(pkg.scope + pkg.source)}>Filters</Button>
        <Button variant="ghost" size="xs" disabled={job.running} aria-label={`Update package ${pkg.source}`} onClick={() => void job.start({ action: "package-update", source: pkg.source })}>Update</Button>
        <Button variant="ghost" size="xs" className="text-destructive" disabled={job.running} aria-label={`Remove package ${pkg.source}`} onClick={() => void job.start({ action: "package-remove", source: pkg.source, ...(pkg.scope === "project" ? { project } : {}) })}>Remove</Button>
      </span>
      {filtering === pkg.scope + pkg.source && <PackageFilterForm pkg={pkg} busy={busy} onCancel={() => setFiltering(undefined)}
        onSave={patch => void saveFilters(pkg.scope, pkg.source, patch)} />}
    </li>)}</ul> : <p className="empty">No packages yet. Install one by its npm name, git URL or folder.</p>}
  </section>;
  return <>
    <PageHeader title="Plugins" description="Extensions, prompt templates and themes, including Pi's built-ins and installed packages. Package skills are in the Skills tab."
      actions={<DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" />}><Plus aria-hidden="true" />New<ChevronDown aria-hidden="true" /></DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-auto">{(["prompts", "themes", "extensions"] as const).map(type =>
          <DropdownMenuItem key={type} onClick={() => { setMode(type); setSelected(undefined); setPinned(undefined); }}>{newLabels[type]}</DropdownMenuItem>)}</DropdownMenuContent>
      </DropdownMenu>} />
    <Feedback message={message} onDismiss={() => { setMessage(""); setUndo(undefined); }}
      action={undo && { label: "Undo", disabled: busy, onClick: () => void restore(undo) }} />
    {error && <div role="alert" className="error"><strong>Could not complete the change</strong><p>{error}</p><div className="actions"><Button variant="outline" size="sm" onClick={() => void refresh()}>Reload</Button></div></div>}
    {!view ? !error && <div className="loading" aria-busy="true">Reading plugins…</div> : <Workbench open={open} onBack={back} backLabel="All plugins" list={<section aria-label="Plugin list">
      <div className="list-search"><SearchField label="Search plugins" placeholder="Search plugins…" value={query} onChange={setQuery} /></div>
      <ul className="item-list pinned"><li><button type="button" aria-pressed={pinned === "packages"} onClick={() => { setPinned("packages"); setSelected(undefined); setMode(undefined); }}>
        <Package aria-hidden="true" /><span className="item-name">Packages</span><span className="item-state">{view.packages.length}</span></button></li>
        <li><button type="button" aria-pressed={pinned === "folders"} onClick={() => { setPinned("folders"); setSelected(undefined); setMode(undefined); }}>
          <FolderOpen aria-hidden="true" /><span className="item-name">Folders</span><span className="item-state">where Pi finds plugins</span></button></li></ul>
      {!visible.length && <p className="empty">{resources.length ? `No plugins match “${query.trim()}”.` : "No plugins found."}</p>}
      {groups.map(group => {
        const members = visible.filter(item => item.group === group);
        return <div key={group} className="item-group">
          <div className="list-header"><h2>{group}</h2>
            <Switch aria-label={`Enable everything in ${group}`} checked={members.every(item => item.enabled)} disabled={busy}
              onCheckedChange={enabled => void toggle(members.filter(item => item.enabled !== enabled), enabled, `Everything in ${group}`)} /></div>
          <ul className="item-list">{members.map(item => <li key={item.type + item.path}>
            <button type="button" aria-pressed={item.path === selected} onClick={() => { setSelected(item.path); setMode(undefined); setPinned(undefined); }}>
              <span className="item-name">{item.name}</span><span className="item-state">{item.enabled ? typeLabels[item.type] : "off"}</span>
            </button>
            <Switch aria-label={`Enable ${item.name}`} checked={item.enabled} disabled={busy} onCheckedChange={enabled => void toggle([item], enabled)} />
          </li>)}</ul>
        </div>;
      })}
    </section>} detail={pinned === "packages" ? packages
      : pinned === "folders" ? <section className="detail plugin-folders" aria-labelledby="folders-title" key={folders}>
        <header><h2 id="folders-title">Folders</h2>
          <p className="muted">Pi finds extensions, prompt templates and themes in its own folders and in packages. Add other folders or files here.</p></header>
        {(["extensions", "prompts", "themes"] as const).map(type => <ResourceFolders key={type} type={type} project={project} onChanged={folderChanged} />)}
      </section>
      : mode && mode !== "edit" ? <NewResourceForm key={mode} type={mode} project={project} onCancel={() => setMode(undefined)}
          onCreated={async (path, name) => { await refresh(); setSelected(path); setMode("edit"); setMessage(`Created ${name}. Applies to new T3Code threads, or after /reload.`); }} />
      : current && mode === "edit" ? <ResourceEditor key={current.path} type={current.type} path={current.path} name={current.name} editable={current.origin === "top-level"}
          project={project} onMessage={setMessage} onClose={() => { setMode(undefined); void refresh(); }} />
      : current ? <PluginDetail item={current} onOpen={() => setMode("edit")} />
      : <EmptyDetail icon={Puzzle} title="No plugin selected">Choose an extension, prompt template or theme to see where it comes from, or open Packages to install more.</EmptyDetail>} />}
  </>;
}
