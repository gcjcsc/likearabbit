// Draws a four-generation pedigree as a one-page, landscape letter-size PDF with jsPDF (loaded in
// index.html as window.jspdf), so it can be texted, emailed or printed straight from the share sheet.

const PAGE = { w: 792, h: 612, margin: 30 };
const TREE = { top: 96, bottom: 520 };
const COLS = [
  { x: 30, w: 170 },
  { x: 222, w: 164 },
  { x: 408, w: 164 },
  { x: 594, w: 168 },
];
// Font size, line height and box height for each generation of ancestors
const GEN = [null, { fs: 9, lh: 11.2, h: 98 }, { fs: 8, lh: 9.8, h: 78 }, { fs: 7, lh: 8.3, h: 48 }];

const COLOR = {
  brand: [122, 75, 42],
  text: [43, 36, 32],
  muted: [119, 106, 96],
  line: [190, 176, 162],
  box: [214, 202, 189],
  buck: [47, 111, 159],
  doe: [176, 74, 114],
  repeat: [178, 106, 0],
};

const slotCenter = (gen, i) => {
  const slots = 2 ** gen;
  const slotH = (TREE.bottom - TREE.top) / slots;
  return TREE.top + slotH * (i + 0.5);
};

// Shortens text with an ellipsis until it fits the width at the current font size
const fit = (doc, text, width) => {
  if (doc.getTextWidth(text) <= width) return text;
  let t = text;
  while (t.length > 1 && doc.getTextWidth(t + "…") > width) t = t.slice(0, -1);
  return t.trimEnd() + "…";
};

const join = (...parts) => parts.filter(Boolean).join(" · ");

const box = (doc, x, y, w, h, sex) => {
  doc.setDrawColor(...COLOR.box);
  doc.setFillColor(255, 255, 255);
  doc.setLineWidth(0.75);
  doc.roundedRect(x, y, w, h, 4, 4, "FD");
  doc.setFillColor(...(sex === "buck" ? COLOR.buck : sex === "doe" ? COLOR.doe : COLOR.box));
  doc.roundedRect(x, y, 3.5, h, 1.5, 1.5, "F");
};

const ancestorBox = (doc, r, gen, i, ctx) => {
  const { fs, lh, h } = GEN[gen];
  const { x, w } = COLS[gen];
  const y = slotCenter(gen, i) - h / 2;
  const role = i % 2 ? "DAM" : "SIRE";
  const innerW = w - 16;

  if (!r) {
    doc.setDrawColor(...COLOR.box);
    doc.setLineWidth(0.6);
    doc.setLineDashPattern([2, 2], 0);
    doc.roundedRect(x, y, w, h, 4, 4, "S");
    doc.setLineDashPattern([], 0);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(fs);
    doc.setTextColor(...COLOR.muted);
    doc.text(`Unknown ${role.toLowerCase()}`, x + 9, y + h / 2 + fs / 3);
    return;
  }

  box(doc, x, y, w, h, r.sex);

  // Role, and a marker when this ancestor appears more than once in the pedigree
  doc.setFont("helvetica", "bold");
  doc.setFontSize(5.5);
  doc.setTextColor(...COLOR.muted);
  doc.text(role, x + w - 6, y + 8, { align: "right" });
  const repeats = ctx.counts.get(r.id) || 0;
  if (repeats > 1) {
    doc.setTextColor(...COLOR.repeat);
    doc.setFontSize(fs);
    doc.text(`×${repeats}`, x + w - 6, y + 9 + fs, { align: "right" });
  }

  let ty = y + 5 + fs + 1.5;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(fs + 1.5);
  doc.setTextColor(...COLOR.text);
  doc.text(fit(doc, ctx.displayName(r), innerW - 18), x + 9, ty);

  const lines = [
    r.color,
    join(r.ear && `Ear ${r.ear}`, r.dob && ctx.fmtDate(r.dob)),
    r.genotype,
    join(r.weight, r.reg && `Reg ${r.reg}`, r.gc && `GC ${r.gc}`, r.legs && `Legs ${r.legs}`),
  ].filter(Boolean);
  const room = Math.floor((y + h - 4 - ty) / lh);
  doc.setFontSize(fs);
  lines.slice(0, room).forEach((line) => {
    ty += lh;
    const isGeno = line === r.genotype;
    doc.setFont(isGeno ? "courier" : "helvetica", "normal");
    doc.setTextColor(...(isGeno ? COLOR.muted : COLOR.text));
    doc.text(fit(doc, line, innerW), x + 9, ty);
  });
};

const subjectBox = (doc, r, ctx) => {
  const { x, w } = COLS[0];
  const rows = [
    ["Ear #", r.ear],
    ["Sex", r.sex === "buck" ? "Buck" : r.sex === "doe" ? "Doe" : ""],
    ["Breed", r.breed],
    ["Color", r.color],
    ["Genotype", r.genotype],
    ["Born", ctx.fmtDate(r.dob)],
    ["Weight", r.weight],
    ["Reg #", r.reg],
    ["GC #", r.gc],
    ["Legs", r.legs],
    ["Breeder", r.breeder],
    ["COI", r.sire_id && r.dam_id ? ctx.fmtCoi(ctx.coi(r.sire_id, r.dam_id)) : ""],
  ].filter(([, v]) => v);

  // Each row is a small label over its value, so long colors and genotypes get the full width
  const nameLines = (() => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    return doc.splitTextToSize(ctx.displayName(r), w - 18).slice(0, 2);
  })();
  const h = 16 + nameLines.length * 15 + rows.length * 21 + 4;
  const y = slotCenter(0, 0) - h / 2;
  box(doc, x, y, w, h, r.sex);

  let ty = y + 20;
  doc.setTextColor(...COLOR.text);
  nameLines.forEach((line) => {
    doc.text(line, x + 10, ty);
    ty += 15;
  });
  ty += 2;
  rows.forEach(([label, value]) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6);
    doc.setTextColor(...COLOR.muted);
    doc.text(label.toUpperCase(), x + 10, ty);
    doc.setFont(label === "Genotype" ? "courier" : "helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...COLOR.text);
    doc.text(fit(doc, value, w - 18), x + 10, ty + 10);
    ty += 21;
  });
};

// Bracket lines from each rabbit to its sire and dam
const connectors = (doc) => {
  doc.setDrawColor(...COLOR.line);
  doc.setLineWidth(0.75);
  for (let gen = 0; gen < 3; gen++) {
    for (let i = 0; i < 2 ** gen; i++) {
      const x1 = COLS[gen].x + COLS[gen].w;
      const x2 = COLS[gen + 1].x;
      const xm = (x1 + x2) / 2;
      const yc = slotCenter(gen, i);
      const ys = slotCenter(gen + 1, 2 * i);
      const yd = slotCenter(gen + 1, 2 * i + 1);
      doc.line(x1, yc, xm, yc);
      doc.line(xm, ys, xm, yd);
      doc.line(xm, ys, x2, ys);
      doc.line(xm, yd, x2, yd);
    }
  }
};

export const pedigreePdf = (subject, ctx) => {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "letter" });
  const name = ctx.displayName(subject);
  const cols = ctx.pedigreeColumns(subject);
  ctx.counts = ctx.repeatsIn(cols);
  doc.setProperties({ title: `${name} pedigree`, author: ctx.rabbitry, creator: ctx.rabbitry });

  // Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(...COLOR.brand);
  doc.text(ctx.rabbitry, PAGE.margin, 52);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(...COLOR.muted);
  doc.text(`${subject.breed || "Rex"} Rabbit Pedigree`, PAGE.margin, 69);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...COLOR.text);
  doc.text(fit(doc, name, 380), PAGE.w - PAGE.margin, 50, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(...COLOR.muted);
  doc.text(join(subject.ear && `Ear # ${subject.ear}`, subject.sex === "buck" ? "Buck" : subject.sex === "doe" ? "Doe" : ""), PAGE.w - PAGE.margin, 68, {
    align: "right",
  });
  doc.setDrawColor(...COLOR.brand);
  doc.setLineWidth(1.5);
  doc.line(PAGE.margin, 80, PAGE.w - PAGE.margin, 80);

  // Generation labels
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.setTextColor(...COLOR.muted);
  ["", "PARENTS", "GRANDPARENTS", "GREAT-GRANDPARENTS"].forEach((label, g) => label && doc.text(label, COLS[g].x, 92));

  connectors(doc);
  subjectBox(doc, subject, ctx);
  for (let gen = 1; gen < 4; gen++) cols[gen].forEach((r, i) => ancestorBox(doc, r, gen, i, ctx));

  // Footer: owner, certification and signature line
  const fy = 538;
  doc.setDrawColor(...COLOR.box);
  doc.setLineWidth(0.75);
  doc.line(PAGE.margin, fy - 8, PAGE.w - PAGE.margin, fy - 8);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...COLOR.text);
  doc.text(`Owner: ${ctx.rabbitry}`, PAGE.margin, fy + 6);
  doc.setTextColor(...COLOR.muted);
  doc.text(`Generated ${ctx.fmtDate(new Date().toISOString().slice(0, 10))}`, PAGE.margin, fy + 19);
  if ([...ctx.counts.values()].some((n) => n > 1)) {
    doc.setTextColor(...COLOR.repeat);
    doc.text("×2 = appears twice in this pedigree", PAGE.margin, fy + 32);
  }
  doc.setTextColor(...COLOR.text);
  doc.text("I certify that this pedigree is correct to the best of my knowledge.", PAGE.w - PAGE.margin, fy + 6, { align: "right" });
  doc.setDrawColor(...COLOR.text);
  doc.setLineWidth(0.5);
  doc.text("Signed", 470, fy + 36);
  doc.line(500, fy + 37, 648, fy + 37);
  doc.text("Date", 656, fy + 36);
  doc.line(678, fy + 37, PAGE.w - PAGE.margin, fy + 37);

  return doc.output("blob");
};
