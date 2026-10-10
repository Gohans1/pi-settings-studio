import { useEffect, useMemo, useState, type ReactNode } from "react";
import { CircleAlert, CircleCheck, CircleX, Eye, EyeOff, ListChecks, RefreshCw, TriangleAlert } from "lucide-react";
import type { ToolsView } from "../shared/plugin-tools";
import { loadTools } from "./api";
import { Alert, AlertDescription, AlertTitle } from "./components/ui/alert";
import { Button, buttonVariants } from "./components/ui/button";
import { Empty, EmptyDescription, EmptyHeader } from "./components/ui/empty";
import { ItemGroup } from "./components/ui/item";
import { Separator } from "./components/ui/separator";
import { Spinner } from "./components/ui/spinner";
import { Disclosure } from "./Disclosure";
import { Feedback } from "./Feedback";
import { PageHeader } from "./PageHeader";
import { SettingsForm } from "./SettingsForm";
import { SearchField } from "./SearchField";
import { FAMILY_ICON, REACH, SourceLine, SourceTag, TAB_NAMES, Tally, ToolRows } from "./ToolRows";
import { useCached } from "./useCached";
import { ListItem, Workbench } from "./Workbench";
import { FAMILIES, REACHES, buildCatalog, bySource, isOff, type Catalog, type Source, type Tool } from "./tool-catalog";

/** The two pinned views: what the model is given, and everything else. */
type View = "sees" | "unseen";
const VIEWS = { sees: { title: "What the model sees", icon: Eye }, unseen: { title: "What the model doesn't see", icon: EyeOff } } as const;
const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
/** The pinned editor of Pi's own tools; a link to #tools/startup opens it, from another tab or from this one. */
const STARTUP = "startup";
const linked = () => location.hash === "#tools/startup";

function Gateway({ on, name }: { on: boolean; name: string }) {
  const Icon = on ? CircleCheck : CircleX;
  return <span className="tools-gateway" data-on={on || undefined}><Icon aria-hidden="true" />{name} {on ? "on" : "off"}</span>;
}

/** The page's answer in one paragraph: what the model gets, what it can reach, what is off. */
function Overview({ catalog }: { catalog: Catalog }) {
  const of = (test: (tool: Tool) => boolean) => catalog.tools.filter(test).length;
  const sees = of(tool => tool.reach === "sees"), demand = of(tool => tool.reach === "demand"), off = of(isOff);
  const sourcesOff = catalog.sources.filter(source => source.status === "off").length;
  return <div className="tools-overview">
    <p>A new session declares <strong>{sees}</strong> tools to the model. <strong>{demand}</strong> more are on demand.{" "}
      <strong>{off}</strong> are off{sourcesOff ? <>, and <strong>{sourcesOff}</strong> sources are turned off</> : null}.</p>
    {demand > 0 && <p className="tools-gateways">On demand through <Gateway on={catalog.gateways.codemode} name="Code mode" /> <Gateway on={catalog.gateways.toolSearch} name="Tool search" /></p>}
  </div>;
}

/** Tools under their sources; the level keeps the outline whole below an h2 or an h3. */
function BySource({ catalog, tools, level = 3, showReach = false }: { catalog: Catalog; tools: Tool[]; level?: 3 | 4; showReach?: boolean }) {
  const Heading = level === 3 ? "h3" : "h4";
  return <>{bySource(catalog, tools).map(({ source, tools: own }) => <section key={source.key} className="source-group" aria-label={source.title}>
    <Heading className="source-group-title"><SourceTag source={source} /><span className="tools-count">{own.length}</span></Heading>
    <ToolRows tools={own} catalog={catalog} showReach={showReach} />
  </section>)}</>;
}

function Gateways({ catalog }: { catalog: Catalog }) {
  const { codemode, toolSearch } = catalog.gateways;
  if (!codemode && !toolSearch) return <Alert role="note"><TriangleAlert aria-hidden="true" /><AlertDescription>Code mode and tool search are both off, so the model cannot reach these. Turn one on in <a href="#tools/startup">Startup tools</a>.</AlertDescription></Alert>;
  return <p className="tools-note">Not declared. The model finds and calls these through {[codemode && "code mode", toolSearch && "tool search"].filter(Boolean).join(" or ")} when a task needs them.</p>;
}

function Part({ title, count: n, children }: { title: string; count: number; children: ReactNode }) {
  return <section className="reach-part" aria-label={title}><h3 className="reach-part-title">{title}<span className="tools-count">{n}</span></h3>{children}</section>;
}

function Filtered({ query }: { query: string }) {
  return query ? <p className="tools-note">Showing tools that match “{query}”.</p> : null;
}

function NoMatch({ query }: { query: string }) {
  return <Empty><EmptyHeader><EmptyDescription>No tools here match “{query}”. The list shows where they are.</EmptyDescription></EmptyHeader></Empty>;
}

function ReachView({ view, catalog, tools, query }: { view: View; catalog: Catalog; tools: Tool[]; query: string }) {
  const sees = tools.filter(tool => tool.reach === "sees"), demand = tools.filter(tool => tool.reach === "demand"), off = tools.filter(isOff);
  const header = <><header className="detail-header"><h2>{VIEWS[view].title}</h2></header><Filtered query={query} /></>;
  if (query && !(view === "sees" ? sees : [...demand, ...off]).length) return <div className="detail">{header}<NoMatch query={query} /></div>;
  if (view === "sees") return <div className="detail">{header}
    <p className="tools-note">Declared to the model at the start of every new session, from {count(bySource(catalog, sees).length, "source", "sources")}. Each declaration takes context.</p>
    <BySource catalog={catalog} tools={sees} />
  </div>;
  const quiet = query ? [] : catalog.sources.filter(source => source.status !== "on");
  return <div className="detail">{header}
    <p className="tools-note">Not declared to the model. Some it can still reach on demand; the rest are off.</p>
    <Part title="On demand" count={demand.length}><Gateways catalog={catalog} /><BySource catalog={catalog} tools={demand} level={4} /></Part>
    <Part title="Off" count={off.length}>
      <p className="tools-note">Registered but not given to the model: nothing reaches these.</p>
      <Disclosure label={`Show ${count(off.length, "off tool", "off tools")}`} defaultOpen={!!query}>
        <BySource catalog={catalog} tools={off} level={4} showReach />
        {quiet.length > 0 && <section aria-label="Sources with no tools here"><h4 className="source-group-title">Sources with no tools here</h4>
          <ul className="source-lines">{quiet.map(source => <SourceLine key={source.key} source={source} />)}</ul></section>}
      </Disclosure>
    </Part>
  </div>;
}

function SourceDetail({ source, catalog, tools, query }: { source: Source; catalog: Catalog; tools: Tool[]; query: string }) {
  return <div className="detail">
    <header className="detail-header"><h2>{source.title}</h2>
      <div className="actions"><a className={buttonVariants({ variant: "outline", size: "sm" })} href={"#" + source.tab}>
        {source.status === "off" ? "Turn on" : "Change"} in {TAB_NAMES[source.tab]}</a></div></header>
    {source.detail && <p className="tools-note">{source.detail}</p>}
    <Filtered query={query} />
    {source.status === "on" && <Tally source={source} />}
    {source.status === "off" && <Alert role="note"><AlertDescription>Turned off, so Pi loads none of its tools.</AlertDescription></Alert>}
    {source.status === "empty" && <Alert role="note"><AlertDescription>{source.family === "mcp" ? "On, but it offered no tools at startup. Test its connection in MCP." : "On, but it registers no tools."}</AlertDescription></Alert>}
    {query && source.tools.length > 0 && !tools.length && <NoMatch query={query} />}
    {REACHES.map(reach => {
      const own = tools.filter(tool => tool.reach === reach);
      return own.length ? <section key={reach} className="source-group" aria-label={REACH[reach].label}>
        <h3 className="source-group-title">{REACH[reach].label}<span className="tools-count">{own.length}</span></h3>
        <ToolRows tools={own} catalog={catalog} showReach={false} />
      </section> : null;
    })}
  </div>;
}

/** The one state a list row has room for: what matters most about the source. */
function headline(source: Source, tools: Tool[], query: string) {
  if (query) return count(tools.length, "match", "matches");
  if (source.status !== "on") return source.status === "off" ? "Off" : "No tools";
  const seen = tools.filter(tool => tool.reach === "sees").length, demand = tools.filter(tool => tool.reach === "demand").length;
  return seen ? `${seen} seen` : demand ? `${demand} on demand` : `${tools.length} off`;
}

export function ToolsTab({ project }: { project?: string }) {
  const { data: view, error, loading, refresh } = useCached<ToolsView>(`tools\0${project ?? ""}`, (signal, fresh) => loadTools(project, signal, fresh));
  // Kept across refreshes: the chosen view, source or Startup tools, the narrow screen's pane and the search.
  const [chosen, setChosen] = useState<string>(() => linked() ? STARTUP : "sees");
  const [open, setOpen] = useState(linked);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const catalog = useMemo(() => view && buildCatalog(view), [view]);
  const words = query.trim();
  useEffect(() => {
    const follow = () => { if (linked()) { setChosen(STARTUP); setOpen(true); } };
    window.addEventListener("hashchange", follow);
    return () => window.removeEventListener("hashchange", follow);
  }, []);

  function workbench(catalog: Catalog) {
    // Choosing leaves #tools/startup, so following a link to it changes the hash again.
    const choose = (key: string) => { setChosen(key); setOpen(true); if (linked()) history.replaceState(null, "", "#tools"); };
    const lower = words.toLowerCase();
    const matches = (tool: Tool) => !lower || [tool.short, tool.name, tool.description, catalog.byKey.get(tool.sourceKey)!.title].some(text => text.toLowerCase().includes(lower));
    const tools = catalog.tools.filter(matches);
    const of = (source: Source) => tools.filter(tool => tool.sourceKey === source.key);
    const pinned = { sees: tools.filter(tool => tool.reach === "sees").length, unseen: tools.filter(tool => tool.reach !== "sees").length };
    const source = catalog.byKey.get(chosen);
    // A source no longer listed falls back to what the model sees.
    const shown = chosen === STARTUP || chosen === "unseen" || source ? chosen : "sees";
    const list = <section aria-label="Tool views and sources">
      <div className="list-search"><SearchField label="Search tools" placeholder="Search tools…" value={query} onChange={setQuery} /></div>
      <ItemGroup aria-label="What the model gets">{(["sees", "unseen"] as View[]).map(key => <div role="listitem" key={key}>
        <ListItem selected={shown === key} onSelect={() => choose(key)} icon={VIEWS[key].icon} name={VIEWS[key].title} state={count(pinned[key], "tool", "tools")} />
      </div>)}
        <div role="listitem"><ListItem selected={shown === STARTUP} onSelect={() => choose(STARTUP)} icon={ListChecks} name="Startup tools" state="Pi's tools, on or off" /></div>
      </ItemGroup>
      <Separator className="mt-2" />
      {words && <p className="list-count">{count(tools.length, "tool matches", "tools match")} “{words}”</p>}
      {FAMILIES.map(({ family, title }) => {
        const sources = catalog.sources.filter(entry => entry.family === family && (!lower || of(entry).length > 0));
        return sources.length ? <section key={family} className="item-group" aria-labelledby={`tools-${family}`}>
          <div className="list-header"><h2 id={`tools-${family}`}>{title}</h2><span>{sources.length}</span></div>
          <ItemGroup aria-labelledby={`tools-${family}`}>{sources.map(entry => <div role="listitem" key={entry.key}>
            <ListItem selected={chosen === entry.key} onSelect={() => choose(entry.key)} icon={FAMILY_ICON[family]} name={entry.title}
              state={headline(entry, of(entry), words)} quiet={entry.status !== "on"} />
          </div>)}</ItemGroup>
        </section> : null;
      })}
    </section>;
    const detail = shown === STARTUP ? <section className="detail" aria-labelledby="startup-title"><header className="detail-header"><h2 id="startup-title">Startup tools</h2></header>
        <SettingsForm section="tools" project={project} onSaved={text => { setMessage(text); refresh(); }} /></section>
      : source ? <SourceDetail source={source} catalog={catalog} tools={of(source)} query={words} />
      : <ReachView view={shown === "unseen" ? "unseen" : "sees"} catalog={catalog} tools={tools} query={words} />;
    return <Workbench list={list} detail={detail} open={open} onBack={() => setOpen(false)} backLabel="All views" />;
  }

  return <>
    <PageHeader title="Tools" description="What a new session gives the model, and where each tool comes from: Pi, an extension or an MCP server."
      actions={<Button variant="outline" size="sm" disabled={loading} onClick={refresh}><RefreshCw aria-hidden="true" data-icon="inline-start" />Refresh tools</Button>} />
    <Feedback message={message} onDismiss={() => setMessage("")} />
    {loading && <p className="loading" role="status"><Spinner aria-hidden="true" />{view ? "Checking for changes…" : "Loading tools with Pi…"}</p>}
    {error && <Alert variant="destructive"><CircleAlert aria-hidden="true" /><AlertTitle>{view ? "Could not check again" : "Could not inspect tools"}</AlertTitle><AlertDescription>{error} Try Refresh tools.</AlertDescription></Alert>}
    {view && catalog && <>
      {!view.complete && <Alert variant="destructive"><CircleAlert aria-hidden="true" /><AlertTitle>Could not verify all tools</AlertTitle>
        <AlertDescription><p>The list may be incomplete. Fix the extension or MCP server, then Refresh tools.</p>
          {view.issues.map((issue, index) => <p key={index} className="break-words">{issue}</p>)}</AlertDescription></Alert>}
      <Overview catalog={catalog} />
      {workbench(catalog)}
      <p className="tools-footnote">{project ? "Global and project settings, the project trusted for this preview" : "Global settings only"}. Checked {new Date(view.checkedAt).toLocaleTimeString()}: a startup preview, not a running thread.</p>
    </>}
  </>;
}
