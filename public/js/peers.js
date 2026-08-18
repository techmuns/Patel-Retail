/**
 * public/js/peers.js — Peer Benchmark view. Rebuilds the client's broken
 * peer model per PATEL-HANDOFF.md §10 (all 10 documented bugs), surfacing
 * the two fixes that actually matter (Trent's revenue/area mismatch,
 * Spencer's gross-profit formula bug) prominently. Everything shown is
 * either a number given directly in the handoff or computed live from
 * stores.json — nothing here is estimated to fill a gap. Where the correct
 * number genuinely isn't available (Osia/V2 financials, a few bug-affected
 * cells), that's stated plainly instead of guessed.
 */
import { qs, escapeHtml, refreshIcons } from "./ui.js";

const STATUS_META = {
  fixed: { label: "Fixed here", tone: "ok" },
  partially_fixed: { label: "Partially fixed", tone: "warn" },
  needs_source_file: { label: "Needs source file", tone: "err" },
  not_applicable: { label: "Not applicable here", tone: "muted" },
  confirmed_harmless: { label: "Confirmed harmless", tone: "ok" },
};

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
  return `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 1 })} cr`;
}
function fmtLakh(value) {
  return `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 0 })} L`;
}
function fmtPct(value, digits = 1) {
  return `${(value * 100).toFixed(digits)}%`;
}

function cellOrNA(value, fmt, kind = "reported") {
  if (value == null) return `<span class="cb-na">Not available</span>`;
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
  // Same formula as computePnl() in economics.js — recomputed here rather
  // than imported to keep this file's only dependency on economics.js at
  // zero, but the arithmetic itself must stay identical, not re-derived
  // independently (see PATEL-HANDOFF.md's note on unifying this).
  const grossProfitL = rec.revenue_l * rec.gross_margin_pct;
  const ebitdaL = grossProfitL - rec.rent_l - rec.utilities_l - rec.staff_l;
  const storeEbitdaPct = ebitdaL / rec.revenue_l;

  const rows = [
    {
      name: "Patel Retail",
      highlight: true,
      revenue: `${fmtCr(rec.total_company_revenue_cr)} <span class="kind-pill kind-reported">reported</span><div style="font-size:10.5px;color:var(--text-4)">total company, 45% B2C</div>`,
      ebitda: `${fmtPct(storeEbitdaPct)} <span class="kind-pill kind-derived">derived</span> / ${fmtPct(rec.peer_model_b2c_ebitda_pct)} <span class="kind-pill kind-reported">reported</span><div style="font-size:10.5px;color:var(--text-4)">store build-up vs peer model — contested, see Store Economics</div>`,
      stores: `${patelStoreCount} <span class="kind-pill kind-reported">reported</span>`,
      privateLabel: cellOrNA(pl.patel, (v) => fmtPct(v)),
    },
    {
      name: "Avenue Supermarts (DMart)",
      revenue: `<span class="cb-na">Not available</span>`,
      ebitda: `<span class="cb-na">Not available</span>`,
      stores: `<span class="cb-na">Not available</span>`,
      privateLabel: cellOrNA(pl.dmart, (v) => fmtPct(v)),
    },
    {
      name: "Vishal Mega Mart",
      revenue: `<span class="cb-na">Not available</span>`,
      ebitda: `<span class="cb-na">Not available</span>`,
      stores: `<span class="cb-na">Not available</span>`,
      privateLabel: cellOrNA(pl.vishal_mega_mart, (v) => fmtPct(v)),
    },
    {
      name: "Trent (Star Bazaar)",
      revenue: `${fmtCr(trent.corrected_revenue_cr)} <span class="kind-pill kind-derived">derived</span><div style="font-size:10.5px;color:var(--text-4)">corrected from the model's own unused row — see below</div>`,
      ebitda: `<span class="cb-na">Not available</span>`,
      stores: `${trent.store_count} <span class="kind-pill kind-reported">reported</span>`,
      privateLabel: cellOrNA(pl.trent, (v) => fmtPct(v)),
    },
    {
      name: "Spencer's Retail",
      revenue: `<span class="cb-na">Not available</span>`,
      ebitda: `<span class="cb-na">Not available</span>`,
      stores: `<span class="cb-na">Not available</span>`,
      privateLabel: `<span class="cb-na">Not available</span>`,
    },
    {
      name: "Osia Hyper Retail",
      revenue: `${fmtCr(osia.revenue_cr)} <span class="kind-pill kind-reported">reported</span><div style="font-size:10.5px;color:var(--text-4)">${escapeHtml(osia.fiscal_year)}</div>`,
      ebitda: `${fmtPct(osia.ebitda_margin_pct)} <span class="kind-pill kind-reported">reported</span>`,
      stores: cellOrNA(osia.total_stores, (v) => v.toLocaleString("en-IN")),
      privateLabel: cellOrNA(osia.private_label_pct, (v) => fmtPct(v)),
    },
    {
      name: "V2 Retail",
      revenue: `${fmtCr(v2.revenue_cr)} <span class="kind-pill kind-reported">reported</span><div style="font-size:10.5px;color:var(--text-4)">${escapeHtml(v2.fiscal_year)}</div>`,
      ebitda: `${fmtPct(v2.ebitda_margin_pct)} <span class="kind-pill kind-reported">reported</span><div style="font-size:10.5px;color:var(--text-4)">apparel-led, not a grocery margin comp</div>`,
      stores: cellOrNA(v2.total_stores, (v) => v.toLocaleString("en-IN")),
      privateLabel: cellOrNA(v2.private_label_pct, (v) => fmtPct(v)),
    },
  ];

  body.innerHTML = rows
    .map(
      (r) => `
    <tr${r.highlight ? ' style="background:var(--surface-hover)"' : ""}>
      <td style="font-weight:${r.highlight ? 700 : 500}">${escapeHtml(r.name)}</td>
      <td>${r.revenue}</td>
      <td>${r.ebitda}</td>
      <td>${r.stores}</td>
      <td>${r.privateLabel}</td>
    </tr>`
    )
    .join("");
}

function renderPeerBugsTable(metrics) {
  const body = qs("#peerBugsTableBody");
  body.innerHTML = metrics.peer_model_bugs.items
    .map((item) => {
      const meta = STATUS_META[item.status] || STATUS_META.needs_source_file;
      return `
    <tr>
      <td style="max-width:340px">${escapeHtml(item.issue)}</td>
      <td style="max-width:280px;color:var(--text-3);font-size:12.5px">${escapeHtml(item.effect)}</td>
      <td><span class="chip ${meta.tone === "ok" ? "done" : meta.tone === "warn" ? "queued" : meta.tone === "err" ? "failed" : "src-none"}"><span class="cdot"></span>${escapeHtml(meta.label)}</span></td>
    </tr>
    ${item.verified_note ? `<tr><td colspan="3" style="color:var(--text-4);font-size:11.5px;padding-top:0"><strong style="color:var(--text-3)">Verified against primary source:</strong> ${escapeHtml(item.verified_note)}</td></tr>` : ""}`;
    })
    .join("");
}

function renderTrentFixCard(metrics) {
  const t = metrics.peer_model_corrections.trent;
  const el = qs("#trentFixCard");
  el.innerHTML = `
    <div class="card-head">
      <div>
        <h3><span class="card-ico" style="background: var(--grad-warm)"><i data-lucide="triangle-alert" class="i16"></i></span>Trent revenue — fixed</h3>
      </div>
    </div>
    <div class="card-body">
      <div class="compare-row">
        <div class="compare-box" data-kind="reported">
          <div class="cb-label">Old model (wrong)</div>
          <div class="cb-value">${fmtCr(t.wrong_revenue_cr)}</div>
          <div class="cb-source">${escapeHtml(t.wrong_note)}</div>
        </div>
        <div class="compare-box used" data-kind="reported">
          <div class="cb-label">Corrected</div>
          <div class="cb-value">${fmtCr(t.corrected_revenue_cr)}</div>
          <div class="cb-source">${escapeHtml(t.corrected_note)}</div>
        </div>
      </div>
      <div class="compare-row">
        <div class="compare-box" data-kind="derived">
          <div class="cb-label">Revenue/store (old, wrong)</div>
          <div class="cb-value">${fmtLakh(t.wrong_revenue_per_store_lakh)}</div>
        </div>
        <div class="compare-box used" data-kind="derived">
          <div class="cb-label">Revenue/store (corrected)</div>
          <div class="cb-value">${fmtLakh(t.corrected_revenue_per_store_lakh)}</div>
        </div>
      </div>
      <div class="flag-card" data-kind="derived">
        <span class="flag-ico"><i data-lucide="info" class="i16"></i></span>
        <div><p>${escapeHtml(t.revenue_per_store_note)}</p></div>
      </div>
      <div class="flag-card">
        <span class="flag-ico"><i data-lucide="info" class="i16"></i></span>
        <div><p>${escapeHtml(t.still_needs_source_file)}</p></div>
      </div>
    </div>
  `;
  refreshIcons();
}

function renderSpencersFixCard(metrics) {
  const s = metrics.peer_model_corrections.spencers;
  const el = qs("#spencersFixCard");
  el.innerHTML = `
    <div class="card-head">
      <div>
        <h3><span class="card-ico" style="background: var(--grad-warm)"><i data-lucide="triangle-alert" class="i16"></i></span>Spencer's gross profit — fixed</h3>
      </div>
    </div>
    <div class="card-body">
      <div class="compare-row">
        <div class="compare-box" data-kind="reported">
          <div class="cb-label">Old model (wrong)</div>
          <div class="cb-value">${fmtCr(s.wrong_gross_profit_cr)}</div>
          <div class="cb-source">${escapeHtml(s.wrong_formula)}</div>
        </div>
        <div class="compare-box used" data-kind="reported">
          <div class="cb-label">Corrected</div>
          <div class="cb-value">${fmtCr(s.corrected_gross_profit_cr)}</div>
          <div class="cb-source">${escapeHtml(s.corrected_formula)}</div>
        </div>
      </div>
      <div class="flag-card">
        <span class="flag-ico"><i data-lucide="triangle-alert" class="i16"></i></span>
        <div>
          <span class="flag-title">Understated by ${fmtPct(s.understated_pct, 0)}</span>
          <p>${escapeHtml(s.still_needs_source_file)}</p>
        </div>
      </div>
    </div>
  `;
  refreshIcons();
}

function fmtCrOrNA(value) {
  return value == null ? `<span class="cb-na">Not available</span>` : fmtCr(value);
}
function fmtNumOrNA(value, unit = "") {
  return value == null ? `<span class="cb-na">Not available</span>` : `${value.toLocaleString("en-IN")}${unit}`;
}
function fmtPctOrNA(value, digits = 1) {
  return value == null ? `<span class="cb-na">Not available</span>` : fmtPct(value, digits);
}

function renderPeerCompanyBlock(p) {
  const growthPct = (p.revenue_cr - p.revenue_prev_year_cr) / p.revenue_prev_year_cr;
  return `
    <div class="compare-box" data-kind="reported" style="text-align:left">
      <div class="cb-label">${escapeHtml(p.name)} <span style="font-weight:400;text-transform:none;color:var(--text-4)">(${escapeHtml(p.ticker)})</span></div>
      <div style="font-size:11px;color:var(--text-4);margin-top:2px">${escapeHtml(p.fiscal_year)}</div>
      <table class="metric-table" style="margin-top:10px">
        <tr><td>Revenue</td><td class="mono">${fmtCr(p.revenue_cr)} <span class="kind-pill kind-reported">reported</span></td></tr>
        <tr><td>Revenue growth YoY</td><td class="mono">${fmtPct(growthPct, 1)} <span class="kind-pill kind-derived">derived</span></td></tr>
        <tr><td>EBITDA</td><td class="mono">${fmtCr(p.ebitda_cr)} (${fmtPct(p.ebitda_margin_pct, 1)} margin) <span class="kind-pill kind-reported">reported</span></td></tr>
        <tr><td>PAT</td><td class="mono">${fmtCr(p.pat_cr)} <span class="kind-pill kind-reported">reported</span></td></tr>
        <tr><td>Total stores</td><td class="mono">${fmtNumOrNA(p.total_stores)}</td></tr>
        <tr><td>Retail area</td><td class="mono">${fmtNumOrNA(p.retail_area_mn_sqft, " mn sqft")}</td></tr>
        <tr><td>Private label %</td><td class="mono">${fmtPctOrNA(p.private_label_pct)}</td></tr>
      </table>
      <p style="font-size:11.5px;color:var(--text-4);margin-top:8px">${escapeHtml(p.note)} — <span style="color:var(--text-3)">${escapeHtml(p.source)}</span></p>
      ${
        p.period_offset_flag
          ? `<div class="flag-card" style="margin-top:10px"><span class="flag-ico"><i data-lucide="clock" class="i16"></i></span><div><p>${escapeHtml(p.period_offset_flag)}</p></div></div>`
          : ""
      }
      ${
        p.category_flag
          ? `<div class="flag-card" style="margin-top:10px"><span class="flag-ico"><i data-lucide="info" class="i16"></i></span><div><p>${escapeHtml(p.category_flag)}</p></div></div>`
          : ""
      }
    </div>
  `;
}

function renderPeerScaleCard(metrics) {
  const el = qs("#peerScaleCard");
  el.innerHTML = `
    <div class="card-head">
      <div>
        <h3><span class="card-ico" style="background: var(--grad-cool)"><i data-lucide="scale" class="i16"></i></span>Osia Hyper Retail &amp; V2 Retail — the closest scale peers</h3>
        <div class="sub">Patel's own scale (52 operational stores) — every other peer in the model is 120+ stores</div>
      </div>
    </div>
    <div class="card-body">
      <div class="compare-row">
        ${renderPeerCompanyBlock(metrics.osia_hyper_retail)}
        ${renderPeerCompanyBlock(metrics.v2_retail)}
      </div>
      <p style="font-size:11.5px;color:var(--text-4);margin-top:4px">Store count, retail area, and private label % are genuinely not disclosed by either company on Screener — shown as "Not available," not estimated.</p>
    </div>
  `;
  refreshIcons();
}

function renderPrivateLabelBlock(metrics) {
  const el = qs("#peerPrivateLabelBlock");
  const pl = metrics.peer_comparison.private_label_pct;
  const rows = [
    { label: "Patel Retail", value: pl.patel, highlight: true },
    { label: "DMart", value: pl.dmart },
    { label: "Vishal Mega Mart", value: pl.vishal_mega_mart },
    { label: "Trent", value: pl.trent },
  ];
  const max = Math.max(...rows.map((r) => r.value));
  el.innerHTML = `
    <div data-kind="reported">
      ${rows
        .map(
          (r) => `
        <div style="margin-bottom:12px">
          <div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:4px">
            <span style="color:${r.highlight ? "var(--text-1)" : "var(--text-3)"};font-weight:${r.highlight ? 700 : 500}">${escapeHtml(r.label)}</span>
            <span class="mono">${fmtPct(r.value, 1)}</span>
          </div>
          <div style="height:8px;border-radius:99px;background:var(--hairline)">
            <div style="height:100%;width:${(r.value / max) * 100}%;border-radius:99px;background:${r.highlight ? "var(--grad-primary)" : "var(--text-4)"}"></div>
          </div>
        </div>`
        )
        .join("")}
      <p style="font-size:12px;color:var(--text-4);margin:8px 0 0">${escapeHtml(pl.note)}</p>
      <p style="font-size:11px;color:var(--text-4);margin:4px 0 0">Osia Hyper Retail's private label % is ${metrics.osia_hyper_retail.private_label_pct == null ? "not disclosed on Screener" : fmtPct(metrics.osia_hyper_retail.private_label_pct, 1)}; V2 Retail's is ${metrics.v2_retail.private_label_pct == null ? "not disclosed on Screener" : fmtPct(metrics.v2_retail.private_label_pct, 1)} — same gap as above, not filled in.</p>
    </div>
  `;
}

function renderPeerContradictionsTable(metrics, storeCount) {
  const body = qs("#peerContradictionsTableBody");
  const c = metrics.cross_file_contradictions;
  const rows = [
    { metric: "Store count", peer: c.store_count.peer_model, store: `${c.store_count.store_file_operational} (+${c.store_count.store_file_operational_plus_closed - c.store_count.store_file_operational} closed) = ${c.store_count.store_file_operational_plus_closed}`, note: c.store_count.note },
    { metric: "Avg store size", peer: `${c.avg_store_size_sqft.peer_model.toLocaleString("en-IN")} sq ft`, store: `${c.avg_store_size_sqft.store_file.toLocaleString("en-IN")} sq ft` },
    { metric: "Revenue / sq ft / yr", peer: `₹${c.revenue_per_sqft_year.peer_model.toLocaleString("en-IN")}`, store: `₹${c.revenue_per_sqft_year.store_file.toLocaleString("en-IN")}`, note: `${(c.revenue_per_sqft_year.gap_pct * 100).toFixed(0)}% gap — store-file value used in this dashboard throughout` },
    { metric: "Avg bill size", peer: `₹${c.avg_bill_size.peer_model}`, store: `₹${c.avg_bill_size.store_file}` },
    { metric: "Footprint", peer: escapeHtml(metrics.peer_model_corrections.patel_footprint.wrong), store: escapeHtml(metrics.peer_model_corrections.patel_footprint.corrected), note: `Verified live against stores.json — ${storeCount} stores` },
  ];
  body.innerHTML = rows
    .map(
      (r) => `
    <tr>
      <td>${escapeHtml(r.metric)}</td>
      <td class="mono">${r.peer}</td>
      <td class="mono">${r.store}</td>
    </tr>
    ${r.note ? `<tr><td colspan="3" style="color:var(--text-4);font-size:11.5px;padding-top:0">${escapeHtml(r.note)}</td></tr>` : ""}`
    )
    .join("");
}

export async function initPeers() {
  const container = qs("#viewPeers");
  try {
    const [metrics, stores] = await Promise.all([loadMetrics(), loadStores()]);
    const operationalCount = stores.filter((s) => s.status === "operational").length;
    renderGenuinePeerTable(metrics, operationalCount);
    renderPeerBugsTable(metrics);
    renderTrentFixCard(metrics);
    renderSpencersFixCard(metrics);
    renderPeerScaleCard(metrics);
    renderPrivateLabelBlock(metrics);
    renderPeerContradictionsTable(metrics, stores.length);
  } catch (err) {
    if (container) {
      container.innerHTML = `<div class="empty"><div class="empty-ico"><i data-lucide="alert-triangle"></i></div><h4>Couldn't load peer data</h4><p>${escapeHtml(err.message)}</p></div>`;
      refreshIcons();
    }
  }
}
