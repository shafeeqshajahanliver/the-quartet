// One-click opt-out from drop emails. The link in each email carries an HMAC of the reader id.
import crypto from "node:crypto";
import { db, unsubToken } from "./_lib.js";

export default async function handler(req, res) {
  const u = new URL(req.url, "http://local");
  const id = u.searchParams.get("r") || "", t = u.searchParams.get("t") || "";
  const want = unsubToken(id);
  const ok = !!process.env.SESSION_SECRET && t.length === want.length && crypto.timingSafeEqual(Buffer.from(t), Buffer.from(want));
  let msg = "That link isn't valid.";
  if (ok) {
    const q = await db();
    if (q) { await q`update readers set email_optin = false where id = ${id}`; msg = "Done. You won't get drop emails any more. The drops are still on the site whenever you want them."; }
    else msg = "Couldn't reach storage just now. Please try the link again in a moment.";
  }
  res.statusCode = ok ? 200 : 400;
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>The Quartet</title><body style="margin:0;background:#f4ecdc;font:20px/1.5 Georgia,serif;color:#151a2c;display:grid;place-items:center;min-height:100vh"><p style="max-width:30em;padding:24px">${msg}</p></body>`);
}
