// Runs only in a disposable subprocess: installed extensions are trusted executable code.
import { join } from "node:path";
import {
  createAgentSession, DefaultResourceLoader, ModelRuntime, SessionManager, SettingsManager,
  type InlineExtension,
} from "@earendil-works/pi-coding-agent";
import type { PluginToolsView } from "../shared/plugin-tools.ts";

export type ToolProbeInput = {
  agentDir: string; cwd: string; project: boolean; path: string; enabled: boolean;
  paths: string[]; globalSettings: Record<string, unknown>; projectSettings?: Record<string, unknown>;
};

async function inspect(input: ToolProbeInput): Promise<PluginToolsView> {
  const { agentDir, cwd, path, enabled } = input;
  function settings(discovery = false) {
    return SettingsManager.fromStorage({ withLock(scope, read) {
      const value = scope === "global" ? input.globalSettings : input.projectSettings ?? {};
      // Paths were resolved by Pi in the server, skipping missing packages. Do not install packages
      // or discover a different set here. Session settings themselves remain unchanged in memory.
      read(JSON.stringify(discovery ? { ...value, packages: [], extensions: [], skills: [], prompts: [], themes: [] } : value));
    } }, { projectTrusted: input.project });
  }
  // Pi 1.1.0's CLI built-ins (including llama.cpp) have no public aggregate export. Reuse its exact
  // factories and replaceable flags rather than duplicating their registration logic.
  const { builtInExtensions } = await import(new URL("./extensions/index.js", import.meta.resolve("@earendil-works/pi-coding-agent")).href) as { builtInExtensions: InlineExtension[] };
  const loader = new DefaultResourceLoader({
    cwd, agentDir, settingsManager: settings(true), noExtensions: true,
    additionalExtensionPaths: input.paths, extensionFactories: builtInExtensions,
    noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
  });
  await loader.reload();
  const issues = loader.getExtensions().errors.map(error => `${error.path}: ${error.error}`);
  const runtime = await ModelRuntime.create({
    authPath: join(agentDir, "auth.json"), modelsPath: join(agentDir, "models.json"), modelsStorePath: join(agentDir, "models-store.json"),
    allowModelNetwork: false, refreshOnCreate: false,
  });
  const { session } = await createAgentSession({
    cwd, agentDir, resourceLoader: loader, settingsManager: settings(), modelRuntime: runtime,
    sessionManager: SessionManager.inMemory(cwd),
  });
  try {
    await session.bindExtensions({
      mode: "rpc", onError: error => issues.push(`${error.extensionPath}: ${error.error}`),
      uiContext: { ...session.extensionRunner.getUIContext(), notify(message, type) {
        if (type === "error" || type === "warning") issues.push(message);
      } },
    });
    // The built-in /mcp status command waits for its pending connections in non-TUI mode. It does
    // not call a model or a tool. Do not invoke a third-party command that happens to be named mcp.
    const mcp = session.extensionRunner.getCommand("mcp");
    if (mcp?.sourceInfo.path === "builtin:mcp") await mcp.handler("", session.extensionRunner.createCommandContext());
    const extension = loader.getExtensions().extensions.find(item => item.path === path || item.resolvedPath === path);
    if (!extension && !issues.length) issues.push("Pi did not load this extension; another extension may replace it.");
    const registered = session.getAllTools();
    const active = new Set(session.getActiveToolNames());
    const callable = new Set(session.getCallableToolNames());
    const hidden = new Set(session.extensionRunner.createCommandContext().getSystemPromptOptions().hiddenTools ?? []);
    const tools: PluginToolsView["tools"] = [...(extension?.tools.values() ?? [])].map(({ definition }) => {
      const tool = registered.find(candidate => candidate.name === definition.name);
      const exposure = tool?.sourceInfo.path === path ? tool.exposure : definition.exposure ?? "direct";
      const visibility = !enabled ? "disabled" : issues.length ? "unknown"
        : tool?.sourceInfo.path !== path ? "shadowed" : exposure === "hidden" ? "hidden"
        : active.has(definition.name) && !hidden.has(definition.name) ? "model"
        : callable.has(definition.name) ? "callable" : "inactive";
      // The active declaration may have a description rewritten by prepareLoadout (e.g. codemode).
      const declaration = session.agent.state.tools.find(candidate => candidate.name === definition.name);
      return { name: definition.name, description: visibility === "model" ? declaration?.description ?? definition.description : definition.description, exposure, visibility };
    });
    return { path, enabled, checkedAt: new Date().toISOString(), complete: issues.length === 0, issues, tools };
  } finally {
    await session.extensionRunner.emit({ type: "session_shutdown", reason: "quit" });
    session.dispose();
  }
}

if (import.meta.main) {
  try {
    const input: ToolProbeInput = await Bun.stdin.json();
    process.send?.({ result: await inspect(input) });
  } catch (error) {
    process.send?.({ error: error instanceof Error ? error.message : "Pi could not inspect this extension." });
  } finally {
    // Extensions may leave timers behind even after session_shutdown.
    process.exit();
  }
}
