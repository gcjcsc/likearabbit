// Rabbit photos. Details (date, caption, which rabbit) are in the main database's photos table; the
// JPEG bytes, a full-size copy and a thumbnail, are in the separate PHOTOS database under the same id.
// The phone shrinks each photo before upload, so a full-size copy is a few hundred KB.

const MAX_FULL = 1.8 * 1024 * 1024; // D1 rows top out at 2 MB
const MAX_THUMB = 300 * 1024;
const PHOTO_FIELDS = ["taken_on", "caption", "kind"];

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
const fail = (status, error) => json({ error }, status);

// The rabbit's main photo: the one chosen, else its newest photo (not pedigree scans)
const pickMainPhoto = async (env, rabbitId) => {
  const newest = await env.DB.prepare("SELECT id FROM photos WHERE rabbit_id = ? AND kind = 'photo' ORDER BY taken_on DESC, id DESC LIMIT 1")
    .bind(rabbitId)
    .first();
  await env.DB.prepare("UPDATE rabbits SET photo_id = ? WHERE id = ?").bind(newest?.id ?? null, rabbitId).run();
};

const readJpeg = async (file, max, label) => {
  if (!file || typeof file === "string") throw new Error(`The ${label} is missing.`);
  if (file.type !== "image/jpeg") throw new Error(`The ${label} must be a JPEG.`);
  if (file.size > max) throw new Error(`The ${label} is too large.`);
  return file.arrayBuffer();
};

const upload = async (request, env, rabbitId) => {
  const rabbit = await env.DB.prepare("SELECT id, photo_id FROM rabbits WHERE id = ?").bind(rabbitId).first();
  if (!rabbit) return fail(404, "Not found.");
  const form = await request.formData();
  let full, thumb;
  try {
    full = await readJpeg(form.get("full"), MAX_FULL, "photo");
    thumb = await readJpeg(form.get("thumb"), MAX_THUMB, "thumbnail");
  } catch (err) {
    return fail(400, err.message);
  }
  const kind = form.get("kind") === "pedigree" ? "pedigree" : "photo";
  const size = (v) => (Number.isInteger(Number(v)) && Number(v) > 0 ? Number(v) : null);

  const photo = await env.DB.prepare(
    "INSERT INTO photos (rabbit_id, taken_on, caption, kind, width, height) VALUES (?, ?, ?, ?, ?, ?) RETURNING *"
  )
    .bind(rabbitId, String(form.get("taken_on") || "").trim(), String(form.get("caption") || "").trim(), kind, size(form.get("width")), size(form.get("height")))
    .first();
  try {
    await env.PHOTOS.prepare("INSERT INTO photo_files (id, full, thumb) VALUES (?, ?, ?)").bind(photo.id, full, thumb).run();
  } catch (err) {
    // Without its image the details row is useless
    await env.DB.prepare("DELETE FROM photos WHERE id = ?").bind(photo.id).run();
    throw err;
  }
  if (kind === "photo" && !rabbit.photo_id) await env.DB.prepare("UPDATE rabbits SET photo_id = ? WHERE id = ?").bind(photo.id, rabbitId).run();
  return json(photo, 201);
};

const serve = async (env, id, thumb) => {
  const row = await env.PHOTOS.prepare(`SELECT ${thumb ? "thumb" : "full"} AS data FROM photo_files WHERE id = ?`).bind(id).first();
  if (!row) return fail(404, "Not found.");
  // A photo's bytes never change once uploaded, so the phone can keep them
  return new Response(new Uint8Array(row.data), {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=31536000, immutable" },
  });
};

const edit = async (request, env, id) => {
  const body = await request.json().catch(() => ({}));
  const data = Object.fromEntries(PHOTO_FIELDS.filter((f) => f in body).map((f) => [f, String(body[f] ?? "").trim()]));
  if (data.kind && !["photo", "pedigree"].includes(data.kind)) return fail(400, "One of those values isn't allowed.");
  const cols = Object.keys(data);
  if (!cols.length) return fail(400, "Nothing to save.");
  const photo = await env.DB.prepare(`UPDATE photos SET ${cols.map((c) => `${c} = ?`).join(", ")} WHERE id = ? RETURNING *`)
    .bind(...Object.values(data), id)
    .first();
  if (!photo) return fail(404, "Not found.");
  return json(photo);
};

const remove = async (env, id) => {
  const photo = await env.DB.prepare("SELECT rabbit_id FROM photos WHERE id = ?").bind(id).first();
  if (!photo) return fail(404, "Not found.");
  const rabbit = await env.DB.prepare("SELECT photo_id FROM rabbits WHERE id = ?").bind(photo.rabbit_id).first();
  await env.DB.prepare("DELETE FROM photos WHERE id = ?").bind(id).run();
  await env.PHOTOS.prepare("DELETE FROM photo_files WHERE id = ?").bind(id).run();
  if (rabbit?.photo_id === id) await pickMainPhoto(env, photo.rabbit_id);
  return json({ ok: true });
};

// Called before a rabbit is deleted: its photo rows go with it, so clear their files first
export const deleteRabbitPhotos = async (env, rabbitId) => {
  const { results } = await env.DB.prepare("SELECT id FROM photos WHERE rabbit_id = ?").bind(rabbitId).all();
  if (results.length) await env.PHOTOS.batch(results.map((p) => env.PHOTOS.prepare("DELETE FROM photo_files WHERE id = ?").bind(p.id)));
};

// Answers the photo routes, or returns null for anything else
export const photoRoutes = async (request, env, path) => {
  const method = request.method;
  let m;
  if ((m = path.match(/^\/api\/rabbits\/(\d+)\/photos$/)) && method === "POST") return upload(request, env, Number(m[1]));
  if ((m = path.match(/^\/api\/photos\/(\d+)(\/thumb)?$/)) && method === "GET") return serve(env, Number(m[1]), Boolean(m[2]));
  if ((m = path.match(/^\/api\/photos\/(\d+)$/))) {
    if (method === "PUT") return edit(request, env, Number(m[1]));
    if (method === "DELETE") return remove(env, Number(m[1]));
  }
  return null;
};
