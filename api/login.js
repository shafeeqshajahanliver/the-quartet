// Curator sign-in with the password set as OWNER_PASSWORD in Vercel.
import { json, readBody, makeSession, setSessionCookie, sameText } from "./_lib.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "method" });
  if (!process.env.SESSION_SECRET || !process.env.OWNER_PASSWORD) {
    return json(res, 503, { error: "setup", message: "Sign-in isn't set up yet: OWNER_PASSWORD and SESSION_SECRET need adding in Vercel." });
  }
  const { password } = await readBody(req);
  if (!password || !sameText(password, process.env.OWNER_PASSWORD)) {
    await new Promise(r => setTimeout(r, 600));
    return json(res, 401, { error: "wrong", message: "That password didn't match." });
  }
  setSessionCookie(res, makeSession("curator"), 90 * 86400);
  return json(res, 200, { ok: true });
}
