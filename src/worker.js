// MCF herd and pedigree app: a password-protected JSON API over the D1 database, plus the static app in ./public

const RABBIT_FIELDS = ["name", "ear", "sex", "breed", "color", "genotype", "weight", "dob", "reg", "gc", "legs", "breeder", "status", "acquired", "notes", "sire_id", "dam_id", "litter_id"];
const LITTER_FIELDS = ["sire_id", "dam_id", "bred_on", "kindled_on", "born", "alive", "notes"];
const ID_FIELDS = new Set(["sire_id", "dam_id", "litter_id"]);
const COUNT_FIELDS = new Set(["born", "alive"]);

// Pages and files the login page needs before anyone has signed in
const PUBLIC_PATHS = new Set(["/login", "/login.html", "/styles.css", "/favicon.svg", "/api/login"]);

const SESSION_COOKIE = "mcf_session";
const SESSION_DAYS = 60;

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers } });

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// ---- Sessions: the cookie is "<expiry>.<signature>", signed with the app password, so changing the password signs everyone out ----

const encoder = new TextEncoder();

const hmac = async (secret, message) => {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
};

// Compares two strings without leaking where they first differ
const sameText = (a, b) => {
  const x = encoder.encode(a);
  const y = encoder.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
};

const getCookie = (request, name) => {
  const header = request.headers.get("Cookie") || "";
  const match = header.split(/;\s*/).find((c) => c.startsWith(name + "="));
  return match ? match.slice(name.length + 1) : "";
};

const isSignedIn = async (request, env) => {
  const [expires, sig] = getCookie(request, SESSION_COOKIE).split(".");
  if (!expires || !sig || Number(expires) < Date.now()) return false;
  return sameText(sig, await hmac(env.APP_PASSWORD, `session:${expires}`));
};

const login = async (request, env) => {
  const { password = "" } = await request.json().catch(() => ({}));
  // Hashing both sides first keeps the comparison the same length whatever was typed
  const ok = sameText(await hmac("login", password), await hmac("login", env.APP_PASSWORD));
  if (!ok) throw new HttpError(401, "That password isn't right.");
  const expires = Date.now() + SESSION_DAYS * 86400e3;
  const cookie = `${SESSION_COOKIE}=${expires}.${await hmac(env.APP_PASSWORD, `session:${expires}`)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`;
  return json({ ok: true }, 200, { "Set-Cookie": cookie });
};

const logout = () => json({ ok: true }, 200, { "Set-Cookie": `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0` });

// ---- Records ----

// Keeps only known fields, trimmed, with ids and counts as numbers or null
const clean = (body, fields) => {
  const out = {};
  for (const f of fields) {
    if (!(f in body)) continue;
    const v = body[f];
    if (ID_FIELDS.has(f) || COUNT_FIELDS.has(f)) {
      if (v === "" || v == null) out[f] = null;
      else if (Number.isInteger(Number(v)) && Number(v) >= 0) out[f] = Number(v);
      else throw new HttpError(400, `${f} must be a whole number.`);
    } else out[f] = String(v ?? "").trim();
  }
  return out;
};

// A rabbit can't be its own parent, grandparent, and so on
const checkNoLoop = async (env, id, sireId, damId) => {
  if (!id || (!sireId && !damId)) return;
  const { results } = await env.DB.prepare("SELECT id, sire_id, dam_id FROM rabbits").all();
  const byId = new Map(results.map((r) => [r.id, r]));
  const stack = [sireId, damId];
  const seen = new Set();
  while (stack.length) {
    const cur = stack.pop();
    if (!cur || seen.has(cur)) continue;
    if (cur === id) throw new HttpError(400, "That would make this rabbit its own ancestor.");
    seen.add(cur);
    const r = byId.get(cur);
    if (r) stack.push(r.sire_id, r.dam_id);
  }
};

const insert = async (env, table, data) => {
  const cols = Object.keys(data);
  if (!cols.length) throw new HttpError(400, "Nothing to save.");
  const row = await env.DB.prepare(`INSERT INTO ${table} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")}) RETURNING *`)
    .bind(...Object.values(data))
    .first();
  return json(row, 201);
};

const update = async (env, table, id, data) => {
  const cols = Object.keys(data);
  if (!cols.length) throw new HttpError(400, "Nothing to save.");
  const row = await env.DB.prepare(`UPDATE ${table} SET ${cols.map((c) => `${c} = ?`).join(", ")}, updated_at = datetime('now') WHERE id = ? RETURNING *`)
    .bind(...Object.values(data), id)
    .first();
  if (!row) throw new HttpError(404, "Not found.");
  return json(row);
};

const remove = async (env, table, id) => {
  const { meta } = await env.DB.prepare(`DELETE FROM ${table} WHERE id = ?`).bind(id).run();
  if (!meta.changes) throw new HttpError(404, "Not found.");
  return json({ ok: true });
};

const api = async (request, env, path) => {
  const method = request.method;
  if (path === "/api/logout" && method === "POST") return logout();

  if (path === "/api/data" && method === "GET") {
    const [rabbits, litters] = await env.DB.batch([
      env.DB.prepare("SELECT * FROM rabbits ORDER BY id"),
      env.DB.prepare("SELECT * FROM litters ORDER BY id"),
    ]);
    return json({ rabbits: rabbits.results, litters: litters.results });
  }

  if (path === "/api/export" && method === "GET") {
    const [rabbits, litters] = await env.DB.batch([env.DB.prepare("SELECT * FROM rabbits ORDER BY id"), env.DB.prepare("SELECT * FROM litters ORDER BY id")]);
    const date = new Date().toISOString().slice(0, 10);
    return json({ exported: new Date().toISOString(), rabbits: rabbits.results, litters: litters.results }, 200, {
      "Content-Disposition": `attachment; filename="mcf-herd-${date}.json"`,
    });
  }

  const match = path.match(/^\/api\/(rabbits|litters)(?:\/(\d+))?$/);
  if (!match) throw new HttpError(404, "Not found.");
  const [, table, idText] = match;
  const id = idText ? Number(idText) : null;
  const fields = table === "rabbits" ? RABBIT_FIELDS : LITTER_FIELDS;

  if (!id && method === "POST") return insert(env, table, clean(await request.json(), fields));
  if (id && method === "PUT") {
    const data = clean(await request.json(), fields);
    if (table === "rabbits") await checkNoLoop(env, id, data.sire_id, data.dam_id);
    return update(env, table, id, data);
  }
  if (id && method === "DELETE") return remove(env, table, id);
  throw new HttpError(405, "Method not allowed.");
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (!env.APP_PASSWORD) throw new HttpError(500, "The APP_PASSWORD secret isn't set. See the README.");
      if (path === "/api/login" && request.method === "POST") return await login(request, env);

      if (!PUBLIC_PATHS.has(path) && !(await isSignedIn(request, env))) {
        if (path.startsWith("/api/")) throw new HttpError(401, "Please sign in.");
        return Response.redirect(new URL("/login", url).toString(), 302);
      }

      if (path.startsWith("/api/")) return await api(request, env, path);
      return env.ASSETS.fetch(request);
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message }, err.status);
      // SQLite CHECK and foreign key failures mean the request had a bad value in it
      if (/constraint/i.test(err.message)) return json({ error: "One of those values isn't allowed." }, 400);
      console.error(err);
      return json({ error: "Something went wrong on the server." }, 500);
    }
  },
};
