import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseAllowedOrigin, startServer } from "../src/server/server.ts";

test("server binds loopback, serves the API without a login, writes nothing on launch, and closes", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "pi-settings-lifecycle-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const running = await startServer({ agentDir: join(root, "agent"), projectDir: join(root, "workspace"), port: 0 });
  t.after(() => running.close());
  const url = new URL(running.url);
  assert.equal(url.hostname, "127.0.0.1");
  assert.notEqual(url.port, "0");
  assert.equal(url.hash, "");
  assert.equal((await fetch(url.origin + "/api/settings/global")).status, 200);
  await assert.rejects(stat(join(root, "agent")), { code: "ENOENT" });
  await running.close();
  await assert.rejects(fetch(url.origin + "/api/settings/global"));
});

test("an allowed origin lets its tailnet address in, and only that origin", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "pi-settings-tailnet-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const tailnet = "https://anphat-1.taild3d41b.ts.net:8443";
  const allowed = await startServer({ agentDir: join(root, "agent"), port: 0, allowedOrigins: [tailnet] });
  t.after(() => allowed.close());
  const allowedPort = new URL(allowed.url).port;
  const inTailnet = await fetch(`http://127.0.0.1:${allowedPort}/api/settings/global`, { headers: { host: "anphat-1.taild3d41b.ts.net:8443", origin: tailnet } });
  assert.equal(inTailnet.status, 200);
  const stranger = await fetch(`http://127.0.0.1:${allowedPort}/api/settings/global`, { headers: { host: "anphat-1.taild3d41b.ts.net:8443", origin: "https://evil.example" } });
  assert.equal(stranger.status, 403);

  const closed = await startServer({ agentDir: join(root, "agent"), port: 0 });
  t.after(() => closed.close());
  const closedPort = new URL(closed.url).port;
  const withoutFlag = await fetch(`http://127.0.0.1:${closedPort}/api/settings/global`, { headers: { host: "anphat-1.taild3d41b.ts.net:8443", origin: tailnet } });
  assert.equal(withoutFlag.status, 403);
});

test("--allow-origin accepts one origin, normalised, and refuses anything else", () => {
  assert.equal(parseAllowedOrigin("https://anphat-1.taild3d41b.ts.net:8443/"), "https://anphat-1.taild3d41b.ts.net:8443");
  assert.equal(parseAllowedOrigin("https://anphat-1.taild3d41b.ts.net"), "https://anphat-1.taild3d41b.ts.net");
  assert.throws(() => parseAllowedOrigin("anphat-1"), /valid URL/);
  assert.throws(() => parseAllowedOrigin("ftp://anphat-1.taild3d41b.ts.net"), /http or https/);
  assert.throws(() => parseAllowedOrigin("https://anphat-1.taild3d41b.ts.net/settings"), /origin only/);
});
