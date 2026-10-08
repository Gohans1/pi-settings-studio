import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

/** A real npm metadata endpoint on loopback, never a package download or install. */
export async function packageRegistry(root: string) {
  const requests: string[] = [];
  let latest = "2.0.0";
  let unavailable = false;
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch(request) {
    const name = decodeURIComponent(new URL(request.url).pathname.slice(1));
    requests.push(name);
    if (unavailable) return new Response("Unavailable", { status: 503 });
    return Response.json({ name, "dist-tags": { latest }, versions: Object.fromEntries(
      ["1.0.0", "1.5.0", "2.0.0"].map(version => [version, { name, version }])) });
  } });
  async function configure(dir: string) {
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, ".npmrc"), `registry=http://127.0.0.1:${server.port}/\ncache=${join(root, "npm-cache")}\nfetch-retries=0\nupdate-notifier=false\n`);
  }
  async function installed(base: string, name: string, version = "1.0.0") {
    const path = join(base, "npm", "node_modules", name);
    await mkdir(path, { recursive: true });
    await writeFile(join(path, "package.json"), JSON.stringify({ name, version }));
  }
  return { configure, installed, requests, setLatest: (value: string) => { latest = value; },
    fail: () => { unavailable = true; }, close: () => server.stop(true) };
}
