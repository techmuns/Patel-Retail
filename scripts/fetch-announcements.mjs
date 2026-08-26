#!/usr/bin/env node
/**
 * scripts/fetch-announcements.mjs — pull Patel Retail's own exchange filings
 * from BSE and surface the ones that move numbers on this dashboard,
 * especially new-store announcements.
 *
 * WHY THIS EXISTS: everything else in this project reads a file somebody
 * handed over once. A company that is listed has to disclose material events
 * — including new store openings — under SEBI LODR Regulation 30, publicly,
 * on a fixed schedule. That is a live feed nobody has to remember to send us.
 * The Uran store (see PATEL-HANDOFF.md §29) was found exactly this way, by
 * hand, after sitting unmatched for weeks; this script is that lookup made
 * automatic.
 *
 * SOURCE: BSE's own public announcements API (api.bseindia.com), scrip code
 * 544487 (Patel Retail Ltd, listed 26 Aug 2025; NSE symbol PATELRMART).
 * No key, no login. Plain fetch() reaches it from CI.
 *
 * WHAT IT DOES *NOT* DO — deliberately:
 *   - It does not auto-add stores to stores.json. A press release says "we
 *     opened a store at X"; turning that into a mapped store needs an address
 *     resolved to a coordinate and a store_id assigned, and a wrong pin is
 *     worse than a missing one. New-store filings are written to
 *     public/data/announcements.json flagged `new_store_candidate: true` for
 *     review, the same propose-then-apply discipline as
 *     fetch-official-stores.mjs.
 * READING THE PDF BODY MATTERS. BSE headlines are frequently generic —
 * Patel's own Uran store opening (27 Jul 2026) was filed as nothing more
 * than "Announcement under Regulation 30 (LODR)-Press Release / Media
 * Release". Headline matching alone would miss it, which is exactly how it
 * went unnoticed for weeks. So press-release attachments are downloaded and
 * their text scanned too; that filing's body says plainly "53rd Store
 * Opening in Uran ... at Karanja Road, Uran, Raigad".
 *
 * pdfjs-dist is an OPTIONAL dependency. If it isn't installed the script
 * still runs and still writes its output, just headline-only — it degrades
 * instead of failing, the same discipline the browser code uses for CDN libs.
 *
 * Usage: node scripts/fetch-announcements.mjs
 */

import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.join(__dirname, "..", "public", "data", "announcements.json");

const SCRIP_CODE = "544487"; // Patel Retail Ltd on BSE
const COMPANY = "Patel Retail Ltd";
const BSE_API = "https://api.bseindia.com/BseIndiaAPI/api/AnnSubCategoryGetData/w";
const ATTACH_BASE = "https://www.bseindia.com/xml-data/corpfiling/AttachLive/";
const LOOKBACK_DAYS = 400;
// Only these filing kinds are worth spending a PDF download on; a "Newspaper
// Publication" or a monitoring-agency report never announces a store.
const PDF_SCAN_KINDS = new Set(["press_release", "other"]);
const MAX_PDF_SCANS = 40;

// Headline patterns that mean "a store opened / is opening". Kept broad on
// purpose — a missed opening is worse than a false positive a human rejects.
const NEW_STORE_PATTERNS = [
  /\bnew\s+store\b/i,
  /\bstore\s+open/i,
  /\bopen(?:ing|ed|s)?\s+(?:of\s+)?(?:a\s+|its\s+|new\s+)*(?:\d+(?:st|nd|rd|th)\s+)?store\b/i,
  /\b\d+(?:st|nd|rd|th)\s+store\b/i,
  /\bcommenc\w*\s+(?:of\s+)?(?:commercial\s+)?operation/i,
  /\bexpan\w+\s+(?:its\s+)?(?:retail\s+)?(?:footprint|network|presence)/i,
  /\boutlet\b/i,
];
// Filings worth showing even when they are not about a store.
const MATERIAL_PATTERNS = [
  { re: /press\s+release|media\s+release/i, kind: "press_release" },
  { re: /investor\s+presentation/i, kind: "investor_presentation" },
  { re: /earnings\s+(?:conference\s+)?call|concall|transcript/i, kind: "earnings_call" },
  { re: /financial\s+results|board\s+meeting\s+outcome|outcome\s+of\s+the\s+board/i, kind: "results" },
];

/** pdfjs-dist if present, else null — the script degrades to headline-only. */
async function loadPdfExtractor() {
  try {
    const mod = await import("pdfjs-dist/legacy/build/pdf.mjs");
    return mod.getDocument;
  } catch {
    console.log("[announcements] pdfjs-dist not installed — scanning headlines only.");
    console.log("[announcements] For full press-release scanning: npm install --no-save pdfjs-dist");
    return null;
  }
}

async function extractPdfText(url, getDocument) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; PatelRetailDashboard/1.0)", Referer: "https://www.bseindia.com/" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = new Uint8Array(await res.arrayBuffer());
  const doc = await getDocument({ data, useSystemFonts: true }).promise;
  let text = "";
  for (let i = 1; i <= Math.min(doc.numPages, 4); i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((it) => it.str).join(" ") + "\n";
  }
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Pull the store's stated location out of a press-release body. Patel's
 * filings follow a consistent shape ("...Store Opening in Uran", "opening of
 * its 53rd retail store at Karanja Road, Uran, Raigad"), so this reads the
 * phrasing rather than guessing at any address-like text.
 */
function extractStoreLocation(text) {
  const patterns = [
    /\bstore\s+opening\s+in\s+([A-Z][A-Za-z\s.'-]{2,40}?)(?=[.,;]|\s{2}|\s+Mumbai\b|$)/i,
    /\bretail\s+store\s+at\s+([A-Z][A-Za-z0-9\s.,'\/-]{4,80}?)(?=[.;]|\s+further\b|\s+strategically\b|$)/i,
    /\bopening\s+of\s+(?:its\s+)?(?:\d+\s*(?:st|nd|rd|th)\s+)?(?:retail\s+)?store\s+at\s+([A-Z][A-Za-z0-9\s.,'\/-]{4,80}?)(?=[.;]|$)/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m && m[1]) return m[1].replace(/\s+/g, " ").trim().replace(/[,.]$/, "");
  }
  return null;
}

/** "...53rd retail store..." -> 53, so a filing can be tied to a store number. */
function extractStoreNumber(text) {
  const m = text.match(/\b(\d{1,3})\s*(?:st|nd|rd|th)\s+(?:retail\s+)?store\b/i);
  return m ? parseInt(m[1], 10) : null;
}

function yyyymmdd(d) {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

function classify(headline) {
  const text = headline || "";
  const isNewStore = NEW_STORE_PATTERNS.some((re) => re.test(text));
  const material = MATERIAL_PATTERNS.find((m) => m.re.test(text));
  return { isNewStore, kind: isNewStore ? "new_store" : material?.kind || "other" };
}

async function fetchPage(pageno, fromDate, toDate) {
  const params = new URLSearchParams({
    pageno: String(pageno),
    strCat: "-1",
    strPrevDate: fromDate,
    strScrip: SCRIP_CODE,
    strSearch: "P",
    strToDate: toDate,
    strType: "C",
    subcategory: "-1",
  });
  const res = await fetch(`${BSE_API}?${params}`, {
    headers: {
      // BSE's API rejects requests without a browser-shaped UA/Referer.
      "User-Agent": "Mozilla/5.0 (compatible; PatelRetailDashboard/1.0)",
      Referer: "https://www.bseindia.com/",
      Accept: "application/json",
    },
  });
  if (!res.ok) throw new Error(`BSE announcements API -> HTTP ${res.status}`);
  const json = await res.json();
  const rows = json.Table || [];
  // BSE reports argument errors as a single row with a Column1 message
  // rather than an HTTP error — treat that as a hard failure, not "0 results".
  if (rows.length === 1 && rows[0].Column1 && !rows[0].NEWSSUB) {
    throw new Error(`BSE API rejected the request: ${rows[0].Column1}`);
  }
  return rows;
}

async function main() {
  const now = new Date();
  const from = new Date(now.getTime() - LOOKBACK_DAYS * 86400000);
  const toDate = yyyymmdd(now);
  const fromDate = yyyymmdd(from);

  console.log(`[announcements] ${COMPANY} (BSE ${SCRIP_CODE}), ${fromDate} → ${toDate}`);

  const seen = new Set();
  const all = [];
  for (let page = 1; page <= 10; page++) {
    const rows = await fetchPage(page, fromDate, toDate);
    if (!rows.length) break;
    let added = 0;
    for (const r of rows) {
      const headline = (r.NEWSSUB || r.HEADLINE || "").trim();
      if (!headline) continue;
      const id = String(r.NEWSID || `${r.NEWS_DT}-${headline}`);
      if (seen.has(id)) continue;
      seen.add(id);
      added++;
      const { isNewStore, kind } = classify(headline);
      all.push({
        id,
        date: (r.NEWS_DT || "").slice(0, 10),
        headline,
        category: (r.CATEGORYNAME || "").trim() || null,
        kind,
        new_store_candidate: isNewStore,
        attachment_url: r.ATTACHMENTNAME ? `${ATTACH_BASE}${r.ATTACHMENTNAME}` : null,
      });
    }
    console.log(`[announcements]   page ${page}: ${rows.length} rows, ${added} new`);
    if (added === 0) break;
  }

  all.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  // Second pass: read the attachments whose headline told us nothing.
  const getDocument = await loadPdfExtractor();
  if (getDocument) {
    const scannable = all.filter((a) => a.attachment_url && !a.new_store_candidate && PDF_SCAN_KINDS.has(a.kind)).slice(0, MAX_PDF_SCANS);
    console.log(`[announcements] scanning ${scannable.length} attachment(s) whose headline is uninformative...`);
    let found = 0;
    for (const a of scannable) {
      try {
        const text = await extractPdfText(a.attachment_url, getDocument);
        if (!text) continue;
        a.body_scanned = true;
        if (NEW_STORE_PATTERNS.some((re) => re.test(text))) {
          a.new_store_candidate = true;
          a.kind = "new_store";
          a.detected_in = "attachment_body";
          a.store_location = extractStoreLocation(text);
          a.store_number = extractStoreNumber(text);
          found++;
          console.log(`  ✓ ${a.date} — store filing found in body${a.store_location ? `: ${a.store_location}` : ""}`);
        }
      } catch (err) {
        a.body_scan_error = err.message;
      }
    }
    console.log(`[announcements] ${found} additional store filing(s) found by reading attachments.`);
  }

  const newStores = all.filter((a) => a.new_store_candidate);

  const output = {
    company: COMPANY,
    bse_scrip_code: SCRIP_CODE,
    nse_symbol: "PATELRMART",
    source: "BSE corporate announcements (api.bseindia.com) — SEBI LODR Regulation 30 filings",
    kind: "reported",
    note:
      "Patel Retail's own exchange filings, fetched live — not a file anyone had to send. New-store filings are flagged as candidates for review, never auto-added to stores.json: a filing headline is not a resolved coordinate, and a wrong pin is worse than a missing one.",
    fetched_at: now.toISOString(),
    window: { from: fromDate, to: toDate },
    pdf_body_scanning: Boolean(await loadPdfExtractor()),
    counts: { total: all.length, new_store_candidates: newStores.length },
    announcements: all,
  };

  await writeFile(OUT_PATH, JSON.stringify(output, null, 2) + "\n", "utf8");
  console.log(`\n[announcements] Wrote ${OUT_PATH} — ${all.length} filing(s), ${newStores.length} flagged as new-store candidates.`);
  for (const n of newStores.slice(0, 10)) {
    console.log(`  • ${n.date}  ${n.store_location || n.headline.slice(0, 80)}${n.store_number ? `  (store #${n.store_number})` : ""}`);
  }
}

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exitCode = 1;
});
