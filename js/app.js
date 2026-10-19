/* RFP Response Assistant — live demo. Runs entirely in the browser on fictional files. */
(function () {
  "use strict";
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const icons = () => window.lucide && window.lucide.createIcons();
  const DOC_SHORT = { rfp: "RFP", tc: "Terms", spec: "Spec", price: "Prices" };

  const S = { sectors: [], data: null, parsed: null, rates: [], ix: null, drafted: false, running: false, filter: "all" };

  async function getJSON(p) { const r = await fetch(p); if (!r.ok) throw new Error("Could not load " + p); return r.json(); }

  /* ---------- sector + files ---------- */
  function renderSectorBar(active) {
    $("#sectorBar").innerHTML = S.sectors.map((s) =>
      `<button type="button" role="tab" class="sector${s.key === active ? " on" : ""}" aria-selected="${s.key === active}" data-key="${s.key}"><i data-lucide="${s.icon}"></i><span>${esc(s.label)}</span></button>`).join("");
  }

  async function selectSector(key, autorun) {
    S.data = await getJSON(`./data/${key}.json`);
    S.parsed = null; S.drafted = false;
    S.rates = S.data.price_lines.map((l) => l.rate);
    S.ix = window.NyyoBM25.buildIndex(S.data.kb);
    renderSectorBar(key);
    const m = S.data.meta;
    $("#rfpMeta").innerHTML = `<div><span class="mono">${esc(m.rfp_id)}</span> · <strong>${esc(m.title)}</strong></div>
      <div class="muted">Buyer: ${esc(m.buyer)} · Bidder in this demo: ${esc(m.vendor)}</div>
      <div class="muted small">${esc(m.scope)}</div>`;
    $("#fileGrid").innerHTML = S.data.docs.map((d) =>
      `<button type="button" class="file" data-doc="${d.id}"><i data-lucide="${d.id === "price" ? "sheet" : "file-text"}"></i><span><strong>${esc(d.label)}</strong><small>${esc(d.file)} · ${d.pages.length} page${d.pages.length > 1 ? "s" : ""}</small></span></button>`).join("");
    $("#inCompany").value = m.vendor;
    $("#inWin").value = "A proven team, measurable service levels and no surprises on price.";
    $("#results").classList.add("hidden");
    $("#draftOut").innerHTML = ""; $("#exportRow").classList.add("hidden");
    $$(".pipe-node").forEach((n) => n.classList.remove("on", "done"));
    $("#runNote").textContent = "Runs in your browser on the fictional files above.";
    renderValue(parse());
    icons();
    if (autorun) run();
  }

  /* ---------- source viewer ---------- */
  function openViewer(docId, page, quote) {
    const d = S.data.docs.find((x) => x.id === docId);
    if (!d) return;
    const p = Math.min(Math.max(1, page || 1), d.pages.length);
    $("#viewerTitle").textContent = `${d.label} — ${d.file}`;
    const blob = new Blob([d.pages.map((t, i) => `--- Page ${i + 1} ---\n${t}\n`).join("\n")], { type: "text/plain" });
    const dl = $("#viewerDl"); if (dl.dataset.url) URL.revokeObjectURL(dl.dataset.url);
    dl.href = dl.dataset.url = URL.createObjectURL(blob); dl.download = d.file;
    $("#viewerPages").innerHTML = d.pages.map((_, i) => `<button type="button" class="${i + 1 === p ? "on" : ""}" data-p="${i + 1}">Page ${i + 1}</button>`).join("");
    $("#viewerPages").onclick = (e) => { const b = e.target.closest("button"); if (b) openViewer(docId, Number(b.dataset.p), quote); };
    let html = esc(d.pages[p - 1]);
    if (quote) { const q = esc(quote); html = html.split(q).join(`<mark id="hl">${q}</mark>`); }
    $("#viewerBody").innerHTML = html;
    $("#viewer").classList.remove("hidden");
    document.body.classList.add("noscroll");
    const hl = $("#hl"); if (hl) hl.scrollIntoView({ block: "center" });
    icons();
    $("#viewerClose").focus({ preventScroll: true });
  }
  function closeViewer() { $("#viewer").classList.add("hidden"); document.body.classList.remove("noscroll"); }
  const citeBtn = (doc, page, quote) => `<button type="button" class="cite" data-doc="${doc}" data-page="${page}" data-q="${esc(quote || "")}"><i data-lucide="link"></i>${DOC_SHORT[doc]} p.${page}</button>`;
  const kbCite = (id) => { const k = S.data.kb.find((x) => x.id === id); return k ? `<span class="cite kb" title="${esc(k.title)}"><i data-lucide="library"></i>${esc(k.source.split("/").pop())} p.${k.page}</span>` : ""; };

  /* ---------- live rule-based extraction ---------- */
  function parse() {
    const D = S.data, out = { reqs: [], criteria: [], deadlines: [], documents: [] };
    let n = 0;
    D.docs.forEach((doc) => doc.pages.forEach((pg, pi) => {
      const lines = pg.split("\n");
      let inTimetable = false;
      lines.forEach((raw) => {
        const line = raw.trim();
        if (doc.id === "rfp") {
          if (/^2\. Timetable/.test(line)) { inTimetable = true; return; }
          if (/^\d+\. /.test(line)) inTimetable = false;
          let m;
          if (inTimetable && (m = line.match(/^([^:]+): (.+?)(?: at (\d\d:\d\d))?$/))) out.deadlines.push({ label: m[1], date: m[2], time: m[3] || "", doc: doc.id, page: pi + 1, quote: line });
          if ((m = line.match(/^([QP]\d) — (.+?) — (\d+)% — (.+)$/))) out.criteria.push({ id: m[1], name: m[2], weight: Number(m[3]), description: m[4], doc: doc.id, page: pi + 1, quote: line });
          if ((m = line.match(/^- (.+) \((Mandatory|Optional)\)$/))) out.documents.push({ name: m[1], mandatory: m[2] === "Mandatory", doc: doc.id, page: pi + 1, quote: m[1] });
        }
        const body = line.replace(/^-\s+/, "").replace(/^\d+(\.\d+)*\s+/, "");
        body.split(/(?<=[.!?])\s+(?=[A-Z])/).forEach((sent) => {
          if (!/\b(shall|should)\b/i.test(sent) || /means a (mandatory|desirable)/i.test(sent)) return;
          const known = D.requirements.find((r) => r.text === sent || sent.includes(r.text) || r.text.includes(sent));
          const kind = /\bshall\b/i.test(sent) ? "must" : "should";
          n++;
          out.reqs.push({ id: "R" + String(n).padStart(2, "0"), text: sent, kind, doc: doc.id, page: pi + 1,
            category: known ? known.category : "Submission rules", kb: known ? known.kb : null });
        });
      });
    }));
    out.reqs.forEach((r) => {
      if (r.kb) {
        const top = window.NyyoBM25.score(S.ix, r.category + " " + r.text)[0];
        r.status = "evidence"; r.conf = top && top.id === r.kb ? "High" : "Medium";
      } else if (r.category === "Pricing") r.status = "input";
      else if (r.doc === "rfp" || r.doc === "tc") r.status = "confirm";
      else r.status = r.kind === "must" ? "gap" : "gap-opt";
    });
    S.parsed = out;
    return out;
  }
  const STATUS = {
    evidence: ["ok", "Evidence found"], input: ["info", "Your input — price schedule"],
    confirm: ["soft", "Confirm compliance"], gap: ["warn", "Gap — needs your input"], "gap-opt": ["warn", "Not covered (desirable)"],
  };

  /* ---------- run ---------- */
  async function run() {
    if (S.running) return; S.running = true;
    const btn = $("#btnRun"); btn.disabled = true;
    const nodes = $$(".pipe-node"); nodes.forEach((n) => n.classList.remove("on", "done"));
    const t0 = performance.now();
    for (let i = 0; i < nodes.length; i++) {
      nodes[i].classList.add("on");
      if (i === 1) parse();
      await sleep(420);
      nodes[i].classList.remove("on"); nodes[i].classList.add("done");
    }
    const ms = Math.max(1, Math.round(performance.now() - t0 - 4 * 420));
    renderResults();
    $("#results").classList.remove("hidden");
    $("#runNote").textContent = `Parsed ${S.data.meta.pages} pages in ${ms} ms in your browser · ${S.parsed.reqs.length} requirements found.`;
    btn.disabled = false; S.running = false;
    icons();
  }

  function renderResults() {
    const P = S.parsed;
    const must = P.reqs.filter((r) => r.kind === "must");
    const okMust = must.filter((r) => r.status !== "gap").length;
    const gaps = P.reqs.filter((r) => r.status === "gap" || r.status === "gap-opt");
    const sub = P.deadlines.find((d) => /submission deadline/i.test(d.label));
    const days = sub ? Math.ceil((new Date(sub.date + "T12:00:00") - new Date()) / 864e5) : null;
    const pct = must.length ? Math.round((okMust / must.length) * 100) : 0;
    $("#readiness").innerHTML = `
      <div class="ready-ring" style="--p:${pct}"><span>${pct}%</span><small>mandatory covered</small></div>
      <div class="ready-cards">
        <div><b>${P.reqs.length}</b><span>requirements<br>${must.length} shall · ${P.reqs.length - must.length} should</span></div>
        <div class="${gaps.length ? "warn" : ""}"><b>${gaps.length}</b><span>gaps flagged<br>for a human</span></div>
        <div><b>${P.criteria.length}</b><span>scored criteria<br>${P.criteria.filter((c) => c.id.startsWith("Q")).reduce((a, c) => a + c.weight, 0)}% quality</span></div>
        <div><b>${days != null ? days : "—"}</b><span>days to the<br>submission deadline</span></div>
      </div>`;
    renderReqs();
    $("#matrix tbody").innerHTML = P.reqs.map((r) => {
      const [cls, lbl] = STATUS[r.status];
      return `<tr><td class="mono" data-label="ID">${r.id}</td><td data-label="Requirement">${esc(r.text)}</td><td data-label="Type"><span class="pill ${r.kind === "must" ? "" : "soft"}">${r.kind === "must" ? "Shall" : "Should"}</span></td>
        <td data-label="Source">${citeBtn(r.doc, r.page, r.text)}</td><td data-label="Status"><span class="pill ${cls}">${lbl}</span>${r.conf ? ` <small class="muted">${r.conf}</small>` : ""}</td>
        <td data-label="Evidence">${r.kb ? kbCite(r.kb) : "—"}</td></tr>`;
    }).join("");
    const crit = [...P.criteria].sort((a, b) => b.weight - a.weight);
    $("#critBars").innerHTML = crit.map((c) => `<div class="cbar"><div class="cbar-top"><span class="mono">${c.id}</span><strong>${esc(c.name)}</strong><b>${c.weight}%</b></div>
      <div class="cbar-track"><i style="width:${c.weight * 2.5}%"></i></div><p>${esc(c.description)} ${citeBtn(c.doc, c.page, c.quote)}</p></div>`).join("");
    const q = P.criteria.filter((c) => c.id.startsWith("Q")).reduce((a, c) => a + c.weight, 0);
    $("#critHint").textContent = `Quality ${q}% · Price ${100 - q}%. The draft gives each criterion its own section, in this order of weight.`;
    $("#dates tbody").innerHTML = P.deadlines.map((d) => `<tr><td data-label="Event">${esc(d.label)}</td><td class="mono" data-label="When">${esc(d.date)}${d.time ? " " + esc(d.time) : ""}</td><td data-label="Source">${citeBtn(d.doc, d.page, d.quote)}</td></tr>`).join("");
    $("#docs tbody").innerHTML = P.documents.map((d) => `<tr><td data-label="Document">${esc(d.name)}</td><td data-label="Type"><span class="pill ${d.mandatory ? "warn" : "soft"}">${d.mandatory ? "Mandatory" : "Optional"}</span></td><td data-label="Source">${citeBtn(d.doc, d.page, d.quote)}</td></tr>`).join("");
    renderPrices();
    renderValue(P);
    kbSearch($("#kbQ").value || "insurance");
    icons();
  }

  function renderReqs() {
    const list = S.parsed.reqs.filter((r) => S.filter === "all" || r.kind === S.filter);
    $("#reqList").innerHTML = list.map((r) => `<div class="req-item"><span class="id">${r.id}</span>
      <div><span class="pill ${r.kind === "must" ? "" : "soft"}">${r.kind === "must" ? "Shall" : "Should"}</span> <strong>${esc(r.category)}</strong> — ${esc(r.text)}</div>${citeBtn(r.doc, r.page, r.text)}</div>`).join("");
    icons();
  }

  /* ---------- prices ---------- */
  const money = (n) => (S.data.meta.currency === "USD" ? "$" : S.data.meta.currency + " ") + Number(n).toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: n % 1 ? 2 : 0 });
  const priceTotal = () => S.data.price_lines.reduce((a, l, i) => a + l.qty * (Number(S.rates[i]) || 0), 0);
  function renderPrices() {
    $("#priceTbl tbody").innerHTML = S.data.price_lines.map((l, i) => `<tr><td data-label="Line">${esc(l.desc)}</td><td data-label="Unit">${esc(l.unit)}</td><td class="mono" data-label="Qty">${l.qty.toLocaleString("en-US")}</td>
      <td data-label="Rate"><input class="rate" type="number" min="0" step="any" data-i="${i}" value="${S.rates[i]}" aria-label="Rate for ${esc(l.desc)}" /></td><td class="mono" data-label="Total" id="lt${i}">${money(l.qty * S.rates[i])}</td></tr>`).join("");
    $("#priceTotal").textContent = money(priceTotal());
  }

  /* ---------- answer library ---------- */
  function kbSearch(q) {
    $("#kbQ").value = q;
    const hits = window.NyyoBM25.score(S.ix, q).slice(0, 3);
    $("#kbHits").innerHTML = hits.length ? hits.map((h) => { const k = S.data.kb.find((x) => x.id === h.id);
      return `<article class="hit"><h4>${esc(k.title)}</h4><p>${esc(k.text)}</p>${kbCite(k.id)}</article>`; }).join("") : `<p class="hint">No match — try another word.</p>`;
    icons();
  }

  /* ---------- draft ---------- */
  function draftModel() {
    const D = S.data, P = S.parsed;
    const inp = { company: $("#inCompany").value.trim() || D.meta.vendor, contact: $("#inContact").value.trim(), win: $("#inWin").value.trim() };
    const crit = [...P.criteria].sort((a, b) => b.weight - a.weight);
    const secs = crit.map((c) => {
      const s = D.sections[c.id] || { title: c.name, bullets: [] };
      const bullets = s.bullets.map((b) => ({ ...b }));
      if (c.id.startsWith("P")) bullets.push({ text: `Total evaluated price: ${money(priceTotal())} (sum of the bidder's rates × the buyer's estimated quantities).`, cite: null, input: true });
      return { id: c.id, weight: c.weight, title: s.title, bullets };
    });
    const gaps = P.reqs.filter((r) => r.status === "gap" || r.status === "gap-opt");
    const summary = `${inp.company} is pleased to submit this proposal for ${D.meta.title.toLowerCase()} (${D.meta.rfp_id}) for ${D.meta.buyer}. ${inp.win}`;
    return { inp, secs, gaps, summary };
  }

  async function assemble() {
    if (!S.parsed) parse();
    const M = draftModel(), out = $("#draftOut");
    out.innerHTML = `<div class="prop-sec show"><h3>Executive summary</h3><p>${esc(M.summary)}</p></div>`;
    for (const s of M.secs) {
      const el = document.createElement("div"); el.className = "prop-sec";
      el.innerHTML = `<h3><span class="pill">${s.id} · ${s.weight}%</span> ${esc(s.title)}</h3><ul>${s.bullets.map((b) => `<li>${esc(b.text)} ${b.cite ? kbCite(b.cite) : b.input ? `<span class="pill info">your input</span>` : `<span class="pill warn">check</span>`}</li>`).join("")}</ul>`;
      out.appendChild(el); icons(); await sleep(160); el.classList.add("show");
    }
    const g = document.createElement("div"); g.className = "prop-sec show gaps";
    g.innerHTML = `<h3><i data-lucide="alert-triangle"></i> Before you submit — ${M.gaps.length} gap${M.gaps.length === 1 ? "" : "s"} to fill</h3><ul>${M.gaps.map((r) => `<li><span class="mono">${r.id}</span> ${esc(r.text)} ${citeBtn(r.doc, r.page, r.text)}</li>`).join("") || "<li>No gaps flagged.</li>"}</ul>`;
    out.appendChild(g);
    S.drafted = true; $("#exportRow").classList.remove("hidden"); icons();
  }

  /* ---------- DOCX ---------- */
  async function docx() {
    if (!S.drafted) await assemble();
    const X = window.docx; if (!X) { alert("The Word export library is still loading — try again in a second."); return; }
    const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, BorderStyle, AlignmentType, ShadingType, Footer, PageNumber } = X;
    const D = S.data, P = S.parsed, M = draftModel();
    const docName = (id) => (D.docs.find((d) => d.id === id) || {}).file || id;
    const kbRef = (id) => { const k = D.kb.find((x) => x.id === id); return k ? ` [Source: ${k.source.split("/").pop()}, p.${k.page}]` : ""; };
    const bd = { style: BorderStyle.SINGLE, size: 4, color: "C9CED8" }, borders = { top: bd, bottom: bd, left: bd, right: bd };
    const cell = (t, w, head) => new TableCell({ borders, width: { size: w, type: WidthType.PERCENTAGE }, shading: head ? { type: ShadingType.CLEAR, color: "auto", fill: "E8EEF9" } : undefined,
      children: [new Paragraph({ children: [new TextRun({ text: String(t), bold: !!head, size: 18 })] })] });
    const table = (hdr, rows, widths) => new Table({ width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [new TableRow({ tableHeader: true, children: hdr.map((h, i) => cell(h, widths[i], true)) }), ...rows.map((r) => new TableRow({ children: r.map((c, i) => cell(c, widths[i])) }))] });
    const H = (t, l = HeadingLevel.HEADING_1) => new Paragraph({ text: t, heading: l, spacing: { before: 240, after: 120 } });
    const para = (t, o = {}) => new Paragraph({ children: [new TextRun({ text: t, ...o })], spacing: { after: 100 } });
    const kids = [
      new Paragraph({ text: "PROPOSAL — DRAFT FOR REVIEW", heading: HeadingLevel.TITLE }),
      para(D.meta.title, { bold: true, size: 28 }),
      para(`Buyer: ${D.meta.buyer} · Reference: ${D.meta.rfp_id}`),
      para(`Bidder: ${M.inp.company}${M.inp.contact ? " · Contact: " + M.inp.contact : ""}`),
      para("HUMAN REVIEW REQUIRED — generated from a fictional sample RFP. Check every statement and citation before any real submission.", { bold: true, color: "B45309" }),
      H("1. Executive summary"), para(M.summary),
    ];
    M.secs.forEach((s, i) => {
      kids.push(H(`${i + 2}. ${s.title} (${s.id}, ${s.weight}%)`));
      s.bullets.forEach((b) => kids.push(new Paragraph({ bullet: { level: 0 }, children: [new TextRun(b.text), new TextRun({ text: b.cite ? kbRef(b.cite) : b.input ? " [Bidder input]" : " [To check]", italics: true, color: "5B6B8C" })] })));
    });
    let n = M.secs.length + 2;
    kids.push(H(`${n++}. Compliance matrix`));
    kids.push(table(["ID", "Requirement", "Type", "Source", "Status", "Evidence"], P.reqs.map((r) => [r.id, r.text, r.kind === "must" ? "Shall" : "Should", `${docName(r.doc)} p.${r.page}`, STATUS[r.status][1], r.kb ? kbRef(r.kb).replace(/^ \[Source: |\]$/g, "") : "—"]), [7, 41, 8, 17, 15, 12]));
    kids.push(H(`${n++}. Evaluation criteria and weights`));
    kids.push(table(["ID", "Criterion", "Weight", "Source"], [...P.criteria].sort((a, b) => b.weight - a.weight).map((c) => [c.id, c.name, c.weight + "%", `${docName(c.doc)} p.${c.page}`]), [10, 55, 12, 23]));
    kids.push(H(`${n++}. Deadlines`));
    kids.push(table(["Event", "When", "Source"], P.deadlines.map((d) => [d.label, d.date + (d.time ? " " + d.time : ""), `${docName(d.doc)} p.${d.page}`]), [45, 30, 25]));
    kids.push(H(`${n++}. Document checklist`));
    P.documents.forEach((d) => kids.push(para(`☐ ${d.name} — ${d.mandatory ? "mandatory" : "optional"}`)));
    kids.push(H(`${n++}. Price summary`));
    kids.push(table(["Line", "Unit", "Qty", "Rate", "Total"], D.price_lines.map((l, i) => [l.desc, l.unit, l.qty.toLocaleString("en-US"), money(S.rates[i]), money(l.qty * S.rates[i])]).concat([["Total evaluated price", "", "", "", money(priceTotal())]]), [40, 15, 13, 14, 18]));
    kids.push(H(`${n++}. Gaps to fill before submission`));
    (M.gaps.length ? M.gaps : [{ id: "—", text: "No gaps flagged.", doc: "rfp", page: 1 }]).forEach((r) => kids.push(para(`${r.id} — ${r.text} (${docName(r.doc)} p.${r.page})`)));
    const doc = new Document({ creator: "Nyyo Automation — RFP Response Assistant demo", title: `Proposal draft ${D.meta.rfp_id}`, description: "Fictional sample — human review required",
      styles: { default: { document: { run: { font: "Calibri", size: 21 } } } },
      sections: [{ properties: {}, footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Draft for review · fictional sample · page ", size: 16, color: "888888" }), new TextRun({ children: [PageNumber.CURRENT], size: 16, color: "888888" })] })] }) }, children: kids }] });
    const blob = await Packer.toBlob(doc);
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${D.meta.rfp_id}_proposal_draft.docx`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  function csv() {
    const P = S.parsed, q = (v) => `"${String(v).replace(/"/g, '""')}"`;
    const rows = [["ID", "Requirement", "Type", "Document", "Page", "Status", "Evidence"]].concat(P.reqs.map((r) => {
      const k = S.data.kb.find((x) => x.id === r.kb);
      return [r.id, r.text, r.kind === "must" ? "Shall" : "Should", S.data.docs.find((d) => d.id === r.doc).file, r.page, STATUS[r.status][1], k ? `${k.source} p.${k.page}` : ""];
    }));
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([rows.map((r) => r.map(q).join(",")).join("\n")], { type: "text/csv" }));
    a.download = `${S.data.meta.rfp_id}_compliance_matrix.csv`; document.body.appendChild(a); a.click(); a.remove();
  }

  /* ---------- value section ---------- */
  function renderValue(P) {
    const D = S.data, must = P.reqs.filter((r) => r.kind === "must").length;
    const gaps = P.reqs.filter((r) => r.status === "gap" || r.status === "gap-opt").length;
    const ev = P.reqs.filter((r) => r.status === "evidence").length;
    const cited = Object.values(D.sections).reduce((a, s) => a + s.bullets.filter((b) => b.cite).length, 0);
    $("#baBefore").innerHTML = [
      `Read ${D.meta.pages} pages (~${Math.round(D.meta.words / 10) * 10} words) across 4 files`,
      `Copy ${P.reqs.length} requirements into a spreadsheet, one by one`,
      `Dig through past proposals for evidence`,
      `Build the matrix, the ${P.deadlines.length}-date timeline and the ${P.documents.length}-item checklist by hand`,
      `Start the proposal from a blank page`,
      `<strong>≈ 2–3 hours</strong> of bid-team time <em>(estimate for this example)</em>`,
    ].map((t) => `<li>${t}</li>`).join("");
    $("#baAfter").innerHTML = [
      `${P.reqs.length} requirements (${must} mandatory) extracted, each linked to its page`,
      `Matrix pre-filled: ${ev} with evidence from your library, ${gaps} gap${gaps === 1 ? "" : "s"} flagged`,
      `Criteria weights, dates and checklist in one view`,
      `A Word draft with ${cited} cited statements, structured by criterion weight`,
      `Your time goes on review, pricing and win themes`,
      `<strong>≈ 30–45 minutes</strong> of review <em>(estimate for this example)</em>`,
    ].map((t) => `<li>${t}</li>`).join("");
    $("#valGrid").innerHTML = [
      [P.reqs.length, "requirements found, none retyped"], [gaps, "gaps caught before submission"], [cited, "statements with a source"], ["≈ 2 h", "saved on this sample (estimate)"],
    ].map(([v, l]) => `<div class="metric"><div class="v">${v}</div><div class="l">${l}</div></div>`).join("");
  }

  /* ---------- wiring ---------- */
  function setTab(t) {
    $$(".tab").forEach((b) => { const on = b.dataset.tab === t; b.classList.toggle("on", on); b.setAttribute("aria-selected", on); });
    $$(".tab-body").forEach((b) => b.classList.toggle("hidden", b.dataset.body !== t));
  }
  function setBill(m) {
    $$(".bill-toggle button").forEach((b) => { const on = b.dataset.bill === m; b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); });
    $$(".plan .price").forEach((p) => (p.innerHTML = `${p.dataset[m]}<small>${p.dataset[m + "s"]}</small>`));
    $$(".plan .bill-note").forEach((p) => (p.textContent = p.dataset[m]));
  }

  async function main() {
    try {
      S.sectors = await getJSON("./data/sectors.json");
      const want = new URLSearchParams(location.search).get("sector");
      const key = S.sectors.some((s) => s.key === want) ? want : "facilities";
      document.addEventListener("click", (e) => {
        const c = e.target.closest(".cite[data-doc]"); if (c) { openViewer(c.dataset.doc, Number(c.dataset.page), c.dataset.q); return; }
        const f = e.target.closest(".file[data-doc]"); if (f) { openViewer(f.dataset.doc, 1, ""); return; }
        const s = e.target.closest(".sector[data-key]"); if (s) { selectSector(s.dataset.key, true); return; }
        const t = e.target.closest(".tab[data-tab]"); if (t) { setTab(t.dataset.tab); return; }
        const r = e.target.closest("#reqFilter .chip"); if (r) { $$("#reqFilter .chip").forEach((x) => x.classList.toggle("on", x === r)); S.filter = r.dataset.f; renderReqs(); return; }
        const b = e.target.closest(".bill-toggle button"); if (b) { setBill(b.dataset.bill); return; }
        if (e.target === $("#viewer")) closeViewer();
      });
      document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeViewer(); });
      $("#viewerClose").addEventListener("click", closeViewer);
      $("#btnRun").addEventListener("click", run);
      $("#btnDraft").addEventListener("click", assemble);
      $("#btnDocx").addEventListener("click", docx);
      $("#btnCsv").addEventListener("click", csv);
      $("#btnKb").addEventListener("click", () => kbSearch($("#kbQ").value));
      $("#kbQ").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); kbSearch($("#kbQ").value); } });
      $("#priceTbl").addEventListener("input", (e) => {
        const i = e.target.dataset.i; if (i == null) return;
        S.rates[i] = Number(e.target.value) || 0;
        $("#lt" + i).textContent = money(S.data.price_lines[i].qty * S.rates[i]);
        $("#priceTotal").textContent = money(priceTotal());
      });
      await selectSector(key, false);
      if (new URLSearchParams(location.search).has("run")) await run();
      window.__rfp = { run, assemble, docx, setTab, selectSector, state: S };
    } catch (err) {
      console.error(err);
      document.body.insertAdjacentHTML("afterbegin", `<p style="color:#ff6b8a;padding:12px">The demo could not load: ${esc(err.message)}</p>`);
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", main); else main();
})();
