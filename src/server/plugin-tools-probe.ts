// Runs only in a disposable subprocess: installed extensions are trusted executable code.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  createAgentSession, DefaultResourceLoader, ModelRuntime, SessionManager, SettingsManager,
  type ExtensionRuntime, type InlineExtension,
} from "@earendil-works/pi-coding-agent";
import type { Api, Model } from "@earendil-works/pi-ai";
import type { PluginToolsView, SessionTools } from "../shared/plugin-tools.ts";
import { credentialsOf, runtimeFor } from "./models.ts";

export type ToolProbeInput = {
  agentDir: string; cwd: string; project: boolean;
  paths: string[]; globalSettings: Record<string, unknown>; projectSettings?: Record<string, unknown>;
  /** The extension to report and whether settings enable it. Without one, every registered tool is reported. */
  path?: string; enabled?: boolean;
  /** Report the providers the extensions register instead of tools. */
  providers?: boolean;
};

/** The providers extensions register, each with Pi's auth status and its chat models (headers left out), and what failed. */
export type ExtensionProviders = { checkedAt: string; issues: string[]; providers: { id: string; name: string; configured: boolean; models: Model<Api>[] }[] };

/**
 * The providers that the loaded extensions queued, applied as Pi's runner applies them when it binds (Pi 1.1.0
 * dist/core/extensions/runner.js bindCore, MIT, Copyright Mario Zechner), on a runtime over auth.json that cannot write it.
 * No session starts: no model is chosen, so no credential command runs, and no MCP server starts.
 */
async function providersOf(queued: ExtensionRuntime, agentDir: string, issues: string[]): Promise<ExtensionProviders> {
  const credentials = credentialsOf(await readFile(join(agentDir, "auth.json"), "utf8").then(JSON.parse, () => ({})));
  const runtime = await runtimeFor(agentDir, credentials);
  const known = new Set(runtime.getProviders().map(provider => provider.id));
  const apply = (extensionPath: string, register: () => void) => {
    try { register(); } catch (error) { issues.push(`${extensionPath}: ${error instanceof Error ? error.message : String(error)}`); }
  };
  for (const { name, config, extensionPath } of queued.pendingProviderRegistrations) apply(extensionPath, () => runtime.registerProvider(name, config));
  for (const { provider, extensionPath } of queued.pendingNativeProviderRegistrations) apply(extensionPath, () => runtime.registerNativeProvider(provider));
  for (const { definition, extensionPath } of queued.pendingVirtualModelRegistrations) apply(extensionPath, () => runtime.registerVirtualModel(definition));
  // As the server reads Pi's status: a stored credential first (Pi fills "stored" only in an availability refresh).
  const providers = runtime.getProviders().filter(provider => !known.has(provider.id)).map(provider => ({
    id: provider.id, name: provider.name, configured: !!credentials[provider.id] || runtime.getProviderAuthStatus(provider.id).configured,
    models: runtime.getModels(provider.id).map(({ headers: _headers, ...model }) => model as Model<Api>),
  }));
  return { checkedAt: new Date().toISOString(), issues, providers };
}

async function inspect(input: ToolProbeInput): Promise<PluginToolsView | SessionTools | ExtensionProviders> {
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
  if (input.providers) return providersOf(loader.getExtensions().runtime, agentDir, issues);
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
    const registered = session.getAllTools();
    const active = new Set(session.getActiveToolNames());
    const callable = new Set(session.getCallableToolNames());
    const hidden = new Set(session.extensionRunner.createCommandContext().getSystemPromptOptions().hiddenTools ?? []);
    const reach = (name: string, exposure: string) => exposure === "hidden" ? "hidden" as const
      : active.has(name) && !hidden.has(name) ? "model" as const : callable.has(name) ? "callable" as const : "inactive" as const;
    // The active declaration may have a description rewritten by prepareLoadout (e.g. codemode).
    const described = (name: string, visibility: string, description: string) => visibility !== "model" ? description
      : session.agent.state.tools.find(candidate => candidate.name === name)?.description ?? description;
    if (path === undefined) {
      const tools: SessionTools["tools"] = registered.map(tool => {
        const visibility = reach(tool.name, tool.exposure);
        return { name: tool.name, description: described(tool.name, visibility, tool.description), exposure: tool.exposure, visibility,
          path: tool.sourceInfo.path, ...(tool.namespace ? { namespace: tool.namespace.name } : {}) };
      });
      return { checkedAt: new Date().toISOString(), complete: issues.length === 0, issues, tools };
    }
    const extension = loader.getExtensions().extensions.find(item => item.path === path || item.resolvedPath === path);
    if (!extension && !issues.length) issues.push("Pi did not load this extension; another extension may replace it.");
    const tools: PluginToolsView["tools"] = [...(extension?.tools.values() ?? [])].map(({ definition }) => {
      const tool = registered.find(candidate => candidate.name === definition.name);
      const exposure = tool?.sourceInfo.path === path ? tool.exposure : definition.exposure ?? "direct";
      const visibility = !enabled ? "disabled" : issues.length ? "unknown"
        : tool?.sourceInfo.path !== path ? "shadowed" : reach(definition.name, exposure);
      return { name: definition.name, description: described(definition.name, visibility, definition.description), exposure, visibility };
    });
    return { path, enabled: !!enabled, checkedAt: new Date().toISOString(), complete: issues.length === 0, issues, tools };
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
    process.send?.({ error: error instanceof Error ? error.message : "Pi could not inspect the tools." });
  } finally {
    // Extensions may leave timers behind even after session_shutdown.
    process.exit();
  }
}
