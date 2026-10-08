import { useEffect, useState } from "react";
import { Bot, Boxes, FileText, Layers, Puzzle, ScrollText, Server, SlidersHorizontal } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs";
import { ProjectPicker, TrustPanel, useProject } from "./ProjectBar";
import { GeneralTab } from "./GeneralTab";
import { InstructionsTab } from "./InstructionsTab";
import { McpTab } from "./McpTab";
import { ModelsTab } from "./ModelsTab";
import { PluginsTab } from "./PluginsTab";
import { SubagentsTab } from "./SubagentsTab";
import { SkillsTab } from "./SkillsTab";
import { SystemPromptTab } from "./SystemPromptTab";

type Panel = (props: { project?: string; loadsInProject?: boolean }) => React.ReactElement;
// Only implemented tabs are listed (SPEC.md: no fake tabs).
const tabs: { id: string; label: string; icon: typeof SlidersHorizontal; Panel: Panel }[] = [
  { id: "general", label: "General", icon: SlidersHorizontal, Panel: GeneralTab },
  { id: "models", label: "Models", icon: Boxes, Panel: ModelsTab },
  { id: "skills", label: "Skills", icon: Layers, Panel: SkillsTab },
  { id: "subagents", label: "Sub-agents", icon: Bot, Panel: SubagentsTab },
  { id: "plugins", label: "Plugins", icon: Puzzle, Panel: PluginsTab },
  { id: "mcp", label: "MCP", icon: Server, Panel: McpTab },
  { id: "instructions", label: "Instructions", icon: FileText, Panel: InstructionsTab },
  { id: "system-prompt", label: "System prompt", icon: ScrollText, Panel: SystemPromptTab },
];

function tabFromHash(): string {
  const id = location.hash.slice(1);
  return tabs.some(tab => tab.id === id) ? id : tabs[0]!.id;
}

/** Pi's π as an ink stamp; the favicon in index.html draws the same mark. */
function PiMark() {
  return <svg viewBox="0 0 20 20" aria-hidden="true">
    <rect width="20" height="20" rx="5" fill="currentColor" />
    <path d="M5.5 7.25h9M8.25 7.25v7M12 7.25v5.25c0 1 .55 1.75 1.75 1.75" fill="none" strokeWidth="1.75" strokeLinecap="round" className="stroke-background" />
  </svg>;
}

export function App() {
  const [active, setActive] = useState(tabFromHash);
  const { projects, project, choose, updateTrust } = useProject();
  const current = projects?.find(entry => entry.path === project);
  useEffect(() => {
    const sync = () => setActive(tabFromHash());
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  useEffect(() => {
    document.title = `${tabs.find(tab => tab.id === active)?.label} · Pi Settings`;
    // On a narrow screen the chosen tab may sit past the edge of the scrolling tab bar.
    document.querySelector("[role=tab][aria-selected=true]")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active]);
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
    history.replaceState(null, "", "#" + id);
    setActive(id);
  }
  return <Tabs className="app grid gap-0" value={active} onValueChange={value => select(String(value))}>
    <a className="skip-link" href="#main">Skip to content</a>
    <header>
      <div className="topbar">
        <span className="brand"><PiMark /><span>Pi Settings</span></span>
        <ProjectPicker projects={projects} project={project} onChoose={choose} />
      </div>
      <div className="tabbar">
        <TabsList variant="line" aria-label="Settings sections">
          {tabs.map(({ id, label, icon: Icon }) => <TabsTrigger key={id} value={id}><Icon aria-hidden="true" />{label}</TabsTrigger>)}
        </TabsList>
      </div>
    </header>
    <main id="main" tabIndex={-1}>
      {current && <TrustPanel project={current.path} trust={current.trust} onChange={trust => updateTrust(current.path, trust)} />}
      {tabs.map(({ id, Panel }) => <TabsContent key={id} value={id} className="flex flex-col"><Panel project={project} loadsInProject={current?.trust.loadsInT3Code} /></TabsContent>)}
    </main>
  </Tabs>;
}
