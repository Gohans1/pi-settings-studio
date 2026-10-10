// What the update checks found, kept beside Pi's files so a restarted app shows it at once, as
// update-notifier keeps its last check. A check runs again after a day.
import { randomUUID } from "node:crypto";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { PackageUpdateCheck } from "../shared/resources.ts";
import { isRecord } from "./mcp-config.ts";

export const DAY = 24 * 60 * 60_000;

export type UpdateCache = { pi?: { latest: string; checkedAt: string }; packages?: Record<string, PackageUpdateCheck> };

const fileOf = (agentDir: string) => join(agentDir, "pi-settings-cache.json");

export async function readUpdateCache(agentDir: string): Promise<UpdateCache> {
  try {
    const value: unknown = JSON.parse(await readFile(fileOf(agentDir), "utf8"));
    return isRecord(value) ? value as UpdateCache : {};
  } catch { return {}; }
}

let writes = Promise.resolve();
/** Changes are applied one at a time; a failed write only loses the cache. */
export function changeUpdateCache(agentDir: string, change: (cache: UpdateCache) => UpdateCache): Promise<void> {
  writes = writes.then(async () => {
    const path = fileOf(agentDir), temporary = `${path}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify(change(await readUpdateCache(agentDir))), { mode: 0o600 });
      await rename(temporary, path);
    } finally { await rm(temporary, { force: true }); }
  }).catch(() => {});
  return writes;
}

/** `npm view <name> version`, as Pi checks npm packages: the user's npm config (registry, proxy) applies. */
export async function npmLatest(name: string, cwd: string): Promise<string | undefined> {
  const npm = Bun.which("npm");
  if (!npm) return undefined;
  const child = Bun.spawn([npm, "view", name, "version", "--json"], { cwd, stdin: "ignore", stdout: "pipe", stderr: "ignore", timeout: 15_000 });
  const [text, code] = await Promise.all([new Response(child.stdout).text(), child.exited]);
  if (code !== 0) return undefined;
  try { const version: unknown = JSON.parse(text); return typeof version === "string" ? version : undefined; } catch { return undefined; }
}
