// Quick public check that the deployment is wired up. Reveals nothing private.
import { json, hasDb, db, contentStats } from "./_lib.js";

export default async function handler(req, res) {
  let q = null;
  try { q = await db(); } catch { q = null; }
  return json(res, 200, Object.assign({ storage: hasDb() }, await contentStats(q)));
}
