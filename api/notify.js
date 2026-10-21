// Emails readers when a new drop is out. Called by the daily Vercel cron (see vercel.json), or by hand
// with the publish key. Needs RESEND_API_KEY and EMAIL_FROM; without them it does nothing.
//   GET /api/notify            send any drop that is out and not yet emailed
//   GET /api/notify?dry=1      list who would be emailed, send nothing
// The first ever run only records the drops that already exist, so old drops are never emailed.
import crypto from "node:crypto";
import { json, db, contentFor, publishKey, unsubToken } from "./_lib.js";

const SITE = (process.env.SITE_URL || "https://the-quartet.vercel.app").replace(/\/$/, "");
const KIND = { essay: "Essay", poem: "Poem", story: "Short story", song: "Song" };
const esc = v => String(v == null ? "" : v).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

function authorised(req) {
  const bearer = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (process.env.CRON_SECRET && bearer && same(bearer, process.env.CRON_SECRET)) return true;
  const key = publishKey();
  return !!key && same(req.headers["x-quartet-key"] || "", key);
}

export function buildEmail(drop, reader) {
  const n = String(drop.n).padStart(2, "0");
  const unsub = `${SITE}/api/unsubscribe?r=${encodeURIComponent(reader.id)}&t=${unsubToken(reader.id)}`;
  const pieces = (drop.pieces || []).map(p => `<tr><td style="padding:6px 14px 6px 0;font:11px/1.4 Menlo,monospace;letter-spacing:.1em;text-transform:uppercase;color:#7b8199;white-space:nowrap">${esc(KIND[p.kind] || p.kind)}</td><td style="padding:6px 0;font:17px/1.4 Georgia,serif;color:#151a2c">${esc(p.title)}<span style="color:#7b8199"> · ${esc(p.author)}</span></td></tr>`).join("");
  const html = `<!doctype html><html><body style="margin:0;background:#f4ecdc"><div style="max-width:560px;margin:0 auto;padding:28px 20px">
<div style="background:#3d2c7c;color:#fff;border-radius:12px;padding:26px 26px 22px">
<div style="font:11px Menlo,monospace;letter-spacing:.14em;text-transform:uppercase;color:#f1cf5c">The Quartet</div>
<div style="font:34px/1.1 Georgia,serif;margin:8px 0 0">Drop ${n} is here</div></div>
<div style="background:#fdf9f0;border-radius:12px;padding:24px 26px;margin-top:14px">
${drop.invitation ? `<p style="font:italic 18px/1.5 Georgia,serif;color:#4a5068;margin:0 0 18px">${esc(drop.invitation)}</p>` : ""}
<table role="presentation" style="border-collapse:collapse">${pieces}</table>
<p style="margin:24px 0 0"><a href="${SITE}" style="display:inline-block;background:#151a2c;color:#fdf9f0;text-decoration:none;font:13px Menlo,monospace;letter-spacing:.06em;text-transform:uppercase;border-radius:4px;padding:13px 18px">Open the drop</a></p></div>
<p style="font:12px/1.5 Georgia,serif;color:#7b8199;margin:18px 4px 0">You are getting this because you read The Quartet. <a href="${unsub}" style="color:#7b8199">Stop these emails</a>.</p></div></body></html>`;
  const text = [`Drop ${n} is here`, "", drop.invitation || "", "", ...(drop.pieces || []).map(p => `${KIND[p.kind] || p.kind}: ${p.title} · ${p.author}`), "", `Open the drop: ${SITE}`, "", `Stop these emails: ${unsub}`].join("\n");
  return { subject: `The Quartet: Drop ${n} is here`, html, text, unsub };
}

async function send(to, mail) {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: "Bearer " + process.env.RESEND_API_KEY, "content-type": "application/json" },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [to], subject: mail.subject, html: mail.html, text: mail.text,
      headers: { "List-Unsubscribe": `<${mail.unsub}>` } }),
  });
  if (!r.ok) throw new Error("resend " + r.status + " " + (await r.text()).slice(0, 200));
}

export default async function handler(req, res) {
  if (!authorised(req)) return json(res, 401, { error: "unauthorised" });
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) return json(res, 200, { ok: false, error: "email_not_configured" });
  const q = await db();
  if (!q) return json(res, 503, { error: "storage" });
  const dry = new URL(req.url, "http://local").searchParams.has("dry");
  const c = await contentFor({ id: "curator", curator: true, path: "own" }, q);
  const drops = c.drops.map(d => Object.assign({ id: d.id }, d.data));
  const done = new Set((await q`select distinct drop_id from notified`).map(r => r.drop_id));
  if (!done.size && drops.length) {
    if (dry) return json(res, 200, { ok: true, dry: true, baseline: drops.map(d => d.id) });
    for (const d of drops) await q`insert into notified (drop_id, reader_id, sent_at) values (${d.id}, '_baseline', now()) on conflict do nothing`;
    return json(res, 200, { ok: true, baseline: drops.map(d => d.id), sent: 0 });
  }
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
  const due = drops.filter(d => !done.has(d.id) && String(d.date || "") <= today);
  const readers = await q`select id, email from readers where email is not null and email_optin = true`;
  const out = [];
  for (const d of due) {
    const already = new Set((await q`select reader_id from notified where drop_id = ${d.id}`).map(r => r.reader_id));
    let sent = 0; const failed = [];
    for (const r of readers) {
      if (already.has(r.id)) continue;
      if (dry) { sent++; continue; }
      try { await send(r.email, buildEmail(d, r)); await q`insert into notified (drop_id, reader_id, sent_at) values (${d.id}, ${r.id}, now()) on conflict do nothing`; sent++; }
      catch (e) { failed.push(r.id); console.error("notify", d.id, r.id, e.message); }
    }
    if (!dry && !failed.length) await q`insert into notified (drop_id, reader_id, sent_at) values (${d.id}, '_done', now()) on conflict do nothing`;
    out.push({ drop: d.id, sent, failed: failed.length });
  }
  return json(res, 200, { ok: true, dry, drops: out });
}
