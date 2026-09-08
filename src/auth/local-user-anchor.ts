import { userRepo } from "../db/repository.js";
import { LOCAL_USER } from "./local-mode.js";

let pending: Promise<void> | undefined;
let provisioned = false;

/** Provision the local identity's FK anchor without storing a password or token. */
export async function ensureLocalModeUser(): Promise<void> {
  if (provisioned) return;
  if (!pending) {
    pending = (async () => {
      if (!await userRepo.findById(LOCAL_USER.id)) {
        try { await userRepo.create({ id: LOCAL_USER.id }); }
        catch (error) {
          // A second process may have created the same fixed anchor concurrently.
          if (!await userRepo.findById(LOCAL_USER.id)) throw error;
        }
      }
      // Cache only success, so the anchor is not re-queried on every request
      // while a failure is still retried on the next one.
      provisioned = true;
    })().finally(() => { pending = undefined; });
  }
  await pending;
}
