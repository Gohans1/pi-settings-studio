import { readFile, realpath } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Hono } from "hono";
import { piCommand } from "./jobs.ts";
import { changeUpdateCache, DAY, npmLatest, readUpdateCache } from "./update-cache.ts";

const PACKAGE = "@earendil-works/pi-coding-agent";

/** The version of the package the pi command links to, read from its package.json; pi is not run. */
export async function installedPiVersion(bin: string): Promise<string | undefined> {
  let dir: string;
  try { dir = dirname(await realpath(bin)); } catch { return undefined; }
  for (let depth = 0; depth < 6; depth++, dir = dirname(dir)) {
    try {
      const pkg = JSON.parse(await readFile(join(dir, "package.json"), "utf8"));
      if (pkg?.name === PACKAGE && typeof pkg.version === "string") return pkg.version;
    } catch { /* keep walking up */ }
  }
  return undefined;
}

/**
 * The Pi on this machine and, with update checks on, a newer one on npm. Like Pi's own check, none runs with
 * PI_OFFLINE or PI_SKIP_VERSION_CHECK set.
 */
export function piRoutes(agentDir: string, { checkUpdates = false, bin = piCommand()[0]! }: { checkUpdates?: boolean; bin?: string } = {}) {
  let pending: Promise<string | undefined> | undefined;
  let failedAt = 0;
  async function latest(): Promise<string | undefined> {
    if (!checkUpdates || process.env.PI_OFFLINE || process.env.PI_SKIP_VERSION_CHECK) return undefined;
    const kept = (await readUpdateCache(agentDir)).pi;
    // A failed lookup waits an hour, so an offline machine does not ask on every visit.
    if ((kept && Date.now() - Date.parse(kept.checkedAt) < DAY) || Date.now() - failedAt < DAY / 24) return kept?.latest;
    pending ??= npmLatest(PACKAGE, agentDir).then(async found => {
      if (!found) { failedAt = Date.now(); return kept?.latest; }
      await changeUpdateCache(agentDir, cache => ({ ...cache, pi: { latest: found, checkedAt: new Date().toISOString() } }));
      return found;
    }).finally(() => { pending = undefined; });
    // A slow registry does not hold the page; its answer is kept for the next visit.
    return Promise.race([pending, Bun.sleep(3000).then(() => kept?.latest)]);
  }
  return new Hono().get("/", async c => {
    // The SDK this app was built and tested against.
    const { version: builtFor } = JSON.parse(await readFile(join(dirname(Bun.resolveSync(`${PACKAGE}/package.json`, import.meta.dir)), "package.json"), "utf8"));
    const installed = await installedPiVersion(bin);
    const newer = installed ? await latest() : undefined;
    return c.json({ bin, installed, builtFor, ...(newer && Bun.semver.order(newer, installed!) > 0 ? { latest: newer } : {}) });
  });
}
