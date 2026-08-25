/**
 * public/js/economics.js — Store Economics view.
 *
 * Surfaces the three things PATEL-HANDOFF.md §9 says must show up in the UI,
 * not just sit in a doc:
 *   1. area_sqft is the same 5,000 blended average for every store — an
 *      `estimate`, and anything derived from it inherits that label.
 *   2. The two client files disagree on revenue/sq ft (₹17,280 vs ₹22,079,
 *      ~28% gap). This dashboard uses ₹17,280 (the store file) for every
 *      calculation — shown here, not averaged, not picked silently.
 *   3. Building store P&L from the client's own unit metrics gives ~5.4%
 *      store EBITDA, while the peer model claims 7.9% at company level —
 *      backwards once head-office cost is added. Surfaced as a flag, not
 *      resolved here.
 */
import { qs, escapeHtml, refreshIcons } from "./ui.js";
import { computePnl } from "./pnl.js";

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

function fmtL(value) {
  return `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 1 })} L`;
}
function fmtPct(value, digits = 1) {
  return `${(value * 100).toFixed(digits)}%`;
}
function fmtINR(value) {
  return `₹${Math.round(value).toLocaleString("en-IN")}`;
}

function renderKpis(metrics, storeEbitdaPct) {
  const el = qs("#econKpis");
  if (!el) return;
  const ue = metrics.unit_economics;
  const contradiction = metrics.cross_file_contradictions.revenue_per_sqft_year;

  el.innerHTML = `
    <div class="kpi k1">
      <div class="kpi-top"><span class="kpi-label">Revenue / sq ft / yr</span><span class="kpi-ico"><i data-lucide="indian-rupee"></i></span></div>
      <div class="kpi-value" data-kind="reported">${fmtINR(ue.revenue_per_sqft_year)}</div>
      <div class="kpi-delta"><span class="kind-pill kind-reported">reported</span> store file · peer model says ${fmtINR(contradiction.peer_model)}</div>
    </div>
    <div class="kpi k2">
      <div class="kpi-top"><span class="kpi-label">Area / Store</span><span class="kpi-ico"><i data-lucide="ruler"></i></span></div>
      <div class="kpi-value" data-kind="estimate">${ue.sqft_per_store.toLocaleString("en-IN")}<span class="unit">sq ft</span></div>
      <div class="kpi-delta"><span class="kind-pill kind-estimate">estimate</span> blended average, not per-store</div>
    </div>
    <div class="kpi k3">
      <div class="kpi-top"><span class="kpi-label">Store EBITDA</span><span class="kpi-ico"><i data-lucide="triangle-alert"></i></span></div>
      <div class="kpi-value" data-kind="derived">${fmtPct(storeEbitdaPct)}</div>
      <div class="kpi-delta"><span class="kind-pill kind-derived">derived</span> peer model claims ${fmtPct(metrics.store_pnl_reconciliation.peer_model_b2c_ebitda_pct)} company-level</div>
    </div>
    <div class="kpi k4">
      <div class="kpi-top"><span class="kpi-label">Gross Margin</span><span class="kpi-ico"><i data-lucide="percent"></i></span></div>
      <div class="kpi-value" data-kind="reported">${fmtPct(ue.gross_margin_pct)}</div>
      <div class="kpi-delta"><span class="kind-pill kind-reported">reported</span> store file</div>
    </div>
  `;
  refreshIcons();
}

function renderRevSqftCompare(metrics) {
  const el = qs("#revSqftCompare");
  if (!el) return;
  const c = metrics.cross_file_contradictions.revenue_per_sqft_year;
  el.innerHTML = `
    <div class="compare-row">
      <div class="compare-box used" data-kind="reported">
        <div class="cb-label">Used in this dashboard</div>
        <div class="cb-value">${fmtINR(c.store_file)}</div>
        <div class="cb-source">Store file — Patel_Retail_data_Munshot.xlsx</div>
      </div>
      <div class="compare-box" data-kind="reported">
        <div class="cb-label">Peer model (reference only, not used)</div>
        <div class="cb-value">${fmtINR(c.peer_model)}</div>
        <div class="cb-source">Peer_Model.xlsx</div>
      </div>
    </div>
    <div class="flag-card">
      <span class="flag-ico"><i data-lucide="triangle-alert" class="i16"></i></span>
      <div>
        <span class="flag-title">${(c.gap_pct * 100).toFixed(0)}% gap — store-file value used throughout</span>
      </div>
    </div>
  `;
  refreshIcons();
}

function renderPnlTable(pnl) {
  const el = qs("#pnlTable");
  if (!el) return;
  el.innerHTML = `
    <tr><td>Revenue (per store/yr)</td><td>${fmtL(pnl.revenue_l)}</td></tr>
    <tr><td>Gross profit @ ${fmtPct(pnl.gross_margin_pct)}</td><td>${fmtL(pnl.grossProfitL)}</td></tr>
    <tr><td>Less: rent</td><td>−${fmtL(pnl.rent_l)}</td></tr>
    <tr><td>Less: utilities</td><td>−${fmtL(pnl.utilities_l)}</td></tr>
    <tr><td>Less: staff</td><td>−${fmtL(pnl.staff_l)}</td></tr>
    <tr class="total" data-kind="derived"><td>Store EBITDA (before head-office cost)</td><td>${fmtL(pnl.ebitdaL)} · ${fmtPct(pnl.ebitdaPct)}</td></tr>
  `;
}

function renderReconciliationFlag(pnl, osia) {
  const el = qs("#reconciliationFlagCard");
  if (!el) return;
  el.innerHTML = `
    <div class="compare-row cols-3">
      <div class="compare-box used" data-kind="derived">
        <div class="cb-label">Patel — store build-up</div>
        <div class="cb-value">${fmtPct(pnl.ebitdaPct)}</div>
        <div class="cb-source">Store build-up, pre head-office</div>
      </div>
      <div class="compare-box" data-kind="reported">
        <div class="cb-label">Patel — peer model claim</div>
        <div class="cb-value">${fmtPct(pnl.peer_model_b2c_ebitda_pct)}</div>
        <div class="cb-source">Peer_Model.xlsx — company level</div>
      </div>
      <div class="compare-box" data-kind="reported">
        <div class="cb-label">Osia Hyper Retail — comp</div>
        <div class="cb-value">${fmtPct(osia.ebitda_margin_pct)}</div>
        <div class="cb-source">${escapeHtml(osia.source)}, ${escapeHtml(osia.fiscal_year)}</div>
      </div>
    </div>
    <div class="flag-card" data-kind="derived">
      <span class="flag-ico"><i data-lucide="triangle-alert" class="i16"></i></span>
      <div>
        <span class="flag-title">Store-level ${fmtPct(pnl.ebitdaPct)} vs peer-model ${fmtPct(pnl.peer_model_b2c_ebitda_pct)} — open item with Patel Retail</span>
      </div>
    </div>
  `;
  refreshIcons();
}

function renderAreaEstimate(metrics, storeCount) {
  const el = qs("#areaEstimateBlock");
  if (!el) return;
  const ue = metrics.unit_economics;
  el.innerHTML = `
    <div class="compare-box" data-kind="estimate" style="margin-bottom: 12px;">
      <div class="cb-label">Applied uniformly to all ${storeCount} stores</div>
      <div class="cb-value">${ue.sqft_per_store.toLocaleString("en-IN")} sq ft</div>
      <span class="kind-pill kind-estimate">estimate</span>
    </div>
    <p style="font-size:12px;color:var(--text-4);margin:0">Blended average, not a per-store measurement.</p>
  `;
}

function renderPeerCompare(metrics) {
  const el = qs("#peerCompareBlock");
  if (!el) return;
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
    </div>
  `;
}

export async function initEconomics() {
  try {
    const [metrics, stores] = await Promise.all([loadMetrics(), loadStores()]);
    const pnl = computePnl(metrics.store_pnl_reconciliation);
    renderKpis(metrics, pnl.ebitdaPct);
    renderRevSqftCompare(metrics);
    renderPnlTable(pnl);
    renderReconciliationFlag(pnl, metrics.osia_hyper_retail);
    renderAreaEstimate(metrics, stores.length);
    renderPeerCompare(metrics);
  } catch (err) {
    const el = qs("#viewEconomics .content-inner") || qs("#viewEconomics");
    if (el) {
      el.innerHTML = `<div class="empty"><div class="empty-ico"><i data-lucide="alert-triangle"></i></div><h4>Couldn't load economics data</h4><p>${escapeHtml(err.message)}</p></div>`;
      refreshIcons();
    }
  }
}
