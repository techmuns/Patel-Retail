#!/usr/bin/env node
/**
 * scripts/apply-client-coords.mjs — turn a client-pasted Google Maps link
 * (or a raw "lat, lng" pair) into trusted coordinates in stores.json.
 *
 * Why this exists: query-ladder geocoding tops out on hyperlocal Indian
 * addresses (measured: 24 of 53 Patel stores stayed unresolved or only
 * town-centroid after Nominatim + manual re-querying — see
 * PATEL-HANDOFF.md §14). The client dropping a pin on Google Maps for each
 * of those and pasting the link takes him minutes and is AUTHORITATIVE,
 * not inferred — a strictly better source than more automated guessing.
 *
 * How to use it:
 *   1. Open public/data/stores.json, find a store missing a precise
 *      location (geocode_match_tier is "town"/"town_base", or lat/lng is
 *      null), and paste into its `gmaps_link` field either:
 *        - a Google Maps URL (long share link, or the address-bar URL
 *          after opening a pin — "@lat,lng,zoom" and "!3d..!4d.." forms
 *          both work, as do maps.app.goo.gl / goo.gl/maps short links,
 *          which get resolved over HTTP), or
 *        - a bare "lat, lng" pair, e.g. "19.2017, 73.1896".
 *   2. Run this script. It reads every store with a `gmaps_link` set,
 *      parses it, and writes lat/lng with geo_source: "client",
 *      geocode_match_tier: "client" — a tier scripts/verify-geocode.mjs
 *      treats as trusted and never flags, and one that is NOT in
 *      public/js/geo.js's COARSE_MATCH_TIERS, so it's treated as fully
 *      locatable everywhere distances are computed.
 *   3. Re-run scripts/build-proximity.mjs.
 *
 * Re-running this script is safe and idempotent-ish: a store is
 * reprocessed every time its `gmaps_link` is set, so pasting a corrected
 * link and re-running fixes it — client input is authoritative, so later
 * always wins over earlier, unlike the geocode.mjs ladder which skips
 * anything already filled in.
 *
 * Usage: node scripts/apply-client-coords.mjs [--dry-run]
 */

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { tryParseRawLatLng, tryParseMapsUrl, isShortLink, resolveShortLink } from "./lib/gmaps-url.mjs"; // shared with fetch-official-stores.mjs — see that file's header

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORES_PATH = path.join(__dirname, "..", "public", "data", "stores.json");
const DRY_RUN = process.argv.includes("--dry-run");

// Thane–Raigad–Palghar belt, same box as scripts/geocode.mjs — a coordinate
// outside this is almost certainly a mis-paste (wrong pin, wrong city),
// worth a loud warning even though client input is otherwise trusted.
const REGION_VIEWBOX = { minLon: 72.7, minLat: 18.6, maxLon: 73.6, maxLat: 19.8 };

async function parseGmapsLink(input) {
  const trimmed = input.trim();

  const raw = tryParseRawLatLng(trimmed);
  if (raw) return { ...raw, resolved_from: "raw_latlng" };

  let url = trimmed;
  if (isShortLink(trimmed)) {
    url = await resolveShortLink(trimmed);
  }

  const parsed = tryParseMapsUrl(url);
  if (parsed) return { ...parsed, resolved_from: url === trimmed ? "url" : "short_link" };

  return null;
}

function inBoundingBox({ lat, lng }) {
  return lat >= REGION_VIEWBOX.minLat && lat <= REGION_VIEWBOX.maxLat && lng >= REGION_VIEWBOX.minLon && lng <= REGION_VIEWBOX.maxLon;
}

async function main() {
  const raw = await readFile(STORES_PATH, "utf8");
  const data = JSON.parse(raw);

  const pending = data.stores.filter((s) => s.gmaps_link);
  if (!pending.length) {
    console.log("No stores have a gmaps_link set. Paste one into a store's `gmaps_link` field in stores.json and re-run.");
    return;
  }
  console.log(`${pending.length} store(s) have a gmaps_link set — parsing.\n`);

  let applied = 0;
  let failed = 0;

  for (const store of pending) {
    try {
      const result = await parseGmapsLink(store.gmaps_link);
      if (!result) {
        console.warn(`  FAILED: ${store.store_id} — couldn't extract coordinates from "${store.gmaps_link}"`);
        failed++;
        continue;
      }
      if (!inBoundingBox(result)) {
        console.warn(
          `  ⚠️  ${store.store_id}: parsed ${result.lat}, ${result.lng} is OUTSIDE the Thane–Raigad–Palghar box — applying it anyway (client input is trusted), but double-check this link.`
        );
      }
      store.lat = result.lat;
      store.lng = result.lng;
      store.geo_source = "client";
      store.geocode_match_tier = "client";
      delete store.geocode_formatted_address;
      delete store.geocode_location_type;
      delete store.geocode_query_used;
      delete store.geocode_review_note;
      applied++;
      console.log(`  OK: ${store.store_id} -> ${result.lat}, ${result.lng} (via ${result.resolved_from})`);
    } catch (err) {
      console.warn(`  FAILED: ${store.store_id} — ${err.message}`);
      failed++;
    }
  }

  console.log(`\nApplied ${applied}, failed ${failed}.`);

  if (DRY_RUN) {
    console.log("--dry-run set, not writing stores.json.");
    return;
  }
  if (applied > 0) {
    await writeFile(STORES_PATH, JSON.stringify(data, null, 2) + "\n", "utf8");
    console.log(`Wrote ${STORES_PATH}. Next: node scripts/build-proximity.mjs`);
  }
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exitCode = 1;
});
