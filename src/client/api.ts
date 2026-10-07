import type { SettingsView, SettingsChange } from "../shared/settings";
import type { McpFileView, McpServerInput } from "../shared/mcp";
import type { CodemodeView } from "../shared/codemode";
import type { SessionSummary, SystemPromptView } from "../shared/sessions";
import type { SkillsView } from "../shared/resources";
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
export const loadSettings = (scope: Scope) => request<SettingsView>(`/api/settings/${scope}`);
export const saveSettings = (scope: Scope, revision: string, changes: SettingsChange[]) =>
  request<SettingsView>(`/api/settings/${scope}`, "PATCH", { revision, changes });
export const restoreSettings = (scope: Scope, revision: string) =>
  request<SettingsView>(`/api/settings/${scope}/restore`, "POST", { revision, confirm: true });
export const loadMcp = () => request<McpFileView>("/api/mcp/global");
export const saveMcpServer = (name: string, revision: string, patch: { enabled?: boolean; exposure?: string }) =>
  request<McpFileView>(`/api/mcp/global/servers/${encodeURIComponent(name)}`, "PATCH", { revision, ...patch });
export const addMcpServer = (revision: string, name: string, server: McpServerInput) =>
  request<McpFileView>("/api/mcp/global/servers", "POST", { revision, name, server });
export const editMcpServer = (name: string, revision: string, server: McpServerInput) =>
  request<McpFileView>(`/api/mcp/global/servers/${encodeURIComponent(name)}`, "PUT", { revision, server });
export const removeMcpServer = (name: string, revision: string) =>
  request<McpFileView>(`/api/mcp/global/servers/${encodeURIComponent(name)}`, "DELETE", { revision });
export const restoreMcp = (revision: string) => request<McpFileView>("/api/mcp/global/restore", "POST", { revision });
export const loadCodemode = () => request<CodemodeView>("/api/codemode");
export const saveCodemode = (revision: string, patch: { preference?: string; mode?: string; inlineBudget?: number | null }) =>
  request<CodemodeView>("/api/codemode", "PATCH", { revision, ...patch });
export const saveMcpSettings = (revision: string, patch: { autoEnableCodemode: boolean }) =>
  request<McpFileView>("/api/mcp/global/settings", "PATCH", { revision, ...patch });
export const loadSessions = () => request<SessionSummary[]>("/api/sessions");
export const loadSystemPrompt = (id: string) => request<SystemPromptView>(`/api/sessions/${encodeURIComponent(id)}/system-prompt`);
export const loadSkills = () => request<SkillsView>("/api/skills");
export const saveSkills = (revision: string, paths: string[], enabled: boolean) => request<SkillsView>("/api/skills", "PATCH", { revision, paths, enabled });
export type RawSettings = { path: string; text: string; revision: string };
export const loadRawSettings = () => request<RawSettings>("/api/settings/global/raw");
export const saveRawSettings = (revision: string, text: string) => request<RawSettings>("/api/settings/global/raw", "PUT", { revision, text });
