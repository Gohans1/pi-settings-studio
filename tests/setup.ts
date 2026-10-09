// Preloaded before every test file (bunfig.toml). Pi reads the home folder from HOME when it runs
// (dist/core/package-manager.js getHomeDir: process.env.HOME || homedir()) and loads the skills in
// ~/.agents/skills of whoever runs the tests. Each run gets an empty home of its own, removed at the end.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const home = mkdtempSync(join(tmpdir(), "pi-settings-home-"));
process.env.HOME = home;
process.on("exit", () => rmSync(home, { recursive: true, force: true }));
