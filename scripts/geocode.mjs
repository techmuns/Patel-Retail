#!/usr/bin/env node
/**
 * scripts/geocode.mjs — fill public/data/stores.json lat/lng via the Google
 * Geocoding API (decision recorded in PATEL-HANDOFF.md §7: Google over
 * Nominatim for Indian junction-name addresses).
 *
 * IDEMPOTENT: a store with a non-null lat/lng is skipped, so re-running this
 * after new stores are added only geocodes what's new. `geo_confidence`
 * (the client's own address-quality read, 33 high / 17 medium / 3 low) is
 * NEVER touched here — that's a manual assessment, not something a
 * geocoder result should overwrite.
 *
 * Requires GOOGLE_MAPS_API_KEY. Mirrors the donor's check-llm.mjs pattern
 * (screener-test/check-llm.mjs): one cheap call FIRST to fail fast on a bad
 * key, before spending the batch.
 *
 * Usage:
 *   GOOGLE_MAPS_API_KEY=... node scripts/geocode.mjs
 *   GOOGLE_MAPS_API_KEY=... node scripts/geocode.mjs --dry-run   # print, don't write
 */

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORES_PATH = path.join(__dirname, "..", "public", "data", "stores.json");
const GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";
const REQUEST_DELAY_MS = 200; // polite pacing; Google's default quota is generous but this isn't a race
const DRY_RUN = process.argv.includes("--dry-run");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function geocodeOne(query, apiKey) {
  const url = new URL(GEOCODE_URL);
  url.searchParams.set("address", query);
  url.searchParams.set("region", "in"); // bias toward India, doesn't restrict
  url.searchParams.set("key", apiKey);

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }
  const data = await res.json();

  if (data.status === "OK" && data.results?.length) {
    const top = data.results[0];
    return {
      lat: top.geometry.location.lat,
      lng: top.geometry.location.lng,
      formatted_address: top.formatted_address,
      location_type: top.geometry.location_type, // ROOFTOP | RANGE_INTERPOLATED | GEOMETRIC_CENTER | APPROXIMATE
    };
  }
  if (data.status === "ZERO_RESULTS") {
    return null;
  }
  // OVER_QUERY_LIMIT, REQUEST_DENIED, INVALID_REQUEST, UNKNOWN_ERROR
  throw new Error(`Geocoding API status ${data.status}: ${data.error_message || "no message"}`);
}

/** One cheap, known-good lookup before burning the real batch — fail fast on a bad/missing key. */
async function preflight(apiKey) {
  if (!apiKey) {
    throw new Error(
      "GOOGLE_MAPS_API_KEY is not set. Get a Geocoding API key from the Google Cloud Console and set it as an env var (locally) or a GitHub Actions secret (in CI)."
    );
  }
  const result = await geocodeOne("Mumbai, Maharashtra, India", apiKey);
  if (!result) {
    throw new Error("Preflight geocode returned no result for a known-good address — something is wrong before we even start the batch.");
  }
  console.log(`Preflight OK — key works (Mumbai resolved to ${result.lat.toFixed(4)}, ${result.lng.toFixed(4)}).`);
}

async function main() {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  await preflight(apiKey);

  const raw = await readFile(STORES_PATH, "utf8");
  const data = JSON.parse(raw);

  const pending = data.stores.filter((s) => s.lat == null || s.lng == null);
  if (!pending.length) {
    console.log("Nothing to do — every store already has lat/lng.");
    return;
  }
  console.log(`${pending.length} of ${data.stores.length} stores need geocoding.`);

  let geocoded = 0;
  let failed = 0;

  for (const store of pending) {
    try {
      const result = await geocodeOne(store.geocode_query, apiKey);
      if (!result) {
        console.warn(`  ZERO_RESULTS: ${store.store_id} — "${store.geocode_query}"`);
        failed++;
        continue;
      }
      store.lat = result.lat;
      store.lng = result.lng;
      store.geo_source = "google_geocoding_api";
      // Kept for QA only — does NOT override the client's own geo_confidence read.
      store.geocode_formatted_address = result.formatted_address;
      store.geocode_location_type = result.location_type;
      geocoded++;
      console.log(`  OK: ${store.store_id} -> ${result.lat.toFixed(5)}, ${result.lng.toFixed(5)} (${result.location_type})`);
    } catch (err) {
      console.warn(`  FAILED: ${store.store_id} — ${err.message}`);
      failed++;
    }
    await sleep(REQUEST_DELAY_MS);
  }

  console.log(`\nDone. Geocoded ${geocoded}, failed/zero-results ${failed}, already had coords ${data.stores.length - pending.length}.`);

  if (DRY_RUN) {
    console.log("--dry-run set, not writing stores.json.");
    return;
  }
  if (geocoded > 0) {
    await writeFile(STORES_PATH, JSON.stringify(data, null, 2) + "\n", "utf8");
    console.log(`Wrote ${STORES_PATH}`);
  }
  if (failed > 0) {
    console.log(`${failed} store(s) still need attention — re-run this script after fixing their geocode_query, or hand-fill lat/lng for known addresses.`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
