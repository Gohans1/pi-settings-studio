import { Fragment, useEffect, useId, useRef, useState } from "react";
import { ArrowUp, ChevronDown, CircleAlert, FolderOpen, Package, Plus, Puzzle } from "lucide-react";
import type { PluginsView, ResourceType, ResourceView } from "../shared/resources";
import { checkPackageUpdates, loadPlugins, restoreSettings, savePackageFilters, savePlugins } from "./api";
import { PackageFilterForm, type FilterPatch } from "./PackageFilterForm";
import { NewResourceForm, ResourceEditor } from "./ResourceEditor";
import { Alert, AlertDescription, AlertTitle } from "./components/ui/alert";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Empty, EmptyDescription, EmptyHeader } from "./components/ui/empty";
import { Field, FieldLabel } from "./components/ui/field";
import { Input } from "./components/ui/input";
import { OptionSelect } from "./OptionSelect";
import { Switch } from "./components/ui/switch";
import { JobPanel, useJob } from "./JobPanel";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from "./components/ui/dropdown-menu";
import { Spinner } from "./components/ui/spinner";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemSeparator } from "./components/ui/item";
import { Separator } from "./components/ui/separator";
import { Feedback } from "./Feedback";
import { PageHeader } from "./PageHeader";
import { EmptyDetail, ListItem, Workbench } from "./Workbench";
import { SearchField } from "./SearchField";
import { ResourceFolders, type FolderChange } from "./ResourceFolders";
import { PluginTools } from "./PluginTools";

const typeLabels: Record<string, string> = { extensions: "extension", prompts: "prompt", themes: "theme" };
const newLabels = { prompts: "Prompt template", themes: "Theme", extensions: "Extension" } as const;
const builtinNotes: Record<string, string> = {
  mcp: "Turning it off turns off Pi's MCP support: no mcp.json server connects.",
  codemode: "Turning it off removes the codemode tool, so MCP tools with codemode exposure cannot be called.",
  "tool-search": "Turning it off removes tool_search, so deferred MCP tools cannot be loaded.",
  "llama.cpp": "Local llama.cpp provider support.",
};

function PluginDetail({ item, project, onOpen }: { item: ResourceView; project?: string; onOpen: () => void }) {
  const builtin = item.group.startsWith("Built-in");
  const editable = item.origin === "top-level";
  return <section className="detail" aria-labelledby="plugin-title">
    <header className="detail-header"><h2 id="plugin-title">{item.name}</h2>
      {!builtin && <div className="actions"><Button variant="outline" aria-label={`${editable ? "Edit" : "View"} ${item.name}`} onClick={onOpen}>{editable ? "Edit" : "View"}</Button></div>}</header>
    {!item.enabled && <Alert role="note"><AlertDescription>Turned off, so Pi does not load it.</AlertDescription></Alert>}
    {builtin && builtinNotes[item.name] && <Alert role="note"><AlertDescription>{builtinNotes[item.name]}</AlertDescription></Alert>}
    <dl className="detail-list">
      <div><dt>Type</dt><dd>{builtin ? "built-in extension" : typeLabels[item.type]}</dd></div>
      {item.description && <div><dt>Description</dt><dd>{item.description}</dd></div>}
      <div><dt>Source</dt><dd>{item.group}</dd></div>
      <div><dt>{builtin ? "Name" : "File"}</dt><dd><code>{item.path}</code></dd></div>
    </dl>
    {item.type === "extensions" && <PluginTools path={item.path} project={project} />}
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
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState("");
  const generation = useRef(0);
  // pi install / remove / update run on click; the list reloads when they finish.
  const job = useJob({ actions: ["package-install", "package-remove", "package-update", "packages-update"], project }, () => void refresh());
  const id = useId();

  async function refresh() {
    const request = generation.current;
    setError("");
    try {
      const next = await loadPlugins(project);
      if (generation.current === request) setView(next);
    } catch (cause) {
      if (generation.current === request) setError(cause instanceof Error ? cause.message : "Could not read the plugins.");
    }
  }
  useEffect(() => {
    setSelected(undefined); setMode(undefined); setPinned(undefined); setView(undefined);
    setChecking(false); setCheckError(""); void refresh();
    return () => { generation.current++; };
  }, [project]);

  async function checkUpdates() {
    const request = generation.current;
    setChecking(true); setCheckError("");
    try {
      await checkPackageUpdates(project);
      if (generation.current === request) await refresh();
    } catch (cause) {
      if (generation.current === request) setCheckError(cause instanceof Error ? cause.message : "Could not check updates. Try again.");
    } finally {
      if (generation.current === request) setChecking(false);
    }
  }

  // A check started before the reader left still runs on the server: join it, so its progress and result show here.
  useEffect(() => { if (view?.updateChecking && !checking) void checkUpdates(); }, [view?.updateChecking]);

  async function toggle(items: ResourceView[], enabled: boolean, label = items[0]?.name) {
    if (!view || !items.length) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const scope = items[0]!.scope === "project" ? "project" : "global";
      setView(await savePlugins(scope, scope === "project" ? view.projectRevision! : view.revision, items.map(item => ({ type: item.type, path: item.path })), enabled, project));
      setMessage(`${label} turned ${enabled ? "on" : "off"}. Applies to new Pi sessions, or after /reload.`);
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
      setMessage(`Filters saved for ${pkgSource}. Applies to new Pi sessions, or after /reload.`);
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
  const lastCheck = view?.updateCheck;
  const updateCount = lastCheck?.updates.length ?? 0;
  const packages = view && <section className="detail packages" aria-labelledby="packages-title">
    <header><h2 id="packages-title">Packages</h2>
      <p className="muted">Installed with pi install in this environment. Packages can run code: install only sources you trust.</p></header>
    <form className="install-form" onSubmit={event => { event.preventDefault(); void job.start({ action: "package-install", source: source.trim(), ...(installScope === "project" && project ? { project } : {}) }); }}>
      <Field className="flex-1 basis-72"><FieldLabel htmlFor={id + "source"}>Package source</FieldLabel>
        <Input id={id + "source"} value={source} placeholder="npm:@scope/name, git:github.com/user/repo or ./path" autoComplete="off" spellCheck={false} onChange={event => setSource(event.target.value)} /></Field>
      {project && <Field className="w-auto"><FieldLabel htmlFor={id + "for"}>For</FieldLabel>
        <OptionSelect id={id + "for"} value={installScope} onChange={setInstallScope}
          options={[{ value: "global", label: "Every project" }, { value: "project", label: "This project only" }] as const} /></Field>}
      <Button type="submit" disabled={job.running || checking || !source.trim()}>Install</Button>
    </form>
    <JobPanel job={job.job} error={job.error} onAnswer={value => void job.answer(value)} onCancel={() => void job.cancel()} onDismiss={job.dismiss} />
    <div className="list-header package-list-header flex-wrap"><h3>In settings.json</h3><span>{view.packages.length}</span>
      <Button variant="outline" size="sm" disabled={checking || job.running || !view.packages.length} onClick={() => void checkUpdates()}>
        {/* The region's status line announces the check; the spinner only shows it. */}
        {checking && <Spinner data-icon="inline-start" aria-hidden="true" />}Check for updates</Button>
      <Button variant="ghost" size="sm" disabled={job.running || checking || !view.packages.length} onClick={() => void job.start({ action: "packages-update", ...(project ? { project } : {}) })}>Update all</Button></div>
    <div className="my-4 flex flex-col gap-2">
      <p role="status" aria-live="polite" className="m-0">{checking ? "Checking for package updates…"
        : !lastCheck ? "Not checked yet. Check for updates to find newer packages."
        : lastCheck.offline ? "Check skipped: Pi is in offline mode."
        : updateCount ? `${updateCount} package ${updateCount === 1 ? "update" : "updates"} found.`
        : "No updates reported by Pi."}</p>
      {lastCheck && <p className="muted m-0">Last checked <time dateTime={lastCheck.checkedAt}>{new Date(lastCheck.checkedAt).toLocaleString()}</time></p>}
      <p className="muted m-0">Checks use npm and Git without installing anything. Pi skips local paths, pinned versions and failed lookups; no reported update is not a guarantee that every package is current.</p>
      {checkError && <Alert variant="destructive"><CircleAlert aria-hidden="true" /><AlertTitle>Could not check updates</AlertTitle><AlertDescription>{checkError}</AlertDescription></Alert>}
    </div>
    {/* ItemGroup is a list, which may own only list items: its separators are decoration (axe aria-required-children). */}
    {view.packages.length ? <ItemGroup>{view.packages.map((pkg, index) => <Fragment key={pkg.scope + pkg.source}>{index > 0 && <ItemSeparator aria-hidden="true" />}<Item size="sm" role="listitem">
      <ItemContent>
        <code translate="no" className="break-all">{pkg.source}</code>
        <ItemDescription>{pkg.scope === "project" ? "This project · " : ""}{pkg.installed ? "Installed" : "Not installed"}{pkg.filtered ? " · has resource filters" : ""}</ItemDescription>
      </ItemContent>
      {lastCheck?.updates.some(update => update.source === pkg.source && update.scope === pkg.scope) && <Badge variant="secondary"><ArrowUp aria-hidden="true" data-icon="inline-start" />Update available</Badge>}
      <ItemActions>
        <Button variant="ghost" size="xs" disabled={busy} aria-label={`Filters for ${pkg.source}`} onClick={() => setFiltering(pkg.scope + pkg.source)}>Filters</Button>
        <Button variant="ghost" size="xs" disabled={job.running || checking} aria-label={`Update package ${pkg.source}`} onClick={() => void job.start({ action: "package-update", source: pkg.source, ...(pkg.scope === "project" ? { project } : {}) })}>Update</Button>
        <Button variant="destructive" size="xs" disabled={job.running || checking} aria-label={`Remove package ${pkg.source}`} onClick={() => void job.start({ action: "package-remove", source: pkg.source, ...(pkg.scope === "project" ? { project } : {}) })}>Remove</Button>
      </ItemActions>
      {filtering === pkg.scope + pkg.source && <PackageFilterForm pkg={pkg} busy={busy} onCancel={() => setFiltering(undefined)}
        onSave={patch => void saveFilters(pkg.scope, pkg.source, patch)} />}
    </Item></Fragment>)}</ItemGroup> : <Empty><EmptyHeader><EmptyDescription>No packages yet. Install one by its npm name, git URL or folder.</EmptyDescription></EmptyHeader></Empty>}
  </section>;
  return <>
    <PageHeader title="Plugins" description="Extensions, prompt templates and themes, including Pi's built-ins and installed packages. Package skills are in the Skills tab."
      actions={<DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" />}><Plus aria-hidden="true" data-icon="inline-start" />New<ChevronDown aria-hidden="true" data-icon="inline-end" /></DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-auto"><DropdownMenuGroup>{(["prompts", "themes", "extensions"] as const).map(type =>
          <DropdownMenuItem key={type} onClick={() => { setMode(type); setSelected(undefined); setPinned(undefined); }}>{newLabels[type]}</DropdownMenuItem>)}</DropdownMenuGroup></DropdownMenuContent>
      </DropdownMenu>} />
    <Feedback message={message} onDismiss={() => { setMessage(""); setUndo(undefined); }}
      action={undo && { label: "Undo", disabled: busy, onClick: () => void restore(undo) }} />
    {error && <Alert variant="destructive"><CircleAlert aria-hidden="true" /><AlertTitle>Could not complete the change</AlertTitle><AlertDescription>{error}</AlertDescription>
      <div className="actions col-start-2 mt-2"><Button variant="outline" size="sm" onClick={() => void refresh()}>Reload</Button></div></Alert>}
    {!view ? !error && <div className="loading" aria-busy="true"><Spinner />Reading plugins…</div> : <Workbench open={open} onBack={back} backLabel="All plugins" list={<section aria-label="Plugin list">
      <div className="list-search"><SearchField label="Search plugins" placeholder="Search plugins…" value={query} onChange={setQuery} /></div>
      <ItemGroup>
        <div role="listitem" className="list-row"><ListItem selected={pinned === "packages"} onSelect={() => { setPinned("packages"); setSelected(undefined); setMode(undefined); }} icon={Package} name="Packages" state={updateCount ? `${updateCount} ${updateCount === 1 ? "update" : "updates"}` : view.packages.length} /></div>
        <div role="listitem" className="list-row"><ListItem selected={pinned === "folders"} onSelect={() => { setPinned("folders"); setSelected(undefined); setMode(undefined); }} icon={FolderOpen} name="Folders" state="where Pi finds plugins" /></div></ItemGroup>
      <Separator className="mt-2" />
      {!visible.length && <Empty><EmptyHeader><EmptyDescription>{resources.length ? `No plugins match “${query.trim()}”.` : "No plugins found."}</EmptyDescription></EmptyHeader></Empty>}
      {groups.map(group => {
        const members = visible.filter(item => item.group === group);
        return <div key={group} className="item-group">
          <div className="list-header"><h2>{group}</h2>
            <Switch aria-label={`Enable everything in ${group}`} checked={members.every(item => item.enabled)} disabled={busy}
              onCheckedChange={enabled => void toggle(members.filter(item => item.enabled !== enabled), enabled, `Everything in ${group}`)} /></div>
          <ItemGroup>{members.map(item => <div key={item.type + item.path} role="listitem" className="list-row">
            <ListItem selected={item.path === selected} onSelect={() => { setSelected(item.path); setMode(undefined); setPinned(undefined); }}
              name={item.name} state={item.enabled ? typeLabels[item.type] : "off"} />
            <Switch aria-label={`Enable ${item.name}`} checked={item.enabled} disabled={busy} onCheckedChange={enabled => void toggle([item], enabled)} />
          </div>)}</ItemGroup>
        </div>;
      })}
    </section>} detail={pinned === "packages" ? packages
      : pinned === "folders" ? <section className="detail plugin-folders" aria-labelledby="folders-title" key={folders}>
        <header><h2 id="folders-title">Folders</h2>
          <p className="muted">Pi finds extensions, prompt templates and themes in its own folders and in packages. Add other folders or files here.</p></header>
        {(["extensions", "prompts", "themes"] as const).map(type => <ResourceFolders key={type} type={type} project={project} onChanged={folderChanged} />)}
      </section>
      : mode && mode !== "edit" ? <NewResourceForm key={mode} type={mode} project={project} onCancel={() => setMode(undefined)}
          onCreated={async (path, name) => { await refresh(); setSelected(path); setMode("edit"); setMessage(`Created ${name}. Applies to new Pi sessions, or after /reload.`); }} />
      : current && mode === "edit" ? <ResourceEditor key={current.path} type={current.type} path={current.path} name={current.name} editable={current.origin === "top-level"}
          project={project} onMessage={setMessage} onClose={() => { setMode(undefined); void refresh(); }} />
      : current ? <PluginDetail key={JSON.stringify([project, current.path, view.revision, view.projectRevision])} item={current} project={project} onOpen={() => setMode("edit")} />
      : <EmptyDetail icon={Puzzle} title="No plugin selected">Choose an extension, prompt template or theme to see where it comes from, or open Packages to install more.</EmptyDetail>} />}
  </>;
}
