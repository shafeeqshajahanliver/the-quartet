// Gives the page the same storage calls it uses on claude.ai (claude.use("db") / claude.use("user")),
// backed by this site's /api. On claude.ai the real window.claude exists and this file does nothing.
(function () {
  if (window.claude) return;
  // Tells the page it is running on the Vercel site (readers here get the curator's drops for now).
  window.__QUARTET_SITE__ = { ownDrops: false };

  const listeners = new Map(); // key -> Set of refresh functions
  const never = new Promise(() => {});
  let session = null;

  function err(code, message) { return { code, message }; }
  async function call(method, qs, body) {
    let r;
    try {
      r = await fetch("/api/data?" + qs, {
        method, credentials: "same-origin",
        headers: body ? { "content-type": "application/json" } : {},
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (e) { throw err("unavailable", "Network error"); }
    if (r.status === 401) { showSignIn(); throw err("revoked", "Signed out"); }
    if (r.status === 403) throw err("invalid_argument", "Not allowed");
    if (!r.ok) throw err("unavailable", "HTTP " + r.status);
    return r.json();
  }
  function on(key, fn) {
    if (!listeners.has(key)) listeners.set(key, new Set());
    listeners.get(key).add(fn);
    return () => listeners.get(key).delete(fn);
  }
  // After a write, re-read the document, its collection, and anything stored under it
  // (joining changes which drops a reader can see, so their drops and notes must reload too).
  function refresh(path) {
    const parent = path.split("/").slice(0, -1).join("/");
    for (const [key, fns] of listeners) {
      const target = key.slice(key.indexOf(":") + 1);
      if (key === "doc:" + path || key === "col:" + parent || target.startsWith(path + "/")) fns.forEach(fn => fn());
    }
  }
  const docSnap = (id, res) => ({ id, exists: !!res.exists, data: () => res.data, metadata: { fromCache: false, hasPendingWrites: false } });
  const qSnap = docs => ({ docs, size: docs.length, empty: !docs.length, docChanges: () => [], metadata: { fromCache: false, hasPendingWrites: false } });

  function doc(path) {
    const id = path.split("/").pop();
    const get = async () => docSnap(id, await call("GET", "doc=" + encodeURIComponent(path)));
    return {
      id, path, get,
      set: async data => { await call("PUT", "doc=" + encodeURIComponent(path), data); refresh(path); },
      update: async data => { await call("PATCH", "doc=" + encodeURIComponent(path), data); refresh(path); },
      delete: async () => { await call("DELETE", "doc=" + encodeURIComponent(path)); refresh(path); },
      onSnapshot(next, onErr) {
        const run = () => get().then(next, e => onErr && onErr(e));
        run();
        return on("doc:" + path, run);
      },
      collection: c => collection(path + "/" + c),
    };
  }
  function collection(path, order) {
    const get = async () => {
      const res = await call("GET", "col=" + encodeURIComponent(path));
      let docs = (res.docs || []).map(d => docSnap(d.id, { exists: true, data: d.data }));
      if (order) {
        const [f, dir] = order;
        docs.sort((a, b) => { const x = (a.data() || {})[f], y = (b.data() || {})[f]; return (x > y ? 1 : x < y ? -1 : 0) * (dir === "desc" ? -1 : 1); });
      }
      return qSnap(docs);
    };
    const q = {
      path, get,
      orderBy: (f, dir) => collection(path, [f, dir || "asc"]),
      where: () => q, limit: () => q,
      onSnapshot(next, onErr) {
        const run = () => get().then(next, e => onErr && onErr(e));
        run();
        return on("col:" + path, run);
      },
      doc: id => doc(path + "/" + (id || Math.random().toString(36).slice(2))),
      add: async data => { const d = doc(path + "/" + Math.random().toString(36).slice(2)); await d.set(data); return d; },
    };
    return q;
  }
  const dbApi = Object.freeze({ doc, collection });
  const userApi = Object.freeze({
    id: async () => (session ? session.rid : null),
    isOwner: async () => !!(session && session.curator),
    canEdit: async () => !!session,
    can: async () => null,
    me: async () => ({ id: session ? session.rid : null, name: "", isOwner: !!(session && session.curator), canEdit: !!session }),
    name: async () => "",
    community: async () => {
      try {
        const r = await fetch("/api/data?community=1", { credentials: "same-origin" });
        return r.ok ? await r.json() : null;
      } catch (e) { return null; }
    },
    profiles: async ids => {
      try {
        const r = await fetch("/api/data?profiles=" + encodeURIComponent(ids.join(",")), { credentials: "same-origin" });
        const out = r.ok ? await r.json() : {};
        ids.forEach(id => { out[id] = Object.assign({ id, name: "" }, out[id] || {}); });
        return out;
      } catch (e) { return {}; }
    },
  });

  const ready = fetch("/api/session", { credentials: "same-origin" })
    .then(r => r.json().then(b => ({ ok: r.ok, b })))
    .then(({ ok, b }) => { if (ok) { session = b; try { if (/signin=/.test(location.search)) history.replaceState(null, '', location.pathname + location.hash); } catch (e) {} return true; } showSignIn(b && b.setup); return false; })
    .catch(() => { showSignIn(); return false; });

  window.claude = Object.freeze({
    use: async name => {
      const ok = await ready;
      if (!ok) return never;
      if (name === "db") return dbApi;
      if (name === "user") return userApi;
      return null;
    },
  });

  // ---------- sign-in screen and sign-out
  let shown = false;
  function showSignIn(setup) {
    if (shown) return; shown = true;
    const failed = /[?&]signin=failed/.test(location.search);
    const mount = () => {
      const wrap = document.createElement("div");
      wrap.setAttribute("role", "dialog");
      wrap.setAttribute("aria-label", "Sign in to The Quartet");
      wrap.style.cssText = "position:fixed;inset:0;z-index:50;background:var(--paper,#f4ecdc);display:grid;place-items:center;padding:24px max(16px,env(safe-area-inset-left,0px));overflow:auto";
      wrap.innerHTML = `
        <div style="width:min(100%,440px);display:grid;gap:16px">
          <div style="display:flex;align-items:center;gap:10px;font-family:var(--display,Georgia,serif);font-size:26px;line-height:1;color:var(--ink,#151a2c)">
            <span aria-hidden="true" style="display:inline-flex;gap:3px;align-items:end;height:22px"><b style="width:6px;height:18px;border-radius:2px;background:var(--ink,#151a2c)"></b><b style="width:6px;height:13px;border-radius:2px;background:var(--ink,#151a2c)"></b><b style="width:6px;height:22px;border-radius:2px;background:var(--violet,#3d2c7c)"></b><b style="width:6px;height:10px;border-radius:2px;background:var(--ink,#151a2c)"></b></span>The Quartet</div>
          <p style="margin:0;font-family:var(--body,Georgia,serif);font-size:20px;line-height:1.5;font-style:italic;color:var(--ink-2,#4a5068)">An essay, a poem, a short story and a song every other morning, with one hidden thread between them that unseals once you've left your notes.</p>
          <a id="q-google" href="/api/auth/google" style="justify-self:start;display:inline-flex;align-items:center;gap:10px;font-family:var(--mono,monospace);font-size:13px;letter-spacing:.06em;text-transform:uppercase;text-decoration:none;background:var(--ink,#151a2c);color:var(--sheet,#fdf9f0);border-radius:4px;padding:13px 18px">
            <span aria-hidden="true" style="display:grid;place-items:center;width:20px;height:20px;border-radius:50%;background:var(--sheet,#fdf9f0);color:var(--ink,#151a2c);font-family:var(--body,Georgia,serif);font-weight:600;font-size:13px;letter-spacing:0">G</span>Sign in with Google</a>
          <p id="q-msg" style="margin:0;font-family:var(--body,Georgia,serif);font-size:14px;line-height:1.5;color:var(--ink-2,#4a5068)">Use any Google account. Your notes are kept under it, and Shaf, who curates The Quartet, can read them.</p>
        </div>`;
      document.body.appendChild(wrap);
      const msg = wrap.querySelector("#q-msg");
      if (setup && (!setup.google || !setup.secret)) { msg.style.color = "var(--wax,#b8411f)"; msg.textContent = "Sign-in isn't switched on yet. Check back soon."; }
      else if (failed) { msg.style.color = "var(--wax,#b8411f)"; msg.textContent = "That sign-in didn't go through. Try again, and choose an account with a verified email."; }
      wrap.querySelector("#q-google").focus();
    };
    if (document.body) mount(); else document.addEventListener("DOMContentLoaded", mount);
  }
  function addSignOut() {
    const nav = document.querySelector("nav.sections");
    if (!nav || document.getElementById("q-signout")) return;
    const b = document.createElement("button");
    b.id = "q-signout"; b.type = "button"; b.textContent = "Sign out";
    b.title = session && session.email ? "Signed in as " + session.email : "";
    b.addEventListener("click", async () => { try { await fetch("/api/logout", { method: "POST", credentials: "same-origin" }); } catch (e) {} location.href = "/"; });
    nav.appendChild(b);
  }
  ready.then(ok => { if (!ok) return; const go = () => addSignOut(); if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go); else go(); });
})();
