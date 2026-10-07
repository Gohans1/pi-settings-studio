import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, rename, rm } from "node:fs/promises";
import { dirname, join, parse, resolve } from "node:path";
import lockfile from "proper-lockfile";

export type Scope = "global" | "project";
// Fixed documents only; HTTP never supplies a path.
export type DocumentName = "settings.json" | "mcp.json";
export type Change = { path: string[]; value?: unknown; remove?: true };
export type Document = { value: Record<string, unknown>; revision: string; exists: boolean; indent: string };
const MAX_BYTES = 1024 * 1024;
const forbidden = new Set(["__proto__", "constructor", "prototype"]);

export class ConfigError extends Error {
  constructor(message: string, readonly status: 400 | 409 | 422 = 422) { super(message); }
}

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === "ENOENT";
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function decode(raw: string | undefined): Document {
  let value: unknown = {};
  if (raw !== undefined) {
    try { value = JSON.parse(raw.replace(/^\uFEFF/, "")); }
    catch { throw new ConfigError("The file must contain valid JSON. Fix the file before saving."); }
  }
  if (!object(value)) throw new ConfigError("The file must contain a JSON object.");
  return {
    value,
    exists: raw !== undefined,
    revision: raw === undefined ? "missing" : createHash("sha256").update(raw).digest("hex"),
    // Keep the file's indentation when rewriting it, as Pi does.
    indent: (raw && /^([ \t]+)\S/m.exec(raw)?.[1]) || "  ",
  };
}

// Refuse symlinks throughout the selected path. This is not an OS sandbox against
// another process running as the same user; see SPEC.md for the boundary.
async function assertSafe(path: string): Promise<void> {
  const absolute = resolve(path);
  let current = parse(absolute).root;
  for (const segment of absolute.slice(current.length).split(/[\\/]/).filter(Boolean)) {
    current = join(current, segment);
    try {
      const info = await lstat(current);
      if (info.isSymbolicLink()) throw new ConfigError("Symbolic link configuration paths are not supported. Choose a real directory.");
      if (current !== absolute && !info.isDirectory()) throw new ConfigError("Configuration parent must be a directory.");
      if (current === absolute && !info.isDirectory() && !info.isFile()) throw new ConfigError("Configuration must be a regular file.");
    } catch (error) { if (isMissing(error)) return; throw error; }
  }
}

async function readRaw(path: string): Promise<string | undefined> {
  await assertSafe(path);
  let handle;
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const info = await handle.stat();
    if (!info.isFile() || info.size > MAX_BYTES) throw new ConfigError("Settings must be a regular file no larger than 1 MiB.");
    const text = await handle.readFile("utf8");
    if (Buffer.byteLength(text) > MAX_BYTES) throw new ConfigError("Settings exceed 1 MiB.");
    return text;
  } catch (error) { if (isMissing(error)) return undefined; throw error; }
  finally { await handle?.close(); }
}

async function atomicWrite(path: string, text: string): Promise<void> {
  await assertSafe(path);
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    const handle = await open(temporary, "wx", 0o600);
    try { await handle.writeFile(text, "utf8"); await handle.sync(); }
    finally { await handle.close(); }
    await rename(temporary, path);
  } finally { await rm(temporary, { force: true }); }
}

function applyChanges(source: Record<string, unknown>, changes: Change[]): Record<string, unknown> {
  const result = structuredClone(source);
  for (const change of changes) {
    if (!change.path.length || change.path.some(part => !/^[a-zA-Z][\w-]*$/.test(part) || forbidden.has(part))) {
      throw new ConfigError("Invalid setting path.");
    }
    let cursor = result;
    for (const part of change.path.slice(0, -1)) {
      if (!Object.hasOwn(cursor, part)) cursor[part] = {};
      const child = cursor[part];
      if (!object(child)) throw new ConfigError("The existing setting group is not an object. Repair it before editing.");
      cursor = child;
    }
    const key = change.path.at(-1)!;
    if (change.remove) delete cursor[key];
    else cursor[key] = change.value;
  }
  return result;
}

export class ConfigStore {
  constructor(private readonly roots: Record<Scope, string>) {}

  path(scope: Scope, file: DocumentName = "settings.json"): string {
    if (scope !== "global" && scope !== "project") throw new ConfigError("Unknown settings scope.", 400);
    if (file !== "settings.json" && file !== "mcp.json") throw new ConfigError("Unknown configuration file.", 400);
    return join(resolve(this.roots[scope]), file);
  }

  async hasBackup(scope: Scope, file?: DocumentName): Promise<boolean> {
    try { return (await lstat(this.path(scope, file) + ".pi-settings-backup")).isFile(); }
    catch (error) { if (isMissing(error)) return false; throw error; }
  }

  async read(scope: Scope, file?: DocumentName): Promise<Document> { return decode(await readRaw(this.path(scope, file))); }

  async patch(scope: Scope, revision: string, changes: Change[], file?: DocumentName): Promise<Document> {
    return this.transform(scope, revision, value => applyChanges(value, changes), file);
  }

  /** Replace the document with `edit(current)`, under the lock and revision check. */
  async transform(scope: Scope, revision: string, edit: (value: Record<string, unknown>) => Record<string, unknown> | Promise<Record<string, unknown>>, file?: DocumentName): Promise<Document> {
    return this.update(scope, revision, async current => JSON.stringify(await edit(current.value), null, current.indent) + "\n", file);
  }

  async restore(scope: Scope, revision: string, file?: DocumentName): Promise<Document> {
    return this.update(scope, revision, async () => {
      const backup = await readRaw(this.path(scope, file) + ".pi-settings-backup");
      if (backup === undefined) throw new ConfigError("No backup is available.");
      decode(backup);
      return backup;
    }, file);
  }

  private async update(scope: Scope, revision: string, next: (current: Document) => string | Promise<string>, file?: DocumentName): Promise<Document> {
    const path = this.path(scope, file);
    await assertSafe(path);
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    const release = await lockfile.lock(path, { realpath: false, retries: { retries: 8, minTimeout: 15, maxTimeout: 100 } });
    try {
      const raw = await readRaw(path);
      const current = decode(raw);
      if (current.revision !== revision) throw new ConfigError("The file changed in another session. Reload and check your draft before saving.", 409);
      const text = await next(current);
      if (Buffer.byteLength(text) > MAX_BYTES) throw new ConfigError("The file would exceed 1 MiB.");
      if (raw !== undefined) await atomicWrite(path + ".pi-settings-backup", raw);
      // Catch uncooperative editors too, up to this final pre-rename check.
      if (decode(await readRaw(path)).revision !== revision) throw new ConfigError("The file changed while saving. Reload before trying again.", 409);
      await atomicWrite(path, text);
      return decode(text);
    } finally { await release(); }
  }
}
