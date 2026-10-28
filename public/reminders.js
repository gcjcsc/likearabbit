// Litter and health reminders. Used by the app's "Coming up" list and by the Worker's daily phone
// notification, so both always agree. Dates are YYYY-MM-DD strings.

export const GESTATION_DAYS = 31;

export const addDays = (iso, n) => {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

// Each litter's checkpoints, counted from breeding until kindling, then from kindling
export const LITTER_STEPS = [
  { key: "palpate", label: "Palpate", from: "bred_on", days: 14, beforeKindling: true },
  { key: "nestbox", label: "Put the nest box in", from: "bred_on", days: 28, beforeKindling: true },
  { key: "due", label: "Due to kindle", from: "bred_on", days: GESTATION_DAYS, beforeKindling: true },
  { key: "tattoo", label: "Tattoo the kits", from: "kindled_on", days: 42 },
  { key: "wean", label: "Wean the kits", from: "kindled_on", days: 56 },
];

const doneKeys = (litter) => new Set(String(litter.done || "").split(",").filter(Boolean));

export const litterSteps = (litter) => {
  const done = doneKeys(litter);
  return LITTER_STEPS.filter((s) => litter[s.from] && !(s.beforeKindling && litter.kindled_on)).map((s) => ({
    ...s,
    date: addDays(litter[s.from], s.days),
    done: done.has(s.key),
  }));
};

export const withdrawalEnds = (h) => (h.given_on && h.withdrawal_days > 0 ? addDays(h.given_on, h.withdrawal_days) : "");

// Everything from `from` to `to` (inclusive) that still needs doing, oldest first.
// nameOf(id) turns a rabbit id into a display name.
export const upcoming = ({ litters = [], health = [], rabbits = [] }, from, to, nameOf) => {
  const items = [];
  const active = new Set(rabbits.filter((r) => r.status === "herd").map((r) => r.id));
  for (const l of litters) {
    if (l.dam_id && !active.has(l.dam_id)) continue;
    for (const s of litterSteps(l)) {
      if (s.done || s.date < from || s.date > to) continue;
      items.push({ date: s.date, text: `${s.label}: ${nameOf(l.dam_id)}'s litter`, litterId: l.id, key: s.key, rabbitId: l.dam_id });
    }
  }
  for (const h of health) {
    const end = withdrawalEnds(h);
    if (!end || end < from || end > to || !active.has(h.rabbit_id)) continue;
    items.push({ date: end, text: `Withdrawal ends: ${nameOf(h.rabbit_id)} (${h.item || "treatment"})`, rabbitId: h.rabbit_id });
  }
  return items.sort((a, b) => a.date.localeCompare(b.date));
};
