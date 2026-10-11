import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";

export function checkRelease(archive: string, root: string) {
  archive = resolve(archive);
  const entries = execFileSync("tar", ["-tzf", archive], { encoding: "utf8" }).trim().split("\n");
  const types = execFileSync("tar", ["-tzvf", archive], { encoding: "utf8" }).trim().split("\n");
  if (types.some(line => !["-", "d"].includes(line[0]!))) throw new Error("Links and special files are not allowed.");
  const documents = ["package.json", "README.md", "LICENSE", "THIRD_PARTY_NOTICES.md"];
  const directories = ["package/", "package/src/", "package/dist/"];
  for (const entry of entries) {
    const allowed = documents.some(file => entry === `package/${file}`) || directories.includes(entry)
      || ["src/server/", "src/shared/", "dist/client/"].some(dir => entry.startsWith(`package/${dir}`));
    if (!allowed || entry.includes("\\") || entry.split("/").some(part => part.startsWith("."))) {
      throw new Error(`Unexpected package entry: ${entry}`);
    }
  }
  const files = entries.filter(entry => !entry.endsWith("/")).sort();
  const temporary = mkdtempSync(join(tmpdir(), "pi-release-check-"));
  try {
    // Check paths and file types before allowing tar to extract anything.
    execFileSync("tar", ["-xzf", archive, "-C", temporary]);
    const packed = join(temporary, "package");
    const manifest = JSON.parse(readFileSync(join(packed, "package.json"), "utf8"));
    const expected = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    if (!isDeepStrictEqual(manifest, expected)) throw new Error("Package metadata differs from the checkout.");
    if (["preinstall", "install", "postinstall", "prepare"].some(hook => manifest.scripts?.[hook])) {
      throw new Error("Consumer install hooks are not allowed.");
    }
    for (const file of documents.slice(1)) {
      if (!readFileSync(join(packed, file)).equals(readFileSync(join(root, file)))) throw new Error(`Document differs: ${file}`);
    }
    for (const dir of ["src/server", "src/shared"]) {
      const wanted = readdirSync(join(root, dir), { recursive: true }).map(String)
        .filter(file => statSync(join(root, dir, file)).isFile()).map(file => `${dir}/${file}`).sort();
      const found = files.filter(file => file.startsWith(`package/${dir}/`)).map(file => file.slice("package/".length));
      if (!isDeepStrictEqual(found, wanted)) throw new Error(`Source differs: ${dir} file list`);
      for (const file of wanted) {
        if (!readFileSync(join(packed, file)).equals(readFileSync(join(root, file)))) throw new Error(`Source differs: ${file}`);
      }
    }
    const html = readFileSync(join(packed, "dist/client/index.html"), "utf8");
    if (!/<script\b[^>]*\bsrc=["']\/assets\/[^"']+\.js["']/.test(html)) throw new Error("Missing built client script.");
    for (const reference of html.matchAll(/(?:src|href)=["'](\/assets\/[^"']+)["']/g)) {
      if (!files.includes(`package/dist/client${reference[1]}`)) throw new Error(`Missing client asset: ${reference[1]}`);
    }
    return { name: String(manifest.name), version: String(manifest.version), files,
      sha256: createHash("sha256").update(readFileSync(archive)).digest("hex") };
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

async function smokeRelease(archive: string, root: string) {
  const info = checkRelease(archive, root);
  const temporary = mkdtempSync(join(tmpdir(), "pi-release-smoke-"));
  const consumer = join(temporary, "consumer");
  const home = join(temporary, "home");
  const agent = join(home, ".pi/agent");
  let server: ReturnType<typeof Bun.spawn> | undefined;
  try {
    mkdirSync(consumer, { recursive: true });
    mkdirSync(agent, { recursive: true });
    writeFileSync(join(consumer, "package.json"), JSON.stringify({ private: true, type: "module", trustedDependencies: [] }));
    const env = { ...process.env, HOME: home, PI_OFFLINE: "1", PI_SKIP_VERSION_CHECK: "1", PI_CODING_AGENT_DIR: agent };
    for (const args of [
      ["add", "--ignore-scripts", resolve(archive)],
      ["audit", "--audit-level=high"],
    ]) {
      const result = Bun.spawnSync([process.execPath, ...args], { cwd: consumer, env, stdout: "inherit", stderr: "inherit" });
      if (result.exitCode !== 0) throw new Error(`Production package check failed: bun ${args[0]}`);
    }
    const bin = join(consumer, "node_modules/.bin/pi-settings-studio");
    const help = Bun.spawnSync([process.execPath, bin, "--help"], { cwd: consumer, env });
    if (help.exitCode !== 0 || !help.stdout.toString().includes("Pi Settings Studio")) throw new Error("Installed bin --help failed.");
    const log = join(temporary, "server.log");
    server = Bun.spawn([process.execPath, bin, "--agent-dir", agent, "--port", "0"],
      { cwd: consumer, env, stdout: "ignore", stderr: Bun.file(log) });
    let url: string | undefined;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (server.exitCode !== null) throw new Error(`Installed server exited: ${await Bun.file(log).text()}`);
      const output = await Bun.file(log).text();
      url = /Pi Settings Studio: (http:\/\/127\.0\.0\.1:\d+)/.exec(output)?.[1];
      if (url) break;
      await Bun.sleep(100);
    }
    if (!url) throw new Error("Installed server did not become ready.");
    const page = await fetch(url);
    if (!page.ok || !page.headers.get("content-security-policy")) throw new Error("Installed HTML or security headers failed.");
    const html = await page.text();
    const script = /<script\b[^>]*\bsrc=["'](\/assets\/[^"']+\.js)["']/.exec(html)?.[1];
    if (!script || !(await fetch(url + script)).ok) throw new Error("Installed client JavaScript failed.");
    const settings = await fetch(url + "/api/settings/global", { headers: { Origin: url } });
    if (!settings.ok) throw new Error(`Installed settings API failed: ${settings.status}`);
    await settings.json();
    console.log(JSON.stringify({ ...info, productionAudit: "passed (no exceptions)", installedCli: "passed", html: 200, javascript: 200, settings: 200 }));
  } finally {
    if (server) {
      server.kill();
      await server.exited;
    }
    rmSync(temporary, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  const [mode, archive] = process.argv.slice(2);
  if (!archive || !["check", "smoke"].includes(mode ?? "")) throw new Error("Usage: bun scripts/release.ts <check|smoke> package.tgz");
  const root = process.cwd();
  if (mode === "smoke") await smokeRelease(archive, root);
  else console.log(JSON.stringify(checkRelease(archive, root)));
}
