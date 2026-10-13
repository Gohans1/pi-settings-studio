import { afterEach, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { parse } from "yaml";
import { checkRelease } from "../scripts/release.ts";

const temporary: string[] = [];
afterEach(() => { for (const dir of temporary.splice(0)) rmSync(dir, { recursive: true, force: true }); });

function fixture(change: (packed: string, checkout: string) => void = () => {}) {
  const dir = mkdtempSync(join(tmpdir(), "pi-release-test-"));
  temporary.push(dir);
  const root = join(dir, "checkout");
  const packed = join(dir, "payload", "package");
  const manifest = { name: "pi-settings-studio", version: "0.1.0", type: "module", license: "MIT",
    bin: { "pi-settings-studio": "src/server/cli.ts" }, scripts: { prepack: "bun run build" } };
  const files = {
    "package.json": JSON.stringify(manifest),
    "README.md": "# Test package\n",
    LICENSE: "MIT License\n",
    "THIRD_PARTY_NOTICES.md": "Test notices\n",
    "src/server/cli.ts": "#!/usr/bin/env bun\nconsole.log('fixture');\n",
    "src/server/server.ts": "export const fixture = true;\n",
    "src/shared/settings.ts": "export const fixture = true;\n",
    "dist/client/index.html": '<script type="module" src="/assets/app.js"></script><link href="/assets/app.css" rel="stylesheet">',
    "dist/client/assets/app.js": "console.log('fixture');",
    "dist/client/assets/app.css": "body { color: black; }",
  };
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), content);
  }
  mkdirSync(dirname(packed), { recursive: true });
  cpSync(root, packed, { recursive: true });
  change(packed, root);
  const archive = join(dir, "package.tgz");
  execFileSync("tar", ["-czf", archive, "-C", dirname(packed), "package"]);
  return { dir, root, packed, archive };
}

describe("release tarball", () => {
  test("accepts checkout-identical sources and built client assets, returning the actual digest", () => {
    const { root, archive } = fixture();
    const result = checkRelease(archive, root);
    expect(result.name).toBe("pi-settings-studio");
    expect(result.version).toBe("0.1.0");
    expect(result.files).toContain("package/src/server/cli.ts");
    expect(result.sha256).toBe(createHash("sha256").update(readFileSync(archive)).digest("hex"));
  });

  test("rejects accidentally packed npm credentials", () => {
    const { root, archive } = fixture(packed => writeFileSync(join(packed, ".npmrc"), "FAKE_ONLY"));
    expect(() => checkRelease(archive, root)).toThrow("Unexpected package entry");
  });

  test("rejects traversal paths before extraction", () => {
    const { root, archive, packed } = fixture();
    execFileSync("tar", ["-czf", archive, "-C", dirname(packed),
      "--transform=s|package/src/server/cli.ts|package/src/server/../../escape|", "package"]);
    expect(() => checkRelease(archive, root)).toThrow("Unexpected package entry");
  });

  test("rejects links even when their names sit inside an allowed source directory", () => {
    const { root, archive } = fixture(packed => symlinkSync("/does-not-exist", join(packed, "src/server/link.ts")));
    expect(() => checkRelease(archive, root)).toThrow("Links and special files");
  });

  test("rejects altered package metadata", () => {
    const { root, archive } = fixture(packed => {
      const manifest = JSON.parse(readFileSync(join(packed, "package.json"), "utf8"));
      manifest.version = "9.9.9";
      writeFileSync(join(packed, "package.json"), JSON.stringify(manifest));
    });
    expect(() => checkRelease(archive, root)).toThrow("Package metadata differs");
  });

  test("rejects altered server code", () => {
    const { root, archive } = fixture(packed => writeFileSync(join(packed, "src/server/cli.ts"), "console.log('changed');"));
    expect(() => checkRelease(archive, root)).toThrow("Source differs");
  });

  test("rejects a built HTML page referencing a missing asset", () => {
    const { root, archive } = fixture(packed => rmSync(join(packed, "dist/client/assets/app.js")));
    expect(() => checkRelease(archive, root)).toThrow("Missing client asset");
  });

  test("rejects consumer install hooks even when the checkout also declares them", () => {
    const { root, archive } = fixture((packed, checkout) => {
      for (const dir of [packed, checkout]) {
        const manifest = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
        manifest.scripts.postinstall = "echo unexpected";
        writeFileSync(join(dir, "package.json"), JSON.stringify(manifest));
      }
    });
    expect(() => checkRelease(archive, root)).toThrow("Consumer install hooks");
  });
});

test("release credentials are confined to a main-only staging job without rebuilding", () => {
  const root = resolve(import.meta.dir, "..");
  const workflow = parse(readFileSync(join(root, ".github/workflows/release.yml"), "utf8"));
  expect(workflow.permissions).toEqual({ contents: "read" });
  expect(workflow.jobs.build.permissions?.["id-token"]).not.toBe("write");
  expect(workflow.jobs.stage.permissions).toEqual({ contents: "read", "id-token": "write" });
  expect(workflow.jobs.stage.environment).toBe("npm");
  expect(workflow.jobs.stage.if).toContain("refs/heads/main");
  const commands = workflow.jobs.stage.steps.map((step: { run?: string }) => step.run ?? "").join("\n");
  expect(commands).toContain("npm stage publish");
  expect(commands).toContain("--provenance");
  expect(commands).not.toMatch(/bun (install|run build|pm pack)/);
});

// `bun run typecheck` is `bun check`, which Bun has had since 1.4.3; a job on an older Bun fails at that step.
test("every job runs the pinned Bun, and that Bun has bun check", () => {
  const root = resolve(import.meta.dir, "..");
  const workflow = parse(readFileSync(join(root, ".github/workflows/release.yml"), "utf8"));
  const pinned = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).packageManager;
  const used = Object.values<{ steps: { uses?: string; with?: Record<string, unknown> }[] }>(workflow.jobs)
    .flatMap(job => job.steps.flatMap(step => step.uses?.startsWith("oven-sh/setup-bun@") ? [`bun@${step.with?.["bun-version"]}`] : []));
  expect(used.length).toBeGreaterThan(0);
  for (const version of used) expect(version).toBe(pinned);
  expect(Bun.semver.order(pinned.slice("bun@".length), "1.4.3")).toBeGreaterThanOrEqual(0);
});
