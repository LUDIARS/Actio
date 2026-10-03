import { describe, expect, it } from "vitest";
import { readDeploymentPolicySnapshot } from "../../contracts/deployment-policy.js";
import policy, { type DeploymentPolicySnapshot } from "../../contracts/remove-env-cli.contract.js";

describe("Excubitor deployment policy", () => {
  it("removes generated-env tooling while retaining direct startup and Compose", () => {
    expect(policy.post(readDeploymentPolicySnapshot())).toBe(true);
  });

  it.each([
    ["legacy config", { legacyConfigExists: true }],
    ["dotenv startup", { scripts: { start: "node --env-file=.env dist/src/bootstrap.js" } }],
    ["generation script", { scripts: { "env:gen": "node ../Cernere/packages/env-cli/bin/env-cli.js" } }],
    ["legacy dependency", { dependencies: { "dotenv-cli": "1.0.0" } }],
    ["legacy catalog", { catalog: "command: node dist/src/bootstrap.js\nSECRETS_PROVIDER: env\nINFISICAL_PROJECT_ID: obsolete" }],
    ["missing Compose", { composeExists: false }],
    ["missing standalone overlay", { standaloneComposeExists: false }],
  ] satisfies [string, Partial<DeploymentPolicySnapshot>][])("rejects %s", (_name, change) => {
    const snapshot = readDeploymentPolicySnapshot();
    const changed = {
      ...snapshot,
      ...change,
      scripts: { ...snapshot.scripts, ...change.scripts },
    };
    expect(policy.post(changed)).not.toBe(true);
  });
});
