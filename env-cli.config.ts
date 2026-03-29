import type { EnvCliConfig } from "./packages/env-cli/src/index.js";

const config: EnvCliConfig = {
  name: "Schedula",

  infraKeys: {
    // Ports
    FRONTEND_PORT: "8080",
    BACKEND_PORT: "3000",
    DB_PORT: "5432",
    REDIS_PORT: "6379",
    // Database
    DB_DIALECT: "postgres",
    POSTGRES_USER: "schedula",
    POSTGRES_PASSWORD: "schedula",
    POSTGRES_DB: "schedula",
    DATABASE_URL: "postgresql://schedula:schedula@db:5432/schedula",
    // Redis
    REDIS_URL: "redis://redis:6379",
  },
};

export default config;
