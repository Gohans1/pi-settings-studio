import type { SettingsView, SettingsChange } from "../shared/settings";
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
let connection: Promise<void> | undefined;
export function connect(): Promise<void> {
  connection ??= (async () => {
    const token = new URLSearchParams(location.hash.slice(1)).get("token");
    if (token) {
      history.replaceState(null, "", location.pathname + location.search);
      await request("/api/session", "POST", { token });
    }
  })();
  return connection;
}
export const loadSettings = (scope: Scope) => request<SettingsView>(`/api/settings/${scope}`);
export const saveSettings = (scope: Scope, revision: string, changes: SettingsChange[]) =>
  request<SettingsView>(`/api/settings/${scope}`, "PATCH", { revision, changes });
export const restoreSettings = (scope: Scope, revision: string) =>
  request<SettingsView>(`/api/settings/${scope}/restore`, "POST", { revision, confirm: true });
