// Quick public check that the deployment is wired up. Reveals nothing private.
import { json, hasDb, contentStats } from "./_lib.js";

export default async function handler(req, res) {
  return json(res, 200, Object.assign({ storage: hasDb() }, contentStats()));
}
