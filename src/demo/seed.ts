import { copyFile, mkdir, utimes, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const json = (value: object) => JSON.stringify(value, null, 2) + "\n";
const lines = (...entries: object[]) => entries.map(entry => JSON.stringify(entry)).join("\n") + "\n";
const skill = (name: string, description: string, body: string, extra = "") => `---\nname: ${name}\ndescription: ${description}\n${extra}---\n\n${body}\n`;
const declaration = (name: string, description: string) => ({ name, description, parameters: { type: "object", properties: {} } });

/** The sample Pi home of the demo: an agent folder with a few of everything, and one project. Nothing in it is real. */
export async function seedDemo(home: string) {
  const agent = join(home, ".pi", "agent");
  const project = join(home, "projects", "my-app");
  const put = async (path: string, text: string) => { await mkdir(dirname(path), { recursive: true }); await writeFile(path, text); };

  await put(join(agent, "settings.json"), json({
    defaultProvider: "anthropic", defaultModel: "claude-sonnet-5-5", defaultThinkingLevel: "medium",
    enabledModels: ["anthropic/claude-sonnet-5-5", "anthropic/claude-haiku-5-5", "openai/gpt-5.5", "ollama/*"],
    defaultTools: ["+codemode"], defaultProjectTrust: "always", enableSkillCommands: true, steeringMode: "one-at-a-time",
  }));
  await put(join(agent, "auth.json"), json({ anthropic: { type: "api_key", key: "sk-ant-sample-not-a-key" }, openai: { type: "api_key", key: "sk-sample-not-a-key" } }));
  await put(join(agent, "models.json"), json({ providers: { ollama: { baseUrl: "http://localhost:11434/v1", api: "openai-completions", apiKey: "ollama", models: [{ id: "qwen2.5-coder:7b" }, { id: "llama3.1:8b" }] } } }));

  await put(join(agent, "AGENTS.md"), "# Working agreements\n\n- Prefer small, reviewable changes.\n- Run the tests before saying a task is done.\n- Ask when a requirement is unclear.\n");
  await put(join(agent, "APPEND_SYSTEM.md"), "Answer in the language the user writes in.\n");
  await put(join(agent, "skills", "code-review", "SKILL.md"), skill("code-review", "Review a diff for bugs, missing tests and unclear names before it merges.", "Read the diff, then list findings by severity: blockers first, nits last."));
  await put(join(agent, "skills", "release-notes", "SKILL.md"), skill("release-notes", "Draft release notes from the commits since the last tag.", "Read `git log` since the last tag and group the changes by impact. Use template.md."));
  await put(join(agent, "skills", "release-notes", "template.md"), "## What changed\n\n### Added\n\n### Fixed\n");
  await put(join(agent, "skills", "test-first", "SKILL.md"), skill("test-first", "Write the failing test before the code that makes it pass.", "Write one test, watch it fail for the right reason, then write the least code that passes."));
  await put(join(agent, "skills", "commit-message", "SKILL.md"), skill("commit-message", "Write a commit message that says why, from the staged diff.", "Subject under 72 characters, then a short body on why the change was needed.", "disable-model-invocation: true\n"));
  await put(join(agent, "prompts", "review.md"), "---\ndescription: Review staged git changes\nargument-hint: \"[focus]\"\n---\nReview the staged changes. Focus on ${1:-correctness, security, and error handling}.\n");
  await put(join(agent, "agents", "scout.md"), "---\nname: scout\ndescription: Fast codebase recon that returns compressed context for handoff to other agents\ntools: read, grep, find, ls, bash\nmodel: claude-haiku-5-5\n---\n\nYou are a scout. Investigate the codebase quickly and return structured findings another agent can use without re-reading the files.\n");
  await put(join(agent, "agents", "reviewer.md"), "---\nname: reviewer\ndescription: Code review specialist for quality and security analysis\ntools: read, grep, find, ls, bash\nmodel: claude-sonnet-5-5\n---\n\nYou are a senior reviewer. Read the change, check it against the project's rules and report issues by severity.\n");
  await put(join(agent, "extensions", "todo.ts"), `export default pi => {
  const tool = (name, description, exposure) => pi.registerTool({ name, label: name, description, exposure,
    parameters: { type: "object", properties: {} }, execute: async () => ({ content: [], details: undefined }) });
  tool("todo_add", "Add an item to the task list.", "direct");
  tool("todo_list", "List the open items of the task list.", "codemode");
};
`);
  await put(join(agent, "extensions", "notify.ts"), `export default pi => pi.on("before_agent_start", () => {});\n`);

  // A stdio server that connects, and a remote one that is switched off, so opening MCP reaches no network.
  const docs = join(home, "mcp", "docs-server.ts");
  await mkdir(dirname(docs), { recursive: true });
  await copyFile(new URL("./docs-server.ts", import.meta.url), docs);
  await put(join(agent, "mcp.json"), json({ mcpServers: {
    docs: { command: "bun", args: [docs], description: "Product documentation search" },
    github: { url: "https://api.githubcopilot.com/mcp/", enabled: false, description: "Issues and pull requests" },
  } }));

  await put(join(project, "AGENTS.md"), "# my-app\n\nA small web app. Use Bun, keep modules short, and write a test with each fix.\n");
  await put(join(project, ".pi", "settings.json"), json({ defaultThinkingLevel: "high" }));
  await put(join(project, ".pi", "skills", "deploy-checklist", "SKILL.md"), skill("deploy-checklist", "Check a release against the deploy checklist before it ships.", "Run the tests, check the changelog, then confirm the migration order."));
  await put(join(project, ".pi", "mcp.json"), json({ mcpServers: { postgres: { command: "npx", args: ["-y", "@modelcontextprotocol/server-postgres"], enabled: false, description: "Read-only access to the staging database" } } }));

  // One session, so Context › Recorded session has something to show.
  const at = (n: number) => ({ timestamp: `2026-10-09T10:00:0${n}.000Z`, ms: Date.parse(`2026-10-09T10:00:0${n}.000Z`) });
  const [a, b, c] = [at(1), at(2), at(3)];
  const session = join(agent, "sessions", "--home-demo-projects-my-app--", "2026-10-09T10-00-00-000Z_demo1.jsonl");
  await put(session, lines(
    { type: "session", version: 3, id: "demo1", timestamp: a.timestamp, cwd: project },
    { type: "message", id: "e1", parentId: null, timestamp: a.timestamp, message: { role: "system", content: "", timestamp: a.ms,
      sections: { preamble: "You are Pi, a coding agent. You read files, run commands and edit code to finish the user's task.", tools: "<tools>\n- read: Read the contents of a file.\n- bash: Run a command.\n- edit: Edit a file.\n- write: Write a file.\n- codemode: Run JavaScript that calls other tools.\n</tools>", rules: "<rules>\n- Prefer small, reviewable changes.\n- Run the tests before saying a task is done.\n</rules>" },
      toolsAdded: [declaration("read", "Read the contents of a file."), declaration("bash", "Run a command in the working directory."), declaration("edit", "Edit a file using exact text replacement."), declaration("write", "Write content to a file."), declaration("codemode", "Run JavaScript that calls other tools.")] } },
    { type: "message", id: "e2", parentId: "e1", timestamp: b.timestamp, message: { role: "user", content: "Add a dark mode toggle to the settings page", timestamp: b.ms } },
    { type: "message", id: "e3", parentId: "e2", timestamp: c.timestamp, message: { role: "system", content: "", timestamp: c.ms, toolsAdded: [declaration("mcp__docs__search_docs", "Search the product documentation.")] } },
  ));
  await utimes(session, new Date("2026-10-09T10:05:00Z"), new Date("2026-10-09T10:05:00Z"));
  return { agent, project };
}
