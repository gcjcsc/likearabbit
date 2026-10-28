// MCF herd and pedigree app: loads every rabbit and litter once, renders views by URL hash, and saves through /api

import { pedigreePdf } from "./pedigree-pdf.js";
import { photoUrl, exifDate, uploadPhoto, photoDataUrl } from "./photos.js";
import { upcoming as upcomingItems, litterSteps, withdrawalEnds, GESTATION_DAYS } from "./reminders.js";

const app = document.getElementById("app");

const DEFAULT_RABBITRY = "MCF Rabbitry";
const rabbitry = () => settings.rabbitry || DEFAULT_RABBITRY;
const STATUS_LABELS = { herd: "In the herd", ancestor: "Pedigree only", sold: "Sold", deceased: "Deceased" };
// Ways a rabbit leaves the herd, and the status each one files it under
const RETIRE_REASONS = { Sold: "sold", "Gave away": "sold", Died: "deceased", Culled: "deceased" };
const isRetired = (r) => r.status === "sold" || r.status === "deceased";
const statusLabel = (r) => (isRetired(r) && r.left_reason) || STATUS_LABELS[r.status];

let rabbits = [];
let litters = [];
let photos = [];
let weights = [];
let health = [];
let shows = [];
let settings = {};
let byId = new Map();

// ---- Helpers ----

const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const displayName = (r) => (r ? r.name || r.ear || "Unnamed" : "Unknown");
const sexLabel = (r) => (r?.sex === "buck" ? "Buck" : r?.sex === "doe" ? "Doe" : "");
const byName = (a, b) => displayName(a).localeCompare(displayName(b));

const parseDate = (iso) => (iso ? new Date(iso + "T12:00:00") : null);
const fmtDate = (iso) => (iso ? parseDate(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "");
const toISO = (d) => d.toISOString().slice(0, 10);
const addDays = (iso, n) => {
  const d = parseDate(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
};
const daysUntil = (iso) => Math.round((parseDate(iso) - parseDate(toISO(new Date()))) / 86400e3);

const age = (iso) => {
  if (!iso) return "";
  const days = -daysUntil(iso);
  if (days < 0) return "";
  if (days < 7 * 12) return `${Math.floor(days / 7)} wk`;
  const months = Math.floor(days / 30.44);
  if (months < 12) return `${months} mo`;
  const y = Math.floor(months / 12);
  const m = months % 12;
  return m ? `${y} yr ${m} mo` : `${y} yr`;
};

const api = async (method, path, body) => {
  const res = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  }).catch(() => {
    throw new Error("You're offline. This can't be saved until you have a connection.");
  });
  // The service worker marks a saved copy it served because there was no connection
  if (path === "/api/data") document.getElementById("offline").hidden = res.headers.get("X-Offline") !== "1";
  if (res.status === 401) {
    location.href = "/login";
    throw new Error("Signed out");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
};

const load = async () => {
  ({ rabbits, litters, photos = [], weights = [], health = [], shows = [], settings = {} } = await api("GET", "/api/data"));
  byId = new Map(rabbits.map((r) => [r.id, r]));
  coiMemo.clear();
  genMemo.clear();
};

const children = (r) => rabbits.filter((c) => c.sire_id === r.id || c.dam_id === r.id).sort((a, b) => (b.dob || "").localeCompare(a.dob || ""));

// ---- Inbreeding: Wright's coefficient from every known ancestor, through kinship coefficients ----

const genMemo = new Map();
const coiMemo = new Map();

// Generation depth: always greater than any ancestor's, so recursing on the deeper rabbit never loops
const generation = (id) => {
  if (!id || !byId.has(id)) return 0;
  if (!genMemo.has(id)) {
    genMemo.set(id, 0);
    const r = byId.get(id);
    genMemo.set(id, 1 + Math.max(generation(r.sire_id), generation(r.dam_id)));
  }
  return genMemo.get(id);
};

const kinship = (a, b, memo = new Map()) => {
  if (!a || !b || !byId.has(a) || !byId.has(b)) return 0;
  if (a === b) return (1 + coi(byId.get(a).sire_id, byId.get(a).dam_id)) / 2;
  const key = a < b ? `${a}-${b}` : `${b}-${a}`;
  if (memo.has(key)) return memo.get(key);
  // Step up from whichever is further down the tree; it can't be an ancestor of the other
  const [lower, other] = generation(a) >= generation(b) ? [a, b] : [b, a];
  const r = byId.get(lower);
  const k = (kinship(r.sire_id, other, memo) + kinship(r.dam_id, other, memo)) / 2;
  memo.set(key, k);
  return k;
};

// Inbreeding of a rabbit (or a planned litter) with this sire and dam
const coi = (sireId, damId) => {
  if (!sireId || !damId) return 0;
  const key = `${sireId}x${damId}`;
  if (!coiMemo.has(key)) coiMemo.set(key, kinship(sireId, damId));
  return coiMemo.get(key);
};

const fmtCoi = (f) => (f === 0 ? "0%" : `${(f * 100).toFixed(f < 0.01 ? 2 : 1)}%`);

// ---- Pedigree tree ----

// Ancestors laid out generation by generation: [[subject], [sire, dam], [4 grandparents], [8 great-grandparents]]
const pedigreeColumns = (subject, depth = 4) => {
  const cols = [[subject]];
  for (let g = 1; g < depth; g++) {
    cols.push(cols[g - 1].flatMap((r) => [byId.get(r?.sire_id) || null, byId.get(r?.dam_id) || null]));
  }
  return cols;
};

const repeatsIn = (cols) => {
  const counts = new Map();
  cols.slice(1).flat().forEach((r) => r && counts.set(r.id, (counts.get(r.id) || 0) + 1));
  return counts;
};

const treeBox = (r, { slotChild, slotRole, counts, link = true }) => {
  if (!r) {
    const add = slotChild?.id && link ? `<a class="add-parent" href="#/new?child=${slotChild.id}&as=${slotRole}">+ Add ${slotRole}</a>` : "";
    return `<div class="tbox empty ${slotRole}">${add || `<span class="muted">Unknown</span>`}</div>`;
  }
  const repeat = counts?.get(r.id) > 1 ? `<span class="repeat" title="Appears ${counts.get(r.id)} times in this pedigree">×${counts.get(r.id)}</span>` : "";
  const lines = [
    r.color && `<span>${esc(r.color)}</span>`,
    r.ear && `<span>Ear ${esc(r.ear)}</span>`,
    r.tattoo && `<span>Tattoo ${esc(r.tattoo)}</span>`,
    r.genotype && `<span class="geno">${esc(r.genotype)}</span>`,
    [r.weight, r.dob && fmtDate(r.dob)].filter(Boolean).length && `<span>${esc([r.weight, fmtDate(r.dob)].filter(Boolean).join(" · "))}</span>`,
    [r.reg && `Reg ${r.reg}`, r.gc && `GC ${r.gc}`, r.legs && `Legs ${r.legs}`].filter(Boolean).length &&
      `<span>${esc([r.reg && `Reg ${r.reg}`, r.gc && `GC ${r.gc}`, r.legs && `Legs ${r.legs}`].filter(Boolean).join(" · "))}</span>`,
  ].filter(Boolean);
  const title = link ? `<a href="#/rabbit/${r.id}">${esc(displayName(r))}</a>` : esc(displayName(r));
  return `<div class="tbox ${r.sex}">${repeat}<strong>${title}</strong>${lines.join("")}</div>`;
};

const pedigreeTree = (subject, { link = true } = {}) => {
  const cols = pedigreeColumns(subject);
  const counts = repeatsIn(cols);
  return `<div class="tree">${cols
    .map(
      (col, g) =>
        `<div class="tcol">${col
          .map((r, i) => {
            if (g === 0) return treeBox(r, { link: false });
            const child = cols[g - 1][Math.floor(i / 2)];
            return treeBox(r, { slotChild: child, slotRole: i % 2 ? "dam" : "sire", counts, link });
          })
          .join("")}</div>`
    )
    .join("")}</div>`;
};

const sharedAncestorsNote = (cols) => {
  const counts = repeatsIn(cols);
  const repeated = [...counts].filter(([, n]) => n > 1).map(([id]) => byId.get(id));
  if (!repeated.length) return "";
  return `<p class="note">Appears more than once: ${repeated.map((r) => `<a href="#/rabbit/${r.id}">${esc(displayName(r))}</a> ×${counts.get(r.id)}`).join(", ")}</p>`;
};

// ---- Views ----

const rabbitCard = (r) => {
  const sire = byId.get(r.sire_id);
  const dam = byId.get(r.dam_id);
  return `<a class="card rabbit-card ${r.sex} ${r.photo_id ? "has-photo" : ""}" href="#/rabbit/${r.id}">
    ${r.photo_id ? `<img class="card-photo" src="${photoUrl(r.photo_id, true)}" alt="" loading="lazy">` : ""}
    <div class="card-head"><strong>${esc(displayName(r))}</strong>${r.ear && r.name ? `<span class="chip">${esc(r.ear)}</span>` : ""}</div>
    <div>${esc([sexLabel(r), r.color].filter(Boolean).join(" · "))}</div>
    <div class="muted">${esc([r.dob && `${age(r.dob)} old`, r.breeder].filter(Boolean).join(" · "))}</div>
    ${sire || dam ? `<div class="muted small">${esc(displayName(sire))} × ${esc(displayName(dam))}</div>` : ""}
    ${cardChips(r)}
  </a>`;
};

const cardChips = (r) => {
  const until = withdrawalUntil(r);
  const chips = [
    r.cage && `<span class="chip">Cage ${esc(r.cage)}</span>`,
    r.for_sale && r.status === "herd" && `<span class="chip sale">For sale${r.sale_price ? ` · ${/^\d/.test(r.sale_price) ? "$" : ""}${esc(r.sale_price)}` : ""}</span>`,
    until && `<span class="chip warn">Withdrawal to ${fmtDate(until)}</span>`,
  ].filter(Boolean);
  return chips.length ? `<div class="chips card-chips">${chips.join("")}</div>` : "";
};

// Litter jobs and withdrawal periods from a week ago to two weeks ahead, with a Done button for litter jobs
const comingUp = () => {
  const today = toISO(new Date());
  const items = upcomingItems({ litters, health, rabbits }, addDays(today, -7), addDays(today, 14), (id) => displayName(byId.get(id)));
  if (!items.length) return "";
  const when = (d) => {
    const n = daysUntil(d);
    return n === 0 ? "Today" : n === 1 ? "Tomorrow" : n < 0 ? `${-n} day${n === -1 ? "" : "s"} late` : `${fmtDate(d)} · in ${n} days`;
  };
  return `<section class="card due"><h2>Coming up</h2><ul class="todo">${items
    .map(
      (i) => `<li class="${i.date < today ? "late" : i.date === today ? "today" : ""}">
        <span><strong>${when(i.date)}</strong> · <a href="${i.litterId ? `#/litters/${i.litterId}` : `#/rabbit/${i.rabbitId}`}">${esc(i.text)}</a></span>
        ${i.litterId ? `<button type="button" class="button small-button" data-done="${i.litterId}:${i.key}">Done</button>` : ""}</li>`
    )
    .join("")}</ul></section>`;
};

const markDone = async (litterId, key) => {
  const l = litters.find((x) => x.id === litterId);
  const done = new Set(String(l.done || "").split(",").filter(Boolean));
  done.add(key);
  await api("PUT", `/api/litters/${litterId}`, { done: [...done].join(",") });
  await load();
};

const viewHerd = (params = new URLSearchParams()) => {
  const sort = params.get("sort") || "name";
  // Rabbits with a cage first, in cage order (A2 before A10), then the rest by name
  const byCage = (a, b) => !a.cage - !b.cage || a.cage.localeCompare(b.cage, undefined, { numeric: true }) || byName(a, b);
  const herd = rabbits.filter((r) => r.status === "herd").sort(sort === "cage" ? byCage : byName);
  const group = (label, list) =>
    list.length ? `<section><h2>${label} <span class="count">${list.length}</span></h2><div class="grid">${list.map(rabbitCard).join("")}</div></section>` : "";
  app.innerHTML = `
    <div class="title-row"><h1>Herd</h1><div class="actions"><a class="button" href="#/scan">📷 Scan a pedigree</a></div></div>
    ${comingUp()}
    <p class="sort-by">Sort by <a href="#/" class="${sort === "name" ? "active" : ""}">name</a> · <a href="#/?sort=cage" class="${sort === "cage" ? "active" : ""}">cage</a></p>
    ${group("Bucks", herd.filter((r) => r.sex === "buck"))}
    ${group("Does", herd.filter((r) => r.sex === "doe"))}
    ${group("Not sexed yet", herd.filter((r) => !r.sex))}
    ${herd.length ? "" : `<p class="muted">No rabbits in the herd yet. <a href="#/new">Add one</a>.</p>`}
    ${pastRabbits()}`;
  app.querySelectorAll("[data-done]").forEach((b) =>
    b.addEventListener("click", async () => {
      const [litterId, key] = b.dataset.done.split(":");
      b.disabled = true;
      try {
        await markDone(Number(litterId), key);
        viewHerd(params);
      } catch (err) {
        alert(err.message);
        b.disabled = false;
      }
    })
  );
};

const leftSummary = (r) =>
  [statusLabel(r), r.left_on && fmtDate(r.left_on), r.left_to && `to ${r.left_to}`, r.price && (/^\d/.test(r.price) ? `$${r.price}` : r.price)]
    .filter(Boolean)
    .map(esc)
    .join(" · ");

const pastRabbits = () => {
  const past = rabbits.filter(isRetired).sort((a, b) => (b.left_on || "").localeCompare(a.left_on || ""));
  if (!past.length) return "";
  return `<details class="past"><summary><h2>Past rabbits <span class="count">${past.length}</span></h2></summary>
    <ul class="past-list">${past
      .map((r) => `<li><a href="#/rabbit/${r.id}">${esc(displayName(r))}</a> <span class="muted">${leftSummary(r)}</span></li>`)
      .join("")}</ul></details>`;
};

const viewAll = (params) => {
  const q = params.get("q") || "";
  const status = params.get("status") || "";
  const needle = q.toLowerCase();
  const list = rabbits
    .filter((r) => !status || r.status === status)
    .filter((r) => !needle || [r.name, r.ear, r.tattoo, r.color, r.breeder].some((v) => v.toLowerCase().includes(needle)))
    .sort(byName);
  app.innerHTML = `
    <h1>All rabbits</h1>
    <form class="filters" id="filters">
      <input type="search" name="q" value="${esc(q)}" placeholder="Search name, ear #, tattoo, color, breeder" aria-label="Search">
      <select name="status" aria-label="Status">
        <option value="">Any status</option>
        ${Object.entries(STATUS_LABELS).map(([v, l]) => `<option value="${v}" ${v === status ? "selected" : ""}>${l}</option>`).join("")}
      </select>
    </form>
    <p class="muted">${list.length} of ${rabbits.length}</p>
    <div class="table-wrap"><table>
      <thead><tr><th>Name</th><th>Ear #</th><th>Sex</th><th>Color</th><th>Born</th><th>Breeder</th><th>Status</th></tr></thead>
      <tbody>${list
        .map(
          (r) => `<tr>
            <td><a href="#/rabbit/${r.id}">${esc(displayName(r))}</a></td><td>${esc(r.ear)}</td><td>${sexLabel(r)}</td>
            <td>${esc(r.color)}</td><td>${fmtDate(r.dob)}</td><td>${esc(r.breeder)}</td><td>${statusLabel(r)}</td></tr>`
        )
        .join("")}</tbody>
    </table></div>`;
  const form = document.getElementById("filters");
  const apply = () => {
    const p = new URLSearchParams(new FormData(form));
    [...p].forEach(([k, v]) => !v && p.delete(k));
    history.replaceState(null, "", `#/all${p.size ? "?" + p : ""}`);
    viewAll(p);
    const input = document.querySelector("#filters input");
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  };
  form.addEventListener("input", apply);
  form.addEventListener("submit", (e) => e.preventDefault());
};

const detail = (label, value) => (value ? `<div><dt>${label}</dt><dd>${value}</dd></div>` : "");

const viewRabbit = (id) => {
  const r = byId.get(id);
  if (!r) return notFound();
  const sire = byId.get(r.sire_id);
  const dam = byId.get(r.dam_id);
  const kids = children(r);
  const theirLitters = litters.filter((l) => l.sire_id === r.id || l.dam_id === r.id);
  const litter = litters.find((l) => l.id === r.litter_id);
  const f = coi(r.sire_id, r.dam_id);
  const cols = pedigreeColumns(r);

  app.innerHTML = `
    <div class="title-row">
      <div>
        <h1>${esc(displayName(r))}</h1>
        <p class="chips">
          ${r.sex ? `<span class="chip ${r.sex}">${sexLabel(r)}</span>` : ""}
          <span class="chip">${statusLabel(r)}</span>
          ${r.ear ? `<span class="chip">Ear ${esc(r.ear)}</span>` : ""}
          ${r.tattoo ? `<span class="chip">Tattoo ${esc(r.tattoo)}</span>` : ""}
          ${r.cage ? `<span class="chip">Cage ${esc(r.cage)}</span>` : ""}
          ${r.for_sale && r.status === "herd" ? `<span class="chip sale">For sale</span>` : ""}
          ${withdrawalUntil(r) ? `<span class="chip warn">Withdrawal until ${fmtDate(withdrawalUntil(r))}</span>` : ""}
        </p>
      </div>
      <div class="actions">
        <button class="button primary" type="button" id="share-btn">Share pedigree PDF</button>
        <a class="button" href="#/rabbit/${r.id}/edit">Edit</a>
        ${r.status === "herd" ? `<button class="button" type="button" id="retire-btn">Retire…</button>` : ""}
      </div>
    </div>

    ${
      isRetired(r)
        ? `<section class="card retired"><p><strong>${leftSummary(r)}</strong></p><div class="actions">
            ${r.status === "sold" ? `<button class="button primary" type="button" id="buyer-btn">Send pedigree to ${esc(r.left_to || "the buyer")}</button>` : ""}
            <button class="button" type="button" id="unretire-btn">Return to the herd</button></div></section>`
        : ""
    }

    <section class="card ${r.photo_id ? "with-photo" : ""}">
      ${r.photo_id ? `<button type="button" class="hero-photo" data-photo="${r.photo_id}"><img src="${photoUrl(r.photo_id)}" alt="${esc(displayName(r))}"></button>` : ""}
      <dl class="details">
        ${detail("Breed", esc(r.breed))}
        ${detail("Color", esc(r.color))}
        ${detail("Genotype", r.genotype && `<span class="geno">${esc(r.genotype)}</span>`)}
        ${detail("Born", r.dob && `${fmtDate(r.dob)} <span class="muted">(${age(r.dob)})</span>`)}
        ${detail("Weight", esc(r.weight))}
        ${detail("Sire", sire && `<a href="#/rabbit/${sire.id}">${esc(displayName(sire))}</a>`)}
        ${detail("Dam", dam && `<a href="#/rabbit/${dam.id}">${esc(displayName(dam))}</a>`)}
        ${detail("Breeder", esc(r.breeder))}
        ${detail("Acquired", fmtDate(r.acquired))}
        ${detail("Registration #", esc(r.reg))}
        ${detail("Grand champion #", esc(r.gc))}
        ${detail("Legs", esc(r.legs))}
        ${detail("Litter", litter && `<a href="#/litters">${fmtDate(litter.kindled_on || litter.bred_on) || "View"}</a>`)}
        ${detail("Inbreeding (COI)", sire && dam ? `${fmtCoi(f)} <span class="muted">from known ancestors</span>` : "")}
      </dl>
      ${r.notes ? `<p class="notes">${esc(r.notes)}</p>` : ""}
    </section>

    ${photoSection(r)}
    ${saleSection(r)}
    ${weightsSection(r)}
    ${healthSection(r)}
    ${showsSection(r)}

    <section>
      <h2>Pedigree</h2>
      ${sharedAncestorsNote(cols)}
      <div class="tree-scroll">${pedigreeTree(r)}</div>
    </section>

    ${
      kids.length
        ? `<section><h2>Offspring <span class="count">${kids.length}</span></h2><div class="grid">${kids.map(rabbitCard).join("")}</div></section>`
        : ""
    }
    ${
      theirLitters.length
        ? `<section><h2>Litters <span class="count">${theirLitters.length}</span></h2>${litterTable(theirLitters)}</section>`
        : ""
    }`;

  document.getElementById("share-btn").addEventListener("click", () => sharePedigree(r));
  wirePhotos(r);
  wireSale(r);
  wireWeights(r);
  wireHealth(r);
  wireShows(r);
  document.getElementById("buyer-btn")?.addEventListener("click", () => sharePedigree(r));
  document.getElementById("retire-btn")?.addEventListener("click", () => retireDialog(r));
  document.getElementById("unretire-btn")?.addEventListener("click", async () => {
    if (!confirm(`Put ${displayName(r)} back in the herd?`)) return;
    try {
      await api("PUT", `/api/rabbits/${r.id}`, { status: "herd", left_on: "", left_reason: "", left_to: "", price: "" });
      await load();
      viewRabbit(r.id);
    } catch (err) {
      alert(err.message);
    }
  });
};

// ---- Retiring: sold, given away, died or culled ----

const retireDialog = (r) => {
  const dialog = document.createElement("dialog");
  dialog.className = "dialog";
  dialog.innerHTML = `
    <form id="retire-form" class="form">
      <h2>Retire ${esc(displayName(r))}</h2>
      <fieldset class="reasons">
        <legend>What happened?</legend>
        ${Object.keys(RETIRE_REASONS)
          .map((reason, i) => `<label><input type="radio" name="left_reason" value="${reason}" ${i === 0 ? "checked" : ""}><span>${reason}</span></label>`)
          .join("")}
      </fieldset>
      ${field("Date", "left_on", toISO(new Date()), 'type="date" required')}
      <div class="form-grid" id="new-home">
        ${field("Sold to / new owner", "left_to", "", 'autocomplete="off"')}
        ${field("Price", "price", "", 'inputmode="decimal" placeholder="e.g. 40"')}
      </div>
      <label>Note <span class="muted">(added to their notes)</span><textarea name="note" rows="2"></textarea></label>
      ${withdrawalUntil(r) ? `<p class="warn-text" id="withdrawal-warning" hidden>Still in a withdrawal period until ${fmtDate(withdrawalUntil(r))}. Don't process for meat before then.</p>` : ""}
      <p class="error" id="retire-error" role="alert" hidden></p>
      <div class="form-actions">
        <button class="button primary" type="submit">Retire</button>
        <button class="button" type="button" id="retire-cancel">Cancel</button>
      </div>
    </form>`;
  document.body.append(dialog);
  const form = dialog.querySelector("form");
  // Buyer and price only apply when the rabbit went to someone
  const sync = () => {
    const reason = form.left_reason.value;
    dialog.querySelector("#new-home").hidden = RETIRE_REASONS[reason] !== "sold";
    form.price.closest("label").hidden = reason !== "Sold";
    const warning = dialog.querySelector("#withdrawal-warning");
    if (warning) warning.hidden = reason !== "Culled";
  };
  form.addEventListener("change", sync);
  sync();
  dialog.querySelector("#retire-cancel").addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => dialog.remove());

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    const goesToSomeone = RETIRE_REASONS[data.left_reason] === "sold";
    const note = data.note.trim();
    try {
      await api("PUT", `/api/rabbits/${r.id}`, {
        status: RETIRE_REASONS[data.left_reason],
        left_reason: data.left_reason,
        left_on: data.left_on,
        left_to: goesToSomeone ? data.left_to : "",
        price: data.left_reason === "Sold" ? data.price : "",
        for_sale: 0,
        ...(note && { notes: [r.notes, `${fmtDate(data.left_on)}: ${note}`].filter(Boolean).join("\n") }),
      });
      dialog.close();
      await load();
      viewRabbit(r.id);
    } catch (err) {
      const error = dialog.querySelector("#retire-error");
      error.textContent = err.message;
      error.hidden = false;
    }
  });
  dialog.showModal();
};

// ---- Pedigree PDF: made on the phone and handed to the share sheet for Messages, Mail or AirDrop ----

// "Sold to Jane Smith on Oct 28, 2026" on the PDF of a rabbit that has gone to a new owner
const transferLine = (r) =>
  r.status === "sold" && (r.left_to || r.left_on) ? `${r.left_reason === "Gave away" ? "Transferred" : "Sold"}${r.left_to ? ` to ${r.left_to}` : ""}${r.left_on ? ` on ${fmtDate(r.left_on)}` : ""}` : "";

const sharePedigree = async (r) => {
  const photo = photoCache.get(r.photo_id);
  const blob = pedigreePdf(r, { displayName, fmtDate, fmtCoi, coi, pedigreeColumns, repeatsIn, rabbitry: rabbitry(), photo: photo?.dataUrl && photo, transfer: transferLine(r) });
  const filename = `${displayName(r).replace(/[^\w\s'&-]+/g, "").trim() || "Rabbit"} pedigree.pdf`;
  const file = new File([blob], filename, { type: "application/pdf" });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: `${displayName(r)} pedigree` });
      return;
    } catch (err) {
      // Closing the share sheet isn't an error; anything else falls back to downloading
      if (err.name === "AbortError") return;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60e3);
};

// ---- Photos: any number per rabbit, dated so older photos sit in order ----

// Main photos ready for the PDF. Loaded when the rabbit's page opens, since iPhones only allow the share
// sheet straight after a tap and there's no time to fetch the photo then.
const photoCache = new Map();

// Age on a given date, e.g. "8 wk" or "1 yr 2 mo"
const ageOn = (dob, date) => {
  if (!dob || !date) return "";
  const days = Math.round((parseDate(date) - parseDate(dob)) / 86400e3);
  if (days < 0) return "";
  if (days < 7 * 12) return `${Math.floor(days / 7)} wk`;
  const months = Math.floor(days / 30.44);
  if (months < 12) return `${months} mo`;
  return months % 12 ? `${Math.floor(months / 12)} yr ${months % 12} mo` : `${Math.floor(months / 12)} yr`;
};

const photosOf = (r) => photos.filter((p) => p.rabbit_id === r.id).sort((a, b) => (b.taken_on || "").localeCompare(a.taken_on || "") || b.id - a.id);

const photoLabel = (p, r) =>
  [p.kind === "pedigree" ? "Pedigree" : "", p.taken_on && fmtDate(p.taken_on), p.kind === "photo" && ageOn(r.dob, p.taken_on) && `age ${ageOn(r.dob, p.taken_on)}`]
    .filter(Boolean)
    .join(" · ") || "No date";

const photoSection = (r) => {
  const list = photosOf(r);
  return `<section>
    <div class="title-row"><h2>Photos ${list.length ? `<span class="count">${list.length}</span>` : ""}</h2>
      <div class="actions"><label class="button">+ Add photos<input type="file" id="add-photos" accept="image/*" multiple hidden></label></div></div>
    <p class="muted small" id="photo-status" role="status" ${list.length ? "hidden" : ""}>${
      list.length ? "" : "No photos yet. Add as many as you like, older ones too: the date is read from each photo where it can be, and you can change it."
    }</p>
    ${
      list.length
        ? `<div class="photo-grid">${list
            .map(
              (p) => `<button type="button" class="photo-thumb ${p.id === r.photo_id ? "main" : ""}" data-photo="${p.id}">
                <img src="${photoUrl(p.id, true)}" alt="${esc(p.caption || photoLabel(p, r))}" loading="lazy">
                <span>${esc(photoLabel(p, r))}</span>${p.id === r.photo_id ? `<em>Main</em>` : ""}</button>`
            )
            .join("")}</div>`
        : ""
    }
  </section>`;
};

const wirePhotos = (r) => {
  if (r.photo_id && !photoCache.has(r.photo_id)) photoDataUrl(r.photo_id).then((p) => photoCache.set(r.photo_id, p)).catch(() => {});
  document.querySelectorAll("[data-photo]").forEach((el) => el.addEventListener("click", () => photoViewer(r, Number(el.dataset.photo))));

  document.getElementById("add-photos").addEventListener("change", async (e) => {
    const files = [...e.target.files];
    const status = document.getElementById("photo-status");
    status.hidden = false;
    let failed = 0;
    for (const [i, file] of files.entries()) {
      status.innerHTML = `<span class="spinner" aria-hidden="true"></span> Adding photo ${i + 1} of ${files.length}…`;
      try {
        await uploadPhoto(r.id, file, { takenOn: (await exifDate(file)) || toISO(new Date()) });
      } catch (err) {
        failed++;
        status.textContent = err.message;
      }
    }
    await load();
    viewRabbit(r.id);
    if (failed) alert(`${failed} of ${files.length} photos couldn't be added.`);
  });
};

// Full-size viewer with the date and caption to edit, swipe-free prev/next, main photo and delete
const photoViewer = (r, photoId) => {
  const list = photosOf(r);
  let index = Math.max(0, list.findIndex((p) => p.id === photoId));
  const dialog = document.createElement("dialog");
  dialog.className = "dialog lightbox";
  document.body.append(dialog);

  const render = () => {
    const p = list[index];
    const isMain = p.id === r.photo_id;
    dialog.innerHTML = `
      <div class="lightbox-image">
        <img src="${photoUrl(p.id)}" alt="${esc(p.caption || photoLabel(p, r))}">
        ${list.length > 1 ? `<button type="button" class="nav prev" aria-label="Previous photo">‹</button><button type="button" class="nav next" aria-label="Next photo">›</button>` : ""}
      </div>
      <form class="form lightbox-form">
        <p class="muted small">${index + 1} of ${list.length}${p.taken_on && r.dob && p.kind === "photo" ? ` · ${esc(displayName(r))} was ${ageOn(r.dob, p.taken_on)} old` : ""}</p>
        <div class="form-grid">
          ${field("Taken on", "taken_on", p.taken_on, 'type="date"')}
          <label>Type<select name="kind"><option value="photo" ${p.kind === "photo" ? "selected" : ""}>Photo</option><option value="pedigree" ${p.kind === "pedigree" ? "selected" : ""}>Pedigree</option></select></label>
        </div>
        ${field("Caption", "caption", p.caption, 'placeholder="e.g. Best of breed, spring show"')}
        <p class="error" hidden></p>
        <div class="form-actions">
          <button class="button primary" type="submit">Save</button>
          ${isMain || p.kind !== "photo" ? "" : `<button class="button" type="button" data-act="main">Make main photo</button>`}
          <button class="button" type="button" data-act="close">Close</button>
          <button class="button danger" type="button" data-act="delete">Delete</button>
        </div>
      </form>`;
    const error = dialog.querySelector(".error");
    const run = async (fn) => {
      try {
        await fn();
      } catch (err) {
        error.textContent = err.message;
        error.hidden = false;
      }
    };
    dialog.querySelector(".prev")?.addEventListener("click", () => ((index = (index - 1 + list.length) % list.length), render()));
    dialog.querySelector(".next")?.addEventListener("click", () => ((index = (index + 1) % list.length), render()));
    dialog.querySelector('[data-act="close"]').addEventListener("click", () => dialog.close());
    dialog.querySelector('[data-act="main"]')?.addEventListener("click", () =>
      run(async () => {
        await api("PUT", `/api/rabbits/${r.id}`, { photo_id: p.id });
        r.photo_id = p.id;
        dialog.dataset.changed = "1";
        render();
      })
    );
    dialog.querySelector('[data-act="delete"]').addEventListener("click", () =>
      run(async () => {
        if (!confirm("Delete this photo for good?")) return;
        await api("DELETE", `/api/photos/${p.id}`);
        dialog.dataset.changed = "1";
        list.splice(index, 1);
        if (!list.length) return dialog.close();
        index = Math.min(index, list.length - 1);
        render();
      })
    );
    dialog.querySelector("form").addEventListener("submit", (e) => {
      e.preventDefault();
      run(async () => {
        Object.assign(p, await api("PUT", `/api/photos/${p.id}`, Object.fromEntries(new FormData(e.target))));
        dialog.dataset.changed = "1";
        dialog.close();
      });
    });
  };

  dialog.addEventListener("close", async () => {
    dialog.remove();
    if (dialog.dataset.changed) {
      await load();
      viewRabbit(r.id);
    }
  });
  render();
  dialog.showModal();
};

// ---- Weights: a log per rabbit, charted, with the newest copied to the rabbit's weight ----

const fmtWeight = (oz) => {
  const lbs = Math.floor(oz / 16);
  const rest = Math.round((oz - lbs * 16) * 10) / 10;
  return [lbs && `${lbs} lb${lbs === 1 ? "" : "s"}`, rest && `${rest} oz`].filter(Boolean).join(" ") || "0 oz";
};

const weightsOf = (r) => weights.filter((w) => w.rabbit_id === r.id).sort((a, b) => a.weighed_on.localeCompare(b.weighed_on) || a.id - b.id);

// A small line chart in pounds, oldest on the left
const weightChart = (list) => {
  if (list.length < 2) return "";
  const W = 600, H = 180, pad = { l: 44, r: 14, t: 12, b: 26 };
  const times = list.map((w) => parseDate(w.weighed_on).getTime());
  const lbs = list.map((w) => w.weight_oz / 16);
  const [t0, t1] = [Math.min(...times), Math.max(...times)];
  const top = Math.ceil(Math.max(...lbs) + 0.5);
  const bottom = Math.max(0, Math.floor(Math.min(...lbs) - 0.5));
  const x = (t) => pad.l + ((t - t0) / (t1 - t0 || 1)) * (W - pad.l - pad.r);
  const y = (v) => pad.t + (1 - (v - bottom) / (top - bottom || 1)) * (H - pad.t - pad.b);
  const points = list.map((w, i) => [x(times[i]), y(lbs[i])]);
  const ticks = [bottom, (bottom + top) / 2, top];
  return `<svg class="weight-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Weight over time, ${esc(fmtWeight(list[0].weight_oz))} to ${esc(fmtWeight(list.at(-1).weight_oz))}">
    ${ticks.map((v) => `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${pad.l - 6}" y="${y(v) + 4}" text-anchor="end">${Math.round(v * 10) / 10} lb</text>`).join("")}
    <text x="${pad.l}" y="${H - 6}">${esc(fmtDate(list[0].weighed_on))}</text>
    <text x="${W - pad.r}" y="${H - 6}" text-anchor="end">${esc(fmtDate(list.at(-1).weighed_on))}</text>
    <polyline points="${points.map((p) => p.join(",")).join(" ")}" class="line"/>
    ${points.map(([px, py]) => `<circle cx="${px}" cy="${py}" r="4" class="dot"/>`).join("")}
  </svg>`;
};

const weightsSection = (r) => {
  const list = weightsOf(r);
  return `<section class="records" id="weights">
    <h2>Weights ${list.length ? `<span class="count">${list.length}</span>` : ""}</h2>
    ${weightChart(list)}
    <form class="inline-form" id="weight-form">
      ${field("Date", "weighed_on", toISO(new Date()), 'type="date" required')}
      ${field("lbs", "lbs", "", 'type="number" min="0" step="1" inputmode="numeric"')}
      ${field("oz", "oz", "", 'type="number" min="0" max="15.9" step="0.1" inputmode="decimal"')}
      <button class="button primary" type="submit">Add weight</button>
    </form>
    ${
      list.length
        ? `<ul class="record-list">${list
            .slice()
            .reverse()
            .map(
              (w) => `<li><span><strong>${fmtWeight(w.weight_oz)}</strong> <span class="muted">${fmtDate(w.weighed_on)}${r.dob ? ` · age ${ageOn(r.dob, w.weighed_on)}` : ""}</span></span>
                <button type="button" class="link-button" data-delete-weight="${w.id}" aria-label="Delete this weight">Delete</button></li>`
            )
            .join("")}</ul>`
        : ""
    }
  </section>`;
};

// Saves a weighing and keeps the rabbit's weight field (shown on pedigrees) at the newest one
const saveWeight = async (rabbit, weighedOn, oz) => {
  await api("POST", "/api/weights", { rabbit_id: rabbit.id, weighed_on: weighedOn, weight_oz: oz });
  const newest = weightsOf(rabbit).at(-1);
  if (!newest || weighedOn >= newest.weighed_on) await api("PUT", `/api/rabbits/${rabbit.id}`, { weight: fmtWeight(oz) });
};

const ozFrom = (lbs, oz) => (Number(lbs) || 0) * 16 + (Number(oz) || 0);

const wireWeights = (r) => {
  document.getElementById("weight-form").addEventListener("submit", (e) =>
    recordAction(e, r, async (data) => {
      const oz = ozFrom(data.lbs, data.oz);
      if (!(oz > 0)) throw new Error("Enter a weight in pounds and/or ounces.");
      await saveWeight(r, data.weighed_on, oz);
    })
  );
  document.querySelectorAll("[data-delete-weight]").forEach((b) =>
    b.addEventListener("click", () => recordDelete(r, `/api/weights/${b.dataset.deleteWeight}`, "Delete this weight?"))
  );
};

// Runs a record form's save, then redraws the rabbit's page where it was
const recordAction = async (e, r, save) => {
  e.preventDefault();
  const form = e.target;
  const button = form.querySelector("button[type=submit]");
  button.disabled = true;
  try {
    await save(Object.fromEntries(new FormData(form)));
    await load();
    const anchor = form.closest("section")?.id;
    viewRabbit(r.id);
    if (anchor) document.getElementById(anchor)?.scrollIntoView();
  } catch (err) {
    alert(err.message);
    button.disabled = false;
  }
};

const recordDelete = async (r, path, question, after) => {
  if (!confirm(question)) return;
  try {
    await api("DELETE", path);
    if (after) await after();
    await load();
    viewRabbit(r.id);
  } catch (err) {
    alert(err.message);
  }
};

// ---- Health: treatments, vaccinations, vet visits, with withdrawal periods for meat rabbits ----

const HEALTH_KINDS = { treatment: "Treatment", vaccination: "Vaccination", vet: "Vet visit", illness: "Illness / injury", other: "Other" };

// The latest withdrawal end date still in the future (or today), or ""
const withdrawalUntil = (r) =>
  health
    .filter((h) => h.rabbit_id === r.id)
    .map(withdrawalEnds)
    .filter((d) => d && d >= toISO(new Date()))
    .sort()
    .at(-1) || "";

const healthSection = (r) => {
  const list = health.filter((h) => h.rabbit_id === r.id).sort((a, b) => b.given_on.localeCompare(a.given_on) || b.id - a.id);
  return `<section class="records" id="health">
    <h2>Health ${list.length ? `<span class="count">${list.length}</span>` : ""}</h2>
    <details class="add-record" ${list.length ? "" : "open"}><summary>+ Add a health record</summary>
      <form class="form-grid" id="health-form">
        ${field("Date", "given_on", toISO(new Date()), 'type="date" required')}
        <label>Type<select name="kind">${Object.entries(HEALTH_KINDS).map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</select></label>
        ${field("What", "item", "", 'placeholder="e.g. Ivermectin, RHDV2 vaccine" required')}
        ${field("Dose", "dose", "", 'placeholder="e.g. 0.2 ml"')}
        ${field("Withdrawal (days)", "withdrawal_days", "", 'type="number" min="0" inputmode="numeric" placeholder="Meat withdrawal"')}
        ${field("Notes", "notes", "")}
        <div class="form-actions"><button class="button primary" type="submit">Save</button></div>
      </form>
    </details>
    ${
      list.length
        ? `<ul class="record-list">${list
            .map((h) => {
              const end = withdrawalEnds(h);
              const active = end && end >= toISO(new Date());
              return `<li><span><strong>${esc(h.item || HEALTH_KINDS[h.kind])}</strong> <span class="muted">${HEALTH_KINDS[h.kind]} · ${fmtDate(h.given_on)}${h.dose ? ` · ${esc(h.dose)}` : ""}</span>
                  ${end ? `<br><span class="${active ? "warn-text" : "muted"}">${active ? "Withdrawal until" : "Withdrawal ended"} ${fmtDate(end)}</span>` : ""}
                  ${h.notes ? `<br><span class="muted">${esc(h.notes)}</span>` : ""}</span>
                <button type="button" class="link-button" data-delete-health="${h.id}" aria-label="Delete this health record">Delete</button></li>`;
            })
            .join("")}</ul>`
        : ""
    }
  </section>`;
};

const wireHealth = (r) => {
  document.getElementById("health-form").addEventListener("submit", (e) =>
    recordAction(e, r, (data) => api("POST", "/api/health", { ...data, rabbit_id: r.id }))
  );
  document.querySelectorAll("[data-delete-health]").forEach((b) =>
    b.addEventListener("click", () => recordDelete(r, `/api/health/${b.dataset.deleteHealth}`, "Delete this health record?"))
  );
};

// ---- Shows: results, with ARBA legs counted onto the rabbit ----

// ARBA: a leg is first place in a class with at least 3 exhibitors and 5 rabbits (or a higher award)
const earnsLeg = (data) => /^(1|1st|first|bob|bos|bopb|bis|ris)/i.test(String(data.placing).trim()) && Number(data.exhibitors) >= 3 && Number(data.entries) >= 5;
const legCount = (r) => Number.parseInt(r.legs, 10) || 0;

const showsSection = (r) => {
  const list = shows.filter((s) => s.rabbit_id === r.id).sort((a, b) => b.show_on.localeCompare(a.show_on) || b.id - a.id);
  const legs = legCount(r);
  return `<section class="records" id="shows">
    <h2>Shows ${list.length ? `<span class="count">${list.length}</span>` : ""}</h2>
    ${legs ? `<p class="muted">${legs} leg${legs === 1 ? "" : "s"} on record.${legs >= 3 && !r.gc ? " <strong>Eligible to apply for a Grand Champion certificate.</strong>" : ""}</p>` : ""}
    <details class="add-record" ${list.length ? "" : ""}><summary>+ Add a show result</summary>
      <form class="form-grid" id="show-form">
        ${field("Date", "show_on", toISO(new Date()), 'type="date" required')}
        ${field("Show", "show_name", "", 'placeholder="e.g. SC State Fair" required')}
        ${field("Class", "class_name", "", 'placeholder="e.g. Senior Doe, Broken"')}
        ${field("Placing", "placing", "", 'placeholder="e.g. 1st, BOV, BOB"')}
        ${field("Exhibitors", "exhibitors", "", 'type="number" min="0" inputmode="numeric"')}
        ${field("Rabbits in class", "entries", "", 'type="number" min="0" inputmode="numeric"')}
        <label class="check"><input type="checkbox" name="leg" value="1"> Earned a leg</label>
        ${field("Notes", "notes", "")}
        <div class="form-actions"><button class="button primary" type="submit">Save</button></div>
      </form>
    </details>
    ${
      list.length
        ? `<ul class="record-list">${list
            .map(
              (s) => `<li><span><strong>${esc(s.placing || "Shown")}</strong>${s.leg ? ` <span class="chip leg">Leg</span>` : ""} <span class="muted">${esc(s.show_name)} · ${fmtDate(s.show_on)}${s.class_name ? ` · ${esc(s.class_name)}` : ""}${
                s.exhibitors || s.entries ? ` · ${s.exhibitors ?? "?"} exhibitors, ${s.entries ?? "?"} rabbits` : ""
              }</span>${s.notes ? `<br><span class="muted">${esc(s.notes)}</span>` : ""}</span>
                <button type="button" class="link-button" data-delete-show="${s.id}" data-leg="${s.leg}" aria-label="Delete this show result">Delete</button></li>`
            )
            .join("")}</ul>`
        : ""
    }
  </section>`;
};

const wireShows = (r) => {
  const form = document.getElementById("show-form");
  // Tick "Earned a leg" when the placing and class size qualify; it can still be changed
  form.addEventListener("input", (e) => {
    if (e.target.name !== "leg") form.leg.checked = earnsLeg(Object.fromEntries(new FormData(form)));
  });
  form.addEventListener("submit", (e) =>
    recordAction(e, r, async (data) => {
      await api("POST", "/api/shows", { ...data, leg: data.leg ? 1 : 0, rabbit_id: r.id });
      if (data.leg) await api("PUT", `/api/rabbits/${r.id}`, { legs: String(legCount(r) + 1) });
    })
  );
  document.querySelectorAll("[data-delete-show]").forEach((b) =>
    b.addEventListener("click", () =>
      recordDelete(r, `/api/shows/${b.dataset.deleteShow}`, "Delete this show result?", async () => {
        if (b.dataset.leg === "1" && legCount(r) > 0) await api("PUT", `/api/rabbits/${r.id}`, { legs: String(legCount(r) - 1) });
      })
    )
  );
};

// ---- For sale: listing a rabbit on the public sale page ----

const saleUrl = () => `${location.origin}/sale`;

const saleSection = (r) => {
  if (r.status !== "herd") return "";
  return `<section class="records" id="sale">
    <h2>For sale</h2>
    <form class="card form" id="sale-form">
      <label class="check"><input type="checkbox" name="for_sale" value="1" ${r.for_sale ? "checked" : ""}> List ${esc(displayName(r))} on the public sale page</label>
      <div class="form-grid">
        ${field("Price", "sale_price", r.sale_price, 'placeholder="e.g. 60"')}
        ${field("Note for buyers", "sale_notes", r.sale_notes, 'placeholder="e.g. Show quality, great temperament"')}
      </div>
      <div class="form-actions"><button class="button primary" type="submit">Save</button>
        ${r.for_sale ? `<a class="button" href="/sale" target="_blank" rel="noopener">View sale page</a>` : ""}</div>
    </form>
  </section>`;
};

const wireSale = (r) => {
  document.getElementById("sale-form")?.addEventListener("submit", (e) =>
    recordAction(e, r, (data) => api("PUT", `/api/rabbits/${r.id}`, { for_sale: data.for_sale ? 1 : 0, sale_price: data.sale_price, sale_notes: data.sale_notes }))
  );
};

// ---- Settings: rabbitry details, sale page, notifications, backups ----

const viewSettings = async () => {
  const s = settings;
  const pushSupported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  const isIos = /iPhone|iPad|iPod/.test(navigator.userAgent);
  app.innerHTML = `
    <h1>Settings</h1>

    <form class="card form" id="settings-form">
      <h2>Rabbitry</h2>
      <p class="muted small">Shown on pedigrees and the public sale page.</p>
      <div class="form-grid">
        ${field("Rabbitry name", "rabbitry", s.rabbitry || DEFAULT_RABBITRY)}
        ${field("Contact name", "contact_name", s.contact_name)}
        ${field("Phone", "phone", s.phone, 'type="tel"')}
        ${field("Email", "email", s.email, 'type="email"')}
        ${field("Location", "location", s.location, 'placeholder="e.g. Pickens, SC"')}
        <label>Time zone<select name="timezone">${["America/New_York", "America/Chicago", "America/Denver", "America/Phoenix", "America/Los_Angeles"]
          .map((z) => `<option ${z === (s.timezone || "America/New_York") ? "selected" : ""}>${z}</option>`)
          .join("")}</select></label>
      </div>
      <label>Sale page introduction<textarea name="sale_intro" rows="3" placeholder="e.g. Quality Rex for show and meat. Pickup in Pickens, SC.">${esc(s.sale_intro)}</textarea></label>
      ${field("Email weekly backups to", "backup_email", s.backup_email, 'type="email"')}
      <div class="form-actions"><button class="button primary" type="submit">Save</button></div>
    </form>

    <section class="card">
      <h2>Public sale page</h2>
      <p>Anyone with this link can see rabbits you've listed for sale (no password), with photos, prices and pedigrees:</p>
      <p><a href="/sale" target="_blank" rel="noopener">${esc(saleUrl())}</a></p>
      <div class="form-actions"><button class="button" type="button" id="share-sale">Share the link</button></div>
      <p class="muted small">${rabbits.filter((r) => r.for_sale && r.status === "herd").length} rabbits listed. List one from its page, under "For sale".</p>
    </section>

    <section class="card">
      <h2>Phone notifications</h2>
      <p>Each morning, a notification lists that day's litter jobs (palpate, nest box, due date, tattooing, weaning) and any withdrawal periods ending.</p>
      ${
        !pushSupported
          ? `<p class="muted">${isIos && !standalone ? "On iPhone, open the app from its home-screen icon first, then turn notifications on here." : "This browser can't receive notifications."}</p>`
          : `<div class="form-actions"><button class="button primary" type="button" id="push-on">Turn on for this phone</button>
             <button class="button" type="button" id="push-test">Send a test</button>
             <button class="button" type="button" id="push-off">Turn off</button></div>`
      }
      <p class="muted small" id="push-status" role="status"></p>
    </section>

    <section class="card">
      <h2>Backups</h2>
      <p>A backup of all records is saved automatically every Sunday (the newest 12 are kept). Photos aren't included in backups.
        Cloudflare also keeps 30 days of history for the database itself.</p>
      <div class="form-actions"><button class="button" type="button" id="backup-now">Back up now</button><a class="button" href="/api/export">Download everything now</a></div>
      <ul class="record-list" id="backup-list"><li class="muted">Loading…</li></ul>
      <p class="muted small">Backups are only emailed once a free Resend API key is added to the app (see the README); until then they're kept here.</p>
    </section>`;

  document.getElementById("settings-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await api("PUT", "/api/settings", Object.fromEntries(new FormData(e.target)));
      await load();
      alert("Saved.");
    } catch (err) {
      alert(err.message);
    }
  });

  document.getElementById("share-sale").addEventListener("click", () =>
    navigator.share ? navigator.share({ title: rabbitry(), url: saleUrl() }).catch(() => {}) : navigator.clipboard?.writeText(saleUrl()).then(() => alert("Link copied."))
  );

  const status = document.getElementById("push-status");
  const say = (text) => (status.textContent = text);
  const currentSub = async () => (await navigator.serviceWorker.ready).pushManager.getSubscription();
  if (pushSupported) {
    currentSub().then((sub) => say(sub ? "Notifications are on for this phone." : "Notifications are off for this phone."));
    document.getElementById("push-on").addEventListener("click", async () => {
      try {
        if ((await Notification.requestPermission()) !== "granted") return say("Notifications weren't allowed. Turn them on in the phone's Settings → Notifications.");
        const { publicKey } = await api("GET", "/api/push/key");
        const reg = await navigator.serviceWorker.ready;
        const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: publicKey }));
        await api("POST", "/api/push/subscribe", sub.toJSON());
        say("Notifications are on for this phone.");
      } catch (err) {
        say(`Couldn't turn notifications on: ${err.message}`);
      }
    });
    document.getElementById("push-test").addEventListener("click", async () => {
      try {
        const { sent, total } = await api("POST", "/api/push/test");
        say(total ? `Test sent to ${sent} of ${total} phone${total === 1 ? "" : "s"}.` : "No phones have notifications turned on yet.");
      } catch (err) {
        say(err.message);
      }
    });
    document.getElementById("push-off").addEventListener("click", async () => {
      const sub = await currentSub();
      if (sub) {
        await api("DELETE", "/api/push/subscribe", { endpoint: sub.endpoint }).catch(() => {});
        await sub.unsubscribe();
      }
      say("Notifications are off for this phone.");
    });
  }

  const showBackups = async () => {
    const list = document.getElementById("backup-list");
    try {
      const backups = await api("GET", "/api/backups");
      list.innerHTML = backups.length
        ? backups
            .map((b) => `<li><span>${fmtDate(b.created_at.slice(0, 10))} <span class="muted">${Math.max(1, Math.round(b.size / 1024))} KB</span></span><a href="/api/backups/${b.id}">Download</a></li>`)
            .join("")
        : `<li class="muted">No backups yet. The first is made on Sunday, or tap "Back up now".</li>`;
    } catch (err) {
      list.innerHTML = `<li class="error">${esc(err.message)}</li>`;
    }
  };
  showBackups();
  document.getElementById("backup-now").addEventListener("click", async () => {
    try {
      await api("POST", "/api/backups");
      showBackups();
    } catch (err) {
      alert(err.message);
    }
  });
};

// ---- Add and edit ----

const parentOptions = (sex, selected, excludeId) =>
  `<option value="">Unknown</option>` +
  rabbits
    .filter((x) => x.id !== excludeId && (x.sex === sex || !x.sex || x.id === selected))
    .sort(byName)
    .map((x) => `<option value="${x.id}" ${x.id === selected ? "selected" : ""}>${esc(displayName(x))}${x.ear && x.name ? ` (${esc(x.ear)})` : ""}</option>`)
    .join("");

const field = (label, name, value, attrs = "") =>
  `<label>${label}<input name="${name}" value="${esc(value)}" ${attrs}></label>`;

const viewForm = (id, params) => {
  const existing = id ? byId.get(id) : null;
  if (id && !existing) return notFound();
  // Coming from an empty pedigree slot: the new rabbit becomes that child's sire or dam
  const child = byId.get(Number(params.get("child")));
  const role = params.get("as");
  const r = existing || {
    name: "", ear: "", tattoo: "", cage: "", sex: role === "sire" ? "buck" : role === "dam" ? "doe" : "", breed: "Rex", color: "", genotype: "", weight: "",
    dob: "", reg: "", gc: "", legs: "", breeder: "", status: child ? "ancestor" : "herd", acquired: "", notes: "", sire_id: null, dam_id: null,
  };

  app.innerHTML = `
    <h1>${existing ? `Edit ${esc(displayName(existing))}` : child ? `Add ${role} of ${esc(displayName(child))}` : "Add a rabbit"}</h1>
    ${existing || child ? "" : `<p class="muted">Have a paper pedigree? <a href="#/scan">Scan it instead</a> to add the rabbit and its ancestors in one go.</p>`}
    <form class="card form" id="rabbit-form">
      <div class="form-grid">
        ${field("Name", "name", r.name, 'autocomplete="off"')}
        ${field("Ear #", "ear", r.ear, 'autocomplete="off"')}
        ${field("Tattoo", "tattoo", r.tattoo, 'autocomplete="off"')}
        ${field("Cage / hutch", "cage", r.cage, 'autocomplete="off"')}
        <label>Sex<select name="sex">
          <option value="" ${!r.sex ? "selected" : ""}>Not sexed yet</option>
          <option value="buck" ${r.sex === "buck" ? "selected" : ""}>Buck</option>
          <option value="doe" ${r.sex === "doe" ? "selected" : ""}>Doe</option>
        </select></label>
        <label>Status<select name="status">
          ${Object.entries(STATUS_LABELS).map(([v, l]) => `<option value="${v}" ${v === r.status ? "selected" : ""}>${l}</option>`).join("")}
        </select></label>
        ${field("Breed", "breed", r.breed)}
        ${field("Color", "color", r.color, 'list="colors"')}
        ${field("Genotype", "genotype", r.genotype, 'placeholder="e.g. A_ B_ C_ D_ E_"')}
        ${field("Weight", "weight", r.weight, 'placeholder="e.g. 8 lbs 4 oz"')}
        ${field("Born", "dob", r.dob, 'type="date"')}
        ${field("Acquired", "acquired", r.acquired, 'type="date"')}
        ${field("Breeder", "breeder", r.breeder, 'list="breeders"')}
        ${field("Registration #", "reg", r.reg)}
        ${field("Grand champion #", "gc", r.gc)}
        ${field("Legs", "legs", r.legs, 'inputmode="numeric"')}
        <label>Sire<select name="sire_id">${parentOptions("buck", r.sire_id, existing?.id)}</select></label>
        <label>Dam<select name="dam_id">${parentOptions("doe", r.dam_id, existing?.id)}</select></label>
      </div>
      <div class="form-grid" id="left-fields">
        <label>What happened<select name="left_reason">
          <option value="">—</option>
          ${Object.keys(RETIRE_REASONS).map((x) => `<option ${x === r.left_reason ? "selected" : ""}>${x}</option>`).join("")}
        </select></label>
        ${field("Left the herd on", "left_on", r.left_on || "", 'type="date"')}
        ${field("Sold to / new owner", "left_to", r.left_to || "")}
        ${field("Price", "price", r.price || "", 'inputmode="decimal"')}
      </div>
      <label>Notes<textarea name="notes" rows="3">${esc(r.notes)}</textarea></label>
      <datalist id="colors">${[...new Set(rabbits.map((x) => x.color).filter(Boolean))].sort().map((c) => `<option value="${esc(c)}">`).join("")}</datalist>
      <datalist id="breeders">${[...new Set(rabbits.map((x) => x.breeder).filter(Boolean))].sort().map((c) => `<option value="${esc(c)}">`).join("")}</datalist>
      <p class="error" id="form-error" role="alert" hidden></p>
      <div class="form-actions">
        <button class="button primary" type="submit">Save</button>
        <a class="button" href="${existing ? `#/rabbit/${existing.id}` : child ? `#/rabbit/${child.id}` : "#/"}">Cancel</a>
        ${existing ? `<button class="button danger" type="button" id="delete">Delete</button>` : ""}
      </div>
    </form>`;

  const form = document.getElementById("rabbit-form");
  const error = document.getElementById("form-error");
  const syncLeft = () => (document.getElementById("left-fields").hidden = !["sold", "deceased"].includes(form.status.value));
  form.status.addEventListener("change", syncLeft);
  syncLeft();
  const fail = (err) => {
    error.textContent = err.message;
    error.hidden = false;
  };

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    if (!data.name.trim() && !data.ear.trim()) return fail(new Error("Give the rabbit a name or an ear number."));
    try {
      const saved = existing ? await api("PUT", `/api/rabbits/${existing.id}`, data) : await api("POST", "/api/rabbits", data);
      if (child) await api("PUT", `/api/rabbits/${child.id}`, { [role === "dam" ? "dam_id" : "sire_id"]: saved.id });
      await load();
      location.hash = `#/rabbit/${child ? child.id : saved.id}`;
    } catch (err) {
      fail(err);
    }
  });

  document.getElementById("delete")?.addEventListener("click", async () => {
    const kids = children(existing).length;
    const warning = kids ? `\n\n${kids} rabbit${kids > 1 ? "s list" : " lists"} them as a parent; that will become "Unknown".` : "";
    if (!confirm(`Delete ${displayName(existing)} for good?${warning}\n\nIf they were sold or died, you can change their status instead.`)) return;
    try {
      await api("DELETE", `/api/rabbits/${existing.id}`);
      await load();
      location.hash = "#/";
    } catch (err) {
      fail(err);
    }
  });
};

// ---- Litters ----

const dueText = (l) => {
  if (l.kindled_on) return `Kindled ${fmtDate(l.kindled_on)}`;
  if (!l.bred_on) return "";
  const due = addDays(l.bred_on, GESTATION_DAYS);
  const n = daysUntil(due);
  return `Due ${fmtDate(due)} <span class="muted">(${n > 1 ? `in ${n} days` : n === 1 ? "tomorrow" : n === 0 ? "today" : `${-n} days ago`})</span>`;
};

const litterTable = (list) => `<div class="table-wrap"><table>
  <thead><tr><th>Dam</th><th>Sire</th><th>Bred</th><th>Kindling</th><th>Born</th><th>Alive</th><th>COI</th><th></th></tr></thead>
  <tbody>${list
    .slice()
    .sort((a, b) => (b.bred_on || b.kindled_on || "").localeCompare(a.bred_on || a.kindled_on || ""))
    .map((l) => {
      const dam = byId.get(l.dam_id);
      const sire = byId.get(l.sire_id);
      const kits = rabbits.filter((r) => r.litter_id === l.id).length;
      return `<tr>
        <td>${dam ? `<a href="#/rabbit/${dam.id}">${esc(displayName(dam))}</a>` : "—"}</td>
        <td>${sire ? `<a href="#/rabbit/${sire.id}">${esc(displayName(sire))}</a>` : "—"}</td>
        <td>${fmtDate(l.bred_on)}</td><td>${dueText(l)}</td><td>${l.born ?? ""}</td><td>${l.alive ?? ""}</td>
        <td>${fmtCoi(coi(l.sire_id, l.dam_id))}</td>
        <td class="row-actions"><a href="#/litters/${l.id}">Edit</a>${kits ? ` · ${kits} kit${kits > 1 ? "s" : ""}` : ""}</td></tr>`;
    })
    .join("")}</tbody></table></div>`;

const viewLitters = () => {
  app.innerHTML = `
    <div class="title-row"><h1>Litters</h1><div class="actions"><a class="button primary" href="#/litters/new">+ Record a breeding</a></div></div>
    ${litters.length ? litterTable(litters) : `<p class="muted">No breedings recorded yet.</p>`}
    <p class="muted small">Due dates assume ${GESTATION_DAYS} days from breeding.</p>`;
};

const litterChecklist = (l) => {
  const steps = litterSteps(l);
  if (!steps.length) return "";
  return `<section class="card"><h2>Checklist</h2><ul class="checklist">${steps
    .map(
      (s) => `<li><label class="check"><input type="checkbox" data-step="${s.key}" ${s.done ? "checked" : ""}>
        <span>${s.label} <span class="muted">${fmtDate(s.date)}</span></span></label></li>`
    )
    .join("")}</ul><p class="muted small">Dates count from breeding (palpate day 14, nest box day 28, due day ${GESTATION_DAYS}) and from kindling (tattoo week 6, wean week 8). Ticked jobs drop off the reminders.</p></section>`;
};

const weighKits = (kits) => `<section class="card">
  <h2>Weigh the kits</h2>
  <form class="form" id="weigh-form">
    ${field("Date", "weighed_on", toISO(new Date()), 'type="date" required')}
    <table class="weigh-table"><thead><tr><th>Kit</th><th>Last</th><th>lbs</th><th>oz</th></tr></thead><tbody>${kits
      .map((k) => {
        const last = weightsOf(k).at(-1);
        return `<tr><td><a href="#/rabbit/${k.id}">${esc(displayName(k))}</a></td><td class="muted">${last ? fmtWeight(last.weight_oz) : "—"}</td>
          <td><input name="lbs-${k.id}" type="number" min="0" inputmode="numeric" aria-label="${esc(displayName(k))} pounds"></td>
          <td><input name="oz-${k.id}" type="number" min="0" max="15.9" step="0.1" inputmode="decimal" aria-label="${esc(displayName(k))} ounces"></td></tr>`;
      })
      .join("")}</tbody></table>
    <div class="form-actions"><button class="button primary" type="submit">Save weights</button></div>
  </form>
</section>`;

const viewLitterForm = (id) => {
  const existing = id ? litters.find((l) => l.id === id) : null;
  if (id && !existing) return notFound();
  const l = existing || { sire_id: null, dam_id: null, bred_on: toISO(new Date()), kindled_on: "", born: null, alive: null, notes: "" };
  const herdFirst = (sex, selected) => {
    const list = rabbits.filter((r) => r.sex === sex && (r.status === "herd" || r.id === selected)).sort(byName);
    return `<option value="">Choose…</option>` + list.map((r) => `<option value="${r.id}" ${r.id === selected ? "selected" : ""}>${esc(displayName(r))}</option>`).join("");
  };
  const kits = existing ? rabbits.filter((r) => r.litter_id === existing.id) : [];

  app.innerHTML = `
    <h1>${existing ? "Edit litter" : "Record a breeding"}</h1>
    <form class="card form" id="litter-form">
      <div class="form-grid">
        <label>Doe<select name="dam_id" required>${herdFirst("doe", l.dam_id)}</select></label>
        <label>Buck<select name="sire_id" required>${herdFirst("buck", l.sire_id)}</select></label>
        ${field("Bred on", "bred_on", l.bred_on, 'type="date"')}
        ${field("Kindled on", "kindled_on", l.kindled_on, 'type="date"')}
        ${field("Kits born", "born", l.born ?? "", 'type="number" min="0"')}
        ${field("Kits alive", "alive", l.alive ?? "", 'type="number" min="0"')}
      </div>
      <p class="muted" id="litter-coi"></p>
      <label>Notes<textarea name="notes" rows="3">${esc(l.notes)}</textarea></label>
      <p class="error" id="form-error" role="alert" hidden></p>
      <div class="form-actions">
        <button class="button primary" type="submit">Save</button>
        <a class="button" href="#/litters">Cancel</a>
        ${existing ? `<button class="button" type="button" id="add-kits">Add kits to the herd</button><button class="button danger" type="button" id="delete">Delete</button>` : ""}
      </div>
    </form>
    ${existing ? litterChecklist(existing) : ""}
    ${kits.length ? `<section><h2>Kits <span class="count">${kits.length}</span></h2><div class="grid">${kits.map(rabbitCard).join("")}</div></section>` : ""}
    ${kits.filter((k) => k.status === "herd").length ? weighKits(kits.filter((k) => k.status === "herd")) : ""}`;

  const form = document.getElementById("litter-form");
  const error = document.getElementById("form-error");
  const fail = (err) => {
    error.textContent = err.message;
    error.hidden = false;
  };
  const showCoi = () => {
    const s = Number(form.sire_id.value);
    const d = Number(form.dam_id.value);
    document.getElementById("litter-coi").textContent = s && d ? `Kits from this pairing: ${fmtCoi(coi(s, d))} inbreeding (COI) from known ancestors.` : "";
  };
  form.addEventListener("change", showCoi);
  showCoi();
  app.querySelectorAll("[data-step]").forEach((box) =>
    box.addEventListener("change", async () => {
      const done = new Set(String(existing.done || "").split(",").filter(Boolean));
      box.checked ? done.add(box.dataset.step) : done.delete(box.dataset.step);
      try {
        await api("PUT", `/api/litters/${existing.id}`, { done: [...done].join(",") });
        await load();
        viewLitterForm(existing.id);
      } catch (err) {
        alert(err.message);
      }
    })
  );
  document.getElementById("weigh-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    try {
      for (const kit of kits) {
        const oz = ozFrom(data[`lbs-${kit.id}`], data[`oz-${kit.id}`]);
        if (oz > 0) await saveWeight(kit, data.weighed_on, oz);
      }
      await load();
      viewLitterForm(existing.id);
    } catch (err) {
      alert(err.message);
    }
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    try {
      existing ? await api("PUT", `/api/litters/${existing.id}`, data) : await api("POST", "/api/litters", data);
      await load();
      location.hash = "#/litters";
    } catch (err) {
      fail(err);
    }
  });

  document.getElementById("add-kits")?.addEventListener("click", async () => {
    const data = Object.fromEntries(new FormData(form));
    const suggested = data.alive || data.born || "";
    const n = Number(prompt("How many kits should be added to the herd? You can name, sex and edit each one afterward.", suggested));
    if (!Number.isInteger(n) || n < 1 || n > 20) return;
    try {
      const dam = byId.get(Number(data.dam_id));
      for (let i = 1; i <= n; i++) {
        await api("POST", "/api/rabbits", {
          name: `${displayName(dam)} kit ${kits.length + i}`,
          sire_id: data.sire_id,
          dam_id: data.dam_id,
          litter_id: existing.id,
          dob: data.kindled_on,
          breeder: rabbitry(),
          status: "herd",
        });
      }
      await load();
      viewLitterForm(existing.id);
    } catch (err) {
      fail(err);
    }
  });

  document.getElementById("delete")?.addEventListener("click", async () => {
    if (!confirm("Delete this litter record? Any kits added from it stay in the herd.")) return;
    try {
      await api("DELETE", `/api/litters/${existing.id}`);
      await load();
      location.hash = "#/litters";
    } catch (err) {
      fail(err);
    }
  });
};

// ---- Plan a pairing: the would-be litter's pedigree and inbreeding before you breed ----

const viewPair = (params) => {
  const sireId = Number(params.get("buck")) || null;
  const damId = Number(params.get("doe")) || null;
  const options = (sex, selected) =>
    `<option value="">Choose…</option>` +
    rabbits
      .filter((r) => r.sex === sex && r.status === "herd")
      .sort(byName)
      .map((r) => `<option value="${r.id}" ${r.id === selected ? "selected" : ""}>${esc(displayName(r))}</option>`)
      .join("");

  let result = "";
  if (sireId && damId) {
    const kit = { id: 0, name: "Planned litter", sex: "", sire_id: sireId, dam_id: damId };
    const cols = pedigreeColumns(kit);
    const f = coi(sireId, damId);
    const level = f === 0 ? "none" : f < 0.0625 ? "low" : f < 0.125 ? "moderate" : "high";
    const levelText = {
      none: "No shared ancestors are known.",
      low: "A little linebreeding.",
      moderate: "Linebred: roughly like breeding first cousins or closer.",
      high: "Closely inbred: half siblings or closer.",
    }[level];
    result = `
      <section class="card coi ${level}"><h2>${fmtCoi(f)} inbreeding (COI)</h2><p>${levelText} Calculated from every ancestor on record.</p></section>
      ${sharedAncestorsNote(cols)}
      <div class="tree-scroll">${pedigreeTree(kit)}</div>`;
  }

  app.innerHTML = `
    <h1>Plan a pairing</h1>
    <p class="muted">Pick a buck and a doe from the herd to see what their kits' pedigree would look like.</p>
    <form class="filters" id="pair-form">
      <label>Buck<select name="buck">${options("buck", sireId)}</select></label>
      <label>Doe<select name="doe">${options("doe", damId)}</select></label>
      ${sireId && damId ? `<a class="button" href="#/litters/new?buck=${sireId}&doe=${damId}">Record this breeding</a>` : ""}
    </form>
    ${result}`;

  document.getElementById("pair-form").addEventListener("change", (e) => {
    const p = new URLSearchParams(new FormData(e.currentTarget));
    [...p].forEach(([k, v]) => !v && p.delete(k));
    location.hash = `#/pair${p.size ? "?" + p : ""}`;
  });
};

// ---- Scan a paper pedigree: photo → Workers AI reads it → review and fix → save the rabbit and its ancestors ----

// Slot codes match src/scan.js: S = sire, D = dam, so "SD" is the sire's dam
const SCAN_SLOTS = ["self", "S", "D", "SS", "SD", "DS", "DD", "SSS", "SSD", "SDS", "SDD", "DSS", "DSD", "DDS", "DDD"];
const SCAN_FIELDS = [
  ["name", "Name"], ["ear", "Ear #"], ["color", "Color"], ["genotype", "Genotype"], ["weight", "Weight"],
  ["dob", "Born", 'type="date"'], ["reg", "Reg #"], ["gc", "GC #"], ["legs", "Legs"], ["breeder", "Breeder"],
];
const parentSlots = (slot) => (slot === "self" ? ["S", "D"] : [slot + "S", slot + "D"]);
const slotLabel = (slot) =>
  slot === "self" ? "This rabbit" : [...slot].map((c, i) => (c === "S" ? "sire" : "dam") + (i < slot.length - 1 ? "'s" : "")).join(" ").replace(/^./, (c) => c.toUpperCase());
const slotSex = (slot, r) => (slot === "self" ? r?.sex || "" : slot.endsWith("S") ? "buck" : "doe");

let scan = null; // { photo, result, phase, error } while a scan is in progress

const normEar = (v) => String(v || "").toUpperCase().replace(/\s+/g, "");
// Rabbits already on file that look like this one: same ear number, or same name when ears don't conflict
const findMatches = (r) => {
  if (!r) return [];
  const ear = normEar(r.ear);
  const name = r.name.trim().toLowerCase();
  return rabbits
    .filter((x) => {
      const xEar = normEar(x.ear);
      if (ear && xEar) return ear === xEar;
      return name && x.name.trim().toLowerCase() === name;
    })
    .slice(0, 3);
};

// Shrinks the photo (and turns it upright) so it uploads quickly
const photoToDataUrl = async (file) => {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
  const canvas = Object.assign(document.createElement("canvas"), { width: Math.round(bitmap.width * scale), height: Math.round(bitmap.height * scale) });
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.85);
};

const viewScan = () => {
  if (!scan || scan.phase === "pick") {
    app.innerHTML = `
      <h1>Scan a pedigree</h1>
      <section class="card scan-start">
        <p>Take a photo of a paper pedigree, or pick one from your photos. The app reads it and fills in the rabbit and all its ancestors for you to check before anything is saved.</p>
        <label class="button primary big-button">📷 Take or choose a photo<input type="file" id="scan-file" accept="image/*" hidden></label>
        <ul class="muted small tips">
          <li>Lay the page flat in good light, and fill the frame with it.</li>
          <li>Sideways is fine. Glare and shadows across the text are not.</li>
          <li>Several pedigrees on one page? Scan them one at a time.</li>
        </ul>
        ${scan?.error ? `<p class="error">${esc(scan.error)}</p>` : ""}
      </section>`;
    document.getElementById("scan-file").addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        scan = { phase: "reading", photo: await photoToDataUrl(file) };
      } catch {
        scan = { phase: "pick", error: "Couldn't open that photo. Try taking it again." };
        return viewScan();
      }
      viewScan();
      try {
        const result = await api("POST", "/api/scan", { image: scan.photo });
        if (!result.self) throw new Error("No rabbit was found on that page. Try a closer, sharper photo.");
        scan = { ...scan, phase: "review", result };
      } catch (err) {
        scan = { phase: "pick", error: err.message };
      }
      if (location.hash.startsWith("#/scan")) viewScan();
    });
    return;
  }

  if (scan.phase === "reading" || scan.phase === "saving") {
    app.innerHTML = `
      <h1>Scan a pedigree</h1>
      <section class="card scan-reading">
        <img class="scan-photo" src="${scan.photo}" alt="Your pedigree photo">
        <p><span class="spinner" aria-hidden="true"></span> ${scan.phase === "saving" ? "Saving…" : "Reading the pedigree… this can take up to a minute."}</p>
      </section>`;
    return;
  }

  const { result } = scan;
  const found = SCAN_SLOTS.filter((s) => result[s]);
  const card = (slot) => {
    const r = result[slot];
    if (!r) return `<div class="scan-slot empty"><strong>${slotLabel(slot)}</strong> <span class="muted">not on the pedigree</span></div>`;
    const matches = findMatches(r);
    const choice = `<select name="${slot}:action" class="scan-action" aria-label="What to do with ${slotLabel(slot)}">
        ${matches.map((m, i) => `<option value="${m.id}" ${i === 0 ? "selected" : ""}>Use ${esc(displayName(m))}${m.ear ? ` (${esc(m.ear)})` : ""}, already on file</option>`).join("")}
        <option value="new" ${matches.length ? "" : "selected"}>Add as a new rabbit</option>
        ${slot === "self" ? "" : `<option value="skip">Leave out</option>`}
      </select>`;
    const extra =
      slot === "self"
        ? `<label>Sex<select name="self:sex"><option value="">Not sure</option><option value="buck" ${r.sex === "buck" ? "selected" : ""}>Buck</option><option value="doe" ${r.sex === "doe" ? "selected" : ""}>Doe</option></select></label>
           <label>Add to<select name="self:status"><option value="herd">My herd</option><option value="ancestor">Pedigree only</option></select></label>
           ${field("Tattoo", "self:tattoo", "")}
           ${field("Acquired", "self:acquired", "", 'type="date"')}`
        : "";
    // Name, ear, color and birth date always show; other fields only when the scan found something
    const value = (f) => (f === "breeder" && slot === "self" ? r.breeder || result.breeder : r[f]);
    const input = ([f, label, attrs = ""]) => field(label, `${slot}:${f}`, value(f), attrs);
    const shown = SCAN_FIELDS.filter(([f]) => ["name", "ear", "color", "dob"].includes(f) || value(f));
    const hidden = SCAN_FIELDS.filter((x) => !shown.includes(x));
    return `<div class="scan-slot card ${slot === "self" ? "self" : slotSex(slot)}" data-slot="${slot}">
      <div class="scan-slot-head"><strong>${slotLabel(slot)}</strong>${choice}</div>
      <div class="scan-fields">
        <div class="scan-grid">${shown.map(input).join("")}${extra}</div>
        ${hidden.length ? `<details class="scan-more"><summary>More details</summary><div class="scan-grid">${hidden.map(input).join("")}</div></details>` : ""}
      </div>
    </div>`;
  };

  app.innerHTML = `
    <h1>Check the scan</h1>
    <p class="muted">Found ${found.length} of 15 rabbits. Fix anything misread, then save. Ancestors already on file are matched so they aren't added twice.</p>
    <details class="card scan-photo-box"><summary>Show the photo</summary><img class="scan-photo" src="${scan.photo}" alt="Your pedigree photo"></details>
    <form id="scan-form" class="scan-form">
      ${card("self")}
      <h2>Parents</h2>${["S", "D"].map(card).join("")}
      <h2>Grandparents</h2>${["SS", "SD", "DS", "DD"].map(card).join("")}
      <h2>Great-grandparents</h2>${["SSS", "SSD", "SDS", "SDD", "DSS", "DSD", "DDS", "DDD"].map(card).join("")}
      <label class="check"><input type="checkbox" name="keep-photo" checked> Keep this pedigree photo with the rabbit</label>
      <p class="error" id="scan-error" role="alert" hidden></p>
      <div class="form-actions sticky-actions">
        <button class="button primary" type="submit">Save</button>
        <button class="button" type="button" id="scan-again">Scan again</button>
        <a class="button" href="#/">Cancel</a>
      </div>
    </form>`;

  const form = document.getElementById("scan-form");
  // Fields only matter for rabbits being added new
  const sync = () =>
    form.querySelectorAll(".scan-slot[data-slot]").forEach((el) => {
      const action = form.elements[`${el.dataset.slot}:action`].value;
      el.querySelector(".scan-fields").hidden = action !== "new";
      el.classList.toggle("skipped", action === "skip");
    });
  form.addEventListener("change", sync);
  sync();
  document.getElementById("scan-again").addEventListener("click", () => {
    scan = null;
    viewScan();
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    const ids = {};
    const madeThisScan = new Map(); // the same ancestor can appear twice in one pedigree
    const photo = scan.photo;
    scan = { ...scan, phase: "saving" };
    viewScan();
    try {
      // Oldest generation first, so each rabbit's sire and dam already have ids
      for (const slot of [...SCAN_SLOTS].reverse()) {
        const action = data[`${slot}:action`];
        if (!action || action === "skip") continue;
        const [sireId, damId] = parentSlots(slot).map((p) => ids[p] ?? null);
        if (action !== "new") {
          const existing = byId.get(Number(action));
          ids[slot] = existing.id;
          // Fill in parents the existing record is missing, never replace ones it has
          const fill = {};
          if (!existing.sire_id && sireId && sireId !== existing.id) fill.sire_id = sireId;
          if (!existing.dam_id && damId && damId !== existing.id) fill.dam_id = damId;
          if (Object.keys(fill).length) await api("PUT", `/api/rabbits/${existing.id}`, fill).catch(() => {});
          continue;
        }
        const fields = Object.fromEntries(SCAN_FIELDS.map(([f]) => [f, data[`${slot}:${f}`] || ""]));
        const key = normEar(fields.ear) || fields.name.trim().toLowerCase();
        if (key && madeThisScan.has(key)) {
          ids[slot] = madeThisScan.get(key);
          continue;
        }
        const saved = await api("POST", "/api/rabbits", {
          ...fields,
          sex: slot === "self" ? data["self:sex"] : slotSex(slot),
          status: slot === "self" ? data["self:status"] : "ancestor",
          tattoo: slot === "self" ? data["self:tattoo"] : "",
          acquired: slot === "self" ? data["self:acquired"] : "",
          notes: slot === "self" ? `Added from a scanned pedigree on ${fmtDate(toISO(new Date()))}.` : "",
          sire_id: sireId,
          dam_id: damId,
        });
        ids[slot] = saved.id;
        if (key) madeThisScan.set(key, saved.id);
      }
      if (data["keep-photo"] && ids.self) {
        const blob = await (await fetch(photo)).blob();
        await uploadPhoto(ids.self, blob, { takenOn: toISO(new Date()), caption: "Scanned pedigree", kind: "pedigree" }).catch(() => {});
      }
      await load();
      scan = null;
      location.hash = `#/rabbit/${ids.self}`;
    } catch (err) {
      // Anything saved before the error stays; the review screen comes back so nothing typed is lost
      await load().catch(() => {});
      scan = { ...scan, phase: "review", photo };
      viewScan();
      const error = document.getElementById("scan-error");
      error.textContent = `${err.message} Some rabbits may already have been saved; check All rabbits before saving again.`;
      error.hidden = false;
    }
  });
};

const notFound = () => {
  app.innerHTML = `<h1>Not found</h1><p><a href="#/">Back to the herd</a></p>`;
};

// ---- Routing ----

const route = () => {
  const [path, query = ""] = location.hash.replace(/^#/, "").split("?");
  const params = new URLSearchParams(query);
  const parts = path.split("/").filter(Boolean);
  const section = parts[0] || "herd";

  document.querySelectorAll("[data-nav]").forEach((a) => a.classList.toggle("active", a.dataset.nav === section));
  document.querySelector(".menu")?.removeAttribute("open");

  if (section === "herd") viewHerd(params);
  else if (section === "all") viewAll(params);
  else if (section === "pair") viewPair(params);
  else if (section === "new") viewForm(null, params);
  else if (section === "scan") viewScan();
  else if (section === "settings") viewSettings();
  else if (section === "rabbit" && parts[2] === "edit") viewForm(Number(parts[1]), params);
  else if (section === "rabbit") viewRabbit(Number(parts[1]));
  else if (section === "litters" && parts[1] === "new") {
    viewLitterForm(null);
    // Arriving from "Plan a pairing" with the buck and doe already picked
    const form = document.getElementById("litter-form");
    if (params.get("buck")) form.sire_id.value = params.get("buck");
    if (params.get("doe")) form.dam_id.value = params.get("doe");
    form.dispatchEvent(new Event("change"));
  } else if (section === "litters" && parts[1]) viewLitterForm(Number(parts[1]));
  else if (section === "litters") viewLitters();
  else notFound();

  if (!/^(all)$/.test(section)) window.scrollTo(0, 0);
};

document.getElementById("logout").addEventListener("click", async () => {
  await fetch("/api/logout", { method: "POST" }).catch(() => {});
  // Don't leave a saved copy of the herd behind on a shared phone
  if ("caches" in window) await Promise.all((await caches.keys()).map((k) => caches.delete(k)));
  location.href = "/login";
});

window.addEventListener("hashchange", route);

// Back from no signal: pick up anything that changed and drop the offline notice
window.addEventListener("online", () => load().then(route).catch(() => {}));

if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});

load()
  .then(route)
  .catch((err) => {
    if (err.message !== "Signed out") app.innerHTML = `<p class="error">Couldn't load the herd: ${esc(err.message)}</p>`;
  });
