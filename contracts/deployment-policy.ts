import { existsSync, readFileSync } from "node:fs";
import type { DeploymentPolicySnapshot } from "./remove-env-cli.contract.js";
import { contract } from '../src/contract-runtime.js'; /* augur-inject:import:3ce7a265 */
import augurContract_fa915b8f from './remove-env-cli.contract.ts'; /* augur-inject:contract-predicate:4de33fa9 */

const root = new URL("../", import.meta.url);

/** Read public deployment metadata only; environment files are deliberately excluded. */
export const readDeploymentPolicySnapshot = contract(function readDeploymentPolicySnapshot(): DeploymentPolicySnapshot {
  const pkg = JSON.parse(readFileSync(new URL("package.json", root), "utf8")) as {
    scripts: Record<string, string>;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  return {
    legacyConfigExists: existsSync(new URL("env-cli.config.json", root)),
    scripts: pkg.scripts,
    dependencies: { ...pkg.dependencies, ...pkg.devDependencies },
    catalog: readFileSync(new URL("excubitor.catalog.yaml", root), "utf8"),
    composeExists: existsSync(new URL("docker-compose.yaml", root)),
    standaloneComposeExists: existsSync(new URL("docker-compose.standalone.yaml", root)),
  };
}, { ...augurContract_fa915b8f, contractId: 'C-4', where: 'contracts/deployment-policy.ts', id: 'fa915b8f' }) /* augur-inject:contract-wrap:fa915b8f */;
