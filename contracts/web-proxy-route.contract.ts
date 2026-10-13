// Contract for isProxiedPath (C-11). The same-origin backend paths the built
// frontend calls (/api, /ws, /.well-known) are proxied; everything else is static.
export default {
  post: (result: boolean, pathname: string): true | string => {
    const expected = /^\/(api|ws|\.well-known)(\/|$|\?)/.test(pathname);
    return result === expected || `proxy decision for ${pathname} must be ${expected}`;
  },
};
