import { useEffect, useState } from "react";
import { Bot, Layers, Puzzle, ScrollText, Server, SlidersHorizontal } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs";
import { GeneralTab } from "./GeneralTab";
import { McpTab } from "./McpTab";
import { PluginsTab } from "./PluginsTab";
import { SubagentsTab } from "./SubagentsTab";
import { SkillsTab } from "./SkillsTab";
import { SystemPromptTab } from "./SystemPromptTab";

// Only implemented tabs are listed (SPEC.md: no fake tabs).
const tabs = [
  { id: "general", label: "General", icon: SlidersHorizontal, Panel: GeneralTab },
  { id: "skills", label: "Skills", icon: Layers, Panel: SkillsTab },
  { id: "subagents", label: "Sub-agents", icon: Bot, Panel: SubagentsTab },
  { id: "plugins", label: "Plugins", icon: Puzzle, Panel: PluginsTab },
  { id: "mcp", label: "MCP", icon: Server, Panel: McpTab },
  { id: "system-prompt", label: "System prompt", icon: ScrollText, Panel: SystemPromptTab },
];

function tabFromHash(): string {
  const id = location.hash.slice(1);
  return tabs.some(tab => tab.id === id) ? id : tabs[0]!.id;
}

export function App() {
  const [active, setActive] = useState(tabFromHash);
  useEffect(() => {
    const sync = () => setActive(tabFromHash());
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  function select(id: string) {
    history.replaceState(null, "", "#" + id);
    setActive(id);
  }
  return <Tabs className="app" value={active} onValueChange={value => select(String(value))}>
    <a className="skip-link" href="#main">Skip to content</a>
    <header className="app-header">
      <strong className="identity">Settings</strong>
      <TabsList variant="line" aria-label="Settings sections" className="tab-bar">
        {tabs.map(({ id, label, icon: Icon }) => <TabsTrigger key={id} value={id}><Icon aria-hidden="true" />{label}</TabsTrigger>)}
      </TabsList>
    </header>
    <main id="main" tabIndex={-1}>
      {tabs.map(({ id, Panel }) => <TabsContent key={id} value={id}><Panel /></TabsContent>)}
    </main>
  </Tabs>;
}
