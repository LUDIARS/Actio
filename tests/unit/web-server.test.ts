import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, request, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { defaultDistDir, loadWebServerConfig } from "../../src/web-server/config.js";
import { isAllowedHost } from "../../src/web-server/host-guard.js";
import { isProxiedPath } from "../../src/web-server/proxy.js";
import { createWebServer } from "../../src/web-server/server.js";
import { cacheControlOf, resolveStaticPath } from "../../src/web-server/static-files.js";

function makeDist(): string {
  const dir = mkdtempSync(join(tmpdir(), "actio-web-dist-"));
  mkdirSync(join(dir, "assets"));
  writeFileSync(join(dir, "index.html"), "<!doctype html><title>main</title>");
  writeFileSync(join(dir, "declarative.html"), "<!doctype html><title>declarative</title>");
  writeFileSync(join(dir, "assets", "app-abc123.js"), "console.log(1)");
  return dir;
}

describe("resolveStaticPath", () => {
  const dist = makeDist();
  afterAll(() => rmSync(dist, { recursive: true, force: true }));

  it("serves real files and the root index", () => {
    expect(resolveStaticPath(dist, "/")).toEqual({ file: join(dist, "index.html"), fallback: false });
    expect(resolveStaticPath(dist, "/assets/app-abc123.js")?.file).toBe(join(dist, "assets", "app-abc123.js"));
  });

  it("resolves a multi-page entry with or without .html", () => {
    expect(resolveStaticPath(dist, "/declarative")?.file).toBe(join(dist, "declarative.html"));
    expect(resolveStaticPath(dist, "/declarative.html")?.file).toBe(join(dist, "declarative.html"));
  });

  it("falls back to index.html for client routes but not for missing assets", () => {
    expect(resolveStaticPath(dist, "/tasks/123")).toEqual({ file: join(dist, "index.html"), fallback: true });
    expect(resolveStaticPath(dist, "/assets/missing.js")).toBeNull();
  });

  it("refuses paths that escape the dist directory", () => {
    expect(resolveStaticPath(dist, "/../package.json")).toBeNull();
    expect(resolveStaticPath(dist, "/%2e%2e/%2e%2e/secret.txt")).toBeNull();
    expect(resolveStaticPath(dist, "/%E0%A4%A")).toBeNull();
    expect(resolveStaticPath(dist, "/a%00b")).toBeNull();
  });

  it("caches hashed assets for long and revalidates html", () => {
    expect(cacheControlOf(dist, join(dist, "assets", "app-abc123.js"))).toContain("immutable");
    expect(cacheControlOf(dist, join(dist, "index.html"))).toBe("no-cache");
  });
});

describe("isAllowedHost", () => {
  it("accepts loopback and IP literals", () => {
    for (const host of ["localhost:17881", "127.0.0.1:17881", "[::1]:17881", "app.localhost", "192.168.0.2"]) {
      expect(isAllowedHost(host, [])).toBe(true);
    }
  });

  it("accepts only configured public hosts", () => {
    expect(isAllowedHost("actio.ai-run-do.com", ["actio.ai-run-do.com"])).toBe(true);
    expect(isAllowedHost("Actio.AI-run-do.com:443", ["actio.ai-run-do.com"])).toBe(true);
    expect(isAllowedHost("evil.example.com", ["actio.ai-run-do.com"])).toBe(false);
    expect(isAllowedHost(undefined, [])).toBe(false);
    expect(isAllowedHost("", [])).toBe(false);
  });
});

describe("isProxiedPath", () => {
  it("proxies only the backend paths the frontend calls", () => {
    expect(isProxiedPath("/api/tasks")).toBe(true);
    expect(isProxiedPath("/api")).toBe(true);
    expect(isProxiedPath("/ws")).toBe(true);
    expect(isProxiedPath("/.well-known/corpus.json")).toBe(true);
    expect(isProxiedPath("/apidocs")).toBe(false);
    expect(isProxiedPath("/tasks")).toBe(false);
  });
});

describe("loadWebServerConfig", () => {
  const moduleUrl = pathToFileURL(resolve("dist/src/web-server/main.js")).href;

  it("matches the vite preview settings in local mode", () => {
    const config = loadWebServerConfig({
      ACTIO_LOCAL_MODE: "1",
      ACTIO_WEB_PORT: "17881",
      ACTIO_URL: "http://127.0.0.1:17880",
      ACTIO_CF_PUBLIC_ORIGIN: "https://actio.ai-run-do.com",
      LUDIARS_ALLOWED_HOSTS: "a.example, b.example",
    }, moduleUrl);
    expect(config.host).toBe("127.0.0.1");
    expect(config.port).toBe(17881);
    expect(config.backendUrl.href).toBe("http://127.0.0.1:17880/");
    expect(config.changeOrigin).toBe(false);
    expect(config.allowedHosts).toEqual(["actio.ai-run-do.com", "a.example", "b.example"]);
    expect(config.distDir).toBe(resolve("frontend/dist"));
  });

  it("uses the legacy ports outside Excubitor", () => {
    const config = loadWebServerConfig({ FRONTEND_PORT: "5174", BACKEND_PORT: "3001" }, moduleUrl);
    expect(config.host).toBe("0.0.0.0");
    expect(config.port).toBe(5174);
    expect(config.backendUrl.href).toBe("http://localhost:3001/");
    expect(config.changeOrigin).toBe(true);
  });

  it("finds frontend/dist from both the compiled and the source location", () => {
    expect(defaultDistDir(moduleUrl)).toBe(resolve("frontend/dist"));
    expect(defaultDistDir(pathToFileURL(resolve("src/web-server/main.ts")).href)).toBe(resolve("frontend/dist"));
  });
});

function listen(server: Server): Promise<number> {
  return new Promise((done) => server.listen(0, "127.0.0.1", () => done((server.address() as AddressInfo).port)));
}

function get(port: number, path: string, host = "127.0.0.1"): Promise<{ status: number; body: string; headers: Record<string, unknown> }> {
  return new Promise((done, fail) => {
    const req = request({ host: "127.0.0.1", port, path, headers: { host } }, (res) => {
      let body = "";
      res.on("data", (chunk: Buffer) => { body += chunk.toString(); });
      res.on("end", () => done({ status: res.statusCode ?? 0, body, headers: res.headers }));
    });
    req.on("error", fail);
    req.end();
  });
}

describe("createWebServer", () => {
  const dist = makeDist();
  let backend: Server;
  let web: Server;
  let port = 0;
  let seenHost = "";

  beforeAll(async () => {
    backend = createServer((req, res) => {
      seenHost = req.headers.host ?? "";
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ path: req.url }));
    });
    const backendPort = await listen(backend);
    web = createWebServer({
      host: "127.0.0.1",
      port: 0,
      distDir: dist,
      backendUrl: new URL(`http://127.0.0.1:${backendPort}`),
      changeOrigin: false,
      allowedHosts: ["actio.ai-run-do.com"],
    });
    port = await listen(web);
  });

  afterAll(async () => {
    await new Promise((done) => web.close(done));
    await new Promise((done) => backend.close(done));
    rmSync(dist, { recursive: true, force: true });
  });

  it("serves the SPA with fallback", async () => {
    const index = await get(port, "/tasks/1");
    expect(index.status).toBe(200);
    expect(index.body).toContain("main");
    expect(index.headers["content-type"]).toContain("text/html");
    expect((await get(port, "/assets/missing.js")).status).toBe(404);
  });

  it("proxies /api keeping the public Host in local mode", async () => {
    const res = await get(port, "/api/health/live?x=1", "actio.ai-run-do.com");
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ path: "/api/health/live?x=1" });
    expect(seenHost).toBe("actio.ai-run-do.com");
  });

  it("blocks unknown hosts", async () => {
    expect((await get(port, "/", "evil.example.com")).status).toBe(403);
  });
});
