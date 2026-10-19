// Who is signed in, and whether the site's storage is connected.
import { getSession, json, hasDb } from "./_lib.js";

export default async function handler(req, res) {
  const s = getSession(req);
  const setup = { storage: hasDb(), password: !!process.env.OWNER_PASSWORD, secret: !!process.env.SESSION_SECRET };
  if (!s) return json(res, 401, { signedIn: false, setup });
  return json(res, 200, { signedIn: true, rid: s.rid, curator: s.rid === "curator", setup });
}
