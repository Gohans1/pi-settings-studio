import { join } from "node:path";
import { createApp } from "./app.ts";
import { ConfigStore } from "./store.ts";

export const DEFAULT_PORT = 4369;
export type RunningServer = { url: string; close: () => Promise<void> };

export async function startServer(options: {
  agentDir: string; projectDir: string; port?: number; staticDir?: string;
}): Promise<RunningServer> {
  const store = new ConfigStore({ global: options.agentDir, project: join(options.projectDir, ".pi") });
  let app: ReturnType<typeof createApp> | undefined;
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: options.port ?? DEFAULT_PORT,
    fetch: request => app ? app.fetch(request) : new Response("Starting", { status: 503 }),
  });
  // The bookmark uses localhost; WSL forwards it from the Windows browser.
  const origins = [`http://127.0.0.1:${server.port}`, `http://localhost:${server.port}`];
  app = createApp({ store, agentDir: options.agentDir, origins, staticDir: options.staticDir ?? join(import.meta.dir, "../../dist/client") });
  return { url: `${origins[0]}/`, close: () => server.stop(true) };
}
