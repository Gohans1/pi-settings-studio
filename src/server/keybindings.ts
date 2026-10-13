import { Hono } from "hono";
import { z } from "zod";
import type { KeybindingsView } from "../shared/keybindings.ts";
import { isValidKey } from "../shared/keys.ts";
import { KEYBINDING_ACTIONS } from "./keybindings-catalogue.ts";
import { ConfigError, type ConfigStore } from "./store.ts";

const ids = new Set(KEYBINDING_ACTIONS.map(([id]) => id));
const asList = (value: unknown) => typeof value === "string" ? [value] : Array.isArray(value) ? value.filter((key): key is string => typeof key === "string") : undefined;

export function keybindingRoutes(store: ConfigStore) {
  async function view(): Promise<KeybindingsView> {
    const path = store.path("global", "keybindings.json");
    const hasBackup = await store.hasBackup("global", "keybindings.json");
    let value: Record<string, unknown> = {}, revision = "invalid", exists = true, error: string | undefined;
    try { ({ value, revision, exists } = await store.read("global", "keybindings.json")); }
    catch (cause) { if (!(cause instanceof ConfigError)) throw cause; error = cause.message; }
    return {
      path, revision, exists, hasBackup, ...(error ? { error } : {}),
      actions: KEYBINDING_ACTIONS.map(([id, description, defaults]) => {
        const keys = asList(value[id]);
        return { id, description, defaults: [...defaults], ...(keys ? { keys } : {}) };
      }),
      // Ids Pi does not document (extension shortcuts, renamed actions) stay in the file untouched. `$schema` is
      // an editor hint that Pi's loader skips (dist/core/keybindings.js toKeybindingsConfig).
      unknown: Object.keys(value).filter(id => id !== "$schema" && !ids.has(id)),
    };
  }
  const change = z.object({ id: z.string().max(200), keys: z.array(z.string().max(60)).max(10).nullable() }).strict();
  return new Hono()
    .get("/", async c => c.json(await view()))
    .patch("/", async c => {
      const { revision, changes } = z.object({ revision: z.string().min(1).max(100), changes: z.array(change).min(1).max(200) }).strict().parse(await c.req.json());
      for (const { id, keys } of changes) {
        if (!ids.has(id)) throw new ConfigError(`Pi has no action named ${id}.`);
        const bad = keys?.find(key => !isValidKey(key));
        if (bad !== undefined) throw new ConfigError(`"${bad}" is not a key Pi understands. Use modifiers ctrl, shift, alt or super, for example ctrl+shift+n.`);
      }
      await store.transform("global", revision, file => {
        // null goes back to Pi's defaults; an empty list disables the action.
        for (const { id, keys } of changes) {
          if (keys === null) delete file[id];
          else file[id] = keys.length === 1 ? keys[0] : keys;
        }
        return file;
      }, "keybindings.json");
      return c.json(await view());
    })
    .post("/restore", async c => {
      const { revision } = z.object({ revision: z.string().min(1).max(100) }).strict().parse(await c.req.json());
      await store.restore("global", revision, "keybindings.json");
      return c.json(await view());
    });
}
