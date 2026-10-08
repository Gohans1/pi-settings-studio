import { readFile, realpath } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Hono } from "hono";
import { piCommand } from "./jobs.ts";

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

export function piRoutes() {
  return new Hono().get("/", async c => {
    const bin = piCommand()[0]!;
    // The SDK this app was built and tested against.
    const { version: builtFor } = JSON.parse(await readFile(join(dirname(Bun.resolveSync(`${PACKAGE}/package.json`, import.meta.dir)), "package.json"), "utf8"));
    return c.json({ bin, installed: await installedPiVersion(bin), builtFor });
  });
}
