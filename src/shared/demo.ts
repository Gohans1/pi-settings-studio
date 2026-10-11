/** The sample home and project the demo build shows; src/demo/seed.ts builds them and src/demo/snapshot.json records them. */
export const DEMO_HOME = "/home/demo";
export const DEMO_PROJECT = `${DEMO_HOME}/projects/my-app`;

/** A request as one key: a read that names what it reads carries its body, minus `fresh`, which only asks Pi to look again. */
export function demoKey(url: string, method: string, body?: unknown) {
  const { fresh: _fresh, ...named } = (body ?? {}) as Record<string, unknown>;
  return method === "GET" || body === undefined ? `${method} ${url}` : `${method} ${url} ${JSON.stringify(named)}`;
}
