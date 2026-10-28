// The public sale page: rabbits marked for sale, with photos, prices, contact buttons and pedigree PDFs

import { pedigreePdf } from "./pedigree-pdf.js";

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const displayName = (r) => (r ? r.name || r.ear || "Unnamed" : "Unknown");
const fmtDate = (iso) => (iso ? new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "");
const photoUrl = (id, thumb) => `/api/public/photos/${id}${thumb ? "/thumb" : ""}`;
const price = (p) => (p ? (/^\d/.test(p) ? `$${p}` : p) : "");
const age = (dob) => {
  if (!dob) return "";
  const days = Math.floor((Date.now() - new Date(dob + "T12:00:00")) / 86400e3);
  if (days < 0) return "";
  if (days < 84) return `${Math.floor(days / 7)} weeks old`;
  const months = Math.floor(days / 30.44);
  return months < 24 ? `${months} months old` : `${Math.floor(months / 12)} years old`;
};

const data = await (await fetch("/api/public/sale")).json();
const c = data.contact;
const rabbitry = c.rabbitry || "MCF Rabbitry";
const byId = new Map(data.rabbits.map((r) => [r.id, r]));

document.title = `${rabbitry}: rabbits for sale`;
document.getElementById("rabbitry").textContent = rabbitry;
document.getElementById("location").textContent = [c.location, c.contact_name].filter(Boolean).join(" · ");
if (c.sale_intro) {
  const intro = document.getElementById("intro");
  intro.textContent = c.sale_intro;
  intro.hidden = false;
}

const digits = (c.phone || "").replace(/[^\d+]/g, "");
const ask = (r) => `Hi, is ${displayName(r)}${r.ear ? ` (${r.ear})` : ""} still available?`;
document.getElementById("contact").innerHTML = [
  digits && `<a class="button primary" href="tel:${esc(digits)}">Call ${esc(c.phone)}</a>`,
  digits && `<a class="button" href="sms:${esc(digits)}">Text</a>`,
  c.email && `<a class="button" href="mailto:${esc(c.email)}">Email</a>`,
]
  .filter(Boolean)
  .join("");

// The same four-generation layout the app uses, built from the ancestors the page was sent
const pedigreeColumns = (subject) => {
  const cols = [[subject]];
  for (let g = 1; g < 4; g++) cols.push(cols[g - 1].flatMap((r) => [byId.get(r?.sire_id) || null, byId.get(r?.dam_id) || null]));
  return cols;
};
const repeatsIn = (cols) => {
  const counts = new Map();
  cols.slice(1).flat().forEach((r) => r && counts.set(r.id, (counts.get(r.id) || 0) + 1));
  return counts;
};

const listings = document.getElementById("listings");
listings.innerHTML = data.listings.length
  ? data.listings
      .map((r) => {
        const sire = byId.get(r.sire_id);
        const dam = byId.get(r.dam_id);
        const main = r.photo_id && r.photos.includes(r.photo_id) ? r.photo_id : r.photos[0];
        return `<article class="card sale-card" data-id="${r.id}">
          ${main ? `<img class="sale-photo" src="${photoUrl(main)}" alt="${esc(displayName(r))}">` : `<div class="sale-photo empty"><img src="/favicon.svg" alt=""></div>`}
          ${r.photos.length > 1 ? `<div class="sale-thumbs">${r.photos.map((p) => `<button type="button" data-photo="${p}"><img src="${photoUrl(p, true)}" alt="" loading="lazy"></button>`).join("")}</div>` : ""}
          <div class="sale-body">
            <div class="card-head"><h2>${esc(displayName(r))}</h2>${r.sale_price ? `<span class="sale-price">${esc(price(r.sale_price))}</span>` : ""}</div>
            <p>${esc([r.sex === "buck" ? "Buck" : r.sex === "doe" ? "Doe" : "", r.breed, r.color].filter(Boolean).join(" · "))}</p>
            <p class="muted">${esc([r.dob && `Born ${fmtDate(r.dob)} (${age(r.dob)})`, r.ear && `Ear ${r.ear}`].filter(Boolean).join(" · "))}</p>
            ${sire || dam ? `<p class="muted small">Out of ${esc(displayName(sire))} × ${esc(displayName(dam))}</p>` : ""}
            ${r.sale_notes ? `<p>${esc(r.sale_notes)}</p>` : ""}
            <div class="form-actions">
              <button class="button" type="button" data-pedigree="${r.id}">Pedigree (PDF)</button>
              ${digits ? `<a class="button primary" href="sms:${esc(digits)}?&body=${encodeURIComponent(ask(r))}">Ask about ${esc(displayName(r))}</a>` : ""}
              ${!digits && c.email ? `<a class="button primary" href="mailto:${esc(c.email)}?subject=${encodeURIComponent(ask(r))}">Ask about ${esc(displayName(r))}</a>` : ""}
            </div>
          </div>
        </article>`;
      })
      .join("")
  : `<p class="muted">Nothing is listed for sale right now. Please check back soon${digits || c.email ? ", or get in touch to ask about upcoming litters" : ""}.</p>`;

listings.addEventListener("click", async (e) => {
  const thumb = e.target.closest("[data-photo]");
  if (thumb) thumb.closest(".sale-card").querySelector(".sale-photo").src = photoUrl(thumb.dataset.photo);

  const button = e.target.closest("[data-pedigree]");
  if (!button) return;
  const r = byId.get(Number(button.dataset.pedigree));
  const blob = pedigreePdf(r, { displayName, fmtDate, pedigreeColumns, repeatsIn, rabbitry });
  const file = new File([blob], `${displayName(r).replace(/[^\w\s'&-]+/g, "").trim() || "Rabbit"} pedigree.pdf`, { type: "application/pdf" });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      return await navigator.share({ files: [file], title: `${displayName(r)} pedigree` });
    } catch (err) {
      if (err.name === "AbortError") return;
    }
  }
  window.open(URL.createObjectURL(blob), "_blank");
});
