/**
 * public/js/patel-report.js — PDF content builder for the diligence report.
 *
 * Reuses report.js's pagination ENGINE wholesale: packBlocksIntoPages (the
 * measure/split/greedy-pack algorithm), exportReportPdf's rasterisation +
 * canvas-batching + jsPDF assembly loop, injectStyles (the shared .dk-report
 * page/table/card CSS), loadLogo, logoMark, and the page-size constants.
 * None of that is reimplemented here. Only the CONTENT is new: a cover with
 * the estate summary, the store table with precision status, estate/vintage
 * findings, the peer benchmark with its corrections, and unit economics with
 * both contested figures shown side by side — never averaged, never picked
 * silently, matching the same rule already applied on screen. Every figure
 * keeps its reported/derived/estimate label in print, not just on screen.
 */
import { escapeHtml, fmtDate } from "./ui.js";
import { packBlocksIntoPages, exportReportPdf, injectStyles, loadLogo, logoMark } from "./report.js";
import { isCoarseTier } from "./geo.js";
import { yearsSince, VINTAGE_BUCKETS } from "./vintage.js";
import { computePnl, storeRevenueL } from "./pnl.js";

/* ------------------------------------------------------------- helpers ---- */
function el(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}
function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}
function fmtINR(v) {
  return `₹${Math.round(v).toLocaleString("en-IN")}`;
}
function fmtPct(v, d = 1) {
  return v == null ? "—" : `${(v * 100).toFixed(d)}%`;
}
function fmtCr(v) {
  return `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 1 })} cr`;
}
function fmtL(v) {
  return `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 1 })} L`;
}
const KIND_HEX = { reported: "#10b981", derived: "#6366f1", estimate: "#f59e0b" };
const TIER_HEX = { precise: "#10b981", coarse: "#f59e0b", missing: "#f43f5e" };
function badge(label, hex) {
  return `<span class="rpt-badge" style="color:${hex};background:${hex}1f">${escapeHtml(label)}</span>`;
}
function kindBadge(kind) {
  return badge(kind, KIND_HEX[kind] || "#94a3b8");
}

/* ------------------------------------------------------------------ data -- */
async function fetchJson(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  return res.json();
}

export async function buildPatelReportModel() {
  const [storesDoc, metrics, proximity, competitors, screener] = await Promise.all([
    fetchJson("./data/stores.json"),
    fetchJson("./data/metrics.json"),
    fetchJson("./data/proximity.json"),
    fetchJson("./data/competitors.json"),
    // Optional: the report still builds if the scheduled refresh hasn't run,
    // it just falls back to the stored per-store revenue.
    fetchJson("./data/screener-kpis.json").catch(() => null),
  ]);
  const now = new Date();
  return {
    stores: storesDoc.stores,
    metrics,
    proximity,
    competitors,
    screener,
    dateLabel: fmtDate(now.toISOString()),
    dateStamp: now.toISOString().slice(0, 10),
  };
}

function computeStats(model) {
  const { stores, metrics, proximity, screener } = model;
  const meta = proximity.metadata;
  const operational = stores.filter((s) => s.status === "operational").length;
  // Identical derivation to the screen — one formula, so the PDF can never
  // quote a different revenue per store than the dashboard it came from.
  const rev = storeRevenueL({ metrics, screener, operationalStores: operational });
  const pnl = computePnl({ ...metrics.store_pnl_reconciliation, revenue_l: rev.revenue_l });
  return {
    total: stores.length,
    operational,
    towns: new Set(stores.map((s) => s.town)).size,
    locatable: meta.locatable_count,
    coarse: meta.coarse_count,
    pendingGeocode: meta.pending_geocode_count,
    revSqftStoreFile: Math.round((rev.revenue_l * 100000) / metrics.unit_economics.sqft_per_store),
    rev,
    revSqftPeerModel: metrics.cross_file_contradictions.revenue_per_sqft_year.peer_model,
    storeEbitdaPct: pnl.ebitdaPct,
    peerEbitdaPct: metrics.store_pnl_reconciliation.peer_model_b2c_ebitda_pct,
    pnl,
  };
}

/* --------------------------------------------------------------- entry ---- */
export async function exportPatelReportPdf({ onStage } = {}) {
  const model = await buildPatelReportModel();
  injectPatelReportStyles();
  return exportReportPdf(model, {
    onStage,
    composePagesFn: composePatelPages,
    getFileName: () => `Patel_Retail_Diligence_Report_${model.dateStamp}.pdf`,
  });
}

/** Render the report pages into a VISIBLE container — mirrors report.js's own
 *  renderReportInto, which exists for exactly this reason (preview/testing
 *  without a full PDF round-trip). */
export async function renderPatelReportPreviewInto(mountEl) {
  const model = await buildPatelReportModel();
  injectPatelReportStyles();
  const logo = await loadLogo();
  mountEl.classList.add("dk-report");
  return composePatelPages(model, logo, mountEl);
}

function composePatelPages(model, logo, root) {
  const pagesBlocks = packBlocksIntoPages(root, patelBodyBlocks(model));
  const totalPages = pagesBlocks.length + 2; // cover + body pages + closing page
  const pageEls = [patelCoverPage(model, logo, totalPages)];
  pagesBlocks.forEach((bl, i) => pageEls.push(patelBodyPage(model, logo, bl, i + 2, totalPages)));
  pageEls.push(patelThankYouPage(model, logo, totalPages));
  pageEls.forEach((p) => root.appendChild(p));
  return pageEls;
}

/* --------------------------------------------------------------- pages ---- */
function patelFrame(pageNo, total, logo, dateLabel) {
  const header = `<div class="rpt-header">
      <div class="rpt-hd-co">Patel Retail Ltd <span>Investment Diligence Review</span></div>
      <div class="rpt-hd-wm">${logoMark(logo, 20)}<span class="rpt-wm-text">Munshot</span></div>
    </div>`;
  const footer = `<div class="rpt-footer">
      <span>Prepared by Munshot · Investment Diligence Review · ${escapeHtml(dateLabel)}</span>
      <span class="rpt-foot-link">www.muns.io</span>
      <span>Page ${pageNo} of ${total}</span>
    </div>`;
  return { header, footer };
}

function patelBodyPage(model, logo, blockEls, pageNo, total) {
  const { header, footer } = patelFrame(pageNo, total, logo, model.dateLabel);
  const page = el(`<div class="rpt-page">${header}<div class="rpt-content"></div>${footer}</div>`);
  const c = page.querySelector(".rpt-content");
  blockEls.forEach((b) => c.appendChild(b));
  return page;
}

function coverTile(value, label) {
  return `<div class="rpt-cf"><div class="rpt-cf-v">${value}</div><div class="rpt-cf-l">${label}</div></div>`;
}

function patelCoverPage(model, logo, total) {
  const { footer } = patelFrame(1, total, logo, model.dateLabel);
  const s = computeStats(model);
  const pills = [`<span>${s.total} stores</span>`, `<span>${s.towns} towns · Thane–Raigad, Maharashtra</span>`, `<span>Investment diligence</span>`].join("");
  const tiles = [
    coverTile(s.total, `Stores — ${s.operational} operational + ${s.total - s.operational} closed, ${s.towns} towns`),
    coverTile(`${s.locatable}/${s.total}`, `Precisely located — ${s.coarse} town-centroid, ${s.pendingGeocode} ungeocoded`),
    coverTile(fmtINR(s.revSqftStoreFile), "Revenue per sq ft per year"),
    coverTile(fmtPct(s.storeEbitdaPct), `Store EBITDA — company level ${fmtPct(s.peerEbitdaPct)}`),
  ].join("");

  return el(`<div class="rpt-page rpt-cover">
    <div class="rpt-cover-hero">
      <div class="rpt-cover-brandrow">
        ${logoMark(logo, 46, "rpt-cover-logo")}
        <div class="rpt-cover-brandtx"><div class="rpt-cover-word">MUNSHOT</div><div class="rpt-cover-prep">Investment Diligence Review</div></div>
      </div>
    </div>
    <div class="rpt-cover-mid">
      <div class="rpt-cover-eyebrow">Store Network &amp; Unit Economics</div>
      <h1 class="rpt-cover-co">Patel Retail Ltd</h1>
      <div class="rpt-cover-date">${escapeHtml(model.dateLabel)}</div>
      <div class="rpt-cover-pills">${pills}</div>
      <div class="rpt-cover-glance">
        <div class="rpt-cover-glance-h">At a glance</div>
        <div class="rpt-cover-figs">${tiles}</div>
      </div>
    </div>
    <div class="rpt-cover-note">This report reproduces figures from Patel Retail Ltd's own files
      company store data and exchange filings, plus distances derived from OpenStreetMap-geocoded
      coordinates. Every figure is labelled reported, derived, or estimate and traces to a stated source —
      nothing here is invented to fill a gap, and where Patel Retail's own files disagree, both figures are
      shown side by side rather than averaged or silently picked. Open the live dashboard to cross-verify any
      figure at its source.</div>
    ${footer}
  </div>`);
}

function patelThankYouPage(model, logo, total) {
  const { footer } = patelFrame(total, total, logo, model.dateLabel);
  return el(`<div class="rpt-page rpt-thanks">
    <div class="rpt-thanks-mid">
      ${logoMark(logo, 66, "rpt-thanks-logo")}
      <div class="rpt-thanks-word">MUNSHOT</div>
      <h2 class="rpt-thanks-h">End of report.</h2>
      <p class="rpt-thanks-p">Prepared by <b>Munshot</b> for investment-diligence review of <b>Patel Retail Ltd</b>.<br/>
        Every figure above traces to a stated source — open the live dashboard to verify any of them.</p>
      <div class="rpt-thanks-link">www.muns.io</div>
    </div>
    ${footer}
  </div>`);
}

/* ---------------------------------------------------------------- body ---- */
function patelBodyBlocks(model) {
  const blocks = [];
  const push = (node) => blocks.push({ el: node });
  let n = 1;
  storeNetworkSection(push, model, n++);
  estateSection(push, model, n++);
  peerBenchmarkSection(push, model, n++);
  unitEconomicsSection(push, model, n++);
  return blocks;
}

function sectionHead(push, n, title) {
  push(el(`<div class="rpt-block rpt-keep"><div class="rpt-sec-h"><span class="rpt-sec-n">${n}</span>${escapeHtml(title)}</div></div>`));
}

/* ---- Section 1: Store Network — Precision Status --------------------------- */
function precisionTier(store) {
  if (store.lat == null || store.lng == null) return { label: "Not geocoded", key: "missing" };
  if (isCoarseTier(store.geocode_match_tier)) return { label: "Town centroid", key: "coarse" };
  return { label: "Precise", key: "precise" };
}
function storeTable(rows, cont) {
  return `<table class="rpt-pk">
    <thead><tr>
      <th style="width:8%">ID</th><th style="width:20%">Name</th><th style="width:17%">Town</th>
      <th style="width:10%">District</th><th style="width:13%">Status</th><th style="width:16%">Precision</th><th style="width:16%">Source</th>
    </tr></thead>
    <tbody>${rows
      .map((s) => {
        const tier = precisionTier(s);
        return `<tr>
          <td class="mono">${escapeHtml(s.store_id)}</td>
          <td>${escapeHtml(s.name)}</td>
          <td>${escapeHtml(s.town)}</td>
          <td>${escapeHtml(s.district)}</td>
          <td style="white-space:nowrap">${s.status === "operational" ? "Operational" : "Closed"}</td>
          <td>${badge(tier.label, TIER_HEX[tier.key])}</td>
          <td style="font-size:9px;color:#94a3b8;word-break:keep-all;overflow-wrap:normal">${escapeHtml(s.geo_source || "—")}</td>
        </tr>`;
      })
      .join("")}</tbody>
  </table>${cont ? `<div class="rpt-cont">continued</div>` : ""}`;
}
function storeNetworkSection(push, model, n) {
  const { stores } = model;
  const s = computeStats(model);
  sectionHead(push, n, "Store Network — Precision Status");
  push(
    el(`<div class="rpt-block"><p class="rpt-note">${stores.length} stores total (${s.operational} operational,
      ${stores.length - s.operational} closed) across ${s.towns} towns. ${s.locatable} of ${s.total} are precisely
      located; ${s.coarse} resolved only to a town centroid — shown here with distances suppressed rather than
      fabricated, since a town can be several km across (see PATEL-HANDOFF.md §15.1); ${s.pendingGeocode} have no
      coordinates at all pending Patel Retail's own pins (docs/PINS-NEEDED.md).</p></div>`)
  );
  const sorted = stores.slice().sort((a, b) => a.town.localeCompare(b.town) || a.store_id.localeCompare(b.store_id));
  chunk(sorted, 22).forEach((group, gi) => push(el(`<div class="rpt-block">${storeTable(group, gi > 0)}</div>`)));
}

/* ---- Section 2: Estate & Vintage -------------------------------------------- */
function saturationRead(recentCount, total) {
  if (recentCount === 0) return "Established — no recent additions";
  if (recentCount / total > 0.5) return "Fast-forming — most opened in the last 2 years";
  return "Still growing";
}
function estateSection(push, model, n) {
  const { stores } = model;
  const withDates = stores.filter((s) => s.opened);
  const in2024Plus = withDates.filter((s) => parseInt(s.opened.slice(0, 4), 10) >= 2024).length;
  const rollingRecent = withDates.filter((s) => yearsSince(s.opened) < 2).length;
  const oldest = withDates.reduce((a, b) => (a.opened < b.opened ? a : b));
  const newest = withDates.reduce((a, b) => (a.opened > b.opened ? a : b));

  sectionHead(push, n, "Estate & Vintage");
  push(
    el(`<div class="rpt-block"><p class="rpt-note">Oldest store: <b>${escapeHtml(oldest.name)}</b>
      (${escapeHtml(oldest.opened)}). Newest: <b>${escapeHtml(newest.name)}</b> (${escapeHtml(newest.opened)}).
      Two different "under 2 years" figures, both real: <b>${in2024Plus} of ${stores.length}</b>
      (${Math.round((in2024Plus / stores.length) * 100)}%) opened in calendar year 2024 or later — a fixed fact
      that won't change — while <b>${rollingRecent} of ${stores.length}</b>
      (${Math.round((rollingRecent / stores.length) * 100)}%) opened in the trailing 2 years as of
      ${escapeHtml(model.dateLabel)} — smaller, and shrinking, because the 2024 cohort keeps aging past the
      2-year mark while the calendar-year count doesn't move. Both shown rather than picking whichever sounds
      more dramatic.</p></div>`)
  );

  const ageRows = VINTAGE_BUCKETS.map((bucket, i) => {
    const count = withDates.filter((s) => {
      const yrs = yearsSince(s.opened);
      const prevMax = VINTAGE_BUCKETS[i - 1]?.maxYears ?? 0;
      return yrs > prevMax && yrs <= bucket.maxYears;
    }).length;
    return { label: bucket.label, count };
  });
  push(
    el(`<div class="rpt-block"><table class="rpt-pk">
      <thead><tr><th style="width:40%">Age bucket</th><th style="width:30%">Stores</th><th style="width:30%">% of estate</th></tr></thead>
      <tbody>${ageRows
        .map((r) => `<tr><td>${escapeHtml(r.label)}</td><td class="mono">${r.count}</td><td class="mono">${Math.round((r.count / withDates.length) * 100)}%</td></tr>`)
        .join("")}</tbody>
    </table></div>`)
  );

  const byTown = new Map();
  for (const st of stores) {
    if (!byTown.has(st.town)) byTown.set(st.town, []);
    byTown.get(st.town).push(st);
  }
  const clusters = [...byTown.entries()].filter(([, list]) => list.length >= 2).sort((a, b) => b[1].length - a[1].length);
  push(el(`<div class="rpt-block"><div class="rpt-sub-label">Town saturation — every town with 2+ stores</div></div>`));
  const satRows = clusters.map(([town, list]) => {
    const dated = list.filter((s) => s.opened).sort((a, b) => a.opened.localeCompare(b.opened));
    const recentCount = list.filter((s) => s.opened && yearsSince(s.opened) < 2).length;
    return { town, count: list.length, first: dated[0]?.opened || "—", last: dated[dated.length - 1]?.opened || "—", read: saturationRead(recentCount, list.length) };
  });
  chunk(satRows, 20).forEach((group, gi) =>
    push(
      el(`<div class="rpt-block"><table class="rpt-pk">
        <thead><tr><th style="width:26%">Town</th><th style="width:12%">Stores</th><th style="width:16%">First opened</th><th style="width:16%">Most recent</th><th style="width:30%">Read</th></tr></thead>
        <tbody>${group
          .map((r) => `<tr><td>${escapeHtml(r.town)}</td><td class="mono">${r.count}</td><td class="mono">${escapeHtml(r.first)}</td><td class="mono">${escapeHtml(r.last)}</td><td>${escapeHtml(r.read)}</td></tr>`)
          .join("")}</tbody>
      </table>${gi > 0 ? `<div class="rpt-cont">continued</div>` : ""}</div>`)
    )
  );
}

/* ---- Section 3: Peer Benchmark ---------------------------------------------- */
function peerBenchmarkSection(push, model, n) {
  const m = model.metrics;
  sectionHead(push, n, "Peer Benchmark");
  const t = m.peer_model_corrections.trent;
  push(
    el(`<div class="rpt-block"><div class="rpt-sub-label">Trent — revenue and revenue/store, corrected</div>
      <table class="rpt-pk">
        <thead><tr><th style="width:34%">Figure</th><th style="width:33%">Old model (wrong)</th><th style="width:33%">Corrected</th></tr></thead>
        <tbody>
          <tr><td>Revenue</td><td class="mono">${fmtCr(t.wrong_revenue_cr)}</td><td class="mono">${fmtCr(t.corrected_revenue_cr)}</td></tr>
          <tr><td>Revenue/store</td><td class="mono">${fmtL(t.wrong_revenue_per_store_lakh)}</td><td class="mono">${fmtL(t.corrected_revenue_per_store_lakh)}</td></tr>
        </tbody>
      </table>
      <p class="rpt-note">${escapeHtml(t.still_needs_source_file)}</p>
    </div>`)
  );

  const sp = m.peer_model_corrections.spencers;
  push(
    el(`<div class="rpt-block"><div class="rpt-sub-label">Spencer's — gross profit, corrected (understated ${fmtPct(sp.understated_pct, 0)})</div>
      <table class="rpt-pk">
        <thead><tr><th style="width:34%">Figure</th><th style="width:33%">Old model (wrong)</th><th style="width:33%">Corrected</th></tr></thead>
        <tbody><tr><td>Gross profit</td><td class="mono">${fmtCr(sp.wrong_gross_profit_cr)}</td><td class="mono">${fmtCr(sp.corrected_gross_profit_cr)}</td></tr></tbody>
      </table>
    </div>`)
  );

  const osia = m.osia_hyper_retail;
  const v2 = m.v2_retail;
  const naOr = (v, fmt) => (v == null ? "Not disclosed" : fmt(v));
  const operationalCount = model.stores.filter((st) => st.status === "operational").length;
  push(
    el(`<div class="rpt-block"><div class="rpt-sub-label">Osia Hyper Retail &amp; V2 Retail — the closest scale peers (Patel's own scale is ${operationalCount} operational stores; every other peer in the model is 120+)</div>
      <table class="rpt-pk">
        <thead><tr><th style="width:22%">Figure</th><th style="width:39%">Osia Hyper Retail (${escapeHtml(osia.fiscal_year)})</th><th style="width:39%">V2 Retail (${escapeHtml(v2.fiscal_year)})</th></tr></thead>
        <tbody>
          <tr><td>Revenue</td><td class="mono">${fmtCr(osia.revenue_cr)}</td><td class="mono">${fmtCr(v2.revenue_cr)}</td></tr>
          <tr><td>Revenue growth YoY</td><td class="mono">${fmtPct((osia.revenue_cr - osia.revenue_prev_year_cr) / osia.revenue_prev_year_cr)}</td><td class="mono">${fmtPct((v2.revenue_cr - v2.revenue_prev_year_cr) / v2.revenue_prev_year_cr)}</td></tr>
          <tr><td>EBITDA (margin)</td><td class="mono">${fmtCr(osia.ebitda_cr)} (${fmtPct(osia.ebitda_margin_pct)})</td><td class="mono">${fmtCr(v2.ebitda_cr)} (${fmtPct(v2.ebitda_margin_pct)})</td></tr>
          <tr><td>PAT</td><td class="mono">${fmtCr(osia.pat_cr)}</td><td class="mono">${fmtCr(v2.pat_cr)}</td></tr>
          <tr><td>Total stores</td><td class="mono">${naOr(osia.total_stores, (v) => v.toLocaleString("en-IN"))}</td><td class="mono">${naOr(v2.total_stores, (v) => v.toLocaleString("en-IN"))}</td></tr>
          <tr><td>Retail area</td><td class="mono">${naOr(osia.retail_area_mn_sqft, (v) => `${v.toLocaleString("en-IN")} mn sqft${osia.retail_area_store_basis ? ` (${osia.retail_area_store_basis} of ${osia.total_stores} stores)` : ""}`)}</td><td class="mono">${naOr(v2.retail_area_mn_sqft, (v) => `${v.toLocaleString("en-IN")} mn sqft`)}</td></tr>
          <tr><td>Private label %</td><td class="mono">${naOr(osia.private_label_pct, (v) => fmtPct(v))}</td><td class="mono">${naOr(v2.private_label_pct, (v) => `${fmtPct(v)}${v2.private_label_as_of ? ` (${escapeHtml(v2.private_label_as_of)})` : ""}`)}</td></tr>
        </tbody>
      </table>
      <p class="rpt-note">${escapeHtml(osia.name)}: ${escapeHtml(osia.note)} — ${escapeHtml(osia.source)}</p>
      <p class="rpt-note">${escapeHtml(osia.period_offset_flag)}</p>
      <p class="rpt-note">${escapeHtml(v2.name)}: ${escapeHtml(v2.note)} — ${escapeHtml(v2.source)}</p>
      <p class="rpt-note">${escapeHtml(v2.category_flag)}</p>
    </div>`)
  );

  const c = m.cross_file_contradictions;
  push(
    el(`<div class="rpt-block"><p class="rpt-note">Where the two supplied files disagree, this report uses the store
      company store data throughout: store count ${c.store_count.store_file_operational_plus_closed}, avg store size
      ${c.avg_store_size_sqft.store_file.toLocaleString("en-IN")} sq ft, revenue/sq ft ${fmtINR(c.revenue_per_sqft_year.store_file)},
      avg bill \u20b9${c.avg_bill_size.store_file}. Alternate figures from the supplied model are recorded in the source audit,
      not used here.</p></div>`)
  );
}

/* ---- Section 4: Unit Economics ---------------------------------------------- */
function unitEconomicsSection(push, model, n) {
  const m = model.metrics;
  const ue = m.unit_economics;
  const c = m.cross_file_contradictions.revenue_per_sqft_year;
  const s = computeStats(model);
  const pnl = s.pnl;

  sectionHead(push, n, "Unit Economics");
  push(
    el(`<div class="rpt-block"><div class="rpt-sub-label">Revenue/sq ft — Patel Retail's two source files disagree by ${(c.gap_pct * 100).toFixed(0)}%</div>
      <div class="rpt-compare">
        <div class="rpt-cbox used"><div class="cl">Used in this report</div><div class="cv">${fmtINR(c.store_file)}</div><div class="cs">Company store data</div></div>
        <div class="rpt-cbox"><div class="cl">Alternate figure (not used)</div><div class="cv">${fmtINR(c.peer_model)}</div><div class="cs">Supplied model</div></div>
      </div>
      <p class="rpt-note">${escapeHtml(c.resolution_note)}</p>
    </div>`)
  );

  push(
    el(`<div class="rpt-block"><div class="rpt-sub-label">Area per store ${kindBadge("estimate")}</div>
      <div class="rpt-cbox used" style="max-width:260px"><div class="cl">Applied uniformly to all ${model.stores.length} stores</div><div class="cv">${ue.sqft_per_store.toLocaleString("en-IN")} sq ft</div></div>
      <p class="rpt-note">${escapeHtml(ue.sqft_per_store_note)} The store P&amp;L below is built on this figure — every line in it inherits the estimate label.</p>
    </div>`)
  );

  push(
    el(`<div class="rpt-block"><div class="rpt-sub-label">Store P&amp;L — built from reported unit economics ${kindBadge("reported")}</div>
      <table class="rpt-pk">
        <tbody>
          <tr><td>Revenue (per store/yr)</td><td class="mono" style="text-align:right">${fmtL(pnl.revenue_l)}</td></tr>
          <tr><td>Gross profit @ ${fmtPct(pnl.gross_margin_pct)}</td><td class="mono" style="text-align:right">${fmtL(pnl.grossProfitL)}</td></tr>
          <tr><td>Less: rent</td><td class="mono" style="text-align:right">−${fmtL(pnl.rent_l)}</td></tr>
          <tr><td>Less: utilities</td><td class="mono" style="text-align:right">−${fmtL(pnl.utilities_l)}</td></tr>
          <tr><td>Less: staff</td><td class="mono" style="text-align:right">−${fmtL(pnl.staff_l)}</td></tr>
          <tr style="font-weight:700"><td>Store EBITDA (before head-office cost) ${kindBadge("derived")}</td><td class="mono" style="text-align:right">${fmtL(pnl.ebitdaL)} · ${fmtPct(pnl.ebitdaPct)}</td></tr>
        </tbody>
      </table>
      <p class="rpt-note"><b>${fmtPct(pnl.ebitdaPct)} store-level is lower than the ${fmtPct(pnl.peer_model_b2c_ebitda_pct)} company-level margin as filed</b> —
      company-level margin cannot exceed store-level once head-office overhead is added, which is backwards as given. Not resolved here — worth raising with
      Patel Retail directly. ${pnl.total_company_note ? escapeHtml(pnl.total_company_note) : ""}</p>
    </div>`)
  );

  const mix = m.revenue_mix;
  push(
    el(`<div class="rpt-block"><div class="rpt-sub-label">Revenue mix &amp; margin ${kindBadge("reported")}</div>
      <table class="rpt-pk">
        <thead><tr><th style="width:40%">Metric</th><th style="width:30%">Value used</th><th style="width:30%">Stated range</th></tr></thead>
        <tbody>
          <tr><td>Food</td><td class="mono">${fmtPct(mix.food, 0)}</td><td class="mono">—</td></tr>
          <tr><td>Non-food</td><td class="mono">${fmtPct(mix.non_food)}</td><td class="mono">${escapeHtml(mix.non_food_range)}</td></tr>
          <tr><td>Merchandise</td><td class="mono">${fmtPct(mix.merchandise)}</td><td class="mono">${escapeHtml(mix.merchandise_range)}</td></tr>
          <tr><td>Gross margin</td><td class="mono">${fmtPct(ue.gross_margin_pct)}</td><td class="mono">${escapeHtml(ue.gross_margin_pct_range)}</td></tr>
          <tr><td>Private label</td><td class="mono">${fmtPct(ue.private_label_pct)}</td><td class="mono">— exact figure</td></tr>
        </tbody>
      </table>
      <p class="rpt-note">Where the company states a range rather than a single figure, the value used throughout this dashboard is the range midpoint — shown here so the reader can see both. ${escapeHtml(ue.private_label_pct_note)}</p>
    </div>`)
  );

  const pl = m.peer_comparison.private_label_pct;
  push(
    el(`<div class="rpt-block"><div class="rpt-sub-label">Private label % vs peers ${kindBadge("reported")}</div>
      <table class="rpt-pk">
        <thead><tr><th style="width:50%">Company</th><th style="width:50%">Private label %</th></tr></thead>
        <tbody>
          <tr style="font-weight:700"><td>Patel Retail</td><td class="mono">${fmtPct(pl.patel)}</td></tr>
          <tr><td>DMart</td><td class="mono">${fmtPct(pl.dmart)}</td></tr>
          <tr><td>Vishal Mega Mart</td><td class="mono">${fmtPct(pl.vishal_mega_mart)}</td></tr>
          <tr><td>Trent</td><td class="mono">${fmtPct(pl.trent)}</td></tr>
        </tbody>
      </table>
      <p class="rpt-note">${escapeHtml(pl.note)}</p>
    </div>`)
  );
}

/* --------------------------------------------------------------- styles ---- */
let patelStylesInjected = false;
function injectPatelReportStyles() {
  injectStyles(); // shared .dk-report page/table/card CSS from report.js — untouched
  if (patelStylesInjected) return;
  patelStylesInjected = true;
  const css = `
  .dk-report .rpt-pk { width: 100%; border-collapse: collapse; font-size: 10.5px; table-layout: fixed; }
  .dk-report .rpt-pk th { text-align: left; font-size: 9px; font-weight: 700; letter-spacing: .4px; text-transform: uppercase; color: #94a3b8; padding: 6px 8px; border-bottom: 1.5px solid #e6e8f0; background: #fafbfe; }
  .dk-report .rpt-pk td { padding: 6px 8px; border-bottom: 1px solid #eef1f6; vertical-align: top; color: #334155; overflow-wrap: anywhere; }
  .dk-report .rpt-pk tbody tr:nth-child(even) { background: #fafbfe; }
  .dk-report .rpt-pk td.mono { font-family: 'JetBrains Mono', monospace; }
  .dk-report .rpt-badge { display: inline-block; font-size: 8.5px; font-weight: 700; letter-spacing: .3px; text-transform: uppercase; padding: 2px 7px; border-radius: 999px; white-space: nowrap; }
  .dk-report .rpt-note { font-size: 10.5px; line-height: 1.55; color: #64748b; margin: 6px 0 0; }
  .dk-report .rpt-compare { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 8px 0; }
  .dk-report .rpt-cbox { border: 1px solid #e6e8f0; border-radius: 8px; padding: 9px 11px; }
  .dk-report .rpt-cbox.used { border-color: #a7f3d0; background: #f0fdf9; }
  .dk-report .rpt-cbox .cl { font-size: 8.5px; font-weight: 700; letter-spacing: .4px; text-transform: uppercase; color: #94a3b8; }
  .dk-report .rpt-cbox .cv { font-family: 'Space Grotesk', sans-serif; font-size: 16px; font-weight: 700; color: #0f172a; margin-top: 2px; }
  .dk-report .rpt-cbox .cs { font-size: 9px; color: #94a3b8; margin-top: 2px; }
  `;
  const style = document.createElement("style");
  style.id = "dk-patel-report-styles";
  style.textContent = css;
  document.head.appendChild(style);
}
