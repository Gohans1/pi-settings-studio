import snapshot from "../demo/snapshot.json";
import { demoKey } from "../shared/demo";

export const READ_ONLY = "This is a read-only demo with sample data. Run Pi Settings Studio on your machine to change your own settings.";
export const NOT_IN_DEMO = "This part is not included in the demo.";

/** Each reader gets its own copy, as it would from the server. */
export async function answer<T>(recorded: Record<string, unknown>, url: string, method: string, body?: unknown): Promise<T> {
  const found = recorded[demoKey(url, method, body)];
  if (found !== undefined) return structuredClone(found) as T;
  throw new Error(method === "GET" ? NOT_IN_DEMO : READ_ONLY);
}

let refused: ((message: string) => void) | undefined;
/** The page says a change was refused, whichever way the tab that asked reports its error. */
export const whenRefused = (listener: typeof refused) => { refused = listener; };

export async function demoRequest<T>(url: string, method: string, body?: unknown): Promise<T> {
  try { return await answer<T>(snapshot, url, method, body); }
  catch (error) { if (error instanceof Error && error.message === READ_ONLY) refused?.(READ_ONLY); throw error; }
}
