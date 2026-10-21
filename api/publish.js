// Backup publishing route for the scheduled curator run, used when it can't push to GitHub.
// POST { id: "d004", drop: {...}, reveal: {...}, texts: { "d004-poem": {text, source, licence} } }
// with header x-quartet-key: the key from publishKey(). Stored in Postgres; the repo copy wins later.
import crypto from "node:crypto";
import { json, readBody, db, publishKey } from "./_lib.js";

const ID = /^d\d{3}$/;
const TEXT = /^d\d{3}-(essay|poem|story|song)$/;
function same(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "method" });
  const key = publishKey();
  if (!key || !same(req.headers["x-quartet-key"] || "", key)) return json(res, 401, { error: "key" });
  const q = await db();
  if (!q) return json(res, 503, { error: "storage" });
  const b = await readBody(req);
  if (!b || !ID.test(b.id || "") || !b.drop || !Array.isArray(b.drop.pieces) || !b.reveal) return json(res, 400, { error: "shape" });
  const now = new Date().toISOString();
  const rows = [["drops", b.id, b.drop], ["reveals", b.id, b.reveal]];
  for (const [k, v] of Object.entries(b.texts || {})) {
    if (!TEXT.test(k) || !k.startsWith(b.id) || !v || typeof v.text !== "string") return json(res, 400, { error: "text " + k });
    rows.push(["texts", k, v]);
  }
  for (const [kind, id, data] of rows) {
    await q`insert into published (kind, id, data, updated_at) values (${kind}, ${id}, ${JSON.stringify(data)}::jsonb, ${now})
            on conflict (kind, id) do update set data = excluded.data, updated_at = excluded.updated_at`;
  }
  return json(res, 200, { ok: true, stored: rows.map(r => r[0] + "/" + r[1]) });
}
