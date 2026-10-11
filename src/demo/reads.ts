import type * as Api from "../client/api";
import { DEMO_PROJECT } from "../shared/demo";
import type { ResourceType } from "../shared/resources";

type Client = typeof Api;
const TYPES: ResourceType[] = ["extensions", "skills", "prompts", "themes"];

/**
 * Every read the app makes when its tabs and their lists open, with and without the demo project chosen. The recorder
 * (record.ts) runs it against the real server to write the snapshot; the demo test runs it against the snapshot, so a
 * read the app starts making and the snapshot lacks fails there. A change to a loader's arguments fails the typecheck.
 */
export async function readEverything(api: Client, project: string = DEMO_PROJECT) {
  await Promise.all([api.loadProjects(), api.loadPi(), api.loadKeybindings(), api.loadJobs(), api.loadCustomProviders(), api.loadModelsRaw()]);
  const providers = await api.loadProviders();
  for (const sessionId of (await api.loadSessions()).map(session => session.id)) await api.loadSystemPrompt(sessionId);

  for (const chosen of [undefined, project]) {
    for (const view of [await api.loadSettings("global"), ...chosen ? [await api.loadSettings("project", chosen)] : []]) {
      // Models › Defaults: what is in effect in the scope being edited, as ModelDefaults computes it.
      const inherited = (key: string) => view.scope === "project" ? view.inherited[key] : undefined;
      const enabled = Array.isArray(view.values.enabledModels) ? view.values.enabledModels.map(String) : Array.isArray(inherited("enabledModels")) ? (inherited("enabledModels") as unknown[]).map(String) : [];
      const provider = String(view.values.defaultProvider ?? inherited("defaultProvider") ?? "");
      const model = String(view.values.defaultModel ?? inherited("defaultModel") ?? "");
      await api.checkModelScope(enabled, provider && model ? `${provider}/${model}` : undefined, chosen);
    }
    await Promise.all([api.loadRawSettings("global"), ...chosen ? [api.loadRawSettings("project", chosen)] : []]);
    await Promise.all([api.loadMcp(), api.loadMcpRaw({ scope: "global" }), ...chosen ? [api.loadMcp({ scope: "project", project: chosen }), api.loadMcpRaw({ scope: "project", project: chosen })] : []]);
    await Promise.all([api.loadMcpStatus(chosen), api.loadMcpLog(chosen), api.loadCodemode(chosen), api.loadTools(chosen), api.loadAgents(chosen), api.loadInstructions(chosen), api.loadThemes(chosen)]);
    await Promise.all(TYPES.map(type => api.loadResourcePaths(type, chosen)));
    await Promise.all([api.checkPackageUpdates(chosen), api.loadAvailableModels(chosen)]);
    const extensionProviders = await api.loadExtensionProviders(chosen);
    for (const id of [...providers.providers, ...extensionProviders.providers].map(entry => entry.id)) await api.loadModels(id, chosen);

    const plugins = await api.loadPlugins(chosen);
    const skills = await api.loadSkills(chosen);
    for (const resource of [...plugins.resources, ...skills.skills]) {
      if (resource.type === "extensions") await api.loadPluginTools(resource.path, chosen);
      if (resource.group.startsWith("Built-in")) continue; // no Edit or View: the app never opens its file
      const first = await api.loadResourceFile(resource.type, resource.path, undefined, chosen);
      for (const file of first.files.filter(file => file !== first.file)) await api.loadResourceFile(resource.type, resource.path, file, chosen);
    }
  }
}
