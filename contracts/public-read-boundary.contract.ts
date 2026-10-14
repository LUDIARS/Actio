// Contract for isPublicReadRequest (C-13). Only read requests for the public issue
// list leave the local-mode boundary; writes and every other path stay inside.
export default {
  post: (result: boolean, method: string, path: string): true | string => {
    const expected = (method === "GET" || method === "HEAD") && path === "/api/public/issues";
    return result === expected || `${method} ${path} public read must be ${expected}`;
  },
};
