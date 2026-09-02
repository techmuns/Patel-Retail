/**
 * public/js/patel-export-xlsx.js — branded 3-sheet Excel export.
 * ==============================================================================
 * ExcelJS (CDN, already on the page) when available; a clean CSV fallback (of
 * the Store Master sheet, the one flat table that survives a CSV) if the CDN
 * is blocked — same degrade-gracefully discipline as export-xlsx.js, but this
 * file is self-contained rather than importing from it, since the two exports
 * share no data shape.
 *
 *   - "Store Master": every store in stores.json — coordinates, precision tier, geo_source.
 *   - "Proximity": every pair build-proximity.mjs emitted. A null km is shown
 *     as "Unavailable" plus the reason, never as a blank cell — the same rule
 *     the map and screener already enforce on screen (PATEL-HANDOFF.md §15.1).
 *   - "Unit Economics": the reported inputs as live formula cells, so the
 *     derived store P&L (revenue/store, gross profit, rent/utilities/staff,
 *     EBITDA) recalculates in Excel if a reader edits an input — not a frozen
 *     snapshot — plus the 5.4%-vs-7.9% reconciliation flag as a note.
 */
import { storeRevenueL } from "./pnl.js";

const V = "FF7C3AED"; // violet — same brand token as export-xlsx.js
const INK = "FF0F172A";
const MUTE = "FF64748B";
const BAND = "FFEDE9FE";
const BORDER = "FFD2D8E3";
const INPUT_BLUE = "FF0000FF"; // xlsx-skill convention: blue = hardcoded input
const OK_GREEN = "FF059669";
const WARN_AMBER = "FFD97706";
const ERR_ROSE = "FFE11D48";

const thin = () => ({ style: "thin", color: { argb: BORDER } });
const box = () => ({ top: thin(), left: thin(), bottom: thin(), right: thin() });
const solid = (argb) => ({ type: "pattern", pattern: "solid", fgColor: { argb } });

function fileStamp() {
  return new Date().toISOString().slice(0, 10);
}

async function fetchJson(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  return res.json();
}

export async function buildPatelXlsxModel() {
  const [storesDoc, metrics, proximity, screener] = await Promise.all([
    fetchJson("./data/stores.json"),
    fetchJson("./data/metrics.json"),
    fetchJson("./data/proximity.json"),
    fetchJson("./data/screener-kpis.json").catch(() => null),
  ]);
  const stores = storesDoc.stores;
  // The workbook's Unit Economics sheet writes real formulas over these
  // inputs, so the revenue it starts from must be the same one the screen
  // shows — derived from the filing, not the stored constant.
  const rev = storeRevenueL({
    metrics,
    screener,
    operationalStores: stores.filter((s) => s.status === "operational").length,
  });
  return { stores, metrics, proximity, screener, rev };
}

export async function exportPatelXlsx() {
  const model = await buildPatelXlsxModel();
  if (typeof window.ExcelJS === "undefined") return exportCsv(model);

  const wb = new window.ExcelJS.Workbook();
  wb.creator = "Munshot · Investment Diligence Review";
  buildStoreMaster(wb, model);
  buildProximity(wb, model);
  buildUnitEconomics(wb, model);

  const buf = await wb.xlsx.writeBuffer();
  download(
    new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `Patel_Retail_Data_${fileStamp()}.xlsx`
  );
}

/* --------------------------------------------------------- sheet 1: stores - */
const PRECISION_LABEL = (s) => {
  if (s.lat == null || s.lng == null) return "Not geocoded";
  if (s.geocode_match_tier === "town" || s.geocode_match_tier === "town_base") return "Town centroid";
  return "Precise";
};

function buildStoreMaster(wb, { stores }) {
  const head = ["Store ID", "Name", "Locality", "Town", "District", "State", "Status", "Opened", "Closed", "Latitude", "Longitude", "Precision", "Geocode Match Tier", "Geo Confidence", "Geo Source", "Area (sq ft)", "Area Kind"];
  const widths = [10, 26, 26, 18, 12, 12, 12, 12, 12, 11, 11, 14, 16, 13, 12, 12, 12];
  const ws = wb.addWorksheet("Store Master", { views: [{ showGridLines: false, state: "frozen", ySplit: 2 }] });
  ws.columns = widths.map((w) => ({ width: w }));

  let r = 1;
  headerBand(ws, "MUNSHOT  ·  Investment Diligence Review — Patel Retail Ltd", head.length, r++);
  const headRowN = r++;
  styleHeaderRow(setRowValues(ws, headRowN, head), head.length);

  const sorted = stores.slice().sort((a, b) => a.town.localeCompare(b.town) || a.store_id.localeCompare(b.store_id));
  for (const s of sorted) {
    const row = setRowValues(ws, r++, [
      s.store_id, s.name, s.locality, s.town, s.district, s.state,
      s.status === "operational" ? "Operational" : "Closed",
      s.opened || "", s.closed || "",
      s.lat ?? "", s.lng ?? "",
      PRECISION_LABEL(s), s.geocode_match_tier || "", s.geo_confidence || "", s.geo_source || "",
      s.area_sqft ?? "", s.area_kind || "",
    ]);
    row.eachCell((c, col) => {
      c.font = { size: 10, color: { argb: col === 2 ? INK : "FF334155" }, bold: col === 1 };
      c.alignment = { vertical: "top", indent: col === 1 ? 1 : 0 };
      c.border = box();
    });
    const precCell = row.getCell(12);
    if (precCell.value === "Precise") precCell.font = { size: 10, bold: true, color: { argb: OK_GREEN } };
    else if (precCell.value === "Town centroid") precCell.font = { size: 10, bold: true, color: { argb: WARN_AMBER } };
    else precCell.font = { size: 10, bold: true, color: { argb: ERR_ROSE } };
  }
  ws.autoFilter = { from: { row: headRowN, column: 1 }, to: { row: headRowN, column: head.length } };
}

/* ------------------------------------------------------ sheet 2: proximity - */
function buildProximity(wb, { stores, proximity }) {
  const byId = new Map(stores.map((s) => [s.store_id, s]));
  const head = ["Store A", "Store A Name", "Store A Town", "Store B", "Store B Name", "Store B Town", "Distance (km)", "Basis"];
  const widths = [10, 24, 18, 10, 24, 18, 14, 28];
  const ws = wb.addWorksheet("Proximity", { views: [{ showGridLines: false, state: "frozen", ySplit: 3 }] });
  ws.columns = widths.map((w) => ({ width: w }));

  // Every pair now carries a figure. Where both stores are precisely located
  // it is measured; where one is not, its town centre stands in and the row
  // says so. The distinction is the whole point, so it rides in its own
  // column rather than being explained once in a footnote.
  const BASIS = {
    town_to_town: "Approximate — town to town",
    same_town: "Approximate — same town",
  };

  let r = 1;
  headerBand(
    ws,
    `MUNSHOT  ·  Store-Pair Proximity — ${proximity.metadata.pairs_emitted} pairs: ${proximity.metadata.pairs_with_real_distance} measured, ${proximity.metadata.pairs_with_approx_distance ?? 0} approximate`,
    head.length,
    r++
  );
  const legendRow = ws.getRow(r++);
  legendRow.getCell(1).value =
    "Measured = both stores precisely located, distance between the two points. Approximate = one or both known only to their town, so the town centre stands in — a town is several km across, so read these as \u00b1 a few km, and note they are deliberately excluded from the cannibalisation score.";
  legendRow.getCell(1).font = { size: 9, italic: true, color: { argb: MUTE } };
  legendRow.getCell(1).alignment = { wrapText: true, vertical: "top" };
  ws.mergeCells(legendRow.number, 1, legendRow.number, head.length);
  ws.getRow(legendRow.number).height = 28;
  legendRow.eachCell((c) => (c.border = box()));

  const headRowN = r++;
  styleHeaderRow(setRowValues(ws, headRowN, head), head.length);

  for (const p of proximity.pairs) {
    const a = byId.get(p.a);
    const b = byId.get(p.b);
    const measured = p.km != null;
    const value = measured ? p.km : p.approx_km;
    const basis = measured ? "Measured" : BASIS[p.approx_basis] || "No distance available";
    const row = setRowValues(ws, r++, [
      p.a, a?.name || "", a?.town || "",
      p.b, b?.name || "", b?.town || "",
      value == null ? "Not available" : value,
      basis,
    ]);
    row.eachCell((c, col) => {
      c.font = { size: 9.5, color: { argb: col === 7 && !measured ? WARN_AMBER : "FF334155" }, bold: col === 7 };
      c.alignment = { vertical: "top", indent: 0 };
      c.border = box();
    });
  }
  ws.autoFilter = { from: { row: headRowN, column: 1 }, to: { row: headRowN, column: head.length } };
}

/* ------------------------------------------------ sheet 3: unit economics -- */
function inputRow(ws, r, label, value, note) {
  const row = ws.getRow(r);
  row.getCell(1).value = label;
  row.getCell(1).font = { size: 10.5, color: { argb: "FF334155" } };
  row.getCell(2).value = value;
  row.getCell(2).font = { size: 10.5, bold: true, color: { argb: INPUT_BLUE } };
  row.getCell(2).alignment = { horizontal: "right" };
  if (note) {
    row.getCell(3).value = note;
    row.getCell(3).font = { size: 9, italic: true, color: { argb: MUTE } };
    row.getCell(3).alignment = { wrapText: true, vertical: "top" };
  }
  [1, 2, 3].forEach((i) => (row.getCell(i).border = box()));
  return row;
}
function formulaRow(ws, r, label, formula, result, fmt, note) {
  const row = ws.getRow(r);
  row.getCell(1).value = label;
  row.getCell(1).font = { size: 10.5, color: { argb: "FF334155" } };
  row.getCell(2).value = { formula, result };
  row.getCell(2).font = { size: 10.5, bold: true, color: { argb: INK } };
  row.getCell(2).alignment = { horizontal: "right" };
  if (fmt) row.getCell(2).numFmt = fmt;
  if (note) {
    row.getCell(3).value = note;
    row.getCell(3).font = { size: 9, italic: true, color: { argb: MUTE } };
    row.getCell(3).alignment = { wrapText: true, vertical: "top" };
  }
  [1, 2, 3].forEach((i) => (row.getCell(i).border = box()));
  return row;
}

function buildUnitEconomics(wb, { metrics, rev }) {
  const ue = metrics.unit_economics;
  const rec = metrics.store_pnl_reconciliation;
  // Revenue per sq ft is the sheet's INPUT cell and revenue per store the
  // formula over it, which is the inverse of how the screen derives them —
  // so feed the input the value implied by the filed revenue. Same number
  // either way round, and the workbook stays self-consistent when someone
  // edits the area cell.
  const revenueL = rev?.revenue_l ?? rec.revenue_l;
  const revPerSqft = Math.round((revenueL * 100000) / ue.sqft_per_store);
  const mix = metrics.revenue_mix;
  const pl = metrics.peer_comparison.private_label_pct;

  const ws = wb.addWorksheet("Unit Economics", { views: [{ showGridLines: false }] });
  ws.columns = [{ width: 40 }, { width: 18 }, { width: 60 }];
  let r = 1;
  headerBand(ws, "MUNSHOT  ·  Unit Economics — Patel Retail Ltd", 3, r++);

  band(ws, r++, "Inputs", 3);
  const areaRow = r;
  inputRow(ws, r++, "Area per store (sq ft)", ue.sqft_per_store, "Estimate — one blended average for all stores");
  const revSqftRow = r;
  inputRow(
    ws,
    r++,
    "Revenue per sq ft per year (₹)",
    revPerSqft,
    rev?.live ? `Derived — see Derivation block below` : "Company store data"
  );
  const marginRow = r;
  inputRow(ws, r++, "Gross margin %", ue.gross_margin_pct, `Midpoint of ${ue.gross_margin_pct_range}`);
  const rentRow = r;
  inputRow(ws, r++, "Rent per sq ft per month (₹)", ue.rent_per_sqft_month, "Company store data");
  const utilRow = r;
  inputRow(ws, r++, "Utility per sq ft per month (₹)", ue.utility_per_sqft_month, "Company store data");
  const empRow = r;
  inputRow(ws, r++, "Employees per store", ue.employees_per_store, "Company store data");
  const salRow = r;
  inputRow(ws, r++, "Avg salary per month (₹)", ue.avg_salary_month, "Company store data");
  r++;

  band(ws, r++, "Store P&L — live formulas over the inputs above", 3);
  // Same formula shape as computePnl() in pnl.js (which the screen and PDF
  // both import directly) — not imported here, because this sheet needs its
  // cached cell values to match what Excel's own ROUND()-per-step formulas
  // below will compute on open, and pnl.js deliberately does NOT round
  // between steps (it returns full float precision for the caller to format).
  // Rounding here at each step, same as the ROUND() calls in the formula
  // strings, keeps the cached value and the live formula from disagreeing.
  const revenueRow = r;
  formulaRow(ws, r++, "Revenue per store per year (₹ lakh)", `ROUND(B${areaRow}*B${revSqftRow}/100000,2)`, Math.round(revenueL * 100) / 100, "#,##0.00", "= area × revenue/sq ft");
  const gpRow = r;
  const grossProfitL = Math.round(revenueL * ue.gross_margin_pct * 100) / 100;
  formulaRow(ws, r++, "Gross profit (₹ lakh)", `ROUND(B${revenueRow}*B${marginRow},2)`, grossProfitL, "#,##0.00", "= revenue × gross margin %");
  const rentLRow = r;
  formulaRow(ws, r++, "Less: rent (₹ lakh/yr)", `ROUND(B${rentRow}*B${areaRow}*12/100000,2)`, rec.rent_l, "#,##0.00", "= rent/sq ft/month × area × 12");
  const utilLRow = r;
  formulaRow(ws, r++, "Less: utilities (₹ lakh/yr)", `ROUND(B${utilRow}*B${areaRow}*12/100000,2)`, rec.utilities_l, "#,##0.00", "= utility/sq ft/month × area × 12");
  const staffLRow = r;
  formulaRow(ws, r++, "Less: staff (₹ lakh/yr)", `ROUND(B${empRow}*B${salRow}*12/100000,2)`, rec.staff_l, "#,##0.00", "= employees × avg salary × 12");
  const ebitdaL = Math.round((grossProfitL - rec.rent_l - rec.utilities_l - rec.staff_l) * 100) / 100;
  const ebitdaPct = Math.round((ebitdaL / revenueL) * 10000) / 10000;
  const ebitdaLRow = r;
  formulaRow(ws, r++, "Store EBITDA (₹ lakh/yr, before head-office cost)", `ROUND(B${gpRow}-B${rentLRow}-B${utilLRow}-B${staffLRow},2)`, ebitdaL, "#,##0.00");
  ws.getRow(r - 1).getCell(2).font = { size: 10.5, bold: true, color: { argb: INK } };
  formulaRow(ws, r++, "Store EBITDA margin %", `ROUND(B${ebitdaLRow}/B${revenueRow},4)`, ebitdaPct, "0.0%");
  r++;

  // The revenue-per-sq-ft input is derived, so show the arithmetic as rows
  // rather than as a paragraph wrapped inside one cell.
  if (rev?.live) {
    band(ws, r++, `Derivation of revenue per sq ft — from the filed P&L, ${rev.period}`, 3);
    inputRow(ws, r++, "Company revenue (₹ cr)", rev.salesCr, "Filed");
    inputRow(ws, r++, "Retail share of revenue", rev.retailSharePct, "Company-stated");
    inputRow(ws, r++, "Retail revenue (₹ cr)", Math.round(rev.retailCr), "= revenue × retail share");
    inputRow(ws, r++, "Operational stores", rev.operationalStores, "Live store list");
    inputRow(ws, r++, "Revenue per store (₹ lakh)", Math.round(revenueL * 100) / 100, "= retail revenue ÷ stores");
    ws.getRow(r - 1).getCell(2).numFmt = "#,##0.00";
    inputRow(ws, r++, "Revenue per sq ft (₹)", revPerSqft, "= revenue per store ÷ area");
    r++;
  }

  band(ws, r++, "Store build-up vs company level", 3);
  inputRow(ws, r++, "Store EBITDA margin % (before head-office)", ebitdaPct, "From the P&L above");
  ws.getRow(r - 1).getCell(2).numFmt = "0.0%";
  inputRow(ws, r++, "Company EBITDA margin % (as filed)", rec.peer_model_b2c_ebitda_pct, "Exchange filing via Screener");
  ws.getRow(r - 1).getCell(2).numFmt = "0.0%";
  inputRow(ws, r++, "Gap (store − company), pts", Math.round((ebitdaPct - rec.peer_model_b2c_ebitda_pct) * 1000) / 10, "Head-office cost should push this the other way");
  inputRow(ws, r++, "Company revenue (₹ cr)", rec.total_company_revenue_cr, "Filed");
  inputRow(ws, r++, "Company EBITDA (₹ cr)", rec.total_company_ebitda_cr, "Filed");
  inputRow(ws, r++, "Company PAT (₹ cr)", rec.total_company_pat_cr, "Filed");
  inputRow(ws, r++, "Retail share of revenue", rec.b2c_share_pct, "Applied to revenue, EBITDA and PAT alike");
  ws.getRow(r - 1).getCell(2).numFmt = "0%";
  r++;

  band(ws, r++, "Revenue mix & margin", 3);
  inputRow(ws, r++, "Food %", mix.food);
  inputRow(ws, r++, "Non-food %", mix.non_food, mix.non_food_note);
  inputRow(ws, r++, "Merchandise %", mix.merchandise, mix.merchandise_note);
  r++;

  band(ws, r++, "Private label % vs peers (reported)", 3);
  inputRow(ws, r++, "Patel Retail", pl.patel);
  inputRow(ws, r++, "DMart", pl.dmart);
  inputRow(ws, r++, "Vishal Mega Mart", pl.vishal_mega_mart);
  inputRow(ws, r++, "Trent", pl.trent);

  [1, 2, 3].forEach((i) => {
    for (let row = 3; row < r; row++) {
      const cell = ws.getCell(row, i);
      if (i === 2 && cell.numFmt == null && typeof cell.value === "number" && Math.abs(cell.value) < 1) cell.numFmt = "0.0%";
    }
  });
}

/* --------------------------------------------------------------- style ----- */
/** Write `values` into row `r`, cell by cell (rather than relying on
 *  addRow's implicit "append after the last touched row" sequencing, which
 *  is easy to get wrong once a row has been placed via explicit
 *  mergeCells/getCell calls first, as the header band rows are here). */
function setRowValues(ws, r, values) {
  const row = ws.getRow(r);
  values.forEach((v, i) => (row.getCell(i + 1).value = v));
  return row;
}
function headerBand(ws, text, ncol, atRow) {
  const r = atRow || 1;
  ws.mergeCells(r, 1, r, ncol);
  const c = ws.getCell(r, 1);
  c.value = text;
  c.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11.5 };
  c.fill = solid(V);
  c.alignment = { vertical: "middle", indent: 1 };
  ws.getRow(r).height = 24;
}
function band(ws, r, text, ncol) {
  ws.mergeCells(r, 1, r, ncol);
  const c = ws.getCell(r, 1);
  c.value = text;
  c.font = { bold: true, size: 10.5, color: { argb: V } };
  c.fill = solid(BAND);
  c.alignment = { vertical: "middle", indent: 1 };
  c.border = box();
  ws.getRow(r).height = 20;
}
function styleHeaderRow(row, ncol) {
  for (let i = 1; i <= ncol; i++) {
    const c = row.getCell(i);
    c.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    c.fill = solid(V);
    c.alignment = { vertical: "middle", indent: 1 };
    c.border = box();
  }
  row.height = 20;
}

/* --------------------------------------------------------------- csv ------- */
function exportCsv({ stores }) {
  const esc = (v) => {
    let s = String(v ?? "");
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return `"${s.replace(/"/g, '""')}"`;
  };
  const lines = [];
  lines.push(["Munshot · Investment Diligence Review — Patel Retail Ltd (Store Master; ExcelJS unavailable, CSV fallback)"].map(esc).join(","));
  lines.push(["Store ID", "Name", "Locality", "Town", "District", "State", "Status", "Opened", "Closed", "Latitude", "Longitude", "Precision", "Geo Source", "Area (sq ft)"].map(esc).join(","));
  const sorted = stores.slice().sort((a, b) => a.town.localeCompare(b.town) || a.store_id.localeCompare(b.store_id));
  for (const s of sorted) {
    lines.push(
      [s.store_id, s.name, s.locality, s.town, s.district, s.state, s.status, s.opened || "", s.closed || "", s.lat ?? "", s.lng ?? "", PRECISION_LABEL(s), s.geo_source || "", s.area_sqft ?? ""]
        .map(esc)
        .join(",")
    );
  }
  download(new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" }), `Patel_Retail_Store_Master_${fileStamp()}.csv`);
}

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
