/**
 * PeerAdapter integration test — Actio が他 LUDIARS サービスからの
 * ping を受けられること、および他サービスを ping できることを確認する.
 *
 * FakeCernere を本物 Cernere の代わりに使い、ネットワーク分離で完結.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PeerAdapter } from "@ludiars/cernere-service-adapter";
import { FakeCernere } from "@ludiars/cernere-service-adapter/testing";

describe("Actio ↔ peer via PeerAdapter", () => {
  let cernere: FakeCernere;
  let baseUrl: string;
  let actio: PeerAdapter;
  let peer:  PeerAdapter;

  beforeAll(async () => {
    cernere = new FakeCernere({
      projects: [
        { projectKey: "actio",       clientId: "actio-cid", clientSecret: "actio-sec" },
        { projectKey: "imperativus", clientId: "imp-cid",   clientSecret: "imp-sec" },
      ],
      relayPairs: [["actio", "imperativus"]],
    });
    const r = await cernere.start();
    baseUrl = r.baseUrl;

    // Actio — 他サービスからの ping を受け入れる.
    actio = new PeerAdapter({
      projectId:       "actio-cid",
      projectSecret:   "actio-sec",
      cernereBaseUrl:  baseUrl,
      saListenHost:    "127.0.0.1",
      saListenPort:    0,
      saPublicBaseUrl: "ws://127.0.0.1:{port}",
      accept:          { imperativus: ["ping"] },
    });
    actio.handle("ping", async (caller, payload) => ({
      ok:   true,
      from: caller.projectKey,
      echo: payload,
    }));
    await actio.start();

    // Imperativus 相当の peer.
    peer = new PeerAdapter({
      projectId:       "imp-cid",
      projectSecret:   "imp-sec",
      cernereBaseUrl:  baseUrl,
      saListenHost:    "127.0.0.1",
      saListenPort:    0,
      saPublicBaseUrl: "ws://127.0.0.1:{port}",
      accept:          { actio: ["ping"] },
    });
    peer.handle("ping", async () => ({ pong: true }));
    await peer.start();
  });

  afterAll(async () => {
    await peer.stop();
    await actio.stop();
    await cernere.stop();
  });

  it("受信: imperativus からの actio.ping に応答する", async () => {
    const res = await peer.invoke<{ ok: true; from: string; echo: { n: number } }>(
      "actio",
      "ping",
      { n: 7 },
    );
    expect(res.ok).toBe(true);
    expect(res.from).toBe("imperativus");
    expect(res.echo).toEqual({ n: 7 });
  });

  it("発信: actio からも peer (imperativus) を呼べる", async () => {
    const res = await actio.invoke<{ pong: true }>(
      "imperativus",
      "ping",
      {},
    );
    expect(res).toEqual({ pong: true });
  });

  it("accept 未登録のコマンドは forbidden で reject", async () => {
    await expect(
      peer.invoke("actio", "tasks.delete", {}),
    ).rejects.toThrow(/forbidden|not allowed/i);
  });
});
