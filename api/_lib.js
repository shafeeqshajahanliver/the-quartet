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
export function makeSession(who, days = 90) {
  const v = Buffer.from(JSON.stringify(Object.assign({}, who, { exp: Date.now() + days * 864e5 }))).toString("base64url");
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
    await q`alter table readers add column if not exists name text`;
    await q`alter table readers add column if not exists email_optin boolean not null default true`;
    await q`create table if not exists notified (
      drop_id text not null, reader_id text not null, sent_at timestamptz, primary key (drop_id, reader_id))`;
    await q`create table if not exists published (
      kind text not null, id text not null, data jsonb not null, updated_at timestamptz,
      primary key (kind, id))`;
    await seedCurator(q);
  })().catch(e => { _ready = null; throw e; });
  await _ready;
  return q;
}
// Carry the curator's About me and notes over from claude.ai. The data ships encrypted in
// content/private/curator-seed.enc (key derived from SESSION_SECRET), or comes from SEED_CURATOR.
// Safe to run repeatedly: it only fills what's missing.
function loadSeed() {
  if (process.env.SEED_CURATOR) { try { return JSON.parse(process.env.SEED_CURATOR); } catch { /* fall through */ } }
  try {
    const raw = fs.readFileSync(path.join(CONTENT, "private", "curator-seed.enc"), "utf8").trim();
    const [iv, tag, ct] = raw.split(".").map(x => Buffer.from(x, "base64"));
    const key = crypto.createHash("sha256").update("quartet-seed:" + (process.env.SESSION_SECRET || "")).digest();
    const d = crypto.createDecipheriv("aes-256-gcm", key, iv);
    d.setAuthTag(tag);
    return JSON.parse(Buffer.concat([d.update(ct), d.final()]).toString("utf8"));
  } catch { return null; }
}
async function seedCurator(q) {
  const s = loadSeed();
  if (!s) return;
  const now = new Date().toISOString();
  const have = await q`select fields from readers where id = 'curator'`;
  if (!have.length) {
    await q`insert into readers (id, curator, path, fields, joined_at, last_active, updated_at)
            values ('curator', true, 'own', ${JSON.stringify(s.fields || {})}::jsonb, ${s.joinedAt || now}, ${s.lastActive || now}, ${now})
            on conflict (id) do nothing`;
  } else if (!Object.values(have[0].fields || {}).some(v => String(v || "").trim())) {
    await q`update readers set fields = ${JSON.stringify(s.fields || {})}::jsonb where id = 'curator'`;
  }
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

// Which drops a reader sees. The curator and readers on the curator's pathway ("shared") read
// content/curator: every drop, with the curator's numbering, so the archive is complete.
// Readers on their own pathway read content/readers/<id>.
export async function contentFor(reader, q) {
  if (!reader) return { drops: [], reveal: () => null, text: () => null };
  const shared = reader.curator || reader.path === "shared";
  const dir = shared ? path.join(CONTENT, "curator") : path.join(CONTENT, "readers", SAFE.test(reader.id) ? reader.id : "_none");
  // Curator drops published through /api/publish (the backup route when a scheduled run can't push to
  // GitHub). The repo copy wins whenever both exist.
  const extra = { drops: {}, reveals: {}, texts: {} };
  if (shared && q) {
    try { for (const r of await q`select kind, id, data from published`) if (extra[r.kind]) extra[r.kind][r.id] = r.data; } catch { /* table not ready */ }
  }
  const drops = readDir(path.join(dir, "drops"));
  const have = new Set(drops.map(d => d.id));
  for (const [id, data] of Object.entries(extra.drops)) if (!have.has(id)) drops.push({ id, data });
  drops.sort((a, b) => (a.id > b.id ? 1 : -1));
  return {
    drops,
    reveal: id => {
      const r = readOne(path.join(dir, "reveals"), id) || (SAFE.test(id) ? extra.reveals[id] : null) || null;
      // A reader on the curator's drops doesn't see the curator's personal "for your own work" line.
      return r && !reader.curator ? Object.assign({}, r, { forYou: undefined }) : r;
    },
    text: key => readOne(path.join(dir, "texts"), key) || (SAFE.test(key) ? extra.texts[key] : null) || null,
  };
}

// Unsubscribe links in emails carry an HMAC of the reader id, so only the recipient can opt out.
export function unsubToken(id) {
  return crypto.createHmac("sha256", process.env.SESSION_SECRET || "").update("unsub:" + id).digest("base64url");
}

// The key a scheduled run uses for /api/publish, derived from SESSION_SECRET so no new setting is needed.
export function publishKey() {
  const s = process.env.SESSION_SECRET || "";
  return s ? crypto.createHmac("sha256", s).update("quartet-publish").digest("hex") : "";
}

// For /api/health: how many drops the deployment can see (no private data).
export async function contentStats(q) {
  const repo = readDir(path.join(CONTENT, "curator", "drops")).map(d => d.id);
  let pub = [];
  if (q) { try { pub = (await q`select id from published where kind = 'drops'`).map(r => r.id); } catch { /* none */ } }
  return { curatorDrops: new Set([...repo, ...pub]).size, inRepo: repo.length, contentDir: fs.existsSync(CONTENT) };
}
