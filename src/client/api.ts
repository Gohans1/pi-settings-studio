import type { SettingsView, SettingsChange } from "../shared/settings";
import type { McpFileView, McpImportPreview, McpServerInput } from "../shared/mcp";
import type { CodemodeView } from "../shared/codemode";
import type { SessionSummary, SystemPromptView } from "../shared/sessions";
import type { PackageUpdateCheck, PluginsView, ResourceFileView, ResourcePathsView, ResourceType, SkillsView } from "../shared/resources";
import type { PluginToolsView } from "../shared/plugin-tools";
import type { AgentInput, AgentsView } from "../shared/agents";
import type { CustomModel, CustomProviderInput, CustomProvidersView, ModelScopeView, ModelSummary, ProvidersView } from "../shared/models";
import type { ProjectView, TrustView } from "../shared/projects";
import type { InstructionsView } from "../shared/instructions";
import type { KeybindingsView } from "../shared/keybindings";
import type { JobView } from "../shared/jobs";
import type { ThemeView } from "../shared/themes";
type Scope = SettingsView["scope"];
async function request<T>(url: string, method = "GET", body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, {
    method, credentials: "same-origin", signal,
    ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(data.error ?? "Unable to connect. Open a fresh launch link and try again.");
  }
  return response.status === 204 ? undefined as T : response.json() as Promise<T>;
}
/** Project-scoped requests name the project; the server accepts only projects it listed. */
export const withProject = (url: string, project?: string) => project ? `${url}${url.includes("?") ? "&" : "?"}project=${encodeURIComponent(project)}` : url;
export const loadSettings = (scope: Scope, project?: string) => request<SettingsView>(withProject(`/api/settings/${scope}`, project));
export const saveSettings = (scope: Scope, revision: string, changes: SettingsChange[], project?: string) =>
  request<SettingsView>(withProject(`/api/settings/${scope}`, project), "PATCH", { revision, changes });
export const restoreSettings = (scope: Scope, revision: string, project?: string) =>
  request<SettingsView>(withProject(`/api/settings/${scope}/restore`, project), "POST", { revision, confirm: true });
export const loadProjects = () => request<ProjectView[]>("/api/projects");
export const saveTrust = (project: string, decision: boolean | null) => request<TrustView>("/api/projects/trust", "POST", { project, decision });
/** Which mcp.json: the global one, or a project's .pi/mcp.json. */
export type McpTarget = { scope: "global" | "project"; project?: string };
const GLOBAL: McpTarget = { scope: "global" };
const mcpUrl = (target: McpTarget, path = "") => withProject(`/api/mcp/${target.scope}${path}`, target.scope === "project" ? target.project : undefined);
const serverUrl = (target: McpTarget, name: string) => mcpUrl(target, `/servers/${encodeURIComponent(name)}`);
export const loadMcp = (target = GLOBAL) => request<McpFileView>(mcpUrl(target));
export const saveMcpServer = (target: McpTarget, name: string, revision: string, patch: { enabled?: boolean; exposure?: string; tool?: { name: string; exposure: string | null } }) =>
  request<McpFileView>(serverUrl(target, name), "PATCH", { revision, ...patch });
export const addMcpServer = (target: McpTarget, revision: string, name: string, server: McpServerInput) =>
  request<McpFileView>(mcpUrl(target, "/servers"), "POST", { revision, name, server });
export const editMcpServer = (target: McpTarget, name: string, revision: string, server: McpServerInput) =>
  request<McpFileView>(serverUrl(target, name), "PUT", { revision, server });
export const removeMcpServer = (target: McpTarget, name: string, revision: string) =>
  request<McpFileView>(serverUrl(target, name), "DELETE", { revision });
export const previewMcpImport = (target: McpTarget, text: string) => request<McpImportPreview>(mcpUrl(target, "/import/preview"), "POST", { text });
export const importMcp = (target: McpTarget, revision: string, text: string, names: string[]) =>
  request<McpFileView>(mcpUrl(target, "/import"), "POST", { revision, text, names });
export const loadMcpLog = (project?: string) => request<{ path: string; exists: boolean; text: string }>(withProject("/api/mcp/log", project));
export const loadMcpRaw = (target: McpTarget) => request<RawSettings>(mcpUrl(target, "/raw"));
export const saveMcpRaw = (target: McpTarget, revision: string, text: string) => request<RawSettings>(mcpUrl(target, "/raw"), "PUT", { revision, text });
export const restoreMcp = (target: McpTarget, revision: string) => request<McpFileView>(mcpUrl(target, "/restore"), "POST", { revision });
export const loadCodemode = (project?: string) => request<CodemodeView>(withProject("/api/codemode", project));
export const saveCodemode = (revision: string, patch: { preference?: string; mode?: string | null; inlineBudget?: number | null }, project?: string) =>
  request<CodemodeView>(withProject("/api/codemode", project), "PATCH", { revision, ...patch });
export const saveMcpSettings = (revision: string, patch: { autoEnableCodemode: boolean | null }, target: McpTarget = GLOBAL) =>
  request<McpFileView>(mcpUrl(target, "/settings"), "PATCH", { revision, ...patch });
export const loadSessions = () => request<SessionSummary[]>("/api/sessions");
export const loadSystemPrompt = (id: string) => request<SystemPromptView>(`/api/sessions/${encodeURIComponent(id)}/system-prompt`);
export const loadSkills = (project?: string) => request<SkillsView>(withProject("/api/skills", project));
export const saveSkills = (scope: Scope, revision: string, paths: string[], enabled: boolean, project?: string) =>
  request<SkillsView>(withProject("/api/skills", project), "PATCH", { scope, revision, paths, enabled });
export type RawSettings = { path: string; text: string; revision: string };
export const loadRawSettings = (scope: Scope = "global", project?: string) => request<RawSettings>(withProject(`/api/settings/${scope}/raw`, project));
export const saveRawSettings = (revision: string, text: string, scope: Scope = "global", project?: string) =>
  request<RawSettings>(withProject(`/api/settings/${scope}/raw`, project), "PUT", { revision, text });
export const loadPlugins = (project?: string) => request<PluginsView>(withProject("/api/plugins", project));
export const loadPluginTools = (path: string, project?: string, signal?: AbortSignal) =>
  request<PluginToolsView>(withProject("/api/plugins/tools", project), "POST", { path }, signal);
export const checkPackageUpdates = (project?: string) => request<PackageUpdateCheck>(withProject("/api/plugins/updates", project), "POST", {});
export const savePlugins = (scope: Scope, revision: string, items: { type: string; path: string }[], enabled: boolean, project?: string) =>
  request<PluginsView>(withProject("/api/plugins", project), "PATCH", { scope, revision, items, enabled });
export type AgentScope = "user" | "project";
const agentUrl = (scope: AgentScope, project: string | undefined, path = "") =>
  withProject(`/api/agents${path}?scope=${scope}`, project);
export const loadAgents = (project?: string) => request<AgentsView>(withProject("/api/agents", project));
export const addAgent = (scope: AgentScope, input: AgentInput, project?: string) => request<AgentsView>(agentUrl(scope, project), "POST", input);
export const editAgent = (scope: AgentScope, file: string, revision: string, input: AgentInput, project?: string) =>
  request<AgentsView>(agentUrl(scope, project, `/${encodeURIComponent(file)}`), "PUT", { revision, ...input });
export const removeAgent = (scope: AgentScope, file: string, revision: string, project?: string) =>
  request<AgentsView>(agentUrl(scope, project, `/${encodeURIComponent(file)}`), "DELETE", { revision });
export const restoreAgent = (scope: AgentScope, file: string, project?: string) =>
  request<AgentsView>(agentUrl(scope, project, `/${encodeURIComponent(file)}/restore`), "POST", {});
export const loadProviders = () => request<ProvidersView>("/api/models/providers");
export const saveProviderKey = (id: string, revision: string, key: string) =>
  request<ProvidersView>(`/api/models/providers/${encodeURIComponent(id)}/key`, "PUT", { revision, key });
export const removeProviderKey = (id: string, revision: string) =>
  request<ProvidersView>(`/api/models/providers/${encodeURIComponent(id)}/key`, "DELETE", { revision });
export const restoreAuth = (revision: string) => request<ProvidersView>("/api/models/auth/restore", "POST", { revision });
export const loadModels = (provider: string) => request<ModelSummary[]>(`/api/models/providers/${encodeURIComponent(provider)}/models`);
export const loadInstructions = (project?: string) => request<InstructionsView>(withProject("/api/instructions", project));
export const saveInstruction = (id: string, revision: string, text: string, project?: string) =>
  request<InstructionsView>(withProject(`/api/instructions/${id}`, project), "PUT", { revision, text });
export const deleteInstruction = (id: string, revision: string, project?: string) =>
  request<InstructionsView>(withProject(`/api/instructions/${id}`, project), "DELETE", { revision });
export const restoreInstruction = (id: string, project?: string) =>
  request<InstructionsView>(withProject(`/api/instructions/${id}/restore`, project), "POST", {});
export const loadCustomProviders = () => request<CustomProvidersView>("/api/models/custom");
export const discoverCustomModels = (body: { provider?: string; baseUrl: string; api: string; apiKey?: string; headers?: { name: string; value?: string }[]; authHeader?: boolean }) =>
  request<CustomModel[]>("/api/models/custom/discover", "POST", body);
export const addCustomProvider = (revision: string, id: string, provider: CustomProviderInput) =>
  request<CustomProvidersView>("/api/models/custom", "POST", { revision, id, provider });
export const editCustomProvider = (id: string, revision: string, provider: CustomProviderInput) =>
  request<CustomProvidersView>(`/api/models/custom/${encodeURIComponent(id)}`, "PUT", { revision, provider });
export const removeCustomProvider = (id: string, revision: string) =>
  request<CustomProvidersView>(`/api/models/custom/${encodeURIComponent(id)}`, "DELETE", { revision });
export const restoreCustomProviders = (revision: string) => request<CustomProvidersView>("/api/models/custom/restore", "POST", { revision });
export const loadKeybindings = () => request<KeybindingsView>("/api/keybindings");
export const saveKeybindings = (revision: string, changes: { id: string; keys: string[] | null }[]) =>
  request<KeybindingsView>("/api/keybindings", "PATCH", { revision, changes });
export const startJob = (body: Record<string, unknown>) => request<JobView>("/api/jobs", "POST", body);
export const loadJob = (id: string) => request<JobView>(`/api/jobs/${id}`);
export const answerJob = (id: string, promptId: string, value: string) => request<JobView>(`/api/jobs/${id}/answer`, "POST", { promptId, value });
export const cancelJob = (id: string) => request<JobView>(`/api/jobs/${id}/cancel`, "POST", {});
export const loadModelsRaw = () => request<RawSettings>("/api/models/custom/raw");
export const saveModelsRaw = (revision: string, text: string) => request<RawSettings>("/api/models/custom/raw", "PUT", { revision, text });
export const loadModelIds = () => request<string[]>("/api/models/ids");
export const checkModelScope = (patterns: string[], model?: string) =>
  request<ModelScopeView>("/api/models/scope", "POST", { patterns, ...(model ? { default: model } : {}) });
export const savePackageFilters = (scope: Scope, revision: string, source: string, filters: Record<string, unknown>, project?: string) =>
  request<PluginsView>(withProject("/api/plugins/packages", project), "PUT", { scope, revision, source, filters });
export const loadThemes = (project?: string) => request<ThemeView[]>(withProject("/api/themes", project));
export const loadResourceFile = (type: ResourceType, path: string, file?: string, project?: string) =>
  request<ResourceFileView>(withProject(`/api/resource-files?type=${type}&path=${encodeURIComponent(path)}${file ? `&file=${encodeURIComponent(file)}` : ""}`, project));
export const saveResourceFile = (body: { type: ResourceType; path: string; file: string; revision: string; text: string }, project?: string) =>
  request<{ revision: string }>(withProject("/api/resource-files", project), "PUT", body);
export const setModelInvocation = (path: string, modelInvocation: boolean, project?: string) =>
  request<{ revision: string }>(withProject("/api/resource-files/invocation", project), "PATCH", { path, modelInvocation });
export const createResource = (body: { scope: "global" | "project"; type: ResourceType; name: string; description?: string }, project?: string) =>
  request<{ type: ResourceType; path: string }>(withProject("/api/resource-files", project), "POST", body);
export const loadPi = () => request<{ bin: string; installed?: string; builtFor: string }>("/api/pi");
export const loadResourcePaths = (type: ResourceType, project?: string) => request<ResourcePathsView>(withProject(`/api/resource-paths?type=${type}`, project));
export const changeResourcePath = (method: "POST" | "DELETE", body: { type: ResourceType; scope: Scope; revision: string; path: string }, project?: string) =>
  request<ResourcePathsView>(withProject("/api/resource-paths", project), method, body);
