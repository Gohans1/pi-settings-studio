import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { Hono } from "hono";
import { buildSessionContext, migrateSessionEntries, parseSessionEntries, SessionManager, type SessionEntry } from "@earendil-works/pi-coding-agent";
import { contentText, getCurrentSystemMessage, getSystemMessageText, type Message } from "@earendil-works/pi-ai";
import type { SessionSummary, SystemPromptView } from "../shared/sessions.ts";

// ponytail: reads <agentDir>/sessions only; a custom `sessionDir` setting is not followed yet.
export async function listSessions(agentDir: string) {
  const root = join(agentDir, "sessions");
  let dirs: string[] = [];
  try { dirs = (await readdir(root, { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => join(root, entry.name)); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  // listAll(dir) reads one flat directory; Pi keeps one directory per project.
  const sessions = (await Promise.all(dirs.map(dir => SessionManager.listAll(dir)))).flat();
  return sessions.sort((a, b) => b.modified.getTime() - a.modified.getTime());
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

export function sessionRoutes(agentDir: string) {
  return new Hono()
    .get("/", async c => c.json((await listSessions(agentDir)).slice(0, 500).map((session): SessionSummary => ({
      id: session.id,
      cwd: session.cwd,
      title: (session.name || session.firstMessage || "(no messages)").slice(0, 160),
      modified: session.modified.toISOString(),
      messageCount: session.messageCount,
    }))))
    .get("/:id/system-prompt", async c => {
      // The browser names a session by id; the path always comes from Pi's own listing.
      const session = (await listSessions(agentDir)).find(entry => entry.id === c.req.param("id"));
      if (!session) return c.json({ error: "This session no longer exists." }, 404);
      return c.json(await systemPrompt(session.path, session.id, session.cwd));
    });
}
