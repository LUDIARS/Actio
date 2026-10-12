import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // The in-repo Terpsichore package exports only its built dist, which `npm test` builds in
    // `pretest`. Revisor/Augur run vitest directly on registered files without that step, so the
    // tests read the package source instead and never depend on a stale or missing dist.
    alias: [{ find: /^@ludiars\/terpsichore$/, replacement: fileURLToPath(new URL("./lib/terpsichore/src/index.ts", import.meta.url)) }],
  },
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    testTimeout: 15000,
    hookTimeout: 15000,
    pool: "forks",
    // Run test files one at a time. The API suites cold-import the whole app in
    // beforeAll (several seconds each); run in parallel forks they contend and
    // exceed hookTimeout. Vitest 4 removed `poolOptions.forks.singleFork` and
    // silently ignores it, so the serial run is expressed as maxWorkers.
    maxWorkers: 1,
  },
});
