/**
 * public/js/peers.js — Peer Benchmark view.
 *
 * Checking a source spreadsheet is backend work. This screen carries the
 * corrected figures only — never the file they came from, and no longer the
 * before/after of what was wrong with them (that is docs/PEER-MODEL-AUDIT.md,
 * which records all 10 defects including the two that move a number, Trent's
 * revenue/area mismatch and Spencer's gross-profit formula).
 *
 * Everything shown is either a reported figure, a live Screener reading, or
 * computed from stores.json. Nothing is estimated to fill a gap: where a
 * company does not publish something, the cell says so.
 */
import { qs, escapeHtml, refreshIcons } from "./ui.js";
import { computePnl } from "./pnl.js";
import { renderScreenerKpis } from "./screener-kpis.js";


async function loadMetrics() {
  const res = await fetch("./data/metrics.json", { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load metrics.json: ${res.status}`);
  return res.json();
}

async function loadStores() {
  const res = await fetch("./data/stores.json", { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load stores.json: ${res.status}`);
  return (await res.json()).stores;
}

function fmtCr(value) {
  const n = Math.abs(value).toLocaleString("en-IN", { maximumFractionDigits: 1 });
  return `${value < 0 ? "-" : ""}₹${n} cr`;
}
function fmtLakh(value) {
  // 1 decimal, matching fmtL() in patel-report.js — this value (Trent's
  // revenue/store) is shown on both screen and PDF and must round the same
  // way in both places.
  return `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 1 })} L`;
}
function fmtPct(value, digits = 1) {
  return `${(value * 100).toFixed(digits)}%`;
}

function cellOrNA(value, fmt, kind = "reported") {
  if (value == null) return `<span class="cb-na">Not disclosed</span>`;
  return `${fmt(value)} <span class="kind-pill kind-${kind}">${kind}</span>`;
}

/**
 * The real, cross-company peer table — every figure sourced or computed
 * live, nothing invented to fill a gap. Deliberately sparse for Avenue
 * Supermarts/DMart, Vishal Mega Mart and Spencer's Retail: this project has
 * never had more than isolated bug-fix figures for them (private label %,
 * one corrected line item each), not full financials — "Not available" is
 * the honest state, not a placeholder waiting to be filled with a guess.
 */
function renderGenuinePeerTable(metrics, patelStoreCount) {
  const body = qs("#peerTableBody");
  if (!body) return;
  const pl = metrics.peer_comparison.private_label_pct;
  const trent = metrics.peer_model_corrections.trent;
  const rec = metrics.store_pnl_reconciliation;
  const osia = metrics.osia_hyper_retail;
  const v2 = metrics.v2_retail;
  const dmart = metrics.dmart;
  const vishal = metrics.vishal_mega_mart;
  const spencers = metrics.spencers_retail;
  const storeEbitdaPct = computePnl(rec).ebitdaPct;

  const rows = [
    {
      name: "Patel Retail",
      highlight: true,
      revenue: `${fmtCr(rec.total_company_revenue_cr)} <span class="kind-pill kind-reported">reported</span><div style="font-size:10.5px;color:var(--text-4)">total company, 45% B2C</div>`,
      ebitda: `${fmtPct(storeEbitdaPct)} <span class="kind-pill kind-derived">derived</span> / ${fmtPct(rec.peer_model_b2c_ebitda_pct)} <span class="kind-pill kind-reported">reported</span><div style="font-size:10.5px;color:var(--text-4)">store build-up vs company level — see Store Economics</div>`,
      stores: `${patelStoreCount} <span class="kind-pill kind-reported">reported</span>`,
      privateLabel: cellOrNA(pl.patel, (v) => fmtPct(v)),
    },
    {
      name: "Avenue Supermarts (DMart)",
      revenue: `${fmtCr(dmart.revenue_cr)} <span class="kind-pill kind-reported">reported</span><div style="font-size:10.5px;color:var(--text-4)">${escapeHtml(dmart.fiscal_year)}</div>`,
      ebitda: `${fmtPct(dmart.ebitda_margin_pct)} <span class="kind-pill kind-reported">reported</span>`,
      stores: cellOrNA(dmart.total_stores, (v) => v.toLocaleString("en-IN")),
      privateLabel: cellOrNA(pl.dmart, (v) => fmtPct(v)),
    },
    {
      name: "Vishal Mega Mart",
      revenue: `${fmtCr(vishal.revenue_cr)} <span class="kind-pill kind-reported">reported</span><div style="font-size:10.5px;color:var(--text-4)">${escapeHtml(vishal.fiscal_year)}</div>`,
      ebitda: `${fmtPct(vishal.ebitda_margin_pct)} <span class="kind-pill kind-reported">reported</span>`,
      stores: cellOrNA(vishal.total_stores, (v) => v.toLocaleString("en-IN")),
      privateLabel: cellOrNA(pl.vishal_mega_mart, (v) => fmtPct(v)),
    },
    {
      name: "Trent (Star Bazaar)",
      revenue: `${fmtCr(trent.corrected_revenue_cr)} <span class="kind-pill kind-derived">derived</span><div style="font-size:10.5px;color:var(--text-4)">Star Bazaar format only, not all of Trent</div>`,
      ebitda: `<span class="cb-na">Not disclosed</span>`,
      stores: `${trent.store_count} <span class="kind-pill kind-reported">reported</span>`,
      privateLabel: cellOrNA(pl.trent, (v) => fmtPct(v)),
    },
    {
      name: "Spencer's Retail",
      revenue: `${fmtCr(spencers.revenue_cr)} <span class="kind-pill kind-reported">reported</span><div style="font-size:10.5px;color:var(--text-4)">${escapeHtml(spencers.fiscal_year)}</div>`,
      ebitda: `${fmtPct(spencers.ebitda_margin_pct)} <span class="kind-pill kind-reported">reported</span><div style="font-size:10.5px;color:var(--text-4)">loss-making</div>`,
      stores: cellOrNA(spencers.total_stores, (v) => v.toLocaleString("en-IN")),
      privateLabel: `<span class="cb-na">Not disclosed</span>`,
    },
    {
      name: "Osia Hyper Retail",
      nameSuffix: osia.status_flag ? ` <span class="chip failed" style="padding:2px 7px;font-size:10px">${escapeHtml(osia.status_flag)}</span>` : "",
      revenue: `${fmtCr(osia.revenue_cr)} <span class="kind-pill kind-reported">reported</span><div style="font-size:10.5px;color:var(--text-4)">${escapeHtml(osia.fiscal_year)}</div>`,
      ebitda: `${fmtPct(osia.ebitda_margin_pct)} <span class="kind-pill kind-reported">reported</span>`,
      stores: cellOrNA(osia.total_stores, (v) => v.toLocaleString("en-IN")),
      privateLabel: cellOrNA(osia.private_label_pct, (v) => fmtPct(v)),
    },
    {
      name: "V2 Retail",
      revenue: `${fmtCr(v2.revenue_cr)} <span class="kind-pill kind-reported">reported</span><div style="font-size:10.5px;color:var(--text-4)">${escapeHtml(v2.fiscal_year)}</div>`,
      ebitda: `${fmtPct(v2.ebitda_margin_pct)} <span class="kind-pill kind-reported">reported</span><div style="font-size:10.5px;color:var(--text-4)">apparel-led — not a grocery margin comparison</div>`,
      stores: cellOrNA(v2.total_stores, (v) => v.toLocaleString("en-IN")),
      privateLabel: cellOrNA(v2.private_label_pct, (v) => fmtPct(v)),
    },
  ];

  body.innerHTML = rows
    .map(
      (r) => `
    <tr${r.highlight ? ' style="background:var(--surface-hover)"' : ""}>
      <td style="font-weight:${r.highlight ? 700 : 500}">${escapeHtml(r.name)}${r.nameSuffix || ""}</td>
      <td>${r.revenue}</td>
      <td>${r.ebitda}</td>
      <td>${r.stores}</td>
      <td>${r.privateLabel}</td>
    </tr>`
    )
    .join("");
}

function fmtCrOrNA(value) {
  return value == null ? `<span class="cb-na">Not disclosed</span>` : fmtCr(value);
}
function fmtNumOrNA(value, unit = "") {
  return value == null ? `<span class="cb-na">Not disclosed</span>` : `${value.toLocaleString("en-IN")}${unit}`;
}
function fmtPctOrNA(value, digits = 1) {
  return value == null ? `<span class="cb-na">Not disclosed</span>` : fmtPct(value, digits);
}

function renderPeerCompanyBlock(p) {
  const growthPct = p.revenue_prev_year_cr ? (p.revenue_cr - p.revenue_prev_year_cr) / p.revenue_prev_year_cr : null;
  return `
    <div class="compare-box${p.subject ? " used" : ""}" data-kind="reported" style="text-align:left">
      <div class="cb-label">${escapeHtml(p.name)} <span style="font-weight:400;text-transform:none;color:var(--text-4)">(${escapeHtml(p.ticker)})</span>${
        p.status_flag ? ` <span class="chip failed" style="padding:2px 7px;font-size:10px;text-transform:none">${escapeHtml(p.status_flag)}</span>` : ""
      }</div>
      <div style="font-size:11.5px;color:var(--text-2);margin-top:2px">${escapeHtml(p.fiscal_year)}</div>
      <table class="metric-table" style="margin-top:10px">
        <tr><td>Revenue</td><td class="mono">${fmtCr(p.revenue_cr)} <span class="kind-pill kind-reported">reported</span></td></tr>
        <tr><td>Revenue growth YoY</td><td class="mono">${growthPct == null ? `<span class="cb-na">Not disclosed</span>` : `${fmtPct(growthPct, 1)} <span class="kind-pill kind-derived">derived</span>`}</td></tr>
        <tr><td>EBITDA</td><td class="mono">${fmtCr(p.ebitda_cr)} (${fmtPct(p.ebitda_margin_pct, 1)} margin) <span class="kind-pill kind-reported">reported</span></td></tr>
        <tr><td>PAT</td><td class="mono">${fmtCr(p.pat_cr)} <span class="kind-pill kind-reported">reported</span></td></tr>
        <tr><td>Total stores</td><td class="mono">${fmtNumOrNA(p.total_stores)}</td></tr>
        <tr><td>Retail area</td><td class="mono">${fmtNumOrNA(p.retail_area_mn_sqft, " mn sqft")}${
          p.retail_area_kind ? ` <span class="kind-pill kind-${p.retail_area_kind}">${p.retail_area_kind}</span>` : ""
        }${
          p.retail_area_store_basis
            ? `<div style="font-size:10.5px;color:var(--text-3);font-family:var(--font-sans, inherit)">covers ${p.retail_area_store_basis} of the ${p.total_stores} stores</div>`
            : ""
        }</td></tr>
        <tr><td>Private label %</td><td class="mono">${fmtPctOrNA(p.private_label_pct)}${
          p.private_label_as_of
            ? `<div style="font-size:10.5px;color:var(--text-3);font-family:var(--font-sans, inherit)">${escapeHtml(p.private_label_as_of)}</div>`
            : ""
        }</td></tr>
      </table>
      <p style="font-size:11.5px;color:var(--text-2);margin-top:8px">Source: ${
        p.source_url
          ? `<a href="${escapeHtml(p.source_url)}" target="_blank" rel="noopener" style="color:var(--text-2)">${escapeHtml(p.source)}</a>`
          : `<span style="color:var(--text-2)">${escapeHtml(p.source)}</span>`
      }</p>
    </div>
  `;
}

/**
 * Patel against the two listed grocers closest to its size.
 *
 * V2 Retail used to hold the second slot. It was dropped: it sells clothes,
 * where margins are structurally fatter, so its 15% was never a benchmark
 * Patel could be measured against — it only ever showed what a larger store
 * count looks like. Spencer's is an actual grocer at 120 stores, which makes
 * it a real comparison, and putting Patel in the card rather than in the
 * caption lets the reader make it directly.
 */
function renderPeerScaleCard(metrics, operationalCount, patelLive) {
  const el = qs("#peerScaleCard");
  const rec = metrics.store_pnl_reconciliation;
  const sp = metrics.spencers_retail;

  const patel = {
    name: "Patel Retail",
    ticker: "PATELRMART",
    fiscal_year: patelLive?.period ? `FY2026 (${patelLive.period})` : "FY2026",
    revenue_cr: rec.total_company_revenue_cr,
    revenue_prev_year_cr: patelLive?.prevSalesCr ?? null,
    ebitda_cr: rec.total_company_ebitda_cr,
    ebitda_margin_pct: rec.total_company_ebitda_cr / rec.total_company_revenue_cr,
    pat_cr: rec.total_company_pat_cr,
    total_stores: operationalCount,
    retail_area_mn_sqft: Math.round((operationalCount * metrics.unit_economics.sqft_per_store) / 1e5) / 10,
    retail_area_kind: "estimate",
    private_label_pct: metrics.peer_comparison.private_label_pct.patel,
    source: "Exchange filings via Screener",
    source_url: "https://www.screener.in/company/PATELRMART/",
    subject: true,
  };
  // Spencer's carries its prior year nested, so growth can be shown the same
  // way as the others.
  const spencers = { ...sp, revenue_prev_year_cr: sp.prior_year?.revenue_cr ?? null, ticker: "SPENCERS" };

  el.innerHTML = `
    <div class="card-head">
      <div>
        <h3><span class="card-ico" style="background: var(--grad-cool)"><i data-lucide="scale" class="i16"></i></span>Patel vs. the two listed grocers closest to its size</h3>
        <div class="sub">DMart runs 506 stores and Vishal 795 — too large for a like-for-like read</div>
      </div>
    </div>
    <div class="card-body">
      <div class="compare-row cols-3">
        ${renderPeerCompanyBlock(patel)}
        ${renderPeerCompanyBlock(metrics.osia_hyper_retail)}
        ${renderPeerCompanyBlock(spencers)}
      </div>
    </div>
  `;
  refreshIcons();
}

/**
 * Own-brand share, grouped by format.
 *
 * Grouping is the whole point. Apparel retailers design and make nearly
 * everything they sell, so 60-75% own-brand is ordinary for them; a grocer
 * cannot make its own Maggi or Amul, so grocery own-brand runs far lower
 * everywhere. Ranking all four on one undifferentiated bar chart invited the
 * reading that Patel is far behind Trent, when Trent is not a target Patel
 * could reach or should want to. The only like-for-like comparison on this
 * screen is Patel against DMart.
 */
function renderPrivateLabelBlock(metrics) {
  const el = qs("#peerPrivateLabelBlock");
  const pl = metrics.peer_comparison.private_label_pct;
  const groups = [
    {
      format: "Grocery — comparable",
      rows: [
        { label: "Patel Retail", value: pl.patel, highlight: true },
        { label: "DMart", value: pl.dmart },
      ],
    },
    {
      format: "Apparel-led — different economics",
      rows: [
        { label: "Vishal Mega Mart", value: pl.vishal_mega_mart },
        { label: "Trent", value: pl.trent },
      ],
    },
  ];
  // One scale across both groups so the bars stay honest against each other,
  // even though only the first group is a fair comparison.
  const max = Math.max(...groups.flatMap((g) => g.rows.map((r) => r.value)));
  el.innerHTML = `
    <div data-kind="reported">
      ${groups
        .map(
          (g, gi) => `
        <div style="${gi ? "margin-top:18px;padding-top:16px;border-top:1px solid var(--hairline)" : ""}">
          <div style="font-size:10.5px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--text-4);margin-bottom:10px">${escapeHtml(g.format)}</div>
          ${g.rows
            .map(
              (r) => `
            <div style="margin-bottom:12px">
              <div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:4px">
                <span style="color:${r.highlight ? "var(--text-1)" : "var(--text-2)"};font-weight:${r.highlight ? 700 : 500}">${escapeHtml(r.label)}</span>
                <span class="mono">${fmtPct(r.value, 1)}</span>
              </div>
              <div style="height:8px;border-radius:99px;background:var(--hairline)">
                <div style="height:100%;width:${(r.value / max) * 100}%;border-radius:99px;background:${r.highlight ? "var(--grad-primary)" : "var(--text-4)"}"></div>
              </div>
            </div>`
            )
            .join("")}
        </div>`
        )
        .join("")}
    </div>
  `;
}

/** Patel's own latest and prior filed year, for the growth line. */
async function loadPatelLive() {
  try {
    const res = await fetch("./data/screener-kpis.json", { cache: "no-store" });
    if (!res.ok) return null;
    const pl = (await res.json()).companies?.find((c) => c.subject)?.sections?.profit_loss;
    const cols = pl?.columns?.slice(1) || [];
    const sales = pl?.rows?.find((r) => r.label === "Sales")?.values || [];
    const last = /^TTM$/i.test(cols[cols.length - 1] || "") ? cols.length - 2 : cols.length - 1;
    if (last < 1) return null;
    const num = (v) => Number(String(v).replace(/,/g, ""));
    return { period: cols[last], prevSalesCr: num(sales[last - 1]) };
  } catch {
    return null;
  }
}

export async function initPeers() {
  const container = qs("#viewPeers");
  try {
    const [metrics, stores, patelLive] = await Promise.all([loadMetrics(), loadStores(), loadPatelLive()]);
    const operationalCount = stores.filter((s) => s.status === "operational").length;
    renderGenuinePeerTable(metrics, operationalCount);
    renderPeerScaleCard(metrics, operationalCount, patelLive);
    renderPrivateLabelBlock(metrics);
    // Last, and awaited separately: a Screener fetch failure must not blank
    // the peer screen that was already rendered above it.
    await renderScreenerKpis(metrics);
  } catch (err) {
    if (container) {
      container.innerHTML = `<div class="empty"><div class="empty-ico"><i data-lucide="alert-triangle"></i></div><h4>Couldn't load peer data</h4><p>${escapeHtml(err.message)}</p></div>`;
      refreshIcons();
    }
  }
}
