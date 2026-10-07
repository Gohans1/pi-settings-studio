import type { SettingsView, SettingsChange } from "../shared/settings";
import type { McpFileView } from "../shared/mcp";
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
