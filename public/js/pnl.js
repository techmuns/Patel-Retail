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
export function computePnl(rec) {
  const grossProfitL = rec.revenue_l * rec.gross_margin_pct;
  const ebitdaL = grossProfitL - rec.rent_l - rec.utilities_l - rec.staff_l;
  const ebitdaPct = ebitdaL / rec.revenue_l;
  return { ...rec, grossProfitL, ebitdaL, ebitdaPct };
}
