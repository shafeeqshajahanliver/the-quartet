import { json, setSessionCookie } from "./_lib.js";

export default async function handler(req, res) {
  setSessionCookie(res, "", 0);
  return json(res, 200, { ok: true });
}
