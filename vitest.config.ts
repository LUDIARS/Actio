import { defineConfig } from "vitest/config";

export default defineConfig({
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
