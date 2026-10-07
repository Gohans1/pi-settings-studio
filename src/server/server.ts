import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { serve } from "@hono/node-server";
import type { Server } from "node:http";
import { createApp } from "./app.js";
import { ConfigStore } from "./store.js";

export type RunningServer = { url: string; close: () => Promise<void> };
export async function startServer(options: {
  agentDir: string; projectDir: string; port?: number; staticDir?: string;
}): Promise<RunningServer> {
  const token = randomBytes(32).toString("base64url");
  const store = new ConfigStore({ global: options.agentDir, project: join(options.projectDir, ".pi") });
  let app: ReturnType<typeof createApp> | undefined;
  const { server, origin } = await new Promise<{ server: Server; origin: string }>((resolve, reject) => {
    const server = serve({
      hostname: "127.0.0.1",
      port: options.port ?? 0,
      fetch: request => app ? app.fetch(request) : new Response("Starting", { status: 503 }),
    }, info => resolve({ server: server as Server, origin: `http://127.0.0.1:${info.port}` }));
    server.once("error", reject);
  });
  app = createApp({ store, token, origin, staticDir: options.staticDir ?? fileURLToPath(new URL("../client/", import.meta.url)) });
  let closing: Promise<void> | undefined;
  return {
    url: `${origin}/#token=${token}`,
    close() {
      closing ??= new Promise<void>((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve());
        server.closeIdleConnections();
      });
      return closing;
    },
  };
}
