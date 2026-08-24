/**
 * public/js/patel-export-xlsx.js — branded 3-sheet Excel export.
 * ==============================================================================
 * ExcelJS (CDN, already on the page) when available; a clean CSV fallback (of
 * the Store Master sheet, the one flat table that survives a CSV) if the CDN
 * is blocked — same degrade-gracefully discipline as export-xlsx.js, but this
 * file is self-contained rather than importing from it, since the two exports
 * share no data shape.
 *
 *   - "Store Master": all 53 stores — coordinates, precision tier, geo_source.
 *   - "Proximity": every pair build-proximity.mjs emitted. A null km is shown
 *     as "Unavailable" plus the reason, never as a blank cell — the same rule
 *     the map and screener already enforce on screen (PATEL-HANDOFF.md §15.1).
 *   - "Unit Economics": the reported inputs as live formula cells, so the
 *     derived store P&L (revenue/store, gross profit, rent/utilities/staff,
 *     EBITDA) recalculates in Excel if a reader edits an input — not a frozen
 *     snapshot — plus the 5.4%-vs-7.9% reconciliation flag as a note.
 */

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
  const [storesDoc, metrics, proximity] = await Promise.all([
    fetchJson("./data/stores.json"),
    fetchJson("./data/metrics.json"),
    fetchJson("./data/proximity.json"),
  ]);
  return { stores: storesDoc.stores, metrics, proximity };
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
  const head = ["Store A", "Store A Name", "Store A Town", "Store B", "Store B Name", "Store B Town", "Distance (km)", "Status"];
  const widths = [10, 24, 18, 10, 24, 18, 14, 26];
  const ws = wb.addWorksheet("Proximity", { views: [{ showGridLines: false, state: "frozen", ySplit: 3 }] });
  ws.columns = widths.map((w) => ({ width: w }));

  // Short, per-row status — the full reason is stated ONCE, in the legend row
  // below the header, not repeated in every one of the ~430 unavailable rows.
  const UNAVAILABLE_STATUS = {
    town_centroid: "Unavailable — town centroid",
    not_geocoded: "Unavailable — not geocoded",
  };

  let r = 1;
  headerBand(
    ws,
    `MUNSHOT  ·  Store-Pair Proximity — ${proximity.metadata.pairs_with_real_distance} of ${proximity.metadata.total_possible_pairs} possible pairs have a real distance (${proximity.metadata.pairs_suppressed_town_centroid} town-centroid, ${proximity.metadata.pairs_suppressed_not_geocoded} not yet geocoded — every pair is a row, none omitted)`,
    head.length,
    r++
  );
  const legendRow = ws.getRow(r++);
  legendRow.getCell(1).value =
    "\"Real distance\" = both stores precisely geocoded. \"Town centroid\" = one or both resolved only to a town-level fallback, not their own address — a distance from that would fabricate precision, not measure it. \"Not geocoded\" = no coordinates at all yet, pending Patel Retail's own pins (see docs/PINS-NEEDED.md).";
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
    const available = p.km != null;
    const status = available ? "Real distance" : UNAVAILABLE_STATUS[p.unavailable_reason] || "Unavailable — not computed";
    const row = setRowValues(ws, r++, [
      p.a, a?.name || "", a?.town || "",
      p.b, b?.name || "", b?.town || "",
      available ? p.km : "Unavailable",
      status,
    ]);
    row.eachCell((c, col) => {
      c.font = { size: 9.5, color: { argb: col === 7 && !available ? WARN_AMBER : "FF334155" }, bold: col === 7 };
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

function buildUnitEconomics(wb, { metrics }) {
  const ue = metrics.unit_economics;
  const c = metrics.cross_file_contradictions.revenue_per_sqft_year;
  const rec = metrics.store_pnl_reconciliation;
  const mix = metrics.revenue_mix;
  const pl = metrics.peer_comparison.private_label_pct;

  const ws = wb.addWorksheet("Unit Economics", { views: [{ showGridLines: false }] });
  ws.columns = [{ width: 40 }, { width: 18 }, { width: 60 }];
  let r = 1;
  headerBand(ws, "MUNSHOT  ·  Unit Economics — Patel Retail Ltd (blue = reported input, black = live formula)", 3, r++);

  band(ws, r++, "Reported inputs (Patel_Retail_data_Munshot.xlsx)", 3);
  const areaRow = r;
  inputRow(ws, r++, "Area per store (sq ft) [estimate]", ue.sqft_per_store, ue.sqft_per_store_note);
  const revSqftRow = r;
  inputRow(ws, r++, "Revenue per sq ft per year (₹) [reported]", c.store_file, `Peer model states ${c.peer_model} instead — ${(c.gap_pct * 100).toFixed(0)}% gap; store-file value used here for every calculation`);
  const marginRow = r;
  inputRow(ws, r++, "Gross margin % [reported, midpoint of 16–17%]", ue.gross_margin_pct, ue.gross_margin_pct_note);
  const rentRow = r;
  inputRow(ws, r++, "Rent per sq ft per month (₹) [reported]", ue.rent_per_sqft_month);
  const utilRow = r;
  inputRow(ws, r++, "Utility per sq ft per month (₹) [reported]", ue.utility_per_sqft_month);
  const empRow = r;
  inputRow(ws, r++, "Employees per store [reported]", ue.employees_per_store);
  const salRow = r;
  inputRow(ws, r++, "Avg salary per month (₹) [reported]", ue.avg_salary_month);
  r++;

  band(ws, r++, "Derived store P&L (formulas — recalculates if an input above changes)", 3);
  const revenueRow = r;
  formulaRow(ws, r++, "Revenue per store per year (₹ lakh)", `ROUND(B${areaRow}*B${revSqftRow}/100000,2)`, rec.revenue_l, "#,##0.00", "= area × revenue/sq ft");
  const gpRow = r;
  const grossProfitL = Math.round(rec.revenue_l * ue.gross_margin_pct * 100) / 100;
  formulaRow(ws, r++, "Gross profit (₹ lakh)", `ROUND(B${revenueRow}*B${marginRow},2)`, grossProfitL, "#,##0.00", "= revenue × gross margin %");
  const rentLRow = r;
  formulaRow(ws, r++, "Less: rent (₹ lakh/yr)", `ROUND(B${rentRow}*B${areaRow}*12/100000,2)`, rec.rent_l, "#,##0.00", "= rent/sq ft/month × area × 12");
  const utilLRow = r;
  formulaRow(ws, r++, "Less: utilities (₹ lakh/yr)", `ROUND(B${utilRow}*B${areaRow}*12/100000,2)`, rec.utilities_l, "#,##0.00", "= utility/sq ft/month × area × 12");
  const staffLRow = r;
  formulaRow(ws, r++, "Less: staff (₹ lakh/yr)", `ROUND(B${empRow}*B${salRow}*12/100000,2)`, rec.staff_l, "#,##0.00", "= employees × avg salary × 12");
  const ebitdaL = Math.round((grossProfitL - rec.rent_l - rec.utilities_l - rec.staff_l) * 100) / 100;
  const ebitdaPct = Math.round((ebitdaL / rec.revenue_l) * 10000) / 10000;
  const ebitdaLRow = r;
  formulaRow(ws, r++, "Store EBITDA (₹ lakh/yr, before head-office cost)", `ROUND(B${gpRow}-B${rentLRow}-B${utilLRow}-B${staffLRow},2)`, ebitdaL, "#,##0.00");
  ws.getRow(r - 1).getCell(2).font = { size: 10.5, bold: true, color: { argb: INK } };
  formulaRow(ws, r++, "Store EBITDA margin %", `ROUND(B${ebitdaLRow}/B${revenueRow},4)`, ebitdaPct, "0.0%");
  r++;

  band(ws, r++, "Reconciliation flag — store-level vs peer-model company-level EBITDA", 3);
  inputRow(ws, r++, "Peer model B2C EBITDA % (company-level) [reported]", rec.peer_model_b2c_ebitda_pct, "Peer_Model.xlsx — cell E18");
  const flagRow = ws.getRow(r++);
  flagRow.getCell(1).value = rec.flag_note;
  flagRow.getCell(1).font = { size: 10, color: { argb: "FF334155" } };
  flagRow.getCell(1).alignment = { wrapText: true, vertical: "top" };
  ws.mergeCells(flagRow.number, 1, flagRow.number, 3);
  ws.getRow(flagRow.number).height = 90;
  flagRow.eachCell((c) => (c.border = box()));
  if (rec.total_company_note) {
    const tcRow = ws.getRow(r++);
    tcRow.getCell(1).value = `Total company: revenue ₹${rec.total_company_revenue_cr} cr, EBITDA ₹${rec.total_company_ebitda_cr} cr, PAT ₹${rec.total_company_pat_cr} cr, B2C share ${(rec.b2c_share_pct * 100).toFixed(0)}%. ${rec.total_company_note}`;
    tcRow.getCell(1).font = { size: 9.5, italic: true, color: { argb: MUTE } };
    tcRow.getCell(1).alignment = { wrapText: true, vertical: "top" };
    ws.mergeCells(tcRow.number, 1, tcRow.number, 3);
    ws.getRow(tcRow.number).height = 60;
    tcRow.eachCell((c) => (c.border = box()));
  }
  r++;

  band(ws, r++, "Revenue mix & margin (reported — ranges shown as a note where the source gives a range, not a single figure)", 3);
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
