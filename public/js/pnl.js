/**
 * public/js/pnl.js — the ONE store P&L formula (revenue → gross profit →
 * EBITDA), pure and DOM-free, same reason geo.js exists for distance math:
 * public/js/economics.js, patel-report.js, patel-export-xlsx.js, and
 * peers.js all show this figure and previously each had their own copy of
 * the arithmetic (three of them written independently, one recomputing it
 * "to avoid a dependency on economics.js" per its own comment, since
 * economics.js is wired to DOM elements and importing it just for this one
 * calculation would pull that along). Importing this instead means the
 * formula itself can never drift between screen, PDF, and Excel — only
 * presentation (rounding, formatting) can differ, and that's a choice made
 * at the call site, not a second implementation.
 */
/** "1,048" -> 1048. Null for anything that isn't a plain number. */
export function toNumber(text) {
  if (text == null) return null;
  const n = Number(String(text).replace(/[,%\u20b9\s]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/**
 * The latest REPORTED year in a Screener section table. Screener's last column
 * is TTM, which is not a reporting period and must never be labelled as one.
 */
export function latestReportedYear(section) {
  if (!section?.columns?.length) return null;
  const cols = section.columns.slice(1);
  if (!cols.length) return null;
  const hasTtm = /^TTM$/i.test(cols[cols.length - 1]);
  const idx = hasTtm ? cols.length - 2 : cols.length - 1;
  if (idx < 0) return null;
  const at = (label) => {
    const vals = section.rows?.find((r) => r.label === label)?.values;
    return vals && vals[idx] != null && vals[idx] !== "" ? vals[idx] : null;
  };
  return {
    period: cols[idx],
    sales: at("Sales"),
    operatingProfit: at("Operating Profit"),
    otherIncome: at("Other Income"),
    opm: at("OPM %"),
    netProfit: at("Net Profit"),
  };
}

/** Patel Retail's own record out of screener-kpis.json. */
export function filedSubject(screener) {
  return screener?.companies?.find((c) => c.subject) || null;
}

/**
 * Revenue per store, per year, in lakh — derived from the company's own filed
 * P&L rather than carried as a fixed number.
 *
 * WHY: this is the single biggest driver of every figure on the Store
 * Economics screen, and as a stored constant it silently aged. The stored
 * value (Rs 864 L) was itself built this way from an older revenue, so each
 * new quarter left the whole screen a little wrong with nothing to show it.
 *
 *   filed revenue  x  retail share of revenue  /  operational stores
 *
 * Falls back to the stored figure when the scheduled fetch has not run, so a
 * missing file degrades to the old behaviour instead of blanking the screen.
 * Rounded once, here, so screen, PDF and Excel cannot disagree in the last
 * decimal place.
 */
export function storeRevenueL({ metrics, screener, operationalStores }) {
  const rec = metrics.store_pnl_reconciliation;
  const stored = { revenue_l: rec.revenue_l, live: false };
  const patel = filedSubject(screener);
  if (!patel || !operationalStores) return stored;
  const live = latestReportedYear(patel.sections?.profit_loss);
  const salesCr = toNumber(live?.sales);
  if (!Number.isFinite(salesCr) || !Number.isFinite(rec.b2c_share_pct)) return stored;
  const retailCr = salesCr * rec.b2c_share_pct;
  return {
    revenue_l: Math.round((retailCr / operationalStores) * 100 * 10) / 10,
    live: true,
    period: live.period,
    salesCr,
    retailCr,
    retailSharePct: rec.b2c_share_pct,
    operationalStores,
  };
}

/**
 * Company-level EBITDA margin straight off the filed P&L, on both the
 * definitions that matter: operating profit alone, and operating profit plus
 * other income. The second is the one that equals the 7.9% the fund's model
 * carries, which is why it is computed rather than quoted.
 */
export function filedCompanyMargins(screener) {
  const patel = filedSubject(screener);
  const live = latestReportedYear(patel?.sections?.profit_loss);
  const sales = toNumber(live?.sales);
  const op = toNumber(live?.operatingProfit);
  const other = toNumber(live?.otherIncome);
  if (!Number.isFinite(sales) || !Number.isFinite(op) || !sales) return null;
  return {
    period: live.period,
    salesCr: sales,
    operatingProfitCr: op,
    otherIncomeCr: Number.isFinite(other) ? other : null,
    operatingMarginPct: op / sales,
    ebitdaCr: Number.isFinite(other) ? op + other : null,
    ebitdaMarginPct: Number.isFinite(other) ? (op + other) / sales : null,
    netProfitCr: toNumber(live.netProfit),
  };
}

export function computePnl(rec) {
  const grossProfitL = rec.revenue_l * rec.gross_margin_pct;
  const ebitdaL = grossProfitL - rec.rent_l - rec.utilities_l - rec.staff_l;
  const ebitdaPct = ebitdaL / rec.revenue_l;
  return { ...rec, grossProfitL, ebitdaL, ebitdaPct };
}
