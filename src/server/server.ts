import { join } from "node:path";
import { createApp } from "./app.ts";
import { ConfigStore } from "./store.ts";

export const DEFAULT_PORT = 4369;
export type RunningServer = { url: string; close: () => Promise<void> };

/** An address other than localhost that may open the app, such as a `tailscale serve` address. Must be an origin, as the browser sends it. */
export function parseAllowedOrigin(value: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error(`Allowed origin must be a valid URL: ${value}`); }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error(`Allowed origin must use http or https: ${value}`);
  if (url.pathname !== "/" || url.search || url.hash) throw new Error(`Allowed origin must be an origin only, with no path: ${value}`);
  return url.origin;
}

export async function startServer(options: {
  agentDir: string; projectDir?: string; port?: number; staticDir?: string; checkUpdates?: boolean; allowedOrigins?: string[];
}): Promise<RunningServer> {
  const store = new ConfigStore({ global: options.agentDir });
  let app: ReturnType<typeof createApp> | undefined;
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: options.port ?? DEFAULT_PORT,
    fetch: request => app ? app.fetch(request) : new Response("Starting", { status: 503 }),
  });
  // The bookmark uses localhost; WSL forwards it from the Windows browser.
  const origins = [`http://127.0.0.1:${server.port}`, `http://localhost:${server.port}`, ...(options.allowedOrigins ?? [])];
  app = createApp({ store, agentDir: options.agentDir, projects: options.projectDir ? [options.projectDir] : [], origins, staticDir: options.staticDir ?? join(import.meta.dir, "../../dist/client"), checkUpdates: options.checkUpdates });
  return { url: `${origins[0]}/`, close: () => server.stop(true) };
}
