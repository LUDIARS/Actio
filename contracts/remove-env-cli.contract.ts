export interface DeploymentPolicySnapshot {
  legacyConfigExists: boolean;
  scripts: Record<string, string>;
  dependencies: Record<string, string>;
  catalog: string;
  composeExists: boolean;
  standaloneComposeExists: boolean;
}

/** Repository policy only; never inspect environment files or secret values. */
export default {
  post(snapshot: DeploymentPolicySnapshot): true | string {
    if (snapshot.legacyConfigExists) return "obsolete env-cli configuration remains";
    const removedTool = /env-cli|infisical|dotenv|--env-file|env:gen/i;
    if (Object.entries(snapshot.scripts).some(([name, command]) => removedTool.test(`${name} ${command}`))) {
      return "package scripts must use the injected environment";
    }
    if (Object.keys(snapshot.dependencies).some(name => removedTool.test(name))) {
      return "obsolete environment tooling dependency remains";
    }
    if (snapshot.scripts.start !== "node dist/src/bootstrap.js"
      || !snapshot.catalog.includes("command: node dist/src/bootstrap.js")
      || !snapshot.catalog.includes("SECRETS_PROVIDER: env")
      || /INFISICAL_/i.test(snapshot.catalog)) return "catalog must retain direct injected startup";
    if (!snapshot.composeExists || !snapshot.standaloneComposeExists
      || snapshot.scripts["env:up"] !== "docker compose up -d"
      || snapshot.scripts["env:up:standalone"] !== "docker compose -f docker-compose.yaml -f docker-compose.standalone.yaml up -d") {
      return "standalone Compose entrypoints must be preserved";
    }
    return true;
  },
};
