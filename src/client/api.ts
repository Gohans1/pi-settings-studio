import type { SettingsView, SettingsChange } from "../shared/settings";
import type { McpFileView, McpServerInput } from "../shared/mcp";
import type { CodemodeView } from "../shared/codemode";
import type { SessionSummary, SystemPromptView } from "../shared/sessions";
import type { PluginsView, SkillsView } from "../shared/resources";
import type { AgentInput, AgentsView } from "../shared/agents";
import type { CustomProviderInput, CustomProvidersView, ModelSummary, ProvidersView } from "../shared/models";
import type { ProjectView, TrustView } from "../shared/projects";
import type { InstructionsView } from "../shared/instructions";
import type { KeybindingsView } from "../shared/keybindings";
import type { JobView } from "../shared/jobs";
type Scope = SettingsView["scope"];
async function request<T>(url: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method, credentials: "same-origin",
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
export const saveMcpServer = (target: McpTarget, name: string, revision: string, patch: { enabled?: boolean; exposure?: string }) =>
  request<McpFileView>(serverUrl(target, name), "PATCH", { revision, ...patch });
export const addMcpServer = (target: McpTarget, revision: string, name: string, server: McpServerInput) =>
  request<McpFileView>(mcpUrl(target, "/servers"), "POST", { revision, name, server });
export const editMcpServer = (target: McpTarget, name: string, revision: string, server: McpServerInput) =>
  request<McpFileView>(serverUrl(target, name), "PUT", { revision, server });
export const removeMcpServer = (target: McpTarget, name: string, revision: string) =>
  request<McpFileView>(serverUrl(target, name), "DELETE", { revision });
export const restoreMcp = (target: McpTarget, revision: string) => request<McpFileView>(mcpUrl(target, "/restore"), "POST", { revision });
export const loadCodemode = () => request<CodemodeView>("/api/codemode");
export const saveCodemode = (revision: string, patch: { preference?: string; mode?: string; inlineBudget?: number | null }) =>
  request<CodemodeView>("/api/codemode", "PATCH", { revision, ...patch });
export const saveMcpSettings = (revision: string, patch: { autoEnableCodemode: boolean }) =>
  request<McpFileView>(mcpUrl(GLOBAL, "/settings"), "PATCH", { revision, ...patch });
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
