/** A profile as Pi's example subagent extension (examples/extensions/subagent) reads it. */
export type AgentView = {
  file: string;
  scope: "user" | "project";
  /** A project profile of the same name replaces this one in that project. */
  shadowed?: boolean;
  revision: string;
  name?: string;
  description?: string;
  tools?: string[];
  model?: string;
  prompt: string;
  /** Frontmatter keys other tools added (pi-web, pi-subagents); kept as they are. */
  extraKeys: string[];
  /** Why Pi's example extension skips this file. */
  error?: string;
};

export type AgentInput = { name: string; description: string; tools: string[]; model?: string; prompt: string };

export type AgentsView = { dir: string; projectDir?: string; readerInstalled: boolean; agents: AgentView[] };
