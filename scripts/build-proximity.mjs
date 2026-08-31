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
 *
 * DISTANCE SUPPRESSION — read before touching this file: a "coarse"
 * geocode_match_tier ("town" / "town_base") means the point is a TOWN
 * CENTROID, not the store's own address — several stores in the same town
 * land on the identical coordinate. A haversine distance computed to or
 * from one of those is fabricated precision: it produces a confident-
 * looking number (e.g. "0.0 km apart, risk 1.00") with nothing real behind
 * it, in exactly the place — intra-town cannibalisation — this dashboard
 * is supposed to answer. So: any pair involving a coarse-tier store gets
 * `km: null, unavailable_reason: "town_centroid"` instead of a computed
 * distance, and per-store nearest/within-radius figures are computed ONLY
 * against other LOCATABLE (non-coarse, geocoded) stores — never against a
 * coarse one — with an honest "N of M locatable" denominator alongside. See
 * public/js/geo.js `isLocatable`/`isCoarseTier`, the single source of
 * truth for this rule (also used by map.js and screener.js).
 *
 * EVERY possible pair is emitted, including ones touching a store with no
 * coordinates at all — an absent row is worse than a null one, since
 * nothing then tells a reader the pair should exist. `unavailable_reason`
 * is `"not_geocoded"` for those (checked first) and `"town_centroid"` for
 * everything else that isn't a real measurement — never both, never
 * neither, whenever `km` is null. (Earlier drafts of this file only looped
 * over already-geocoded stores, so pairs touching an ungeocoded store were
 * missing entirely rather than shown as unavailable — fixed.)
 *
 * No competitor data wired in yet — see scripts/fetch-dmart-overpass.mjs /
 * public/data/competitors.json, which exists but isn't joined into
 * per_store here. `nearest_competitor` / `competitors_within` from the §6
 * schema are intentionally omitted rather than faked.
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
  isLocatable,
  CATCHMENT_DECAY_KM,
} from "../public/js/geo.js"; // single source of truth — also imported client-side by map.js/screener.js

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORES_PATH = path.join(__dirname, "..", "public", "data", "stores.json");
const OUT_PATH = path.join(__dirname, "..", "public", "data", "proximity.json");

const RADII_KM = [1, 3, 5];

// Cannibalisation-risk heuristic. Documented and simple on purpose: this is
// a relative SCREENING signal built only from geography, not a validated
// prediction of actual sales overlap — there is no store-level sales data
// to validate it against (see PATEL-HANDOFF.md §9, "not supplied, and not
// coming"). Treat high values as "worth a closer look", not as fact. It is
// null whenever its inputs are null (i.e. the store itself, or every other
// store it could be compared against, is only a town centroid) — a missing
// score, not a guessed one.
const RISK_METHOD_NOTE =
  `overlap_risk = 1 − exp(−Σ exp(−d/${CATCHMENT_DECAY_KM})) over every other located operational own store, ` +
  `d in km. Distance-decay (retail gravity): a neighbour's overlap falls smoothly with distance and is never ` +
  `cut off at a fixed radius, and the whole network contributes rather than only those inside one ring. ` +
  `Geography-only heuristic (no sales data exists to calibrate against) — a relative screening ` +
  `signal, not a measurement. kind: "derived". null when either input is unavailable — ` +
  `NEVER computed from a town-centroid coordinate.`;

function nCk2(n) {
  return (n * (n - 1)) / 2;
}

async function main() {
  const raw = await readFile(STORES_PATH, "utf8");
  const data = JSON.parse(raw);
  const stores = data.stores;

  const geocoded = stores.filter((s) => s.lat != null && s.lng != null);
  const locatable = stores.filter(isLocatable);
  const locatableOperational = locatable.filter((s) => s.status === "operational");

  // ---- pairs: EVERY pair of the 53 stores (1,378 total) — including pairs
  // touching a store with no coordinates at all. km is null, with a stated
  // unavailable_reason, whenever either side isn't locatable — never a
  // missing row. ----
  const pairs = [];
  for (let i = 0; i < stores.length; i++) {
    for (let j = i + 1; j < stores.length; j++) {
      const a = stores[i];
      const b = stores[j];
      const bothLocatable = isLocatable(a) && isLocatable(b);
      const bothGeocoded = a.lat != null && a.lng != null && b.lat != null && b.lng != null;
      pairs.push({
        a: a.store_id,
        b: b.store_id,
        km: bothLocatable ? round2(haversineKm(a, b)) : null,
        precision: bothLocatable ? "geocoded" : null,
        unavailable_reason: bothLocatable ? null : bothGeocoded ? "town_centroid" : "not_geocoded",
      });
    }
  }
  const pairsWithRealDistance = pairs.filter((p) => p.km != null).length;
  const pairsSuppressedTownCentroid = pairs.filter((p) => p.unavailable_reason === "town_centroid").length;
  const pairsSuppressedNotGeocoded = pairs.filter((p) => p.unavailable_reason === "not_geocoded").length;

  // ---- per_store: nearest OPERATIONAL, LOCATABLE own store + within-radius
  // counts + risk. A store that is itself only a town centroid can't
  // meaningfully report a distance to anything (its own position could be
  // anywhere in town), so it gets the same "unavailable" treatment as an
  // ungeocoded store — not a number computed from its centroid. ----
  const per_store = stores.map((store) => {
    const base = {
      store_id: store.store_id,
      status: store.status,
      geocoded: store.lat != null && store.lng != null,
      locatable: isLocatable(store),
    };

    // Universe of "other operational stores that exist at all", regardless
    // of whether they're locatable — the honest denominator for "N of M".
    const totalOtherOperational = stores.filter((s) => s.status === "operational" && s.store_id !== store.store_id).length;

    if (!base.locatable) {
      return {
        ...base,
        nearest_own: null,
        own_within: null,
        overlap_risk: null,
        risk_unavailable_reason: null, // the whole entry is unavailable — see unavailable_reason instead
        locatable_others: 0,
        total_other_operational: totalOtherOperational,
        unavailable_reason: base.geocoded ? "town_centroid" : "not_geocoded",
      };
    }

    // Compare against other LOCATABLE, OPERATIONAL stores only — a closed
    // store can't currently cannibalise anything, and a coarse-tier store's
    // position isn't trustworthy enough to measure to/from. For the closed
    // store itself (if it's locatable), this still reports the nearest
    // live store to that former site (the "one observed data point" per §8).
    const others = locatableOperational.filter((s) => s.store_id !== store.store_id);

    if (!others.length) {
      return {
        ...base,
        nearest_own: null,
        own_within: null,
        overlap_risk: null,
        risk_unavailable_reason: null, // the whole entry is unavailable — see unavailable_reason instead
        locatable_others: 0,
        total_other_operational: totalOtherOperational,
        unavailable_reason: "no_locatable_neighbors",
      };
    }

    let nearest = null;
    const within = { "1km": 0, "3km": 0, "5km": 0 };
    const distances = [];
    for (const other of others) {
      const km = haversineKm(store, other);
      distances.push(km);
      if (!nearest || km < nearest.km) nearest = { store_id: other.store_id, km: round2(km) };
      for (const r of RADII_KM) {
        if (km <= r) within[`${r}km`] += 1;
      }
    }

    const overlap_risk =
      store.status === "operational"
        ? overlapRisk(distances)
        : null; // don't score risk for the closed store itself — nothing to protect there anymore

    return {
      ...base,
      nearest_own: nearest,
      own_within: within,
      locatable_others: others.length,
      total_other_operational: totalOtherOperational,
      overlap_risk,
      // Distinct from `unavailable_reason` above: nearest_own/own_within ARE
      // real here (a closed store's distance to the nearest live store is a
      // valid data point), only the risk score itself is withheld. Carried
      // as data, not just a code comment, so the UI can state why rather
      // than showing a bare "—".
      risk_unavailable_reason: store.status === "operational" ? null : "closed",
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
      locatable_count: locatable.length,
      coarse_count: geocoded.length - locatable.length,
      pending_geocode_count: stores.length - geocoded.length,
      total_possible_pairs: nCk2(stores.length),
      pairs_emitted: pairs.length, // now always equals total_possible_pairs — every pair gets a row
      pairs_with_real_distance: pairsWithRealDistance,
      pairs_suppressed_town_centroid: pairsSuppressedTownCentroid,
      pairs_suppressed_not_geocoded: pairsSuppressedNotGeocoded,
      note:
        geocoded.length === 0
          ? "No stores are geocoded yet — run scripts/geocode.mjs (Nominatim by default, no key needed), then re-run this script. Town clusters below don't need geocoding and are already real."
          : `${locatable.length}/${stores.length} stores are precisely located; ${geocoded.length - locatable.length} more are geocoded only to a town centroid (distances suppressed, not fabricated) and ${stores.length - geocoded.length} have no coordinates at all.`,
    },
    overlap_risk_method: RISK_METHOD_NOTE,
    pairs,
    per_store,
    clusters,
  };

  await writeFile(OUT_PATH, JSON.stringify(output, null, 2) + "\n", "utf8");
  console.log(
    `Wrote ${OUT_PATH} — ${pairs.length}/${nCk2(stores.length)} pairs emitted (every pair, none missing); ` +
      `${pairsWithRealDistance} have a real distance, ${pairsSuppressedTownCentroid} suppressed as town-centroid, ` +
      `${pairsSuppressedNotGeocoded} suppressed as not-geocoded; ${locatable.length}/${stores.length} stores precisely located, ${clusters.length} towns.`
  );
}

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exitCode = 1;
});
