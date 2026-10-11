import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

// What `bunx pi-settings-studio` runs: the bin starts src/server, which serves dist/client and imports src/shared.
const root = resolve(import.meta.dir, "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const covered = (path: string) => (pkg.files ?? []).some((entry: string) => path === entry || path.startsWith(`${entry}/`));

describe("package metadata", () => {
  test("can be published under the MIT license", () => {
    expect(pkg.private).not.toBe(true);
    expect(pkg.license).toBe("MIT");
    expect(readFileSync(join(root, "LICENSE"), "utf8")).toStartWith("MIT License");
  });

  test("the bin is a Bun script that ships with what it serves and imports", () => {
    const bin = pkg.bin["pi-settings-studio"];
    expect(readFileSync(join(root, bin), "utf8")).toStartWith("#!/usr/bin/env bun");
    for (const path of [bin, "src/server/server.ts", "src/shared/settings.ts", "dist/client/index.html"]) expect(covered(path)).toBe(true);
    expect(covered("tests/setup.ts")).toBe(false);
    expect(covered("e2e/settings.spec.ts")).toBe(false);
  });

  test("every source folder it ships sits in the repository", () => {
    for (const entry of pkg.files.filter((entry: string) => !entry.startsWith("dist/"))) expect(existsSync(join(root, entry))).toBe(true);
  });

  test("tells where to find the code and says it needs Bun", () => {
    expect(pkg.repository.url).toContain("github.com/Gohans1/pi-settings-studio");
    expect(pkg.engines.bun).toBeString();
  });
});
