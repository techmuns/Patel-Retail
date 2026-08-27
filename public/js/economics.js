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
import { latestReportedYear, toNumber } from "./screener-kpis.js";

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

/** Patel's own Screener record, or null if the scheduled fetch hasn't run. */
async function loadPatelFiled() {
  try {
    const res = await fetch("./data/screener-kpis.json", { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    const patel = data.companies.find((c) => c.subject) || null;
    return patel ? { patel, fetched_at: data.fetched_at } : null;
  } catch {
    return null;
  }
}

const KIND_PILL = (k) => `<span class="kind-pill kind-${k}">${k}</span>`;
const LINK = (href, text) =>
  `<a href="${escapeHtml(href)}" target="_blank" rel="noopener" style="color:var(--text-3)">${escapeHtml(text)}</a>`;

/**
 * Every figure this screen uses, traced to where it actually came from.
 * Three distinct origins, and they are NOT interchangeable:
 *   - the company's own exchange filings, read live off Screener,
 *   - the store file the fund supplied (Patel_Retail_data_Munshot.xlsx),
 *   - the peer model the fund supplied (Peer_Model.xlsx), shown for reference.
 * Store-level unit economics are not in any filing — no listed retailer
 * discloses per-store rent or headcount — so those rows say "store file"
 * rather than implying a filing that does not exist.
 */
function renderSourceTrace(metrics, stores, filed) {
  const body = qs("#sourceTraceBody");
  if (!body) return;
  const ue = metrics.unit_economics;
  const rec = metrics.store_pnl_reconciliation;
  const live = filed ? latestReportedYear(filed.patel.sections.profit_loss) : null;
  const SCREENER = filed?.patel?.url || "https://www.screener.in/company/PATELRMART/";
  const STORE_FILE = "Patel_Retail_data_Munshot.xlsx";
  const PEER_FILE = "Peer_Model.xlsx";
  const cfc = metrics.cross_file_contradictions;

  const rows = [];

  if (live) {
    const basis = `Screener ${live.period} P&L (${escapeHtml(filed.patel.basis || "standalone")})`;
    rows.push(
      { figure: "Company revenue", value: `₹${toNumber(live.sales)?.toLocaleString("en-IN")} cr`, kind: "reported", basis: `Exchange filing, ${escapeHtml(live.period)}`, source: LINK(SCREENER, basis) },
      { figure: "Operating profit", value: `₹${toNumber(live.operatingProfit)?.toLocaleString("en-IN")} cr`, kind: "reported", basis: `Exchange filing, ${escapeHtml(live.period)}`, source: LINK(SCREENER, basis) },
      { figure: "Net profit", value: `₹${toNumber(live.netProfit)?.toLocaleString("en-IN")} cr`, kind: "reported", basis: `Exchange filing, ${escapeHtml(live.period)}`, source: LINK(SCREENER, basis) }
    );
  }

  rows.push(
    { figure: "Store count", value: `${stores.length}`, kind: "reported", basis: "Company store list + Reg 30 filings", source: `${LINK("https://patelrpl.in/", "patelrpl.in")} + BSE announcements (scrip 544487) — ${escapeHtml(PEER_FILE)} says ${cfc.store_count.peer_model}, not used` },
    { figure: "Revenue / sq ft / yr", value: fmtINR(ue.revenue_per_sqft_year), kind: "reported", basis: "Fund-supplied store file", source: `${escapeHtml(STORE_FILE)} — peer model says ${fmtINR(metrics.cross_file_contradictions.revenue_per_sqft_year.peer_model)}, not used` },
    { figure: "Area / store", value: `${ue.sqft_per_store.toLocaleString("en-IN")} sq ft`, kind: "estimate", basis: "One blended average applied to all stores", source: `${escapeHtml(STORE_FILE)} — no per-store area in any filing; ${escapeHtml(PEER_FILE)} says ${cfc.avg_store_size_sqft.peer_model.toLocaleString("en-IN")} sq ft, not used` },
    { figure: "Gross margin", value: fmtPct(ue.gross_margin_pct), kind: "reported", basis: `Range ${escapeHtml(ue.gross_margin_pct_range)}, midpoint used`, source: escapeHtml(STORE_FILE) },
    { figure: "Rent / sq ft / month", value: fmtINR(ue.rent_per_sqft_month), kind: "reported", basis: "Not disclosed in any filing", source: escapeHtml(STORE_FILE) },
    { figure: "Utilities / sq ft / month", value: fmtINR(ue.utility_per_sqft_month), kind: "reported", basis: "Not disclosed in any filing", source: escapeHtml(STORE_FILE) },
    { figure: "Staff / store", value: `${ue.employees_per_store} @ ${fmtINR(ue.avg_salary_month)}/mo`, kind: "reported", basis: "Not disclosed in any filing", source: escapeHtml(STORE_FILE) },
    { figure: "Bills / day · avg order", value: `${ue.bills_per_day} · ${fmtINR(ue.avg_order_value)}`, kind: "reported", basis: "Not disclosed in any filing", source: `${escapeHtml(STORE_FILE)} — ${escapeHtml(PEER_FILE)} says ${fmtINR(cfc.avg_bill_size.peer_model)} avg bill, not used` },
    { figure: "Private label %", value: fmtPct(ue.private_label_pct), kind: "reported", basis: "Single figure, not a range", source: escapeHtml(STORE_FILE) },
    { figure: "B2C share of revenue", value: fmtPct(rec.b2c_share_pct), kind: "reported", basis: "Applied uniformly to revenue, EBITDA and PAT", source: escapeHtml(PEER_FILE) },
    { figure: "Store EBITDA", value: fmtPct(computePnl(rec).ebitdaPct), kind: "derived", basis: "Computed live from the store-file inputs above", source: "public/js/pnl.js — no stored figure" }
  );

  body.innerHTML = rows
    .map(
      (r) => `
    <tr>
      <td style="font-weight:500">${escapeHtml(r.figure)}</td>
      <td class="mono" style="white-space:nowrap">${r.value} ${KIND_PILL(r.kind)}</td>
      <td style="color:var(--text-3);font-size:12.5px">${r.basis}</td>
      <td style="color:var(--text-4);font-size:12px">${r.source}</td>
    </tr>`
    )
    .join("");

  const stamp = qs("#sourceTableStamp");
  if (stamp) {
    stamp.textContent = filed
      ? `Filings refreshed ${new Date(filed.fetched_at).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}`
      : "Filing figures unavailable — scheduled fetch has not run";
  }
}

/**
 * The store build-up set against the company's own filed P&L.
 *
 * This is where the 7.9% in the fund's peer model comes from: it is not an
 * assumption at all, it is Patel's reported EBITDA including other income
 * (operating profit + other income ÷ sales). Naming that removes a
 * "contradiction" that was really a definitional difference — and leaves the
 * genuine question, which is that the store build-up lands BELOW the filed
 * company margin when head-office cost should push it the other way.
 */
function renderFiledReconcile(metrics, filed, pnl) {
  const el = qs("#filedReconcileBlock");
  if (!el) return;
  const stamp = qs("#filedReconcileStamp");

  if (!filed) {
    el.innerHTML = `<div class="cb-na">Filing figures unavailable — the scheduled Screener fetch has not run.</div>`;
    return;
  }
  const live = latestReportedYear(filed.patel.sections.profit_loss);
  const sales = toNumber(live.sales);
  const op = toNumber(live.operatingProfit);
  const otherIncome = toNumber(
    filed.patel.sections.profit_loss.rows.find((r) => r.label === "Other Income")?.values[
      filed.patel.sections.profit_loss.columns.slice(1).indexOf(live.period)
    ]
  );
  if (sales == null || op == null) {
    el.innerHTML = `<div class="cb-na">Filed P&L incomplete for ${escapeHtml(live.period)}.</div>`;
    return;
  }
  const opMargin = op / sales;
  const ebitdaInclOther = otherIncome == null ? null : op + otherIncome;
  const ebitdaMargin = ebitdaInclOther == null ? null : ebitdaInclOther / sales;

  if (stamp) stamp.textContent = `${live.period} · ${filed.patel.basis || "standalone"} · Screener`;

  el.innerHTML = `
    <div class="compare-row cols-3">
      <div class="compare-box used" data-kind="derived">
        <div class="cb-label">Store build-up</div>
        <div class="cb-value">${fmtPct(pnl.ebitdaPct)}</div>
        <div class="cb-source">Per store, before head-office cost</div>
      </div>
      <div class="compare-box" data-kind="reported">
        <div class="cb-label">Filed operating margin</div>
        <div class="cb-value">${fmtPct(opMargin)}</div>
        <div class="cb-source">₹${op.toLocaleString("en-IN")} cr ÷ ₹${sales.toLocaleString("en-IN")} cr</div>
      </div>
      ${
        ebitdaMargin == null
          ? ""
          : `<div class="compare-box" data-kind="reported">
        <div class="cb-label">Filed EBITDA incl. other income</div>
        <div class="cb-value">${fmtPct(ebitdaMargin)}</div>
        <div class="cb-source">(₹${op.toLocaleString("en-IN")} cr + ₹${otherIncome.toLocaleString("en-IN")} cr) ÷ ₹${sales.toLocaleString("en-IN")} cr</div>
      </div>`
      }
    </div>
    <table class="metric-table" style="margin-top:14px">
      <tr><td>Peer model's company-level claim</td><td class="mono">${fmtPct(metrics.store_pnl_reconciliation.peer_model_b2c_ebitda_pct)} <span class="kind-pill kind-reported">reported</span></td></tr>
      ${
        ebitdaMargin == null
          ? ""
          : `<tr><td>Same figure, from the filed P&L</td><td class="mono">${fmtPct(ebitdaMargin)} <span class="kind-pill kind-derived">derived</span></td></tr>`
      }
      <tr><td>Store build-up vs. filed operating margin</td><td class="mono">${(
        (pnl.ebitdaPct - opMargin) * 100
      ).toFixed(1)} pts <span class="kind-pill kind-derived">derived</span></td></tr>
    </table>
  `;
  refreshIcons();
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
        <div class="cb-label">Osia Hyper Retail — comp${osia.status_flag ? ` <span class="chip failed" style="padding:2px 6px;font-size:9.5px;text-transform:none">${escapeHtml(osia.status_flag)}</span>` : ""}</div>
        <div class="cb-value">${fmtPct(osia.ebitda_margin_pct)}</div>
        <div class="cb-source">${escapeHtml(osia.source)}, ${escapeHtml(osia.fiscal_year)}</div>
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
    // Last: a missing screener-kpis.json must not blank the screen above it.
    const filed = await loadPatelFiled();
    renderSourceTrace(metrics, stores, filed);
    renderFiledReconcile(metrics, filed, pnl);
  } catch (err) {
    const el = qs("#viewEconomics .content-inner") || qs("#viewEconomics");
    if (el) {
      el.innerHTML = `<div class="empty"><div class="empty-ico"><i data-lucide="alert-triangle"></i></div><h4>Couldn't load economics data</h4><p>${escapeHtml(err.message)}</p></div>`;
      refreshIcons();
    }
  }
}
