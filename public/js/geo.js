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
export const RISK_PROXIMITY_WEIGHT = 0.6;
export const RISK_DENSITY_WEIGHT = 0.4;
export const RISK_PROXIMITY_HORIZON_KM = 5;
export const RISK_DENSITY_SATURATION = 4;

export function overlapRisk(nearestKm, within3kmCount) {
  if (nearestKm == null || within3kmCount == null) return null;
  const proximityComponent = clamp(1 - nearestKm / RISK_PROXIMITY_HORIZON_KM, 0, 1);
  const densityComponent = clamp(within3kmCount / RISK_DENSITY_SATURATION, 0, 1);
  return round2(RISK_PROXIMITY_WEIGHT * proximityComponent + RISK_DENSITY_WEIGHT * densityComponent);
}
