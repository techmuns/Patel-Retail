/**
 * public/js/screener-kpis.js — renders public/data/screener-kpis.json, the
 * scheduled pull of Screener.in's own figures for Patel Retail and every peer
 * on the benchmark screen.
 *
 * WHY THIS EXISTS: the peer figures elsewhere on this screen were read off
 * Screener by hand and typed into metrics.json. They were right on the day
 * they were typed. This module reads the same numbers on a schedule instead,
 * and — more usefully — compares the two, so a hand-entered figure that has
 * fallen a reporting period behind announces itself rather than sitting there
 * looking current.
 *
 * Nothing here is computed or interpreted. Every figure is exactly as Screener
 * presents it, and where the dashboard's own figure disagrees, BOTH are shown
 * side by side — the disagreement is the finding, and averaging it away or
 * quietly preferring one would destroy it.
 */
import { qs, escapeHtml, refreshIcons } from "./ui.js";

const NAME_TO_METRICS_KEY = {
  DMART: "dmart",
  VMM: "vishal_mega_mart",
  SPENCERS: "spencers_retail",
  OSIAHYPER: "osia_hyper_retail",
  V2RETAIL: "v2_retail",
};

async function loadScreenerKpis() {
  const res = await fetch("./data/screener-kpis.json", { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load screener-kpis.json: ${res.status}`);
  return res.json();
}

const NA = `<span class="cb-na">—</span>`;

/** A row's values by label, from one of Screener's section tables. */
function rowValues(section, label) {
  const row = section?.rows?.find((r) => r.label === label);
  return row ? row.values : null;
}

/**
 * Screener's P&L ends with a TTM column, which is not a reporting period and
 * must not be labelled as one. The latest *reported* year is the column before
 * it — unless the table has no TTM column at all, in which case it is the last.
 */
export function latestReportedYear(section) {
  if (!section?.columns?.length) return null;
  const cols = section.columns.slice(1);
  if (!cols.length) return null;
  const hasTtm = /^TTM$/i.test(cols[cols.length - 1]);
  const idx = hasTtm ? cols.length - 2 : cols.length - 1;
  if (idx < 0) return null;
  const at = (label) => {
    const vals = rowValues(section, label);
    return vals && vals[idx] != null && vals[idx] !== "" ? vals[idx] : null;
  };
  return {
    period: cols[idx],
    sales: at("Sales"),
    operatingProfit: at("Operating Profit"),
    opm: at("OPM %"),
    netProfit: at("Net Profit"),
  };
}

/** "1,048" -> 1048. Returns null for anything that isn't a plain number. */
export function toNumber(text) {
  if (text == null) return null;
  const n = Number(String(text).replace(/[,%₹\s]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/**
 * Does the dashboard's hand-entered figure still agree with Screener?
 * A tolerance of 1% absorbs rounding between the two without hiding a genuine
 * restatement or a missed reporting period.
 */
function driftFor(company, metrics) {
  if (!metrics) return null;
  // Patel's own company-level revenue lives in the store P&L reconciliation
  // rather than the peer block, but goes stale exactly the same way.
  const key = NAME_TO_METRICS_KEY[company.ticker];
  let held = key ? metrics[key] : null;
  if (company.subject && metrics.store_pnl_reconciliation) {
    const rec = metrics.store_pnl_reconciliation;
    held = { name: company.label, fiscal_year: rec.fiscal_year || "", revenue_cr: rec.total_company_revenue_cr };
  }
  if (!held) return null;
  const live = latestReportedYear(company.sections.profit_loss);
  if (!live) return null;

  const livePeriod = live.period;
  const heldPeriod = held.fiscal_year || "";
  // "FY2025 (Mar 2025)" vs Screener's "Mar 2025". Where the dashboard records
  // no period at all there is nothing to compare, so the revenue check decides
  // on its own — an unrecorded period is not evidence of being behind.
  const samePeriod = heldPeriod ? heldPeriod.includes(livePeriod) : true;
  const liveSales = toNumber(live.sales);
  const heldSales = held.revenue_cr ?? null;
  const sameRevenue =
    liveSales != null && heldSales != null ? Math.abs(liveSales - heldSales) / heldSales <= 0.01 : null;

  // Consolidated and standalone are different figures, so a basis substitution
  // is not a stale-data finding and must not be reported as one.
  if (company.basis_fallback) return null;
  if (samePeriod && sameRevenue !== false) return null;
  return {
    ticker: company.ticker,
    name: held.name || company.label,
    heldPeriod,
    heldRevenue: heldSales,
    livePeriod,
    liveRevenue: liveSales,
    behindAPeriod: !samePeriod,
  };
}

function fmtCrFromScreener(text) {
  const n = toNumber(text);
  if (n == null) return NA;
  // The sign belongs outside the currency symbol: "-₹10 cr", not "₹-10 cr".
  return `${n < 0 ? "-" : ""}₹${Math.abs(n).toLocaleString("en-IN")} cr`;
}

function renderRow(company, drift) {
  const live = latestReportedYear(company.sections.profit_loss) || {};
  const r = company.ratios || {};
  // Screener writes "₹ 776 Cr." and "15.3 %"; the rest of this dashboard
  // writes "₹776 cr" and "15.3%". Same figure, presented consistently.
  const ratio = (name) => {
    const d = r[name]?.display;
    if (!d || !/\d/.test(d)) return NA;
    return escapeHtml(d.replace(/\s+%/, "%").replace(/₹\s+/, "₹").replace(/\s*Cr\.?$/i, " cr"));
  };
  const subject = company.subject;

  // Where the dashboard's own figure disagrees, both are shown. The second
  // line is the hand-entered one it is being checked against.
  const revenueCell = drift
    ? `${fmtCrFromScreener(live.sales)}<div class="drift-alt">dashboard: ₹${drift.heldRevenue?.toLocaleString("en-IN")} cr${
        drift.heldPeriod ? ` · ${escapeHtml(drift.heldPeriod)}` : ""
      }</div>`
    : fmtCrFromScreener(live.sales);

  return `
    <tr${subject ? ' style="background:var(--surface-hover)"' : ""}>
      <td style="font-weight:${subject ? 700 : 500}">
        <a href="${escapeHtml(company.url)}" target="_blank" rel="noopener" style="color:inherit">${escapeHtml(company.label)}</a>
      </td>
      <td class="mono">${live.period ? escapeHtml(live.period) : NA}${
        drift?.behindAPeriod ? ` <span class="chip queued" style="padding:1px 6px;font-size:10px"><span class="cdot"></span>newer</span>` : ""
      }${
        company.basis_fallback
          ? ` <span class="chip failed" style="padding:1px 6px;font-size:10px;text-transform:none"><span class="cdot"></span>${escapeHtml(company.basis)}</span>`
          : ""
      }</td>
      <td class="mono">${revenueCell}</td>
      <td class="mono">${fmtCrFromScreener(live.operatingProfit)}</td>
      <td class="mono">${live.opm ? escapeHtml(live.opm) : NA}</td>
      <td class="mono">${fmtCrFromScreener(live.netProfit)}</td>
      <td class="mono">${ratio("Market Cap")}</td>
      <td class="mono">${ratio("Stock P/E")}</td>
      <td class="mono">${ratio("ROCE")}</td>
      <td class="mono">${ratio("ROE")}</td>
    </tr>`;
}

/**
 * @param {object} metrics  metrics.json, so live figures can be checked
 *                          against the hand-entered ones. Optional.
 */
export async function renderScreenerKpis(metrics) {
  const body = qs("#screenerKpiBody");
  if (!body) return;
  const stamp = qs("#screenerStamp");
  const chip = qs("#screenerDriftChip");

  let data;
  try {
    data = await loadScreenerKpis();
  } catch (err) {
    body.innerHTML = `<tr><td colspan="10"><span class="cb-na">${escapeHtml(err.message)}</span></td></tr>`;
    return;
  }

  const drifts = data.companies.map((c) => driftFor(c, metrics)).filter(Boolean);
  const driftBy = new Map(drifts.map((d) => [d.ticker, d]));
  body.innerHTML = data.companies.map((c) => renderRow(c, driftBy.get(c.ticker))).join("");

  if (stamp) {
    const when = data.fetched_at ? new Date(data.fetched_at) : null;
    const tier = data.account_tier && data.account_tier !== "unknown" ? `${data.account_tier} account` : null;
    stamp.textContent = [
      "Screener.in",
      when
        ? when.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
        : null,
      tier,
      data.counts ? `${data.counts.fetched}/${data.counts.requested} companies` : null,
    ]
      .filter(Boolean)
      .join(" · ");
  }

  const substituted = data.companies.filter((c) => c.basis_fallback);
  if (chip) {
    chip.innerHTML = substituted.length
      ? `<span class="chip failed"><span class="cdot"></span>${substituted.length} on a substituted reporting basis</span>`
      : drifts.length
      ? `<span class="chip queued"><span class="cdot"></span>${drifts.length} figure${drifts.length > 1 ? "s" : ""} newer than the dashboard</span>`
      : `<span class="chip done"><span class="cdot"></span>Dashboard matches</span>`;
    refreshIcons();
  }
}
