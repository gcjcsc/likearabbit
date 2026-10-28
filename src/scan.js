// Reads a photo of a paper pedigree with a Workers AI vision model and returns the rabbit and its
// 14 ancestors as plain fields for the app's review screen. Nothing is saved here.

const MODEL = "@cf/qwen/qwen3.8-27b";

// Slot codes: S = sire, D = dam, read left to right, so "SD" is the sire's dam
export const SLOTS = ["self", "S", "D", "SS", "SD", "DS", "DD", "SSS", "SSD", "SDS", "SDD", "DSS", "DSD", "DDS", "DDD"];
const FIELDS = ["name", "ear", "sex", "color", "genotype", "weight", "dob", "reg", "gc", "legs", "breeder"];

const rabbitSchema = {
  type: ["object", "null"],
  properties: Object.fromEntries(FIELDS.map((f) => [f, { type: "string" }])),
};

const SCHEMA = {
  type: "object",
  properties: {
    breeder: { type: "string" },
    ...Object.fromEntries(SLOTS.map((s) => [s, rabbitSchema])),
  },
  required: ["self"],
};

const PROMPT = `This is a photo of a rabbit pedigree. Read it and return JSON only.

How pedigrees are laid out:
- The rabbit the pedigree is for ("self") is in the first column (left, or top if the page is rotated). Each column further on is one generation back: parents, then grandparents, then great-grandparents.
- In each pair, the sire (father, buck) is the upper or first box and the dam (mother, doe) is the lower or second box.
- The page may be photographed sideways or upside down. Work out the orientation from the text.

Return these keys. Each is an object, or null if that box is empty or missing:
self, S (sire), D (dam), SS (sire's sire), SD (sire's dam), DS (dam's sire), DD (dam's dam),
SSS, SSD, SDS, SDD, DSS, DSD, DDS, DDD (great-grandparents, same pattern: SDS is the sire's dam's sire).

Each rabbit object has these string fields; use "" when not shown:
- name: the rabbit's name, including any rabbitry prefix printed with it (e.g. "Barrons Keep It Simple"). If a box shows "NAME - EARNUMBER", the name is the part before the dash.
- ear: the ear number / ear # / ID / tattoo
- sex: "buck" or "doe" if printed, else ""
- color: color or variety exactly as written
- genotype: genotype exactly as written (e.g. "at_ B_ C_ dd E_")
- weight: as written (e.g. "8 lbs 4 oz")
- dob: date of birth as YYYY-MM-DD, or "" if not shown or unreadable
- reg: registration number; gc: grand champion number; legs: number of legs
- breeder: rabbitry name if shown separately from the name

Also return "breeder": the rabbitry that issued the pedigree (from the header), or "".

Copy text exactly. Never guess or invent a value: leave it "" if you can't read it.`;

// The model's answer may be an object, a JSON string, or JSON wrapped in prose or a code fence
const parseAnswer = (result) => {
  let out = result?.response ?? result?.choices?.[0]?.message?.content ?? result;
  if (typeof out === "object" && out !== null) return out;
  const text = String(out ?? "");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("The scan didn't come back as a pedigree.");
  return JSON.parse(text.slice(start, end + 1));
};

const clean = (v) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim());
// Dates come back as YYYY-MM-DD when the model follows the prompt; US-style M/D/YYYY is converted
const isoDate = (v) => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!m) return "";
  const year = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${year}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
};

// Keeps only known slots and fields, as tidy strings
export const normalize = (raw) => {
  const out = { breeder: clean(raw?.breeder) };
  for (const slot of SLOTS) {
    const r = raw?.[slot];
    if (!r || typeof r !== "object") {
      out[slot] = null;
      continue;
    }
    const rabbit = Object.fromEntries(FIELDS.map((f) => [f, clean(r[f])]));
    rabbit.dob = isoDate(rabbit.dob);
    rabbit.sex = ["buck", "doe"].includes(rabbit.sex.toLowerCase()) ? rabbit.sex.toLowerCase() : "";
    out[slot] = Object.values(rabbit).some(Boolean) ? rabbit : null;
  }
  return out;
};

export const scanPedigree = async (env, image) => {
  if (!env.AI) throw new Error("Scanning isn't set up: the Workers AI binding is missing.");
  if (!/^data:image\/(jpeg|png|webp);base64,/.test(image || "")) throw new Error("That isn't a photo the scanner can read.");

  const messages = [
    {
      role: "user",
      content: [
        { type: "text", text: PROMPT },
        { type: "image_url", image_url: { url: image } },
      ],
    },
  ];
  const options = {
    messages,
    max_tokens: 8000,
    reasoning_effort: "medium",
    response_format: { type: "json_schema", json_schema: SCHEMA },
  };
  let result;
  try {
    result = await env.AI.run(MODEL, options);
  } catch (err) {
    // If the model rejects the optional settings, ask again with just the prompt and photo
    console.warn("Scan with JSON schema failed, retrying plainly:", err.message);
    result = await env.AI.run(MODEL, { messages, max_tokens: 8000 });
  }
  return normalize(parseAnswer(result));
};
