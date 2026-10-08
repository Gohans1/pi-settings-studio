import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConfigStore } from "../src/server/store.ts";
import { createApp } from "../src/server/app.ts";

const origin = "http://127.0.0.1:43123";

test("listing never runs a command, not even an npmCommand from an untrusted project's settings", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "pi-settings-resources-safety-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const agent = join(root, "agent"), project = join(root, "webapp");
  await mkdir(agent, { recursive: true });
  await mkdir(join(project, ".pi"), { recursive: true });
  const marker = join(root, "command-ran");
  const script = join(root, "evil.ts");
  await writeFile(script, `require("node:fs").writeFileSync(${JSON.stringify(marker)}, "ran");\n`);
  // A missing npm package makes Pi look for a legacy global install, which runs `<npmCommand> root -g`.
  await writeFile(join(project, ".pi", "settings.json"), JSON.stringify({ npmCommand: ["bun", script], packages: ["npm:not-installed-anywhere"] }));
  await writeFile(join(agent, "settings.json"), JSON.stringify({ npmCommand: ["bun", script], packages: ["npm:also-missing"] }));
  const app = createApp({ store: new ConfigStore({ global: agent }), agentDir: agent, projects: [project], origins: [origin] });
  const request = (path: string) => app.request(new Request(origin + path, { headers: { host: new URL(origin).host } }));
  const q = `?project=${encodeURIComponent(project)}`;
  for (const path of [`/api/plugins${q}`, `/api/skills${q}`, "/api/plugins", "/api/skills", "/api/agents"]) {
    const response = await request(path);
    assert.equal(response.status, 200, path);
  }
  assert.equal(existsSync(marker), false);
});
