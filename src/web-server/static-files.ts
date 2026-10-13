/**
 * frontend/dist の静的配信の解決。vite preview (appType spa) と同じく、実ファイル →
 * `<path>.html` → `<path>/index.html` → 拡張子の無いパスは index.html の順で解決する。
 */
import { statSync } from "node:fs";
import { extname, isAbsolute, join, relative, resolve } from "node:path";
import { contract } from '../contract-runtime.js'; /* augur-inject:import:d30d0d4d */
import augurContract_89373bf3 from '../../contracts/web-static-path.contract.ts'; /* augur-inject:contract-predicate:53435bc5 */

export interface StaticResolution {
  readonly file: string;
  /** SPA フォールバック (index.html) で返したとき true。 */
  readonly fallback: boolean;
}

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".wasm": "application/wasm",
};

export function contentTypeOf(file: string): string {
  return CONTENT_TYPES[extname(file).toLowerCase()] ?? "application/octet-stream";
}

/** ハッシュ付きの assets/ は長期キャッシュ、HTML 等は毎回検証させる。 */
export function cacheControlOf(distDir: string, file: string): string {
  const first = relative(distDir, file).split(/[\\/]/)[0];
  return first === "assets" ? "public, max-age=31536000, immutable" : "no-cache";
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function inside(root: string, path: string): boolean {
  const rel = relative(root, path);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

export function resolveStaticPath(distDir: string, pathname: string): StaticResolution | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname.split("?")[0] || "/");
  } catch {
    return null;
  }
  if (decoded.includes("\0")) return null;
  const root = resolve(distDir);
  const target = resolve(join(root, decoded));
  if (target !== root && !inside(root, target)) return null;

  const candidates = target === root ? [] : [target, `${target}.html`];
  candidates.push(join(target, "index.html"));
  for (const candidate of candidates) {
    if (inside(root, candidate) && isFile(candidate)) return { file: candidate, fallback: false };
  }
  const ext = extname(decoded);
  if (ext !== "" && ext !== ".html") return null;
  const index = join(root, "index.html");
  return isFile(index) ? { file: index, fallback: true } : null;
}
// @ts-expect-error augur-inject
resolveStaticPath = contract(resolveStaticPath, { ...augurContract_89373bf3, contractId: 'C-9', mode: 'observe', sample: 1, where: 'src/web-server/static-files.ts:59', rule: 'contract-wrap', id: '89373bf3' }); /* augur-inject:contract-wrap:89373bf3 */
