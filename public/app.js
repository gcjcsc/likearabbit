// MCF herd and pedigree app: loads every rabbit and litter once, renders views by URL hash, and saves through /api

const app = document.getElementById("app");
const printArea = document.getElementById("print");

const GESTATION_DAYS = 31;
const STATUS_LABELS = { herd: "In the herd", ancestor: "Pedigree only", sold: "Sold", deceased: "Deceased" };

let rabbits = [];
let litters = [];
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
  ({ rabbits, litters } = await api("GET", "/api/data"));
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
  return `<a class="card rabbit-card ${r.sex}" href="#/rabbit/${r.id}">
    <div class="card-head"><strong>${esc(displayName(r))}</strong>${r.ear && r.name ? `<span class="chip">${esc(r.ear)}</span>` : ""}</div>
    <div>${esc([sexLabel(r), r.color].filter(Boolean).join(" · "))}</div>
    <div class="muted">${esc([r.dob && `${age(r.dob)} old`, r.breeder].filter(Boolean).join(" · "))}</div>
    ${sire || dam ? `<div class="muted small">${esc(displayName(sire))} × ${esc(displayName(dam))}</div>` : ""}
  </a>`;
};

const viewHerd = () => {
  const herd = rabbits.filter((r) => r.status === "herd").sort(byName);
  const group = (label, list) =>
    list.length ? `<section><h2>${label} <span class="count">${list.length}</span></h2><div class="grid">${list.map(rabbitCard).join("")}</div></section>` : "";
  const upcoming = litters
    .filter((l) => l.bred_on && !l.kindled_on && daysUntil(addDays(l.bred_on, GESTATION_DAYS)) >= -7)
    .sort((a, b) => a.bred_on.localeCompare(b.bred_on));
  const dueList = upcoming.length
    ? `<section class="card due"><h2>Due soon</h2><ul>${upcoming
        .map((l) => `<li><a href="#/litters">${esc(displayName(byId.get(l.dam_id)))}</a> · ${dueText(l)}</li>`)
        .join("")}</ul></section>`
    : "";
  app.innerHTML = `
    <h1>Herd</h1>
    ${dueList}
    ${group("Bucks", herd.filter((r) => r.sex === "buck"))}
    ${group("Does", herd.filter((r) => r.sex === "doe"))}
    ${group("Not sexed yet", herd.filter((r) => !r.sex))}
    ${herd.length ? "" : `<p class="muted">No rabbits in the herd yet. <a href="#/new">Add one</a>.</p>`}`;
};

const viewAll = (params) => {
  const q = params.get("q") || "";
  const status = params.get("status") || "";
  const needle = q.toLowerCase();
  const list = rabbits
    .filter((r) => !status || r.status === status)
    .filter((r) => !needle || [r.name, r.ear, r.color, r.breeder].some((v) => v.toLowerCase().includes(needle)))
    .sort(byName);
  app.innerHTML = `
    <h1>All rabbits</h1>
    <form class="filters" id="filters">
      <input type="search" name="q" value="${esc(q)}" placeholder="Search name, ear #, color, breeder" aria-label="Search">
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
            <td>${esc(r.color)}</td><td>${fmtDate(r.dob)}</td><td>${esc(r.breeder)}</td><td>${STATUS_LABELS[r.status]}</td></tr>`
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
          <span class="chip">${STATUS_LABELS[r.status]}</span>
          ${r.ear ? `<span class="chip">Ear ${esc(r.ear)}</span>` : ""}
        </p>
      </div>
      <div class="actions">
        <a class="button" href="#/rabbit/${r.id}/edit">Edit</a>
        <button class="button" type="button" id="print-btn">Print pedigree</button>
      </div>
    </div>

    <section class="card">
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

  document.getElementById("print-btn").addEventListener("click", () => printPedigree(r));
};

// ---- Printing: a classic landscape four-generation pedigree ----

const printPedigree = (r) => {
  const cols = pedigreeColumns(r);
  const counts = repeatsIn(cols);
  const box = (x, role) =>
    x
      ? `<div class="pbox ${x.sex}"><strong>${esc(displayName(x))}</strong>
          ${[
            ["Ear #", x.ear],
            ["Color", x.color],
            ["Genotype", x.genotype],
            ["Weight", x.weight],
            ["DOB", fmtDate(x.dob)],
            ["Reg #", x.reg],
            ["GC #", x.gc],
            ["Legs", x.legs],
          ]
            .filter(([, v]) => v)
            .map(([k, v]) => `<span>${k}: ${esc(v)}</span>`)
            .join("")}
          ${counts.get(x.id) > 1 && x !== r ? `<span class="repeat">×${counts.get(x.id)}</span>` : ""}</div>`
      : `<div class="pbox empty"><span>${role}</span></div>`;
  printArea.innerHTML = `
    <div class="psheet">
      <header>
        <div><h1>MCF Rabbitry</h1><p>${esc(r.breed || "Rex")} Pedigree</p></div>
        <div class="pid">${esc(r.ear || "")}</div>
      </header>
      <div class="ptree">
        ${cols
          .map((col, g) => `<div class="pcol">${col.map((x, i) => box(x, g === 0 ? "" : i % 2 ? "Dam" : "Sire")).join("")}</div>`)
          .join("")}
      </div>
      <footer>
        <div>
          <p>Name: <strong>${esc(displayName(r))}</strong> · Sex: ${sexLabel(r) || "—"} · Born: ${fmtDate(r.dob) || "—"}${r.sire_id && r.dam_id ? ` · COI: ${fmtCoi(coi(r.sire_id, r.dam_id))}` : ""}</p>
          <p>Breeder: ${esc(r.breeder || "—")} · Owner: MCF Rabbitry</p>
        </div>
        <p class="sign">I certify that this pedigree is correct to the best of my knowledge.<br>Signed ______________________ Date ___________</p>
      </footer>
    </div>`;
  window.print();
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
    name: "", ear: "", sex: role === "sire" ? "buck" : role === "dam" ? "doe" : "", breed: "Rex", color: "", genotype: "", weight: "",
    dob: "", reg: "", gc: "", legs: "", breeder: "", status: child ? "ancestor" : "herd", acquired: "", notes: "", sire_id: null, dam_id: null,
  };

  app.innerHTML = `
    <h1>${existing ? `Edit ${esc(displayName(existing))}` : child ? `Add ${role} of ${esc(displayName(child))}` : "Add a rabbit"}</h1>
    <form class="card form" id="rabbit-form">
      <div class="form-grid">
        ${field("Name", "name", r.name, 'autocomplete="off"')}
        ${field("Ear #", "ear", r.ear, 'autocomplete="off"')}
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
    ${kits.length ? `<section><h2>Kits <span class="count">${kits.length}</span></h2><div class="grid">${kits.map(rabbitCard).join("")}</div></section>` : ""}`;

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
          breeder: "MCF Rabbitry",
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

  if (section === "herd") viewHerd();
  else if (section === "all") viewAll(params);
  else if (section === "pair") viewPair(params);
  else if (section === "new") viewForm(null, params);
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
