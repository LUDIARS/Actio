// @implements AT-SPRINT-CHAT-INTEGRATION
import { createPublicKey, verify } from "node:crypto";
export function validDiscordSignature(body: string, timestamp: string, signature: string, key: string, now = Date.now()): boolean {
  if (!/^\d+$/.test(timestamp) || Math.abs(now - Number(timestamp) * 1000) > 300000 || !/^[a-f\d]{128}$/i.test(signature) || !/^[a-f\d]{64}$/i.test(key)) return false;
  try { return verify(null, Buffer.from(timestamp + body, "utf8"), createPublicKey({ key: Buffer.from("302a300506032b6570032100" + key, "hex"), format: "der", type: "spki" }), Buffer.from(signature, "hex")); }
  catch { return false; /* Malformed public keys are unauthenticated requests. */ }
}
