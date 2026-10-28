// The public "for sale" page's data. No password: it only ever exposes rabbits marked for sale, their
// photos, the ancestors needed for their pedigrees, and the contact details set in Settings.

const PUBLIC_RABBIT = ["id", "name", "ear", "sex", "breed", "color", "genotype", "weight", "dob", "reg", "gc", "legs", "breeder", "sire_id", "dam_id"];
const CONTACT_KEYS = ["rabbitry", "contact_name", "phone", "email", "location", "sale_intro"];

const pick = (r, keys) => Object.fromEntries(keys.map((k) => [k, r[k]]));
const json = (data) => new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

export const saleListing = async (env) => {
  const [rabbits, photos, settings] = await env.DB.batch([
    env.DB.prepare("SELECT * FROM rabbits"),
    env.DB.prepare("SELECT id, rabbit_id, taken_on, caption FROM photos WHERE kind = 'photo' ORDER BY taken_on DESC, id DESC"),
    env.DB.prepare(`SELECT key, value FROM settings WHERE key IN (${CONTACT_KEYS.map(() => "?").join(",")})`).bind(...CONTACT_KEYS),
  ]);
  const byId = new Map(rabbits.results.map((r) => [r.id, r]));
  const listed = rabbits.results.filter((r) => r.for_sale && r.status === "herd");

  // Four generations behind each listed rabbit, for its pedigree PDF
  const ancestors = new Map();
  const walk = (id, depth) => {
    const r = byId.get(id);
    if (!r || depth > 3) return;
    ancestors.set(r.id, pick(r, PUBLIC_RABBIT));
    walk(r.sire_id, depth + 1);
    walk(r.dam_id, depth + 1);
  };
  listed.forEach((r) => walk(r.id, 0));

  return json({
    contact: Object.fromEntries(settings.results.map((s) => [s.key, s.value])),
    listings: listed.map((r) => ({
      ...pick(r, PUBLIC_RABBIT),
      sale_price: r.sale_price,
      sale_notes: r.sale_notes,
      photo_id: r.photo_id,
      photos: photos.results.filter((p) => p.rabbit_id === r.id).map((p) => p.id),
    })),
    rabbits: [...ancestors.values()],
  });
};

// A photo, only if it belongs to a rabbit that is listed for sale right now
export const salePhoto = async (env, id, thumb) => {
  const ok = await env.DB.prepare(
    "SELECT 1 FROM photos p JOIN rabbits r ON r.id = p.rabbit_id WHERE p.id = ? AND p.kind = 'photo' AND r.for_sale = 1 AND r.status = 'herd'"
  )
    .bind(id)
    .first();
  if (!ok) return new Response("Not found", { status: 404 });
  const row = await env.PHOTOS.prepare(`SELECT ${thumb ? "thumb" : "full"} AS data FROM photo_files WHERE id = ?`).bind(id).first();
  if (!row) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(row.data), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=3600" } });
};
