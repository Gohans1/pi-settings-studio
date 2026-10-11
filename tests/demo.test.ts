import { describe, expect, test } from "bun:test";
import { answer, demoRequest, whenRefused, READ_ONLY, NOT_IN_DEMO } from "../src/client/demo";

// The demo answers the app's requests from what the real server answered on sample data (src/demo/snapshot.json).
const recorded = {
  "GET /api/pi": { installed: "1.1.0", builtFor: "1.1.0" },
  "POST /api/tools {}": { tools: ["read", "bash"] },
  'POST /api/plugins/tools {"path":"todo.ts"}': { tools: ["todo_add"] },
};

describe("the demo's answers", () => {
  test("a read gets what the server answered when it was recorded", async () => {
    expect(await answer<unknown>(recorded, "/api/pi", "GET")).toEqual({ installed: "1.1.0", builtFor: "1.1.0" });
  });

  test("a read that asks Pi to look again finds the same answer", async () => {
    expect(await answer<unknown>(recorded, "/api/tools", "POST", { fresh: true })).toEqual({ tools: ["read", "bash"] });
    expect(await answer<unknown>(recorded, "/api/plugins/tools", "POST", { path: "todo.ts", fresh: true })).toEqual({ tools: ["todo_add"] });
  });

  test("a read that names something else does not get another one's answer", async () => {
    await expect(answer(recorded, "/api/plugins/tools", "POST", { path: "other.ts" })).rejects.toThrow(READ_ONLY);
  });

  test("a reader that changes its answer does not change the next one", async () => {
    const first = await answer<{ tools: string[] }>(recorded, "/api/tools", "POST", {});
    first.tools.push("changed");
    expect((await answer<{ tools: string[] }>(recorded, "/api/tools", "POST", {})).tools).toEqual(["read", "bash"]);
  });

  test("a change is refused as read-only", async () => {
    await expect(answer(recorded, "/api/settings/global", "PATCH", { revision: "r", changes: [] })).rejects.toThrow(READ_ONLY);
    await expect(answer(recorded, "/api/mcp/global/servers/echo", "DELETE", { revision: "r" })).rejects.toThrow(READ_ONLY);
  });

  test("a read the demo does not have says it is not in the demo, not that it is read-only", async () => {
    await expect(answer(recorded, "/api/keybindings", "GET")).rejects.toThrow(NOT_IN_DEMO);
  });
});

describe("telling the page a change was refused", () => {
  test("a refused change tells the page, whichever tab asked", async () => {
    const told: string[] = [];
    whenRefused(message => told.push(message));
    await expect(demoRequest("/api/settings/global", "PATCH", { revision: "r", changes: [] })).rejects.toThrow(READ_ONLY);
    expect(told).toEqual([READ_ONLY]);
    whenRefused(undefined);
  });

  test("a read the demo lacks is not a refusal", async () => {
    const told: string[] = [];
    whenRefused(message => told.push(message));
    await expect(demoRequest("/api/not-recorded", "GET")).rejects.toThrow(NOT_IN_DEMO);
    expect(told).toEqual([]);
    whenRefused(undefined);
  });
});
