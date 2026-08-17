#!/usr/bin/env node
/**
 * scripts/verify-geocode.mjs — flag geocoded stores that need a human look
 * before anyone trusts the pin. Run after scripts/geocode.mjs.
 *
 * Flags four things, all cheap to check and none of them requiring network
 * access:
 *   1. Outside the Thane–Raigad–Palghar bounding box (18.6–19.8N, 72.7–73.6E)
 *      — every real store sits inside it, so a hit outside is a bad match.
 *   2. Two or more stores sharing the exact same coordinates — usually means
 *      they all fell back to the same town-level centroid, not their own
 *      address.
 *   3. geo_confidence: "low" — the client's own address-quality read, not
 *      something a geocoder result should override.
 *   4. A coarse fallback tier ("town" / "town_base" in geocode_match_tier)
 *      — a town centroid, not the store, even for a store that happens not
 *      to collide with a sibling (e.g. the only Patel store in its town).
 *
 * geo_source: "client" stores (pasted by the client via a Google Maps link
 * — see scripts/apply-client-coords.mjs) are EXCLUDED from all four checks.
 * That's authoritative input, not an inference to second-guess.
 *
 * This script only READS and REPORTS — it never edits stores.json. Corrections
 * belong in stores.json by hand, with geo_source set to "manual" so the
 * provenance stays honest about what's geocoded vs. eyeballed.
 *
 * Usage: node scripts/verify-geocode.mjs
 * Exits non-zero if anything is flagged, so it can gate CI until reviewed.
 */

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORES_PATH = path.join(__dirname, "..", "public", "data", "stores.json");

const REGION_VIEWBOX = { minLon: 72.7, minLat: 18.6, maxLon: 73.6, maxLat: 19.8 };
const COARSE_TIERS = new Set(["town", "town_base"]);

function inBoundingBox(store) {
  return (
    store.lat >= REGION_VIEWBOX.minLat &&
    store.lat <= REGION_VIEWBOX.maxLat &&
    store.lng >= REGION_VIEWBOX.minLon &&
    store.lng <= REGION_VIEWBOX.maxLon
  );
}

function coordKey(store) {
  // 5dp ≈ 1.1m — treat "identical to the eye" as identical; a coarse
  // fallback landing 2 stores on the exact same centroid will match at
  // far fewer decimal places than this anyway.
  return `${store.lat.toFixed(5)},${store.lng.toFixed(5)}`;
}

async function main() {
  const raw = await readFile(STORES_PATH, "utf8");
  const data = JSON.parse(raw);
  const allGeocoded = data.stores.filter((s) => s.lat != null && s.lng != null);
  const clientTrusted = allGeocoded.filter((s) => s.geo_source === "client");
  const geocoded = allGeocoded.filter((s) => s.geo_source !== "client"); // checked below
  const notGeocoded = data.stores.length - allGeocoded.length;

  const flags = []; // { store_id, reasons: [...] }
  const flagFor = (store, reason) => {
    let entry = flags.find((f) => f.store_id === store.store_id);
    if (!entry) {
      entry = { store_id: store.store_id, name: store.name, reasons: [] };
      flags.push(entry);
    }
    entry.reasons.push(reason);
  };

  // 1. Bounding box
  for (const store of geocoded) {
    if (!inBoundingBox(store)) {
      flagFor(store, `outside bounding box (${store.lat}, ${store.lng})`);
    }
  }

  // 2. Duplicate coordinates
  const byCoord = new Map();
  for (const store of geocoded) {
    const key = coordKey(store);
    if (!byCoord.has(key)) byCoord.set(key, []);
    byCoord.get(key).push(store);
  }
  for (const [key, group] of byCoord) {
    if (group.length > 1) {
      const ids = group.map((s) => s.store_id).join(", ");
      for (const store of group) flagFor(store, `shares coordinates (${key}) with ${group.length - 1} other store(s): ${ids}`);
    }
  }

  // 3. Client's own low-confidence read
  for (const store of geocoded) {
    if (store.geo_confidence === "low") {
      flagFor(store, "geo_confidence: low (client's own address-quality read)");
    }
  }

  // 4. Coarse geocoding tier
  for (const store of geocoded) {
    if (COARSE_TIERS.has(store.geocode_match_tier)) {
      flagFor(store, `coarse geocode match tier: "${store.geocode_match_tier}" (a town centroid, not the store's own address)`);
    }
  }

  console.log(
    `${allGeocoded.length}/${data.stores.length} stores geocoded (${notGeocoded} pending) — ${clientTrusted.length} client-supplied and trusted without checks, ${geocoded.length} checked below.`
  );
  console.log(`${flags.length} store(s) flagged for manual review:\n`);

  flags.sort((a, b) => a.store_id.localeCompare(b.store_id));
  for (const f of flags) {
    console.log(`  ${f.store_id} — ${f.name}`);
    for (const reason of f.reasons) console.log(`      - ${reason}`);
  }

  if (!flags.length && geocoded.length) {
    console.log("Nothing flagged — every geocoded store passed all four checks. (Still worth spot-checking a handful by eye.)");
  }

  process.exitCode = flags.length ? 1 : 0;
}

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exitCode = 1;
});
