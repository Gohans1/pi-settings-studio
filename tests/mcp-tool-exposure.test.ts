import { expect, test } from "bun:test";
import { toolExposure } from "../src/shared/mcp.ts";

test("a tool's exposure follows Pi: an exact rule, then the first matching pattern, then the server", () => {
  const server = { exposure: "deferred", toolExposure: { search_code: "direct", "delete_*": "hidden", "*_code": "codemode" } };
  expect(toolExposure(server, "search_code")).toBe("direct");
  expect(toolExposure(server, "delete_repo")).toBe("hidden");
  expect(toolExposure(server, "read_code")).toBe("codemode");
  expect(toolExposure(server, "list_issues")).toBe("deferred");
  expect(toolExposure({ toolExposure: {} }, "anything")).toBe("codemode");
  // Only * is a wildcard; other characters match themselves.
  expect(toolExposure({ toolExposure: { "a.b*": "direct" } }, "axb_c")).toBe("codemode");
});
