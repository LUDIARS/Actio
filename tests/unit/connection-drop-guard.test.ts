import { EventEmitter } from "node:events";
import { createServer, connect, type Server, type Socket } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import {
  connectionDropCode,
  installConnectionDropGuard,
  lastConnectionDrop,
  resetConnectionDropRecord,
} from "../../src/lib/connection-drop-guard.js";

/** 相手側が RST で切るソケットから、本物の ECONNRESET を得る。 */
async function realConnectionReset(): Promise<NodeJS.ErrnoException> {
  const server: Server = createServer((socket: Socket) => socket.resetAndDestroy());
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as { port: number };
  try {
    return await new Promise<NodeJS.ErrnoException>((resolve) => {
      const client = connect(port, "127.0.0.1");
      client.on("error", (error: NodeJS.ErrnoException) => resolve(error));
      client.on("close", () => resolve(Object.assign(new Error("closed without error"), { code: "NONE" })));
    });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

afterEach(() => resetConnectionDropRecord());

describe("connectionDropCode", () => {
  it("recognizes a real socket reset", async () => {
    const error = await realConnectionReset();
    expect(error.code).toBe("ECONNRESET");
    expect(connectionDropCode(error)).toBe("ECONNRESET");
  });

  it("follows the cause of a wrapped query error", () => {
    const socketError = Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" });
    const wrapped = new Error("Failed query: select 1", { cause: socketError });
    expect(connectionDropCode(new Error("fetch failed", { cause: wrapped }))).toBe("ECONNRESET");
  });

  it("does not treat other failures as connection drops", () => {
    expect(connectionDropCode(new Error("relation does not exist"))).toBeNull();
    expect(connectionDropCode(Object.assign(new Error("x"), { code: "23505" }))).toBeNull();
    expect(connectionDropCode("ECONNRESET")).toBeNull();
    expect(connectionDropCode(undefined)).toBeNull();
  });

  it("stops on a cyclic cause chain", () => {
    const a: { code?: string; cause?: unknown } = {};
    const b: { cause?: unknown } = { cause: a };
    a.cause = b;
    expect(connectionDropCode(a)).toBeNull();
  });
});

describe("installConnectionDropGuard", () => {
  it("keeps running and records an unhandled socket reset", async () => {
    const source = new EventEmitter();
    const warnings: string[] = [];
    installConnectionDropGuard(source, { now: () => new Date("2026-10-13T00:00:00.000Z"), warn: (m) => warnings.push(m) });
    const reset = await realConnectionReset();

    expect(() => source.emit("unhandledRejection", reset)).not.toThrow();
    expect(() => source.emit("unhandledRejection", reset)).not.toThrow();

    expect(lastConnectionDrop()).toEqual({ code: "ECONNRESET", at: "2026-10-13T00:00:00.000Z", count: 2 });
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toContain("ECONNRESET");
  });

  it("rethrows any other unhandled rejection so the process still fails loudly", () => {
    const source = new EventEmitter();
    installConnectionDropGuard(source, { warn: () => undefined });
    const bug = new Error("TypeError in a handler");
    expect(() => source.emit("unhandledRejection", bug)).toThrow(bug);
    expect(lastConnectionDrop()).toBeNull();
  });
});
