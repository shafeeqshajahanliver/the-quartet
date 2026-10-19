// Google sends the visitor back here. Exchange the code, check the account, then sign them in.
import { makeSession, sameText } from "../_lib.js";

function back(res, where, extraCookie) {
  const cookies = [`q_state=; Path=/api/auth; HttpOnly; Secure; SameSite=Lax; Max-Age=0`];
  if (extraCookie) cookies.push(extraCookie);
  res.setHeader("set-cookie", cookies);
  res.statusCode = 302;
  res.setHeader("location", where);
  res.end();
}

export default async function handler(req, res) {
  const url = new URL(req.url, "http://local");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") || "";
  const m = (req.headers.cookie || "").match(/(?:^|;\s*)q_state=([^;]+)/);
  if (!code || !m || !sameText(m[1], state)) return back(res, "/?signin=failed");

  const host = req.headers["x-forwarded-host"] || req.headers.host;
  let idToken;
  try {
    const r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: `https://${host}/api/auth/callback`,
        grant_type: "authorization_code",
      }),
    });
    const body = await r.json();
    idToken = body.id_token;
  } catch (e) { console.error("google token", e); }
  if (!idToken) return back(res, "/?signin=failed");

  // The ID token came straight from Google's token endpoint over TLS, so its claims can be read directly.
  let claims;
  try { claims = JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString()); } catch { return back(res, "/?signin=failed"); }
  const issOk = claims.iss === "https://accounts.google.com" || claims.iss === "accounts.google.com";
  if (!issOk || claims.aud !== process.env.GOOGLE_CLIENT_ID || !claims.email_verified || !claims.sub || claims.exp * 1000 < Date.now()) {
    return back(res, "/?signin=failed");
  }
  const email = String(claims.email).toLowerCase();
  const curator = (process.env.CURATOR_EMAIL || "").toLowerCase().split(",").map(s => s.trim()).filter(Boolean).includes(email);
  const rid = curator ? "curator" : "g_" + claims.sub;
  const session = makeSession({ rid, email, name: claims.name || "" });
  return back(res, "/", `q_session=${session}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${90 * 86400}`);
}
