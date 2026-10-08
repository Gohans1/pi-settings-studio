import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConfigStore } from "../src/server/store.ts";
import { createApp } from "../src/server/app.ts";

const origin = "http://127.0.0.1:43123";

test("themes are Pi's built-ins plus the themes Pi discovers, by their name field", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "pi-settings-themes-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const agent = join(root, "agent"), project = join(root, "webapp");
  await mkdir(join(agent, "themes"), { recursive: true });
  await mkdir(join(project, ".pi", "themes"), { recursive: true });
  await writeFile(join(agent, "themes", "ocean.json"), JSON.stringify({ name: "ocean", appearance: "dark", colors: {} }));
  await writeFile(join(agent, "themes", "broken.json"), "{ nope");
  await writeFile(join(project, ".pi", "themes", "paper.json"), JSON.stringify({ name: "paper", colors: {} }));
  await writeFile(join(agent, "settings.json"), "{}");
  const app = createApp({ store: new ConfigStore({ global: agent }), agentDir: agent, projects: [project], origins: [origin] });
  const request = (path: string) => app.request(new Request(origin + path, { headers: { host: new URL(origin).host } }));
  const themes = await (await request(`/api/themes?project=${encodeURIComponent(project)}`)).json();
  assert.deepEqual(themes.map((theme: { name: string; source: string }) => [theme.name, theme.source]),
    [["dark", "built-in"], ["light", "built-in"], ["broken.json", "user"], ["ocean", "user"], ["paper", "project"]]);
  assert.equal(themes.find((theme: { name: string }) => theme.name === "ocean").appearance, "dark");
  assert.match(themes.find((theme: { name: string }) => theme.name === "broken.json").error, /JSON/);
});
