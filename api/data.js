// One endpoint behind the page's storage calls. Paths mirror the claude.ai version:
//   readers                      (list; curator only)
//   readers/<id>                 (a reader's About me, pathway, dates)
//   readers/<id>/drops           (from the repo)
//   readers/<id>/reveals/<drop>  (from the repo; honour system)
//   readers/<id>/texts/<key>     (from the repo)
//   readers/<id>/feedback[/<drop>] (database)
import { getSession, json, readBody, db, contentFor } from "./_lib.js";

const iso = v => (v instanceof Date ? v.toISOString() : v || null);
function readerData(r) {
  return { fields: r.fields || {}, path: r.path, curator: r.curator, joinedAt: iso(r.joined_at), lastActive: iso(r.last_active), updatedAt: iso(r.updated_at) };
}
async function loadReader(q, id) {
  if (!q) return id === "curator" ? { id, curator: true, path: "own", fields: {}, virtual: true } : null;
  const rows = await q`select * from readers where id = ${id}`;
  if (!rows.length) return null;
  const r = rows[0];
  return { id: r.id, curator: r.curator, path: r.path, fields: r.fields, joinedAt: iso(r.joined_at), row: r };
}

export default async function handler(req, res) {
  const s = getSession(req);
  if (!s) return json(res, 401, { error: "signed_out" });
  const owner = s.rid === "curator";
  let q = null;
  try { q = await db(); } catch (e) { console.error("db", e); return json(res, 503, { error: "storage", message: "Storage isn't reachable just now." }); }

  const url = new URL(req.url, "http://local");
  // Display names for the Readers desk.
  if (url.searchParams.has("profiles")) {
    if (!owner || !q) return json(res, 200, {});
    const ids = url.searchParams.get("profiles").split(",").filter(Boolean).slice(0, 64);
    const rows = ids.length ? await q`select id, email, name, curator from readers where id = any(${ids})` : [];
    const out = {};
    for (const r of rows) out[r.id] = { name: r.name || (r.email || "").split("@")[0] || (r.curator ? "Shaf" : ""), email: r.email || "" };
    return json(res, 200, out);
  }

  const docPath = url.searchParams.get("doc");
  const colPath = url.searchParams.get("col");
  const seg = String(docPath || colPath || "").split("/").filter(Boolean);
  const target = seg[1];
  const allowed = target && (target === s.rid || owner);

  if (req.method === "GET") {
    if (colPath) {
      if (seg.length === 1 && seg[0] === "readers") {
        if (!owner || !q) return json(res, 200, { docs: [] });
        const rows = await q`select * from readers order by joined_at`;
        return json(res, 200, { docs: rows.map(r => ({ id: r.id, data: readerData(r) })) });
      }
      if (seg[0] !== "readers" || seg.length !== 3 || !allowed) return json(res, 200, { docs: [] });
      const reader = await loadReader(q, target);
      const c = await contentFor(reader, q);
      if (seg[2] === "drops") return json(res, 200, { docs: c.drops });
      if (seg[2] === "reveals") return json(res, 200, { docs: c.drops.map(d => ({ id: d.id, data: c.reveal(d.id) })).filter(d => d.data) });
      if (seg[2] === "feedback") {
        if (!q) return json(res, 200, { docs: [] });
        const rows = await q`select drop_id, body from feedback where reader_id = ${target} order by drop_id`;
        return json(res, 200, { docs: rows.map(r => ({ id: r.drop_id, data: r.body })) });
      }
      return json(res, 200, { docs: [] });
    }
    if (seg[0] !== "readers" || !allowed) return json(res, 200, { exists: false });
    const reader = await loadReader(q, target);
    if (seg.length === 2) {
      if (!reader) return json(res, 200, { exists: false });
      if (reader.virtual) return json(res, 200, { exists: true, data: { fields: {}, curator: true, path: "own", storageOff: true } });
      return json(res, 200, { exists: true, data: readerData(reader.row) });
    }
    if (seg.length === 4) {
      const c = await contentFor(reader, q);
      let d = null;
      if (seg[2] === "reveals") d = c.reveal(seg[3]);
      else if (seg[2] === "texts") d = c.text(seg[3]);
      else if (seg[2] === "feedback" && q) {
        const rows = await q`select body from feedback where reader_id = ${target} and drop_id = ${seg[3]}`;
        d = rows.length ? rows[0].body : null;
      }
      return json(res, 200, d ? { exists: true, data: d } : { exists: false });
    }
    return json(res, 200, { exists: false });
  }

  if (req.method === "PUT" || req.method === "PATCH") {
    if (!docPath || seg[0] !== "readers" || target !== s.rid) return json(res, 403, { error: "forbidden" });
    if (!q) return json(res, 503, { error: "storage", message: "Saving isn't switched on yet." });
    const body = await readBody(req);
    const now = new Date().toISOString();
    if (seg.length === 2) {
      const cur = await loadReader(q, target);
      if (req.method === "PATCH" && !cur) return json(res, 403, { error: "not_joined" });
      const fields = body.fields !== undefined ? body.fields : (cur ? cur.fields : {});
      // Own drops aren't curated for site readers yet, so everyone but the curator reads the curator's drops.
      const pathway = owner ? "own" : "shared";
      const lastActive = body.lastActive || now;
      if (cur) {
        await q`update readers set fields = ${JSON.stringify(fields)}::jsonb, path = ${pathway},
                last_active = ${lastActive}, updated_at = ${body.updatedAt || now} where id = ${target}`;
      } else {
        await q`insert into readers (id, email, name, curator, path, fields, joined_at, last_active, updated_at)
                values (${target}, ${s.email || null}, ${s.name || null}, ${owner}, ${owner ? "own" : "shared"}, ${JSON.stringify(fields)}::jsonb, ${body.joinedAt || now}, ${lastActive}, ${now})`;
      }
      return json(res, 200, { ok: true });
    }
    if (seg.length === 4 && seg[2] === "feedback" && /^d\d{3}$/.test(seg[3])) {
      await q`insert into feedback (reader_id, drop_id, body, submitted_at)
              values (${target}, ${seg[3]}, ${JSON.stringify(body)}::jsonb, ${body.submittedAt || now})
              on conflict (reader_id, drop_id) do update set body = excluded.body, submitted_at = excluded.submitted_at`;
      await q`update readers set last_active = ${now} where id = ${target}`;
      return json(res, 200, { ok: true });
    }
    return json(res, 403, { error: "forbidden" });
  }
  if (req.method === "DELETE") {
    // Curator only: remove another reader and their notes. The curator's own profile can't be removed here.
    if (!owner || !docPath || seg[0] !== "readers" || seg.length !== 2 || target === s.rid) return json(res, 403, { error: "forbidden" });
    if (!q) return json(res, 503, { error: "storage", message: "Storage isn't reachable just now." });
    const cur = await loadReader(q, target);
    if (!cur) return json(res, 200, { ok: true });
    if (cur.curator) return json(res, 403, { error: "forbidden" });
    await q`delete from feedback where reader_id = ${target}`;
    await q`delete from readers where id = ${target}`;
    return json(res, 200, { ok: true });
  }
  return json(res, 405, { error: "method" });
}
