export default {
  post: (options: { keep_alive?: number | null; connection?: { statement_timeout?: number } }): true | string =>
    (options.keep_alive === 15 && options.connection?.statement_timeout === 7_000)
    || "expected a 7s statement deadline and a 15s TCP keepalive idle delay",
};
