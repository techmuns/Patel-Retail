/**
 * public/js/geo.js — pure geo math, no DOM dependency. Shared by the browser
 * (public/js/map.js, public/js/screener.js) and Node (scripts/build-proximity.mjs
 * imports this same file by relative path) so there's exactly one haversine
 * implementation, not two copies that can drift apart.
 */

const EARTH_KM = 6371;

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * A "coarse" geocode_match_tier means the point is a TOWN CENTROID, not the
 * store's own address — every store that fell back to the same town lands
 * on the identical coordinate. Any distance computed to/from a coarse-tier
 * store is fabricated precision (a town can be several km across), so
 * nothing in this app may report a number derived from one. Single source
 * of truth for that classification — used by scripts/build-proximity.mjs,
 * map.js, and screener.js so the rule can't drift between them.
 */
export const COARSE_MATCH_TIERS = new Set(["town", "town_base"]);

export function isCoarseTier(matchTier) {
  return COARSE_MATCH_TIERS.has(matchTier);
}

/** A store's own position is trustworthy enough to compute distances from/to. */
export function isLocatable(store) {
  return store.lat != null && store.lng != null && !isCoarseTier(store.geocode_match_tier);
}

export function haversineKm(a, b) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return EARTH_KM * 2 * Math.asin(Math.sqrt(clamp(h, 0, 1)));
}

export function round2(v) {
  return Math.round(v * 100) / 100;
}

/**
 * The same overlap_risk heuristic scripts/build-proximity.mjs uses for
 * store-vs-store pairs, generalized so the site screener can score a
 * candidate address against the existing network with the identical formula
 * — "same risk components" is the whole point, not a second invented metric.
 */
/**
 * Catchment decay constant, in km. A neighbouring store's pull on the same
 * shoppers falls off with distance rather than stopping at a line on a map:
 * at 1.5 km another store still overlaps 37% as much as one next door, at
 * 3 km 13%, at 5 km 3.6%, at 10 km effectively nothing. 1.5 km is chosen for
 * a neighbourhood-format grocer whose catchment is a short walk or ride.
 */
export const CATCHMENT_DECAY_KM = 1.5;

/**
 * What a score of 1.00 means: overlap equal to four other stores sitting at
 * zero distance. Patel's densest site currently reaches 3.48 on that scale, so
 * nothing is artificially pinned at the top of the range.
 */
export const OVERLAP_REFERENCE = 4;

/**
 * Cannibalisation overlap score, 0–1.
 *
 * REPLACES a two-term cliff function (0.6 × how close the nearest store is,
 * capped at 5 km, plus 0.4 × how many sit inside 3 km, capped at 4). That
 * version could not discriminate: it scored 22 of 44 stores above 0.8 and 12
 * below 0.2 with almost nothing between, because both terms saturated. It
 * also ignored everything past 5 km and counted a store at 2.9 km exactly as
 * heavily as one across the street.
 *
 * This is the standard retail-gravity treatment instead. Every other located
 * store contributes exp(−distance / λ), so its pull falls smoothly with
 * distance and is never cut off at a ring; the sum is the overlap this site
 * faces, expressed in "stores' worth of pull at zero distance". Five stores at
 * 2 km therefore outrank one store at 2 km, which is the whole question a
 * cannibalisation screen is asked.
 *
 * The sum is divided by OVERLAP_REFERENCE rather than squashed through
 * 1 − exp(−x), which bunched two-thirds of the network into the top band.
 * Dividing by a fixed reference keeps the scale absolute — a store's score
 * does not move because a store opened somewhere else in the network — and
 * spreads Patel's actual range across the full 0–1 scale.
 *
 * Still geography only. No sales or footfall data exists anywhere in this
 * project to calibrate against, so this ranks sites against each other; it
 * does not measure lost revenue.
 *
 * @param {number[]} distancesKm every other located own store's distance.
 */
export function overlapRisk(distancesKm) {
  if (!Array.isArray(distancesKm)) return null;
  let sum = 0;
  for (const km of distancesKm) {
    if (km == null || !Number.isFinite(km)) continue;
    sum += Math.exp(-km / CATCHMENT_DECAY_KM);
  }
  return round2(Math.min(1, sum / OVERLAP_REFERENCE));
}

/** The single nearest store's own contribution, for showing the breakdown. */
export function overlapContribution(km) {
  if (km == null || !Number.isFinite(km)) return null;
  return round2(Math.exp(-km / CATCHMENT_DECAY_KM));
}
