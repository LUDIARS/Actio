// Revisor's domain bundles bypass npm pretest, so prepare the same two SDKs.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

function run(args) {
  const result = spawnSync(process.execPath, args, {
    cwd: root, stdio: 'inherit', shell: false, windowsHide: true, timeout: 300_000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Local team check failed (${result.status ?? result.signal})`);
}

run(['node_modules/typescript/bin/tsc', '-p', 'packages/sdk/tsconfig.json']);
run(['node_modules/typescript/bin/tsc', '-p', 'lib/terpsichore/tsconfig.build.json']);
// Domain reviews cold-import the complete app in concurrent review processes.
// Allow bounded setup time here; individual tests retain their 15-second limit.
run(['node_modules/vitest/vitest.mjs', 'run', '--hookTimeout=60000',
  'tests/api/local-owner-teams.test.ts', 'tests/api/task-integration.test.ts']);
