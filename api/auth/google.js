// Starts "Sign in with Google": sends the visitor to Google with a one-time state value.
import crypto from "node:crypto";
import { json } from "../_lib.js";

export default async function handler(req, res) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId || !process.env.GOOGLE_CLIENT_SECRET || !process.env.SESSION_SECRET) {
    return json(res, 503, { error: "setup", message: "Google sign-in isn't set up yet." });
  }
  const state = crypto.randomBytes(24).toString("base64url");
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const redirectUri = `https://${host}/api/auth/callback`;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  });
  res.setHeader("set-cookie", `q_state=${state}; Path=/api/auth; HttpOnly; Secure; SameSite=Lax; Max-Age=600`);
  res.statusCode = 302;
  res.setHeader("location", "https://accounts.google.com/o/oauth2/v2/auth?" + params.toString());
  res.end();
}
