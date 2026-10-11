#!/usr/bin/env bun
// Writes src/demo/snapshot.json: what the real server answers to every read of readEverything, on the sample home of seed.ts.
// Run it after a change to the server's answers or to what the app reads: `bun run record:demo`.
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir, userInfo } from "node:os";
import { join } from "node:path";
import { DEMO_HOME, demoKey } from "../shared/demo";
import { readEverything } from "./reads";
import { seedDemo } from "./seed";

delete process.env.VITE_DEMO;
const home = await mkdtemp(join(tmpdir(), "pi-settings-demo-"));
const { agent, project } = await seedDemo(home);
const server = Bun.spawn([process.execPath, join(import.meta.dir, "../server/cli.ts"), "--port", "0", "--agent-dir", agent, "--project", project], {
  env: { ...process.env, HOME: home, PI_CODING_AGENT_DIR: agent, PI_OFFLINE: "1", PI_SKIP_VERSION_CHECK: "1" }, stdout: "ignore", stderr: "pipe",
});
try {
  let seen = "";
  for await (const chunk of server.stderr) { seen += new TextDecoder().decode(chunk); if (/http:\/\/\S+\//.test(seen)) break; }
  const base = seen.match(/(http:\/\/\S+?)\//)?.[1];
  if (!base) throw new Error(`The server did not start: ${seen}`);

  const recorded = new Map<string, unknown>();
  const serverFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string, init?: RequestInit) => {
    const response = await serverFetch(base + input, { ...init, headers: { ...init?.headers, Origin: base } });
    if (!response.ok) console.error(`${init?.method ?? "GET"} ${input} answered ${response.status}: ${await response.clone().text()}`);
    else recorded.set(demoKey(input, init?.method ?? "GET", init?.body === undefined ? undefined : JSON.parse(String(init.body))), await response.clone().json());
    return response;
  }) as typeof fetch;
  await readEverything(await import("../client/api"), project);

  // The recording shows a home of its own, and nothing of this machine.
  const here = [homedir(), userInfo().username, process.cwd()];
  let text = "{\n" + [...recorded].sort(([a], [b]) => a < b ? -1 : 1).map(([key, value]) => `${JSON.stringify(key)}: ${JSON.stringify(value)}`).join(",\n") + "\n}\n";
  for (const [from, to] of [[home, DEMO_HOME], [homedir(), DEMO_HOME]] as const) text = text.replaceAll(from, to).replaceAll(encodeURIComponent(from), encodeURIComponent(to));
  const leaked = here.filter(piece => text.includes(piece) || text.includes(encodeURIComponent(piece)));
  if (leaked.length) throw new Error(`The recording still holds a path of this machine: ${leaked.join(", ")}`);
  await writeFile(join(import.meta.dir, "snapshot.json"), text);
  console.log(`Recorded ${recorded.size} answers, ${(text.length / 1024).toFixed(0)} kB.`);
} finally {
  server.kill();
  await rm(home, { recursive: true, force: true });
}
