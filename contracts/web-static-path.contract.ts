// Contract for resolveStaticPath (C-9). The served file must stay inside the
// dist directory; anything that escapes it is a traversal and must be refused.
import { isAbsolute, relative } from "node:path";

type Resolution = { readonly file: string; readonly fallback: boolean } | null;

export default {
  post: (result: Resolution, distDir: string): true | string => {
    if (result === null) return true;
    const rel = relative(distDir, result.file);
    if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) return "resolved file escapes the dist directory";
    return true;
  },
};
