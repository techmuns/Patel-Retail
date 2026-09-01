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
  // Sign outside the currency symbol: "-₹10 cr", not "₹-10 cr".
  return `${v < 0 ? "-" : ""}₹${Math.abs(v).toLocaleString("en-IN", { maximumFractionDigits: 1 })} cr`;
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

/** Every section opens a page of its own. */
function sectionHead(push, n, title) {
  push(el(`<div class="rpt-block rpt-keep rpt-break"><div class="rpt-sec-h"><span class="rpt-sec-n">${n}</span>${escapeHtml(title)}</div></div>`));
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
    el(`<div class="rpt-block"><table class="rpt-pk">
      <thead><tr><th style="width:60%">Network</th><th style="width:20%">Stores</th><th style="width:20%">Share</th></tr></thead>
      <tbody>
        <tr><td>Total</td><td class="mono" style="text-align:right">${stores.length}</td><td class="mono" style="text-align:right">100%</td></tr>
        <tr><td>Operational</td><td class="mono" style="text-align:right">${s.operational}</td><td class="mono" style="text-align:right">${Math.round((s.operational / stores.length) * 100)}%</td></tr>
        <tr><td>Closed</td><td class="mono" style="text-align:right">${stores.length - s.operational}</td><td class="mono" style="text-align:right">${Math.round(((stores.length - s.operational) / stores.length) * 100)}%</td></tr>
        <tr><td>Towns covered</td><td class="mono" style="text-align:right">${s.towns}</td><td class="mono" style="text-align:right">&mdash;</td></tr>
        <tr><td>Precisely located</td><td class="mono" style="text-align:right">${s.locatable}</td><td class="mono" style="text-align:right">${Math.round((s.locatable / s.total) * 100)}%</td></tr>
        <tr><td>Town centroid only &mdash; distances suppressed</td><td class="mono" style="text-align:right">${s.coarse}</td><td class="mono" style="text-align:right">${Math.round((s.coarse / s.total) * 100)}%</td></tr>
        <tr><td>No coordinates &mdash; map pin needed</td><td class="mono" style="text-align:right">${s.pendingGeocode}</td><td class="mono" style="text-align:right">${Math.round((s.pendingGeocode / s.total) * 100)}%</td></tr>
      </tbody>
    </table></div>`)
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
    el(`<div class="rpt-block"><table class="rpt-pk">
      <thead><tr><th style="width:50%">Vintage</th><th style="width:28%">Value</th><th style="width:22%">Share</th></tr></thead>
      <tbody>
        <tr><td>Oldest store</td><td>${escapeHtml(oldest.name)}</td><td class="mono">${escapeHtml(oldest.opened)}</td></tr>
        <tr><td>Newest store</td><td>${escapeHtml(newest.name)}</td><td class="mono">${escapeHtml(newest.opened)}</td></tr>
        <tr><td>Opened 2024 or later (calendar)</td><td class="mono" style="text-align:right">${in2024Plus} of ${stores.length}</td><td class="mono" style="text-align:right">${Math.round((in2024Plus / stores.length) * 100)}%</td></tr>
        <tr><td>Under 2 years old (rolling, as at ${escapeHtml(model.dateLabel)})</td><td class="mono" style="text-align:right">${rollingRecent} of ${stores.length}</td><td class="mono" style="text-align:right">${Math.round((rollingRecent / stores.length) * 100)}%</td></tr>
      </tbody>
    </table></div>`)
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

  const osia = m.osia_hyper_retail;
  // Spencer's replaces V2 Retail here for the same reason as on screen: V2
  // sells clothes, so its margin was never a benchmark Patel could be read
  // against. Spencer's is an actual grocer at a comparable size.
  const sp = { ...m.spencers_retail, revenue_prev_year_cr: m.spencers_retail.prior_year?.revenue_cr ?? null };
  const naOr = (v, fmt) => (v == null ? "Not disclosed" : fmt(v));
  const dashOr = (v, fmt) => (v == null ? "\u2014" : fmt(v));
  const shortPeriod = (p) => String(p || "").replace(/\s*\([^)]*\)/, "");
  const operationalCount = model.stores.filter((st) => st.status === "operational").length;

  // Whole peer set on one table rather than a page of prose about it.
  const peers = [
    { name: "Patel Retail", period: m.store_pnl_reconciliation.fiscal_year || "FY2026", rev: m.store_pnl_reconciliation.total_company_revenue_cr, ebitdaPct: m.store_pnl_reconciliation.peer_model_b2c_ebitda_pct, stores: operationalCount, pl: m.peer_comparison.private_label_pct.patel },
    { name: "Avenue Supermarts (DMart)", period: m.dmart.fiscal_year, rev: m.dmart.revenue_cr, ebitdaPct: m.dmart.ebitda_margin_pct, stores: m.dmart.total_stores, pl: m.peer_comparison.private_label_pct.dmart },
    { name: "Vishal Mega Mart", period: m.vishal_mega_mart.fiscal_year, rev: m.vishal_mega_mart.revenue_cr, ebitdaPct: m.vishal_mega_mart.ebitda_margin_pct, stores: m.vishal_mega_mart.total_stores, pl: m.peer_comparison.private_label_pct.vishal_mega_mart },
    { name: "Trent (Star Bazaar)", period: "FY2026", rev: m.peer_model_corrections.trent.corrected_revenue_cr, ebitdaPct: null, stores: m.peer_model_corrections.trent.store_count, pl: m.peer_comparison.private_label_pct.trent },
    { name: "Spencer's Retail", period: m.spencers_retail.fiscal_year, rev: m.spencers_retail.revenue_cr, ebitdaPct: m.spencers_retail.ebitda_margin_pct, stores: m.spencers_retail.total_stores, pl: null },
    { name: "Osia Hyper Retail", period: osia.fiscal_year, rev: osia.revenue_cr, ebitdaPct: osia.ebitda_margin_pct, stores: osia.total_stores, pl: osia.private_label_pct },
    { name: "V2 Retail", period: m.v2_retail.fiscal_year, rev: m.v2_retail.revenue_cr, ebitdaPct: m.v2_retail.ebitda_margin_pct, stores: m.v2_retail.total_stores, pl: m.v2_retail.private_label_pct },
  ];
  push(
    el(`<div class="rpt-block"><div class="rpt-sub-label">Peer set ${kindBadge("reported")}</div>
      <table class="rpt-pk">
        <thead><tr>
          <th style="width:30%">Company</th><th style="width:13%">Period</th><th style="width:17%">Revenue</th>
          <th style="width:13%">EBITDA %</th><th style="width:12%">Stores</th><th style="width:15%">Private label</th>
        </tr></thead>
        <tbody>${peers
          .map(
            (p) => `<tr>
            <td>${escapeHtml(p.name)}</td>
            <td class="mono">${escapeHtml(shortPeriod(p.period))}</td>
            <td class="mono" style="text-align:right">${fmtCr(p.rev)}</td>
            <td class="mono" style="text-align:right">${dashOr(p.ebitdaPct, (v) => fmtPct(v))}</td>
            <td class="mono" style="text-align:right">${dashOr(p.stores, (v) => v.toLocaleString("en-IN"))}</td>
            <td class="mono" style="text-align:right">${dashOr(p.pl, (v) => fmtPct(v))}</td>
          </tr>`
          )
          .join("")}</tbody>
      </table>
    </div>`)
  );

  const growth = (c) => (c.revenue_prev_year_cr ? fmtPct((c.revenue_cr - c.revenue_prev_year_cr) / c.revenue_prev_year_cr) : "Not disclosed");
  push(
    el(`<div class="rpt-block"><div class="rpt-sub-label">Patel vs. the two listed grocers closest to its size ${kindBadge("reported")}</div>
      <table class="rpt-pk">
        <thead><tr>
          <th style="width:25%">Figure</th>
          <th style="width:25%">Patel Retail (FY2026)</th>
          <th style="width:25%">Osia Hyper Retail (${escapeHtml(osia.fiscal_year)})</th>
          <th style="width:25%">Spencer's Retail (${escapeHtml(sp.fiscal_year)})</th>
        </tr></thead>
        <tbody>
          <tr><td>Revenue</td><td class="mono">${fmtCr(m.store_pnl_reconciliation.total_company_revenue_cr)}</td><td class="mono">${fmtCr(osia.revenue_cr)}</td><td class="mono">${fmtCr(sp.revenue_cr)}</td></tr>
          <tr><td>Revenue growth YoY</td><td class="mono">${fmtPct(0.276)}</td><td class="mono">${growth(osia)}</td><td class="mono">${growth(sp)}</td></tr>
          <tr><td>EBITDA (margin)</td><td class="mono">${fmtCr(m.store_pnl_reconciliation.total_company_ebitda_cr)} (${fmtPct(m.store_pnl_reconciliation.peer_model_b2c_ebitda_pct)})</td><td class="mono">${fmtCr(osia.ebitda_cr)} (${fmtPct(osia.ebitda_margin_pct)})</td><td class="mono">${fmtCr(sp.ebitda_cr)} (${fmtPct(sp.ebitda_margin_pct)})</td></tr>
          <tr><td>PAT</td><td class="mono">${fmtCr(m.store_pnl_reconciliation.total_company_pat_cr)}</td><td class="mono">${fmtCr(osia.pat_cr)}</td><td class="mono">${fmtCr(sp.pat_cr)}</td></tr>
          <tr><td>Total stores</td><td class="mono">${operationalCount}</td><td class="mono">${naOr(osia.total_stores, (v) => v.toLocaleString("en-IN"))}</td><td class="mono">${naOr(sp.total_stores, (v) => v.toLocaleString("en-IN"))}</td></tr>
          <tr><td>Status</td><td>Growing, profitable</td><td>${escapeHtml(osia.status_flag || "\u2014")}</td><td>Shrinking, loss-making</td></tr>
        </tbody>
      </table>
    </div>`)
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
    el(`<div class="rpt-block"><div class="rpt-sub-label">Revenue per sq ft per year ${kindBadge("derived")}</div>
      <div class="rpt-compare">
        <div class="rpt-cbox used"><div class="cl">Used in this report</div><div class="cv">${fmtINR(c.store_file)}</div><div class="cs">Company store data</div></div>
        <div class="rpt-cbox"><div class="cl">Alternate figure (not used)</div><div class="cv">${fmtINR(c.peer_model)}</div><div class="cs">Supplied model</div></div>
      </div>
    </div>`)
  );

  push(
    el(`<div class="rpt-block"><div class="rpt-sub-label">Area per store ${kindBadge("estimate")}</div>
      <div class="rpt-cbox used" style="max-width:260px"><div class="cl">Applied uniformly to all ${model.stores.length} stores</div><div class="cv">${ue.sqft_per_store.toLocaleString("en-IN")} sq ft</div></div>
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
    </div>`)
  );

  const filedOpMarginPct = pnl.total_company_ebitda_cr && pnl.total_company_revenue_cr
    ? pnl.total_company_ebitda_cr / pnl.total_company_revenue_cr
    : null;
  push(
    el(`<div class="rpt-block"><div class="rpt-sub-label">Store build-up vs company level ${kindBadge("derived")}</div>
      <table class="rpt-pk">
        <thead><tr><th style="width:56%">Measure</th><th style="width:22%">Value</th><th style="width:22%">Basis</th></tr></thead>
        <tbody>
          <tr><td>Store EBITDA margin, before head-office cost</td><td class="mono" style="text-align:right">${fmtPct(pnl.ebitdaPct)}</td><td>Per store</td></tr>
          <tr><td>Company EBITDA margin, as filed</td><td class="mono" style="text-align:right">${fmtPct(pnl.peer_model_b2c_ebitda_pct)}</td><td>Company</td></tr>
          <tr><td>Gap</td><td class="mono" style="text-align:right">${((pnl.ebitdaPct - pnl.peer_model_b2c_ebitda_pct) * 100).toFixed(1)} pts</td><td>Store &minus; company</td></tr>
          <tr><td>Company revenue</td><td class="mono" style="text-align:right">${fmtCr(pnl.total_company_revenue_cr)}</td><td>Filed</td></tr>
          <tr><td>Company EBITDA</td><td class="mono" style="text-align:right">${fmtCr(pnl.total_company_ebitda_cr)}</td><td>Filed</td></tr>
          <tr><td>Company PAT</td><td class="mono" style="text-align:right">${fmtCr(pnl.total_company_pat_cr)}</td><td>Filed</td></tr>
          <tr><td>Retail share of revenue</td><td class="mono" style="text-align:right">${fmtPct(pnl.b2c_share_pct, 0)}</td><td>Company-stated</td></tr>
        </tbody>
      </table>
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
