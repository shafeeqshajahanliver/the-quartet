// Shared helpers for The Quartet's API: sessions, the database, and drop content from the repo.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { neon } from "@neondatabase/serverless";

const CONTENT = path.join(process.cwd(), "content");
const COOKIE = "q_session";

export function json(res, code, body) {
  res.statusCode = code;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(body));
}

export async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  let s = "";
  for await (const chunk of req) s += chunk;
  try { return JSON.parse(s || "{}"); } catch { return {}; }
}

// ---------- sessions: a signed cookie holding the reader id
function sign(v) {
  return crypto.createHmac("sha256", process.env.SESSION_SECRET || "").update(v).digest("base64url");
}
export function makeSession(rid, days = 90) {
  const v = Buffer.from(JSON.stringify({ rid, exp: Date.now() + days * 864e5 })).toString("base64url");
  return v + "." + sign(v);
}
export function getSession(req) {
  if (!process.env.SESSION_SECRET) return null;
  const m = (req.headers.cookie || "").match(/(?:^|;\s*)q_session=([^;]+)/);
  if (!m) return null;
  const [v, s] = m[1].split(".");
  if (!v || !s) return null;
  const want = sign(v);
  if (s.length !== want.length || !crypto.timingSafeEqual(Buffer.from(s), Buffer.from(want))) return null;
  try {
    const o = JSON.parse(Buffer.from(v, "base64url").toString());
    return o.exp > Date.now() ? o : null;
  } catch { return null; }
}
export function setSessionCookie(res, value, maxAgeSeconds) {
  res.setHeader("set-cookie", `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`);
}
export function sameText(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// ---------- database (Vercel Postgres / Neon). Absent until a database is connected.
let _sql = null, _ready = null;
function sql() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) return null;
  if (!_sql) _sql = neon(url);
  return _sql;
}
export function hasDb() { return !!sql(); }
export async function db() {
  const q = sql();
  if (!q) return null;
  if (!_ready) _ready = (async () => {
    await q`create table if not exists readers (
      id text primary key, email text unique, curator boolean not null default false,
      path text not null default 'own', fields jsonb not null default '{}'::jsonb,
      joined_at timestamptz, last_active timestamptz, updated_at timestamptz)`;
    await q`create table if not exists feedback (
      reader_id text not null, drop_id text not null, body jsonb not null,
      submitted_at timestamptz, primary key (reader_id, drop_id))`;
    await seedCurator(q);
  })().catch(e => { _ready = null; throw e; });
  await _ready;
  return q;
}
// One-off: carry the curator's About me and notes over from claude.ai (set SEED_CURATOR in Vercel, private).
async function seedCurator(q) {
  const raw = process.env.SEED_CURATOR;
  if (!raw) return;
  const have = await q`select id from readers where id = 'curator'`;
  if (have.length) return;
  let s; try { s = JSON.parse(raw); } catch { return; }
  const now = new Date().toISOString();
  await q`insert into readers (id, curator, path, fields, joined_at, last_active, updated_at)
          values ('curator', true, 'own', ${JSON.stringify(s.fields || {})}::jsonb, ${s.joinedAt || now}, ${s.lastActive || now}, ${now})
          on conflict (id) do nothing`;
  for (const [dropId, body] of Object.entries(s.feedback || {})) {
    await q`insert into feedback (reader_id, drop_id, body, submitted_at)
            values ('curator', ${dropId}, ${JSON.stringify(body)}::jsonb, ${body.submittedAt || now})
            on conflict do nothing`;
  }
}

// ---------- drop content, read from the repo's content/ folder
const SAFE = /^[A-Za-z0-9_-]{1,80}$/;
function readDir(dir) {
  try {
    return fs.readdirSync(dir).filter(f => f.endsWith(".json")).sort()
      .map(f => ({ id: f.slice(0, -5), data: JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) }));
  } catch { return []; }
}
function readOne(dir, id) {
  if (!SAFE.test(id)) return null;
  try { return JSON.parse(fs.readFileSync(path.join(dir, id + ".json"), "utf8")); } catch { return null; }
}
const pad = n => String(n).padStart(3, "0");

// Which drops a reader sees. The curator and readers on the curator's pathway read content/curator;
// "shared" readers get the curator's drops from the day they joined, numbered from their own 01.
// Readers on their own pathway read content/readers/<id>.
export function contentFor(reader) {
  if (!reader) return { drops: [], reveal: () => null, text: () => null };
  const ownDir = reader.curator ? path.join(CONTENT, "curator")
    : reader.path === "shared" ? null : path.join(CONTENT, "readers", SAFE.test(reader.id) ? reader.id : "_none");
  if (ownDir) {
    return {
      drops: readDir(path.join(ownDir, "drops")),
      reveal: id => readOne(path.join(ownDir, "reveals"), id),
      text: key => readOne(path.join(ownDir, "texts"), key),
    };
  }
  const base = path.join(CONTENT, "curator");
  const since = String(reader.joinedAt || "").slice(0, 10);
  const src = readDir(path.join(base, "drops"))
    .filter(d => !since || String(d.data.date || "") >= since)
    .sort((a, b) => (a.data.n || 0) - (b.data.n || 0));
  const map = {};
  const drops = src.map((d, i) => {
    const id = "d" + pad(i + 1);
    map[id] = d.id;
    return { id, data: Object.assign({}, d.data, { n: i + 1, from: "curator" }) };
  });
  return {
    drops,
    reveal: id => {
      const r = map[id] ? readOne(path.join(base, "reveals"), map[id]) : null;
      return r ? Object.assign({}, r, { forYou: undefined }) : null;
    },
    text: key => {
      const [id, kind] = String(key).split("-");
      return map[id] ? readOne(path.join(base, "texts"), map[id] + "-" + kind) : null;
    },
  };
}
