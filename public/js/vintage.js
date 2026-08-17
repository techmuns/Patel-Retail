/**
 * public/js/vintage.js — store-age math, no DOM dependency. Shared by
 * map.js (vintage-coloured markers) and the Estate & Vintage screen
 * (age distribution, openings-by-year) so there's one bucket definition,
 * not two that can drift — the map's legend and the estate screen's
 * breakdown should always agree on what "2–5 yrs" means.
 */

export const VINTAGE_BUCKETS = [
  { maxYears: 2, color: "var(--brand-teal)", label: "< 2 yrs" },
  { maxYears: 5, color: "var(--brand-sky)", label: "2–5 yrs" },
  { maxYears: 10, color: "var(--brand-indigo)", label: "5–10 yrs" },
  { maxYears: Infinity, color: "var(--brand-violet)", label: "10+ yrs" },
];

export function yearsSince(dateStr) {
  if (!dateStr) return null;
  const opened = new Date(dateStr);
  if (isNaN(opened)) return null;
  return (Date.now() - opened.getTime()) / (365.25 * 24 * 3600 * 1000);
}

export function vintageBucketFor(store) {
  const yrs = yearsSince(store.opened);
  if (yrs == null) return VINTAGE_BUCKETS[VINTAGE_BUCKETS.length - 1];
  return VINTAGE_BUCKETS.find((b) => yrs <= b.maxYears) || VINTAGE_BUCKETS[VINTAGE_BUCKETS.length - 1];
}
