/** Finish configuration before application and DB imports. */
import { initSecrets } from "../config/secrets.js";
export async function ensureEnv(): Promise<void> { await initSecrets(); }
