import { expect, it } from "vitest";
import { postgresOptions } from "../../src/db/dialects/postgres-options.js";

it("sets the PostgreSQL statement deadline and TCP keepalive in the driver's units", () => {
  expect(postgresOptions()).toMatchObject({
    connection: { statement_timeout: 7_000 },
    keep_alive: 15,
  });
});
