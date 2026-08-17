#!/usr/bin/env node
/**
 * scripts/fetch-dmart-overpass.mjs — fetch DMart locations from OpenStreetMap
 * via the Overpass API and write public/data/competitors.json.
 *
 * Replaces the earlier Playwright approach (scripts/scrape-dmart.mjs,
 * deleted): DMart has no public locator for its physical stores — only a
 * "DMart Ready" pickup-point finder, a different thing — and this sandbox's
 * headless browser can't reach the outbound internet at all, so that
 * scraper could never be run or verified here. Overpass is free, needs no
 * key, no browser, and works over plain HTTP, which this sandbox already
 * does for scripts/geocode.mjs.
 *
 * ⚠️ CAVEAT — read before trusting this data:
 * OpenStreetMap coverage is COMMUNITY-MAINTAINED and INCOMPLETE. Absence of
 * a DMart here does not mean one doesn't exist — treat this as a lower
 * bound on DMart's footprint, not an authoritative count. It is also NOT
 * filtered to Patel's operating towns specifically (the query's bounding
 * box is the same Thane–Raigad–Palghar box scripts/geocode.mjs uses, which
 * is wider than just Patel's towns) — some results may be outside Patel's
 * actual catchment.
 *
 * ⚠️ FIXED FALSE POSITIVE (was present in the first run of this script):
 * the original name regex "DMart|D-Mart|D Mart" was a case-insensitive
 * SUBSTRING match with no anchor, so a real OSM node — a "food mart" in
 * Navi Mumbai — matched "D Mart" as a substring of "foo(D MART)" ("...d
 * mart" spans the word boundary). Fixed by anchoring the pattern to the
 * START of the name: "^[Dd][- ]?[Mm]art" matches DMart / D-Mart / D Mart /
 * d mart at position 0 and excludes "food mart" (the match would have to
 * start at index 0, and "food mart" doesn't start with d/D). Every result
 * still carries `brand_tag_confirms_dmart` (true when the OSM `brand` tag
 * is literally "DMart") as a second, independent signal — belt and braces,
 * not a reason to skip the anchor fix.
 *
 * Query (current):
 *   [out:json];
 *   node["shop"="supermarket"]["name"~"^[Dd][- ]?[Mm]art"]
 *     (18.6,72.7,19.8,73.6);
 *   out;
 *
 * ⚠️ COMPLETENESS: OpenStreetMap is community-maintained and this count
 * (see the run this script actually produced, in PATEL-HANDOFF.md) is
 * plausible for the region but almost certainly incomplete. Cross-check
 * against Avenue Supermarts' own annual report store count for Maharashtra
 * the next time this is touched — that's an authoritative total this
 * script has no way to reach on its own.
 *
 * This is NOT wired into build-proximity.mjs / the risk score yet — see
 * PATEL-HANDOFF.md for why (scope discipline: land this data, don't also
 * build a new feature on top of it in the same pass).
 *
 * Usage: node scripts/fetch-dmart-overpass.mjs
 */

import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.join(__dirname, "..", "public", "data", "competitors.json");

// The main public instance. Overpass's free tier is shared infrastructure —
// a 504 "server busy" is common and worth one retry, not a real failure.
const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const QUERY = `[out:json][timeout:60];
node["shop"="supermarket"]["name"~"^[Dd][- ]?[Mm]art"]
  (18.6,72.7,19.8,73.6);
out;`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const MAX_ATTEMPTS = 4;

async function runQuery(attempt = 1) {
  let res;
  try {
    res = await fetch(OVERPASS_URL, {
      method: "POST",
      // Accept + User-Agent explicitly — the Apache front-end in front of the
      // main Overpass instance has been seen returning 406 Not Acceptable for
      // requests that omit them (Node's fetch doesn't send an Accept header
      // by default; curl does, which is why a plain curl test looked fine).
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "*/*",
        "User-Agent": "PatelRetailDashboard/1.0 (github.com/techmuns/Patel-Retail)",
      },
      body: `data=${encodeURIComponent(QUERY)}`,
    });
  } catch (err) {
    // Bare network failure (no HTTP response at all) — measured live, this
    // free shared instance drops a request outright now and then. Retry
    // rather than fail on the first flake.
    if (attempt < MAX_ATTEMPTS) {
      console.log(`  Network error (${err.message}) — retrying in 8s (attempt ${attempt}/${MAX_ATTEMPTS})...`);
      await sleep(8000);
      return runQuery(attempt + 1);
    }
    throw err;
  }
  if (!res.ok) {
    if ((res.status === 504 || res.status === 429) && attempt < MAX_ATTEMPTS) {
      console.log(`  Overpass returned ${res.status} (busy) — retrying in 10s (attempt ${attempt}/${MAX_ATTEMPTS})...`);
      await sleep(10000);
      return runQuery(attempt + 1);
    }
    const text = await res.text().catch(() => "");
    throw new Error(`Overpass returned ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

async function main() {
  console.log("Querying Overpass API for DMart-tagged supermarkets in the Thane–Raigad–Palghar box...");
  const data = await runQuery();
  const elements = data.elements || [];
  console.log(`Got ${elements.length} result(s).`);

  const stores = elements.map((el, i) => ({
    competitor_id: `DMART-${String(i + 1).padStart(3, "0")}`,
    banner: "DMart",
    name: el.tags?.name || null,
    branch: el.tags?.branch || null, // OSM's own branch/locality label when mappers set one — e.g. "Ambernath"
    lat: el.lat,
    lng: el.lon,
    osm_id: el.id,
    osm_type: el.type,
    brand_tag_confirms_dmart: el.tags?.brand === "DMart",
    address: [el.tags?.["addr:housenumber"], el.tags?.["addr:street"], el.tags?.["addr:city"]].filter(Boolean).join(", ") || null,
  }));

  const unconfirmed = stores.filter((s) => !s.brand_tag_confirms_dmart);
  if (unconfirmed.length) {
    console.log(`\n⚠️  ${unconfirmed.length} result(s) matched the name pattern but have no brand="DMart" tag to confirm it — spot-check these:`);
    for (const s of unconfirmed) console.log(`   ${s.competitor_id}: "${s.name}" at ${s.lat}, ${s.lng} (osm ${s.osm_type}/${s.osm_id})`);
  }

  const output = {
    source: "openstreetmap_overpass",
    source_url: OVERPASS_URL,
    query: QUERY,
    caveat:
      "OpenStreetMap coverage is community-maintained and likely incomplete — absence of a DMart here does not mean one doesn't exist; treat this as a lower bound, not an authoritative count, and cross-check against Avenue Supermarts' own annual report store count for Maharashtra the next time this is touched. The name-match pattern is anchored (^[Dd][- ]?[Mm]art) specifically to exclude substring false positives like a 'food mart' matching an earlier, unanchored version of this query; every entry still carries brand_tag_confirms_dmart as a second, independent confirmation signal.",
    scraped_at: new Date().toISOString(),
    banner: "DMart",
    stores,
  };

  await writeFile(OUT_PATH, JSON.stringify(output, null, 2) + "\n", "utf8");
  console.log(`\nWrote ${OUT_PATH} — ${stores.length} result(s), ${stores.length - unconfirmed.length} brand-tag-confirmed.`);
}

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exitCode = 1;
});
