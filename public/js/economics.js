/**
 * public/js/economics.js — Store Economics view.
 *
 * Surfaces the three things PATEL-HANDOFF.md §9 says must show up in the UI,
 * not just sit in a doc:
 *   1. area_sqft is the same 5,000 blended average for every store — an
 *      `estimate`, and anything derived from it inherits that label.
 *   2. Revenue per store is derived from the company's own filed P&L on every
 *      load, so the whole screen moves when a new quarter is filed instead of
 *      ageing against a stored constant.
 *   3. The store build-up lands below the filed company margin, when
 *      head-office cost should push it the other way. Surfaced as a flag,
 *      not resolved here.
 */
import { qs, escapeHtml, refreshIcons } from "./ui.js";
import { computePnl, storeRevenueL, filedCompanyMargins, latestReportedYear, toNumber } from "./pnl.js";

async function loadMetrics() {
  const res = await fetch("./data/metrics.json", { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load metrics.json: ${res.status}`);
  return res.json();
}
/** Patel + peers as filed, or null when the scheduled fetch has not run. */
async function loadScreener() {
  try {
    const res = await fetch("./data/screener-kpis.json", { cache: "no-store" });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
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

function renderKpis(metrics, pnl, rev, filed) {
  const el = qs("#econKpis");
  if (!el) return;
  const ue = metrics.unit_economics;
  // Revenue per sq ft follows the filed revenue rather than a stored constant.
  // It divides by the blended area figure, so it inherits that estimate.
  const revPerSqft = Math.round((rev.revenue_l * 100000) / ue.sqft_per_store);
  const period = rev.live ? rev.period : null;

  el.innerHTML = `
    <div class="kpi k1">
      <div class="kpi-top"><span class="kpi-label">Revenue / sq ft / yr</span><span class="kpi-ico"><i data-lucide="indian-rupee"></i></span></div>
      <div class="kpi-value" data-kind="${rev.live ? "derived" : "reported"}">${fmtINR(revPerSqft)}</div>
      <div class="kpi-delta"><span class="kind-pill kind-${rev.live ? "derived" : "reported"}">${rev.live ? "derived" : "reported"}</span> ${
        period ? `from ${escapeHtml(period)} filing` : "company store data"
      }</div>
    </div>
    <div class="kpi k2">
      <div class="kpi-top"><span class="kpi-label">Revenue / store / yr</span><span class="kpi-ico"><i data-lucide="store"></i></span></div>
      <div class="kpi-value" data-kind="${rev.live ? "derived" : "reported"}">${fmtL(rev.revenue_l)}</div>
      <div class="kpi-delta"><span class="kind-pill kind-${rev.live ? "derived" : "reported"}">${rev.live ? "derived" : "reported"}</span> ${
        rev.live ? `${escapeHtml(rev.period)} · ${rev.operationalStores} stores` : "company store data"
      }</div>
    </div>
    <div class="kpi k3">
      <div class="kpi-top"><span class="kpi-label">Store EBITDA</span><span class="kpi-ico"><i data-lucide="percent"></i></span></div>
      <div class="kpi-value" data-kind="derived">${fmtPct(pnl.ebitdaPct)}</div>
      <div class="kpi-delta"><span class="kind-pill kind-derived">derived</span> ${
        filed ? `company level ${fmtPct(filed.operatingMarginPct)}` : "before head-office cost"
      }</div>
    </div>
    <div class="kpi k4">
      <div class="kpi-top"><span class="kpi-label">Area / Store</span><span class="kpi-ico"><i data-lucide="ruler"></i></span></div>
      <div class="kpi-value" data-kind="estimate">${ue.sqft_per_store.toLocaleString("en-IN")}<span class="unit">sq ft</span></div>
      <div class="kpi-delta"><span class="kind-pill kind-estimate">estimate</span> blended average, not per-store</div>
    </div>
  `;
  refreshIcons();
}

function renderRevSqftCompare(metrics, rev, filed) {
  const el = qs("#revSqftCompare");
  if (!el) return;
  const ue = metrics.unit_economics;
  if (!rev.live || !filed) {
    el.innerHTML = `<div class="cb-na">Filed figures unavailable — the scheduled refresh has not run.</div>`;
    return;
  }
  const revPerSqft = Math.round((rev.revenue_l * 100000) / ue.sqft_per_store);
  const steps = [
    { label: `Revenue, ${rev.period}`, value: `\u20b9${rev.salesCr.toLocaleString("en-IN")} cr`, kind: "reported" },
    { label: "Retail share of revenue", value: fmtPct(rev.retailSharePct, 0), kind: "reported" },
    { label: "Retail revenue", value: `\u20b9${Math.round(rev.retailCr).toLocaleString("en-IN")} cr`, kind: "derived" },
    { label: `Operational stores`, value: `${rev.operationalStores}`, kind: "reported" },
    { label: "Revenue per store", value: fmtL(rev.revenue_l), kind: "derived" },
    { label: "Area per store", value: `${ue.sqft_per_store.toLocaleString("en-IN")} sq ft`, kind: "estimate" },
  ];
  el.innerHTML = `
    <table class="metric-table">
      ${steps
        .map(
          (st) => `<tr><td>${escapeHtml(st.label)}</td><td class="mono">${st.value} <span class="kind-pill kind-${st.kind}">${st.kind}</span></td></tr>`
        )
        .join("")}
      <tr class="total"><td>Revenue / sq ft / yr</td><td class="mono">${fmtINR(revPerSqft)} <span class="kind-pill kind-estimate">estimate</span></td></tr>
    </table>
  `;
  refreshIcons();
}

function renderPnlTable(pnl, rev) {
  const el = qs("#pnlTable");
  if (!el) return;
  el.innerHTML = `
    <tr><td>Revenue (per store/yr)</td><td>${fmtL(pnl.revenue_l)}${
      rev.live ? ` <span class="pnl-src">${escapeHtml(rev.period)} filing</span>` : ""
    }</td></tr>
    <tr><td>Gross profit @ ${fmtPct(pnl.gross_margin_pct)}</td><td>${fmtL(pnl.grossProfitL)}</td></tr>
    <tr><td>Less: rent</td><td>\u2212${fmtL(pnl.rent_l)}</td></tr>
    <tr><td>Less: utilities</td><td>\u2212${fmtL(pnl.utilities_l)}</td></tr>
    <tr><td>Less: staff</td><td>\u2212${fmtL(pnl.staff_l)}</td></tr>
    <tr class="total" data-kind="derived"><td>Store EBITDA (before head-office cost)</td><td>${fmtL(pnl.ebitdaL)} \u00b7 ${fmtPct(pnl.ebitdaPct)}</td></tr>
  `;
}

const KIND_PILL = (k) => `<span class="kind-pill kind-${k}">${k}</span>`;
const LINK = (href, text) =>
  `<a href="${escapeHtml(href)}" target="_blank" rel="noopener" style="color:var(--brand-indigo)">${escapeHtml(text)}</a>`;

/**
 * Every figure this screen uses, with the source it is read from.
 *
 * Everything the company files is read live off Screener on a schedule and
 * carries the reporting period it came from. The remaining rows are
 * store-level operating inputs — rent per sq ft, headcount, bills per day.
 * No listed retailer discloses those at store granularity in any filing, so
 * there is no live feed to point them at; they are the company's own store
 * data and are labelled as such.
 */
function renderSourceTrace(metrics, stores, screener, rev, pnl) {
  const body = qs("#sourceTraceBody");
  if (!body) return;
  const ue = metrics.unit_economics;
  const rec = metrics.store_pnl_reconciliation;
  const patel = screener?.companies?.find((c) => c.subject) || null;
  const pl = patel ? latestReportedYear(patel.sections?.profit_loss) : null;
  const ratios = patel?.ratios || {};
  const URL = patel?.url || "https://www.screener.in/company/PATELRMART/";
  const period = pl?.period || null;
  const COMPANY = "Company store data";

  // Screener writes "15.3 %" and "₹ 776 Cr."; present them the way the rest of
  // this dashboard does.
  const ratio = (name) => {
    const d = ratios[name]?.display;
    if (!d || !/\d/.test(d)) return null;
    return d.replace(/\s+%/, "%").replace(/\u20b9\s+/, "\u20b9").replace(/\s*Cr\.?$/i, " cr");
  };
  const cr = (v) => (toNumber(v) == null ? null : `\u20b9${toNumber(v).toLocaleString("en-IN")} cr`);
  const filedSrc = LINK(URL, `Screener \u00b7 ${period || "filings"}`);
  // Trailing ratios and market price are not from the annual filing, so they
  // must not be labelled with its period.
  const liveSrc = LINK(URL, "Screener");
  const rows = [];
  const filedRow = (figure, value, basis, src) =>
    value == null ? null : { figure, value, kind: "reported", basis, source: src || filedSrc };

  // Everything below this line updates itself on the daily refresh.
  [
    filedRow("Company revenue", cr(pl?.sales), `Filed, ${period}`),
    filedRow("Operating profit", cr(pl?.operatingProfit), `Filed, ${period}`),
    filedRow("Other income", cr(pl?.otherIncome), `Filed, ${period}`),
    filedRow("Net profit", cr(pl?.netProfit), `Filed, ${period}`),
    // Computed rather than quoted, so it agrees with the KPI above it to the
    // decimal — Screener rounds this row to a whole percent.
    filedRow(
      "Operating margin",
      toNumber(pl?.operatingProfit) != null && toNumber(pl?.sales)
        ? fmtPct(toNumber(pl.operatingProfit) / toNumber(pl.sales))
        : null,
      `Operating profit \u00f7 revenue, ${period}`
    ),
    filedRow("ROCE", ratio("ROCE"), "Trailing", liveSrc),
    filedRow("ROE", ratio("ROE"), "Trailing", liveSrc),
    filedRow("Book value / share", ratio("Book Value"), "Latest", liveSrc),
    filedRow("Market cap", ratio("Market Cap"), "Live market price", liveSrc),
    filedRow("P/E", ratio("Stock P/E"), "Live market price", liveSrc),
  ].forEach((r) => r && rows.push(r));

  rows.push({
    figure: "Store count",
    value: `${stores.length}`,
    kind: "reported",
    basis: "Company store list + Reg 30 filings",
    source: `${LINK("https://patelrpl.in/", "patelrpl.in")} + exchange announcements`,
  });

  if (rev.live) {
    rows.push(
      {
        figure: "Revenue / store / yr",
        value: fmtL(rev.revenue_l),
        kind: "derived",
        basis: `Filed revenue \u00d7 ${fmtPct(rev.retailSharePct, 0)} retail share \u00f7 ${rev.operationalStores} stores`,
        source: filedSrc,
      },
      {
        figure: "Revenue / sq ft / yr",
        value: fmtINR(Math.round((rev.revenue_l * 100000) / ue.sqft_per_store)),
        kind: "estimate",
        basis: "Revenue per store \u00f7 blended area \u2014 inherits the area estimate",
        source: filedSrc,
      }
    );
  }

  rows.push(
    { figure: "Retail share of revenue", value: fmtPct(rec.b2c_share_pct), kind: "reported", basis: "Company-stated split", source: COMPANY },
    { figure: "Area / store", value: `${ue.sqft_per_store.toLocaleString("en-IN")} sq ft`, kind: "estimate", basis: "One blended average across all stores", source: `${COMPANY} \u2014 not disclosed per store in any filing` },
    { figure: "Gross margin", value: fmtPct(ue.gross_margin_pct), kind: "reported", basis: `Stated as ${escapeHtml(ue.gross_margin_pct_range)}, midpoint used`, source: COMPANY },
    { figure: "Rent / sq ft / month", value: fmtINR(ue.rent_per_sqft_month), kind: "reported", basis: "Store-level operating input", source: COMPANY },
    { figure: "Utilities / sq ft / month", value: fmtINR(ue.utility_per_sqft_month), kind: "reported", basis: "Store-level operating input", source: COMPANY },
    { figure: "Staff / store", value: `${ue.employees_per_store} @ ${fmtINR(ue.avg_salary_month)}/mo`, kind: "reported", basis: "Store-level operating input", source: COMPANY },
    { figure: "Bills / day \u00b7 avg order", value: `${ue.bills_per_day} \u00b7 ${fmtINR(ue.avg_order_value)}`, kind: "reported", basis: "Store-level operating input", source: COMPANY },
    { figure: "Private label %", value: fmtPct(ue.private_label_pct), kind: "reported", basis: "Company-stated", source: COMPANY },
    { figure: "Store EBITDA", value: fmtPct(pnl.ebitdaPct), kind: "derived", basis: "Computed live from the rows above", source: "Computed on load \u2014 no stored figure" }
  );

  body.innerHTML = rows
    .map(
      (r) => `
    <tr>
      <td style="font-weight:500">${escapeHtml(r.figure)}</td>
      <td class="mono" style="white-space:nowrap">${r.value} ${KIND_PILL(r.kind)}</td>
      <td style="color:var(--text-2);font-size:12.5px">${r.basis}</td>
      <td style="color:var(--text-2);font-size:12.5px">${r.source}</td>
    </tr>`
    )
    .join("");

  const stamp = qs("#sourceTableStamp");
  if (stamp) {
    stamp.textContent = screener?.fetched_at
      ? `Filings refreshed ${new Date(screener.fetched_at).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}`
      : "Filing figures unavailable \u2014 scheduled refresh has not run";
  }
}

function renderReconciliationFlag(pnl, osia, filed) {
  const el = qs("#reconciliationFlagCard");
  if (!el) return;
  el.innerHTML = `
    <div class="compare-row cols-3">
      <div class="compare-box used" data-kind="derived">
        <div class="cb-label">Patel \u2014 store build-up</div>
        <div class="cb-value">${fmtPct(pnl.ebitdaPct)}</div>
        <div class="cb-source">Per store, before head-office cost</div>
      </div>
      ${
        filed
          ? `<div class="compare-box" data-kind="reported">
        <div class="cb-label">Patel \u2014 company level, as filed</div>
        <div class="cb-value">${fmtPct(filed.ebitdaMarginPct ?? filed.operatingMarginPct)}</div>
        <div class="cb-source">Screener, ${escapeHtml(filed.period)}</div>
      </div>`
          : ""
      }
      <div class="compare-box" data-kind="reported">
        <div class="cb-label">Osia Hyper Retail \u2014 comp${osia.status_flag ? ` <span class="chip failed" style="padding:2px 6px;font-size:9.5px;text-transform:none">${escapeHtml(osia.status_flag)}</span>` : ""}</div>
        <div class="cb-value">${fmtPct(osia.ebitda_margin_pct)}</div>
        <div class="cb-source">Screener, ${escapeHtml(osia.fiscal_year)}</div>
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
    const [metrics, stores, screener] = await Promise.all([loadMetrics(), loadStores(), loadScreener()]);
    const operational = stores.filter((s) => s.status === "operational").length;
    // Revenue per store comes off the filed P&L, so every figure below it
    // moves when the company files, instead of ageing in place.
    const rev = storeRevenueL({ metrics, screener, operationalStores: operational });
    const pnl = computePnl({ ...metrics.store_pnl_reconciliation, revenue_l: rev.revenue_l });
    const filed = filedCompanyMargins(screener);
    renderKpis(metrics, pnl, rev, filed);
    renderRevSqftCompare(metrics, rev, filed);
    renderPnlTable(pnl, rev);
    renderReconciliationFlag(pnl, metrics.osia_hyper_retail, filed);
    renderAreaEstimate(metrics, stores.length);
    renderPeerCompare(metrics);
    renderSourceTrace(metrics, stores, screener, rev, pnl);
  } catch (err) {
    const el = qs("#viewEconomics .content-inner") || qs("#viewEconomics");
    if (el) {
      el.innerHTML = `<div class="empty"><div class="empty-ico"><i data-lucide="alert-triangle"></i></div><h4>Couldn't load economics data</h4><p>${escapeHtml(err.message)}</p></div>`;
      refreshIcons();
    }
  }
}
