import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Bot, Boxes, FileText, Layers, Puzzle, ScrollText, Server, SlidersHorizontal, Wrench } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs";
import { Badge } from "./components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "./components/ui/alert-dialog";
import { checkPackageUpdates, loadPi, loadPlugins } from "./api";
import { Toaster } from "./components/ui/toast";
import { TooltipProvider } from "./components/ui/tooltip";
import { ProjectPicker, TrustPanel, useProject } from "./ProjectBar";
import { SoundToggle } from "./Sound";
import { GeneralTab } from "./GeneralTab";
import { InstructionsTab } from "./InstructionsTab";
import { McpTab } from "./McpTab";
import { ModelsTab } from "./ModelsTab";
import { PluginsTab } from "./PluginsTab";
import { SubagentsTab } from "./SubagentsTab";
import { SkillsTab } from "./SkillsTab";
import { ToolsTab } from "./ToolsTab";
import { ContextTab } from "./ContextTab";
import { DemoNotice } from "./DemoNotice";

type Panel = (props: { project?: string; loadsInProject?: boolean }) => React.ReactElement;
// Only implemented tabs are listed (SPEC.md: no fake tabs).
const tabs: { id: string; label: string; icon: typeof SlidersHorizontal; Panel: Panel }[] = [
  { id: "general", label: "General", icon: SlidersHorizontal, Panel: GeneralTab },
  { id: "models", label: "Models", icon: Boxes, Panel: ModelsTab },
  { id: "skills", label: "Skills", icon: Layers, Panel: SkillsTab },
  { id: "subagents", label: "Sub-agents", icon: Bot, Panel: SubagentsTab },
  { id: "plugins", label: "Plugins", icon: Puzzle, Panel: PluginsTab },
  { id: "mcp", label: "MCP", icon: Server, Panel: McpTab },
  { id: "tools", label: "Tools", icon: Wrench, Panel: ToolsTab },
  { id: "instructions", label: "Instructions", icon: FileText, Panel: InstructionsTab },
  { id: "context", label: "Context", icon: ScrollText, Panel: ContextTab },
];

/** Tabs that were renamed, so their old links still open them. */
const RENAMED: Record<string, string> = { "system-prompt": "context" };

/** #tab, or #tab/entry where a tab opens on one of its entries (General's groups, Models' Defaults, Tools' Startup tools). */
function tabFromHash(): string {
  const named = location.hash.slice(1).split("/")[0]!;
  const id = RENAMED[named] ?? named;
  return tabs.some(tab => tab.id === id) ? id : tabs[0]!.id;
}

/** Pi's π as an ink stamp; the favicon in index.html draws the same mark. */
function PiMark() {
  return <svg viewBox="0 0 20 20" aria-hidden="true">
    <rect width="20" height="20" rx="5" fill="currentColor" />
    <path d="M5.5 7.25h9M8.25 7.25v7M12 7.25v5.25c0 1 .55 1.75 1.75 1.75" fill="none" strokeWidth="1.75" strokeLinecap="round" className="stroke-background" />
  </svg>;
}

/** The Pi the app was built against, apart from the installed one that General's Pi page shows. */
function BuiltFor() {
  const [version, setVersion] = useState<string>();
  useEffect(() => { loadPi().then(pi => setVersion(pi.builtFor)).catch(() => setVersion(undefined)); }, []);
  return version ? <span className="built-for">Built for Pi {version}</span> : null;
}

/**
 * Package updates found for the chosen scope. Listing starts a check on the server when one is due, which this
 * waits for; it asks again on each tab change, so an update made in Plugins clears its count.
 */
function useUpdateCount(project: string | undefined, active: string) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let live = true;
    loadPlugins(project).then(view => view.updateChecking ? checkPackageUpdates(project) : view.updateCheck)
      .then(check => { if (live) setCount(check?.updates.length ?? 0); }, () => { if (live) setCount(0); });
    return () => { live = false; };
  }, [project, active]);
  return count;
}

export function App() {
  const [active, setActive] = useState(tabFromHash);
  const { projects, project, choose, updateTrust } = useProject();
  const current = projects?.find(entry => entry.path === project);
  const updates = useUpdateCount(project, active);
  const [instructionDraft, setInstructionDraft] = useState<string>();
  const [pendingNavigation, setPendingNavigation] = useState<{ proceed: () => void }>();
  const navigationTrigger = useRef<HTMLElement | null>(null);
  const requestNavigation = useCallback((proceed: () => void, trigger = document.activeElement) => {
    if (!instructionDraft) { proceed(); return; }
    navigationTrigger.current = trigger instanceof HTMLElement ? trigger : null;
    setPendingNavigation({ proceed });
  }, [instructionDraft]);
  useEffect(() => {
    const sync = (event: HashChangeEvent) => {
      const next = tabFromHash();
      if (next === active) return;
      // A hash change cannot be cancelled; keep the current bookmark until the draft decision.
      if (instructionDraft) history.replaceState(null, "", event.oldURL);
      requestNavigation(() => { history.replaceState(null, "", event.newURL); setActive(next); });
    };
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [active, instructionDraft, requestNavigation]);
  useEffect(() => {
    if (!instructionDraft) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = true; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [instructionDraft]);
  useEffect(() => {
    document.title = `${tabs.find(tab => tab.id === active)?.label} · Pi Settings`;
    // On a narrow screen the chosen tab may sit past the edge of the scrolling tab bar.
    document.querySelector("[role=tab][aria-selected=true]")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active]);
  // main scrolls every tab, and a tab that shows its last result at once would open where the last one was read to.
  useLayoutEffect(() => { document.getElementById("main")?.scrollTo({ top: 0, behavior: "instant" }); }, [active]);
  useEffect(() => {
    // "/" moves to the page's search field, unless the reader is typing or in a menu.
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target?.closest("input, textarea, select, [contenteditable], [role=menu]")) return;
      const search = document.querySelector<HTMLInputElement>("main input[data-shortcut]");
      if (!search) return;
      event.preventDefault();
      search.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  function select(id: string) {
    if (id !== active) requestNavigation(() => { history.replaceState(null, "", "#" + id); setActive(id); });
  }
  return <TooltipProvider><Tabs value={active} onValueChange={value => select(String(value))}><div className="app">
    <a className="skip-link" href="#main" onClick={event => { event.preventDefault(); document.getElementById("main")?.focus(); }}>Skip to content</a>
    <header>
      <div className="topbar">
        <span className="brand"><PiMark /><span>Pi Settings</span></span>
        <BuiltFor />
        <ProjectPicker projects={projects} project={project} onChoose={path => {
          if (path !== project) requestNavigation(() => choose(path), document.getElementById("project-picker"));
        }} />
        <SoundToggle />
      </div>
      <div className="tabbar">
        <TabsList variant="line" aria-label="Settings sections">
          {tabs.map(({ id, label, icon: Icon }) => {
            const count = id === "plugins" ? updates : 0;
            return <TabsTrigger key={id} value={id} aria-label={count ? `${label}, ${count} ${count === 1 ? "update" : "updates"}` : undefined}>
              <Icon aria-hidden="true" />{label}{count > 0 && <Badge variant="secondary">{count}</Badge>}</TabsTrigger>;
          })}
        </TabsList>
      </div>
    </header>
    <main id="main" tabIndex={-1}>
      {import.meta.env.VITE_DEMO && <DemoNotice />}
      {current && <TrustPanel project={current.path} trust={current.trust} onChange={trust => updateTrust(current.path, trust)} />}
      {tabs.map(({ id, Panel }) => <TabsContent key={id} value={id} className="flex flex-col">
        {id === "instructions"
          ? <InstructionsTab key={project} project={project} loadsInProject={current?.trust.loadsWithoutPrompt} onDraftChange={setInstructionDraft} onNavigate={requestNavigation} />
          : <Panel project={project} loadsInProject={current?.trust.loadsWithoutPrompt} />}
      </TabsContent>)}
    </main>
    <AlertDialog open={!!pendingNavigation} onOpenChange={open => { if (!open) setPendingNavigation(undefined); }}>
      <AlertDialogContent finalFocus={() => navigationTrigger.current?.isConnected && navigationTrigger.current.checkVisibility() ? navigationTrigger.current : document.getElementById("main")}>
        <AlertDialogHeader>
          <AlertDialogTitle>Discard the unsaved changes?</AlertDialogTitle>
          <AlertDialogDescription>Your edits to {instructionDraft} are not saved.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep editing</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={() => { const next = pendingNavigation; setPendingNavigation(undefined); next?.proceed(); }}>Discard</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <Toaster />
  </div></Tabs></TooltipProvider>;
}
