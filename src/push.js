// Web Push to phones that turned on notifications (iPhones need the app added to the home screen).
// Messages are encrypted per RFC 8291 and signed with VAPID (RFC 8292) using the Workers crypto API.
// The VAPID key pair is made on first use and kept in the settings table, so there is nothing to set up.

const enc = new TextEncoder();

const b64url = (bytes) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
const fromB64url = (text) => Uint8Array.from(atob(text.replaceAll("-", "+").replaceAll("_", "/")), (c) => c.charCodeAt(0));
const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};

const getSetting = async (env, key) => (await env.DB.prepare("SELECT value FROM settings WHERE key = ?").bind(key).first())?.value ?? "";
const setSetting = (env, key, value) =>
  env.DB.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(key, value).run();

// The app's VAPID keys: { publicKey (base64url, raw), privateJwk }
export const vapidKeys = async (env) => {
  const saved = await getSetting(env, "vapid");
  if (saved) return JSON.parse(saved);
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const keys = {
    publicKey: b64url(await crypto.subtle.exportKey("raw", pair.publicKey)),
    privateJwk: await crypto.subtle.exportKey("jwk", pair.privateKey),
  };
  await setSetting(env, "vapid", JSON.stringify(keys));
  return keys;
};

const vapidHeader = async (keys, endpoint, subject) => {
  const header = b64url(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64url(
    enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject }))
  );
  const key = await crypto.subtle.importKey("jwk", keys.privateJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(`${header}.${claims}`));
  return `vapid t=${header}.${claims}.${b64url(signature)}, k=${keys.publicKey}`;
};

const hkdf = async (salt, ikm, info, length) => {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, length * 8));
};

// Encrypts one message for one subscription (aes128gcm content encoding, a single record)
const encrypt = async (sub, payload) => {
  const uaPublic = fromB64url(sub.p256dh);
  const authSecret = fromB64url(sub.auth);
  const local = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", local.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, local.privateKey, 256));

  const ikm = await hkdf(authSecret, shared, concat(enc.encode("WebPush: info\0"), uaPublic, asPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);

  const aesKey = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const plain = concat(enc.encode(payload), new Uint8Array([2])); // 2 marks the last (only) record
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, plain));

  const header = new Uint8Array(16 + 4 + 1 + asPublic.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = asPublic.length;
  header.set(asPublic, 21);
  return concat(header, cipher);
};

// Sends { title, body, url } to every subscribed phone; drops subscriptions the push service says are gone
export const sendPush = async (env, message) => {
  const { results: subs } = await env.DB.prepare("SELECT * FROM push_subs").all();
  if (!subs.length) return { sent: 0, total: 0 };
  const keys = await vapidKeys(env);
  const email = await getSetting(env, "email");
  const subject = email ? `mailto:${email}` : (await getSetting(env, "origin")) || "mailto:noreply@example.com";
  const payload = JSON.stringify(message);
  let sent = 0;
  for (const sub of subs) {
    try {
      const res = await fetch(sub.endpoint, {
        method: "POST",
        headers: {
          Authorization: await vapidHeader(keys, sub.endpoint, subject),
          "Content-Encoding": "aes128gcm",
          "Content-Type": "application/octet-stream",
          TTL: "86400",
          Urgency: "normal",
        },
        body: await encrypt(sub, payload),
      });
      if (res.ok) sent++;
      else if (res.status === 404 || res.status === 410) await env.DB.prepare("DELETE FROM push_subs WHERE id = ?").bind(sub.id).run();
      else console.warn("Push failed", res.status, await res.text());
    } catch (err) {
      console.warn("Push failed", err.message);
    }
  }
  return { sent, total: subs.length };
};

export const subscribe = async (env, body, origin) => {
  const { endpoint, keys } = body || {};
  if (!endpoint?.startsWith("https://") || !keys?.p256dh || !keys?.auth) throw new Error("That isn't a valid subscription.");
  await env.DB.prepare(
    "INSERT INTO push_subs (endpoint, p256dh, auth) VALUES (?, ?, ?) ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth"
  )
    .bind(endpoint, keys.p256dh, keys.auth)
    .run();
  // Kept as the VAPID contact when no email is set
  await setSetting(env, "origin", origin);
};

export const unsubscribe = (env, endpoint) => env.DB.prepare("DELETE FROM push_subs WHERE endpoint = ?").bind(String(endpoint || "")).run();
