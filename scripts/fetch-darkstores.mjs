#!/usr/bin/env node
/**
 * scripts/fetch-darkstores.mjs — fetch quick-commerce dark-store locations
 * (Blinkit, Zepto, Swiggy Instamart) and write public/data/darkstores.json,
 * filtered to Patel's operating region.
 *
 * WHY THIS EXISTS: on the 2026-08-19 call reviewed for this round, the
 * fund's own team said dark-store cannibalization is the stated reason
 * they've held off on investing in Patel Retail — this isn't a nice-to-have
 * overlay, it's the thing standing between them and a decision. They
 * demoed their own version of this sourced from "an open public repo
 * posted by a guy on Reddit" (~2,200 Blinkit locations, "broadly right").
 *
 * SOURCE: github.com/jatin-dot-py/darkstores (public repo, live demo at
 * darkstores.vercel.app, author wrote a Medium technical piece explaining
 * the scrape methodology — every sign this was built to be seen and used,
 * not private data). Fetched here via plain HTTPS from
 * raw.githubusercontent.com, not from a local clone, so this script stays
 * re-runnable by anyone with internet access, not tied to this session's
 * one-off checkout.
 *
 * ⚠️ TWO CAVEATS, read before trusting this — same discipline as every
 * other third-party source in this project (see fetch-dmart-overpass.mjs):
 *
 *   1. STALE, NOT LIVE. The upstream data is a static scrape from mid-March
 *      2026 (per the source repo's own README: Zepto 14-15 Mar, Blinkit
 *      15-17 Mar, Swiggy Instamart 18-19 Mar). It does NOT update itself.
 *      The fund's own tool was described as "keeps updating real time" —
 *      this doesn't, and is labelled with its scrape date everywhere it's
 *      shown so it's never mistaken for current.
 *   2. NO EXPLICIT LICENSE on the source repo. It's public, openly
 *      demoed, and documented for reuse in spirit (a CSV export feature,
 *      a public write-up) — but there's no LICENSE file granting reuse in
 *      writing. Used here as attributed, cited research data for an
 *      internal diligence tool, the same category of use the fund's own
 *      team already makes of an equivalent public scrape — not
 *      represented as licensed or authoritative. Reconsider before any
 *      wider redistribution of this specific dataset.
 *
 * COVERAGE: filtered to the same Thane–Raigad–Palghar box every other
 * script in this project uses (18.6,72.7,19.8,73.6) — not filtered to
 * Patel's own towns specifically, so some results may be outside Patel's
 * actual catchment. Blinkit coordinates carry a per-store `accuracy`
 * value from the source (trilaterated, 0-50m for most stores per their
 * README); Zepto and Swiggy Instamart carry none.
 *
 * NOT wired into build-proximity.mjs / the existing overlap_risk score —
 * deliberately. The fund's own team said the composite score should be
 * built on THEIR methodology, which hasn't been supplied yet (see
 * PATEL-HANDOFF.md). This lands the data and a simple nearest-dark-store
 * distance per store; it does not redefine the existing risk score.
 *
 * Usage: node scripts/fetch-darkstores.mjs
 */

import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.join(__dirname, "..", "public", "data", "darkstores.json");

const SOURCE_REPO = "https://github.com/jatin-dot-py/darkstores";
const RAW_BASE = "https://raw.githubusercontent.com/jatin-dot-py/darkstores/main/public";
const WRITEUP_URL = "https://jatin-dot-py.medium.com/how-i-scraped-most-dark-stores-in-india-blinkit-zepto-swiggy-instamart-ad939ff17af9";

// Same Thane–Raigad–Palghar box as scripts/geocode.mjs / fetch-dmart-overpass.mjs.
const REGION_BOX = { minLat: 18.6, maxLat: 19.8, minLng: 72.7, maxLng: 73.6 };
function inRegion(lat, lng) {
  return lat >= REGION_BOX.minLat && lat <= REGION_BOX.maxLat && lng >= REGION_BOX.minLng && lng <= REGION_BOX.maxLng;
}

const BRANDS = [
  { brand: "Blinkit", file: "blinkit.json", scraped: "2026-03-15–17" },
  { brand: "Zepto", file: "zepto.json", scraped: "2026-03-14–15" },
  { brand: "Swiggy Instamart", file: "swiggy.json", scraped: "2026-03-18–19" },
];

async function fetchJson(url) {
  const res = await fetch(url, { headers: { "User-Agent": "PatelRetailDashboard/1.0 (github.com/techmuns/Patel-Retail)" } });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

/** Each brand's raw JSON has a different shape — normalize to one record. */
function normalize(brand, raw) {
  if (brand === "Blinkit") {
    // { id, accuracy, coordinates: [lat, lng] }
    return { source_id: String(raw.id), lat: raw.coordinates[0], lng: raw.coordinates[1], label: null, accuracy_m: raw.accuracy ?? null };
  }
  if (brand === "Zepto") {
    // { id, name, lat, lng, city, state, zone: [...] } — zone (delivery geofence) dropped, not needed for a point overlay
    return { source_id: String(raw.id), lat: raw.lat, lng: raw.lng, label: raw.name || null, accuracy_m: null };
  }
  // Swiggy Instamart: { id, locality, coordinates: [lat, lng] }
  return { source_id: String(raw.id), lat: raw.coordinates[0], lng: raw.coordinates[1], label: raw.locality || null, accuracy_m: null };
}

async function main() {
  console.log(`Fetching dark-store locations from ${SOURCE_REPO} ...`);
  const allInRegion = [];
  const counts = {};

  for (const { brand, file, scraped } of BRANDS) {
    console.log(`  ${brand}: fetching ${file}...`);
    const raw = await fetchJson(`${RAW_BASE}/${file}`);
    const normalized = raw.map((r) => normalize(brand, r));
    const inRegionStores = normalized.filter((s) => inRegion(s.lat, s.lng));
    console.log(`  ${brand}: ${raw.length} total, ${inRegionStores.length} in the Thane–Raigad–Palghar box`);
    counts[brand] = { total_india: raw.length, in_region: inRegionStores.length };
    for (const s of inRegionStores) {
      allInRegion.push({ darkstore_id: `${brand.replace(/\s+/g, "").toUpperCase()}-${s.source_id}`, brand, ...s });
    }
  }

  const output = {
    source_repo: SOURCE_REPO,
    source_writeup: WRITEUP_URL,
    note:
      "Third-party public data, not from Patel Retail or this dashboard's own pipeline. Static snapshot from mid-March 2026 (see scraped_at_upstream per brand below) — NOT live, does not self-update. No explicit license on the source repo; used here as attributed, cited research data for internal diligence, not represented as authoritative or exhaustive. Region-filtered to the same Thane–Raigad–Palghar box as every other script in this project — not filtered to Patel's own towns specifically, so some points may be outside Patel's actual catchment. NOT wired into the existing overlap_risk score — that's reserved for the fund's own methodology once supplied.",
    fetched_at: new Date().toISOString(),
    scraped_at_upstream: Object.fromEntries(BRANDS.map((b) => [b.brand, b.scraped])),
    region_box: REGION_BOX,
    counts,
    total_in_region: allInRegion.length,
    darkstores: allInRegion,
  };

  await writeFile(OUT_PATH, JSON.stringify(output, null, 2) + "\n", "utf8");
  console.log(`\nWrote ${OUT_PATH} — ${allInRegion.length} dark store(s) in the region (${Object.entries(counts).map(([b, c]) => `${b} ${c.in_region}`).join(", ")}).`);
}

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exitCode = 1;
});
