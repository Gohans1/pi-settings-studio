import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { DEMO_PROJECT } from "../src/shared/demo";
import { READ_ONLY } from "../src/client/demo";

// The demo build answers the app's requests from src/demo/snapshot.json; `bun run record:demo` writes it.
beforeAll(() => { process.env.VITE_DEMO = "1"; });
afterAll(() => { delete process.env.VITE_DEMO; });

describe("the demo build", () => {
  test("answers every read the app makes when its tabs open", async () => {
    const [api, { readEverything }] = await Promise.all([import("../src/client/api"), import("../src/demo/reads")]);
    await readEverything(api);
  });

  test("opens on the sample project", async () => {
    const api = await import("../src/client/api");
    expect((await api.loadProjects()).map(project => project.path)).toEqual([DEMO_PROJECT]);
  });

  test("refuses a change to the settings", async () => {
    const api = await import("../src/client/api");
    await expect(api.saveSettings("global", "r", [{ key: "theme", value: "light" }])).rejects.toThrow(READ_ONLY);
  });
});
