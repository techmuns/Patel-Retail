#!/usr/bin/env node
/**
 * scripts/build-proximity.mjs — precompute every store-pair distance and a
 * per-store cannibalisation-risk summary from public/data/stores.json, and
 * write public/data/proximity.json. Heavy lifting happens here, not in the
 * browser (PATEL-HANDOFF.md §5: "53 stores = 1,378 pairs, trivial to
 * precompute, keeps the browser instant").
 *
 * Two things work WITHOUT geocoding and stay populated even before
 * scripts/geocode.mjs has ever run:
 *   - `clusters`: grouped straight off each store's `town` field.
 *   - `metadata`: store counts, and how many still need geocoding.
 * Everything distance-based (`pairs`, `per_store[].nearest_own` /
 * `overlap_risk`) needs lat/lng and is `null` for ungeocoded stores.
 *
 * No competitor data yet (scripts/scrape-dmart.mjs doesn't exist in this
 * repo — see PATEL-HANDOFF.md §3/§7 "v1"), so `nearest_competitor` /
 * `competitors_within` from the §6 schema are intentionally omitted here
 * rather than faked; add them once that scraper lands.
 *
 * Usage: node scripts/build-proximity.mjs
 */

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  haversineKm,
  round2,
  overlapRisk,
  RISK_PROXIMITY_WEIGHT,
  RISK_DENSITY_WEIGHT,
  RISK_PROXIMITY_HORIZON_KM,
  RISK_DENSITY_SATURATION,
} from "../public/js/geo.js"; // single source of truth — also imported client-side by map.js/screener.js

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORES_PATH = path.join(__dirname, "..", "public", "data", "stores.json");
const OUT_PATH = path.join(__dirname, "..", "public", "data", "proximity.json");

const RADII_KM = [1, 3, 5];

// Cannibalisation-risk heuristic. Documented and simple on purpose: this is
// a relative SCREENING signal built only from geography, not a validated
// prediction of actual sales overlap — there is no store-level sales data
// to validate it against (see PATEL-HANDOFF.md §9, "not supplied, and not
// coming"). Treat high values as "worth a closer look", not as fact.
const RISK_METHOD_NOTE =
  `overlap_risk = ${RISK_PROXIMITY_WEIGHT}×clamp(1 − nearest_own_km/${RISK_PROXIMITY_HORIZON_KM}, 0, 1) ` +
  `+ ${RISK_DENSITY_WEIGHT}×clamp(own_within[\"3km\"]/${RISK_DENSITY_SATURATION}, 0, 1). ` +
  `Geography-only heuristic (no sales data exists to calibrate against) — a relative screening ` +
  `signal, not a measurement. kind: "derived".`;

function nCk2(n) {
  return (n * (n - 1)) / 2;
}

async function main() {
  const raw = await readFile(STORES_PATH, "utf8");
  const data = JSON.parse(raw);
  const stores = data.stores;

  const geocoded = stores.filter((s) => s.lat != null && s.lng != null);
  const geocodedOperational = geocoded.filter((s) => s.status === "operational");

  // ---- pairs: every geocoded-vs-geocoded distance (up to 1,378 for 53 stores) ----
  const pairs = [];
  for (let i = 0; i < geocoded.length; i++) {
    for (let j = i + 1; j < geocoded.length; j++) {
      const a = geocoded[i];
      const b = geocoded[j];
      pairs.push({ a: a.store_id, b: b.store_id, km: round2(haversineKm(a, b)) });
    }
  }

  // ---- per_store: nearest OPERATIONAL own store + within-radius counts + risk ----
  const per_store = stores.map((store) => {
    const base = {
      store_id: store.store_id,
      status: store.status,
      geocoded: store.lat != null && store.lng != null,
    };
    if (!base.geocoded) {
      return { ...base, nearest_own: null, own_within: null, overlap_risk: null };
    }

    // Compare against other OPERATIONAL geocoded stores only — a closed
    // store can't currently cannibalise anything. For the closed store
    // itself, this still reports the nearest live store to that former
    // site (the "one observed data point" per §8).
    const others = geocodedOperational.filter((s) => s.store_id !== store.store_id);
    if (!others.length) {
      return { ...base, nearest_own: null, own_within: null, overlap_risk: null };
    }

    let nearest = null;
    const within = { "1km": 0, "3km": 0, "5km": 0 };
    for (const other of others) {
      const km = haversineKm(store, other);
      if (!nearest || km < nearest.km) nearest = { store_id: other.store_id, km: round2(km) };
      for (const r of RADII_KM) {
        if (km <= r) within[`${r}km`] += 1;
      }
    }

    const overlap_risk =
      store.status === "operational"
        ? overlapRisk(nearest.km, within["3km"])
        : null; // don't score risk for the closed store itself — nothing to protect there anymore

    return {
      ...base,
      nearest_own: nearest,
      own_within: within,
      overlap_risk,
      kind: overlap_risk == null ? undefined : "derived",
    };
  });

  // ---- clusters: town groupings, no geocoding required ----
  const byTown = new Map();
  for (const store of stores) {
    if (!byTown.has(store.town)) byTown.set(store.town, []);
    byTown.get(store.town).push(store.store_id);
  }
  const clusters = [...byTown.entries()]
    .map(([town, store_ids]) => ({ town, stores: store_ids.length, store_ids }))
    .sort((a, b) => b.stores - a.stores || a.town.localeCompare(b.town));

  const output = {
    generated_at: new Date().toISOString(),
    metadata: {
      total_stores: stores.length,
      geocoded_count: geocoded.length,
      pending_geocode_count: stores.length - geocoded.length,
      total_possible_pairs: nCk2(stores.length),
      pairs_computed: pairs.length,
      note:
        geocoded.length === 0
          ? "No stores are geocoded yet — run scripts/geocode.mjs (Nominatim by default, no key needed), then re-run this script. Town clusters below don't need geocoding and are already real."
          : geocoded.length < stores.length
          ? `${stores.length - geocoded.length} store(s) still ungeocoded — pairs/nearest-own involving them are absent, not zero.`
          : "All stores geocoded.",
    },
    overlap_risk_method: RISK_METHOD_NOTE,
    pairs,
    per_store,
    clusters,
  };

  await writeFile(OUT_PATH, JSON.stringify(output, null, 2) + "\n", "utf8");
  console.log(
    `Wrote ${OUT_PATH} — ${pairs.length}/${nCk2(stores.length)} pairs computed, ${geocoded.length}/${stores.length} stores geocoded, ${clusters.length} towns.`
  );
}

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exitCode = 1;
});
