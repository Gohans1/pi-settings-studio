import { readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { Hono } from "hono";
import { buildSessionContext, migrateSessionEntries, parseSessionEntries, ProjectTrustStore, SessionManager, type SessionEntry } from "@earendil-works/pi-coding-agent";
import { contentText, getCurrentSystemMessage, getSystemMessageText, type Message } from "@earendil-works/pi-ai";
import type { SessionSummary, SystemPromptView } from "../shared/sessions.ts";
import { isRecord } from "./mcp-config.ts";

type SessionInfo = Awaited<ReturnType<typeof SessionManager.listAll>>[number];

const settingsOf = async (path: string): Promise<Record<string, unknown>> => {
  try { const value = JSON.parse(await readFile(path, "utf8")); return isRecord(value) ? value : {}; } catch { return {}; }
};
/** Pi's sessionDir value: `~` expands, a relative path resolves from the working directory. */
const expand = (value: string) => value === "~" ? homedir() : value.startsWith("~/") ? join(homedir(), value.slice(2)) : value;
const sessionDirOf = (value: unknown, cwd: string) => typeof value === "string" && value ? resolve(cwd, expand(value)) : undefined;

/** Sessions of one flat directory, as Pi writes them into a custom sessionDir. */
const flat = (dir: string) => SessionManager.listAll(dir).catch(() => [] as SessionInfo[]);

/**
 * Pi keeps sessions in <agentDir>/sessions/<one folder per cwd>, or flat in the sessionDir setting
 * (a trusted project's .pi/settings.json overriding the global one). A relative sessionDir depends
 * on the working directory, so it is followed for the known projects: the --project folders and
 * the folders sessions were found for. PI_CODING_AGENT_SESSION_DIR and --session-dir are not seen.
 */
export async function listSessions(agentDir: string, projects: string[] = []) {
  const root = join(agentDir, "sessions");
  let dirs: string[] = [];
  try { dirs = (await readdir(root, { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => join(root, entry.name)); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const global = await settingsOf(join(agentDir, "settings.json"));
  if (typeof global.sessionDir === "string" && isAbsolute(expand(global.sessionDir))) dirs.push(resolve(expand(global.sessionDir)));
  const found = (await Promise.all(dirs.map(flat))).flat();

  const trust = new ProjectTrustStore(agentDir);
  const trusted = (cwd: string) => trust.getEntry(cwd)?.decision ?? global.defaultProjectTrust === "always";
  const cwds = new Set([...projects.map(path => resolve(path)), ...found.map(session => session.cwd).filter(Boolean)]);
  const custom = new Set<string>();
  for (const cwd of cwds) {
    const local = trusted(cwd) ? await settingsOf(join(cwd, ".pi", "settings.json")) : {};
    const dir = sessionDirOf(local.sessionDir ?? global.sessionDir, cwd);
    if (dir && !dirs.includes(dir)) custom.add(dir);
  }
  const all = [...found, ...(await Promise.all([...custom].map(flat))).flat()];
  const unique = [...new Map(all.map(session => [session.path, session])).values()];
  return unique.sort((a, b) => b.modified.getTime() - a.modified.getTime());
}

async function systemPrompt(path: string, id: string, cwd: string): Promise<SystemPromptView> {
  const entries = parseSessionEntries(await readFile(path, "utf8"));
  migrateSessionEntries(entries);
  const context = buildSessionContext(entries.filter(entry => entry.type !== "session") as SessionEntry[]);
  const message = getCurrentSystemMessage(context.messages as Message[]);
  return {
    id, cwd,
    sections: Object.entries(message?.sections ?? {}).flatMap(([name, text]) => typeof text === "string" ? [{ name, text }] : []),
    content: message ? contentText(message.content) : "",
    tools: (message?.toolsAdded ?? []).map(tool => ({ name: tool.name, description: tool.description })),
    text: message ? getSystemMessageText(message) : "",
  };
}

export function sessionRoutes(agentDir: string, projects: string[] = []) {
  return new Hono()
    .get("/", async c => c.json((await listSessions(agentDir, projects)).slice(0, 500).map((session): SessionSummary => ({
      id: session.id,
      cwd: session.cwd,
      title: (session.name || session.firstMessage || "(no messages)").slice(0, 160),
      modified: session.modified.toISOString(),
      messageCount: session.messageCount,
    }))))
    .get("/:id/system-prompt", async c => {
      // The browser names a session by id; the path always comes from Pi's own listing.
      const session = (await listSessions(agentDir, projects)).find(entry => entry.id === c.req.param("id"));
      if (!session) return c.json({ error: "This session no longer exists." }, 404);
      return c.json(await systemPrompt(session.path, session.id, session.cwd));
    });
}
