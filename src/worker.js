// MCF herd and pedigree app: a password-protected JSON API over the D1 database, plus the static app in ./public

import { scanPedigree } from "./scan.js";
import { photoRoutes, deleteRabbitPhotos } from "./photos.js";
import { vapidKeys, sendPush, subscribe, unsubscribe } from "./push.js";
import { runDaily, makeBackup, allRecords } from "./daily.js";
import { saleListing, salePhoto } from "./sale.js";

// Editable fields of each table the generic /api/<table>/<id> routes handle
const TABLE_FIELDS = {
  rabbits: ["name", "ear", "tattoo", "sex", "breed", "color", "genotype", "weight", "dob", "reg", "gc", "legs", "breeder", "status", "acquired", "notes", "sire_id", "dam_id", "litter_id", "left_on", "left_reason", "left_to", "price", "photo_id", "cage", "for_sale", "sale_price", "sale_notes"],
  litters: ["sire_id", "dam_id", "bred_on", "kindled_on", "born", "alive", "notes", "done"],
  weights: ["rabbit_id", "weighed_on", "weight_oz", "notes"],
  health: ["rabbit_id", "given_on", "kind", "item", "dose", "withdrawal_days", "notes"],
  shows: ["rabbit_id", "show_on", "show_name", "class_name", "placing", "exhibitors", "entries", "leg", "notes"],
};
const ID_FIELDS = new Set(["sire_id", "dam_id", "litter_id", "photo_id", "rabbit_id"]);
const COUNT_FIELDS = new Set(["born", "alive", "withdrawal_days", "exhibitors", "entries", "leg", "for_sale"]);
const NUMBER_FIELDS = new Set(["weight_oz"]);
// Settings anyone signed in can change (the VAPID keys and app address are kept out of reach)
const SETTING_KEYS = ["rabbitry", "contact_name", "phone", "email", "location", "sale_intro", "backup_email", "timezone"];

// Pages and files the login page needs before anyone has signed in
const PUBLIC_PATHS = new Set([
  "/login", "/login.html", "/styles.css", "/favicon.svg", "/api/login",
  // Home-screen icon and app details, which iPhones fetch when adding the app
  "/manifest.webmanifest", "/icons/apple-touch-icon.png", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/icon.svg",
  // The public sale page and what it needs to draw pedigree PDFs
  "/sale", "/sale.html", "/sale.js", "/pedigree-pdf.js", "/vendor/jspdf.umd.min.js", "/api/public/sale",
]);
const isPublic = (path) => PUBLIC_PATHS.has(path) || /^\/api\/public\/photos\/\d+(\/thumb)?$/.test(path);

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
      if (v === "" || v == null) out[f] = f === "leg" || f === "for_sale" ? 0 : null;
      else if (Number.isInteger(Number(v)) && Number(v) >= 0) out[f] = Number(v);
      else throw new HttpError(400, `${f} must be a whole number.`);
    } else if (NUMBER_FIELDS.has(f)) {
      if (!(Number(v) > 0)) throw new HttpError(400, `${f} must be a number above zero.`);
      out[f] = Number(v);
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
    const records = await allRecords(env);
    const { results } = await env.DB.prepare(`SELECT key, value FROM settings WHERE key IN (${SETTING_KEYS.map(() => "?").join(",")})`)
      .bind(...SETTING_KEYS)
      .all();
    return json({ ...records, settings: Object.fromEntries(results.map((r) => [r.key, r.value])) });
  }

  if (path === "/api/settings" && method === "PUT") {
    const body = await request.json().catch(() => ({}));
    const entries = SETTING_KEYS.filter((k) => k in body).map((k) => [k, String(body[k] ?? "").trim()]);
    if (entries.length)
      await env.DB.batch(
        entries.map(([k, v]) =>
          env.DB.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(k, v)
        )
      );
    return json({ ok: true });
  }

  // Phone notifications
  if (path === "/api/push/key" && method === "GET") return json({ publicKey: (await vapidKeys(env)).publicKey });
  if (path === "/api/push/subscribe" && method === "POST") {
    try {
      await subscribe(env, await request.json(), new URL(request.url).origin);
    } catch (err) {
      throw new HttpError(400, err.message);
    }
    return json({ ok: true });
  }
  if (path === "/api/push/subscribe" && method === "DELETE") {
    await unsubscribe(env, (await request.json().catch(() => ({}))).endpoint);
    return json({ ok: true });
  }
  if (path === "/api/push/test" && method === "POST") {
    return json(await sendPush(env, { title: "MCF Rabbitry", body: "Notifications are working. Reminders will arrive here each morning.", url: "/#/" }));
  }

  // Backups kept by the weekly job (and made on demand)
  if (path === "/api/backups" && method === "GET") {
    const { results } = await env.PHOTOS.prepare("SELECT id, created_at, length(data) AS size FROM backups ORDER BY id DESC").all();
    return json(results);
  }
  if (path === "/api/backups" && method === "POST") {
    const { id, created_at } = await makeBackup(env);
    return json({ id, created_at }, 201);
  }
  const backupMatch = path.match(/^\/api\/backups\/(\d+)$/);
  if (backupMatch && method === "GET") {
    const row = await env.PHOTOS.prepare("SELECT created_at, data FROM backups WHERE id = ?").bind(Number(backupMatch[1])).first();
    if (!row) throw new HttpError(404, "Not found.");
    return new Response(row.data, {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="mcf-herd-${row.created_at.slice(0, 10)}.json"`,
        "Cache-Control": "no-store",
      },
    });
  }

  if (path === "/api/scan" && method === "POST") {
    const { image } = await request.json().catch(() => ({}));
    try {
      return json(await scanPedigree(env, image));
    } catch (err) {
      console.error("Scan failed:", err);
      throw new HttpError(502, `Couldn't read that pedigree. ${err.message}`);
    }
  }

  if (path === "/api/export" && method === "GET") {
    const date = new Date().toISOString().slice(0, 10);
    return json({ exported: new Date().toISOString(), ...(await allRecords(env)) }, 200, {
      "Content-Disposition": `attachment; filename="mcf-herd-${date}.json"`,
    });
  }

  const photoResponse = await photoRoutes(request, env, path);
  if (photoResponse) return photoResponse;

  const match = path.match(/^\/api\/(rabbits|litters|weights|health|shows)(?:\/(\d+))?$/);
  if (!match) throw new HttpError(404, "Not found.");
  const [, table, idText] = match;
  const id = idText ? Number(idText) : null;
  const fields = TABLE_FIELDS[table];

  if (!id && method === "POST") return insert(env, table, clean(await request.json(), fields));
  if (id && method === "PUT") {
    const data = clean(await request.json(), fields);
    if (table === "rabbits") await checkNoLoop(env, id, data.sire_id, data.dam_id);
    return update(env, table, id, data);
  }
  if (id && method === "DELETE") {
    if (table === "rabbits") await deleteRabbitPhotos(env, id);
    return remove(env, table, id);
  }
  throw new HttpError(405, "Method not allowed.");
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (!env.APP_PASSWORD) throw new HttpError(500, "The APP_PASSWORD secret isn't set. See the README.");
      if (path === "/api/login" && request.method === "POST") return await login(request, env);

      if (path === "/api/public/sale" && request.method === "GET") return await saleListing(env);
      const publicPhoto = path.match(/^\/api\/public\/photos\/(\d+)(\/thumb)?$/);
      if (publicPhoto && request.method === "GET") return await salePhoto(env, Number(publicPhoto[1]), Boolean(publicPhoto[2]));

      if (!isPublic(path) && !(await isSignedIn(request, env))) {
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

  // Once a day (see triggers in wrangler.jsonc): reminders to phones, and the Sunday backup
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runDaily(env));
  },
};
