#!/usr/bin/env node
/**
 * scripts/geocode.mjs — fill public/data/stores.json lat/lng.
 *
 * Two providers:
 *   - Nominatim (OpenStreetMap) — DEFAULT. No key needed, works today.
 *     Weaker than Google on messy Indian junction-name addresses, so this
 *     falls back through progressively coarser queries (see
 *     fallbackQueriesFor below) rather than just giving up on ZERO_RESULTS.
 *     Run scripts/verify-geocode.mjs afterward and hand-correct whatever it
 *     flags — town-level fallback matches especially, they're a town
 *     centroid, not the actual store.
 *   - Google Geocoding API — used automatically when GOOGLE_MAPS_API_KEY is
 *     set. Better on Indian junction names (see PATEL-HANDOFF.md §7), but
 *     costs a key nobody's required to go get for v1.
 * Force one explicitly with --provider=nominatim|google.
 *
 * IDEMPOTENT: a store with a non-null lat/lng is skipped, so re-running this
 * after new stores are added only geocodes what's new, and a corrected/
 * manually-set coordinate is never silently overwritten. `geo_confidence`
 * (the client's own address-quality read, 33 high / 17 medium / 3 low) is
 * NEVER touched here — that's a manual assessment, not something a
 * geocoder result should overwrite.
 *
 * Mirrors the donor's check-llm.mjs pattern (screener-test/check-llm.mjs):
 * one cheap call FIRST to fail fast (bad key, or the service unreachable),
 * before spending the batch.
 *
 * Usage:
 *   node scripts/geocode.mjs                              # Nominatim, no key
 *   GOOGLE_MAPS_API_KEY=... node scripts/geocode.mjs       # Google
 *   node scripts/geocode.mjs --provider=nominatim --dry-run
 */

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORES_PATH = path.join(__dirname, "..", "public", "data", "stores.json");
const DRY_RUN = process.argv.includes("--dry-run");
const FORCED_PROVIDER = process.argv.find((a) => a.startsWith("--provider="))?.split("=")[1];

// Thane–Raigad–Palghar belt, generous padding — bounds the Nominatim search
// so an ambiguous junction name doesn't resolve somewhere else in India.
const REGION_VIEWBOX = { minLon: 72.7, minLat: 18.6, maxLon: 73.6, maxLat: 19.8 };

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const NOMINATIM_DELAY_MS = 1100; // usage policy: max 1 req/sec — padded for safety
// Identifies this tool per Nominatim's usage policy
// (https://operations.osmfoundation.org/policies/nominatim/), which requires a
// descriptive User-Agent or Referer. Swap in a real contact address before any
// higher-volume use than this one-time 53-row batch.
const NOMINATIM_USER_AGENT = "PatelRetailDashboard/1.0 (github.com/techmuns/Patel-Retail - investment-diligence tool, one-time store geocode)";

const GOOGLE_URL = "https://maps.googleapis.com/maps/api/geocode/json";
const GOOGLE_DELAY_MS = 200;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---- Nominatim -----------------------------------------------------------

/**
 * One raw Nominatim lookup. `params` is either { q: "free text" } or Nominatim's
 * structured form { street, city, state, country } — the latter sometimes
 * resolves a real street-level match where the equivalent free-text query
 * returns nothing (measured live: "Station Road, Ambernath (W)" as free text
 * failed, but street="Station Road"/city="Ambernath" resolved the real street).
 * Retries once or twice on 429 (rate-limited) with backoff.
 */
async function nominatimSearch(params, attempt = 1) {
  const url = new URL(NOMINATIM_URL);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "in");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set(
    "viewbox",
    `${REGION_VIEWBOX.minLon},${REGION_VIEWBOX.maxLat},${REGION_VIEWBOX.maxLon},${REGION_VIEWBOX.minLat}`
  );
  url.searchParams.set("bounded", "1"); // hard-restrict to the viewbox — a wrong match elsewhere in India is worse than no match

  const res = await fetch(url, { headers: { "User-Agent": NOMINATIM_USER_AGENT, "Accept-Language": "en" } });
  if (res.status === 429 && attempt <= 2) {
    await sleep(5000 * attempt);
    return nominatimSearch(params, attempt + 1);
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }
  return res.json();
}

function normalizeNominatim(top, tier, describeUsed) {
  return {
    lat: parseFloat(top.lat),
    lng: parseFloat(top.lon),
    formatted_address: top.display_name,
    location_type: top.addresstype || top.type || top.class || "unknown",
    provider: "nominatim",
    match_tier: tier,
    query_used: describeUsed,
  };
}

/**
 * Nominatim's free-text search is picky — Patel's addresses are full of
 * parentheticals ("(E)", "(nr Kohinoor Developer)") and town/locality
 * duplication that make the exact geocode_query resolve to ZERO_RESULTS far
 * more often than not (measured: ~26% hit rate on the first pass, live
 * against this exact dataset). Fall back through progressively coarser
 * lookups built strictly from the store's own structured fields — never
 * invented text — rather than giving up. `structured` (Nominatim's
 * street/city/state/country form, not squashed into one free-text string)
 * sometimes resolves a real street where the equivalent free-text query
 * fails, so it's tried before giving up on locality precision. The returned
 * `match_tier` records which one matched, so a coarse town-level fallback (a
 * town CENTROID, not the actual store — every store sharing a town lands on
 * the identical point) can be flagged for mandatory manual review downstream.
 */
function fallbackQueriesFor(store) {
  const townBase = store.town.replace(/\s*\((E|W)\)\s*$/i, "").replace(/\s+(East|West)$/i, "").trim();
  const localityStreet = store.locality.replace(/\s*\([^)]*\)\s*/g, ", ").replace(/,\s*,/g, ",").replace(/^,\s*|,\s*$/g, "").trim();
  const attempts = [
    { tier: "exact", params: { q: store.geocode_query }, describe: store.geocode_query },
    { tier: "locality", params: { q: `${store.locality}, ${store.district}, ${store.state}, India` }, describe: `${store.locality}, ${store.district}, ${store.state}, India` },
    { tier: "structured", params: { street: localityStreet, city: townBase || store.town, state: store.state, country: "India" }, describe: `street=${localityStreet}; city=${townBase || store.town}` },
    { tier: "town", params: { q: `${store.town}, ${store.district}, ${store.state}, India` }, describe: `${store.town}, ${store.district}, ${store.state}, India` },
  ];
  if (townBase && townBase !== store.town) {
    attempts.push({
      tier: "town_base",
      params: { q: `${townBase}, ${store.district}, ${store.state}, India` },
      describe: `${townBase}, ${store.district}, ${store.state}, India`,
    });
  }
  // De-dupe attempts whose free-text query string repeats (locality sometimes equals town verbatim);
  // structured attempts are kept regardless since they hit a different Nominatim code path.
  const seen = new Set();
  return attempts.filter((a) => {
    const key = a.params.q ?? `structured:${a.params.street}|${a.params.city}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function resolveNominatim(store) {
  const tiers = fallbackQueriesFor(store);
  for (let i = 0; i < tiers.length; i++) {
    const { tier, params, describe } = tiers[i];
    const results = await nominatimSearch(params);
    if (results.length) return normalizeNominatim(results[0], tier, describe);
    if (i < tiers.length - 1) await sleep(NOMINATIM_DELAY_MS); // pace between fallback attempts too
  }
  return null;
}

// ---- Google ----------------------------------------------------------------

async function resolveGoogle(store, apiKey) {
  const url = new URL(GOOGLE_URL);
  url.searchParams.set("address", store.geocode_query);
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
      provider: "google_geocoding_api",
      match_tier: "exact",
      query_used: store.geocode_query,
    };
  }
  if (data.status === "ZERO_RESULTS") {
    return null;
  }
  // OVER_QUERY_LIMIT, REQUEST_DENIED, INVALID_REQUEST, UNKNOWN_ERROR
  throw new Error(`Geocoding API status ${data.status}: ${data.error_message || "no message"}`);
}

// ---- Provider selection + preflight -----------------------------------------

function resolveProvider() {
  const name = FORCED_PROVIDER || (process.env.GOOGLE_MAPS_API_KEY ? "google" : "nominatim");
  if (name === "google") {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) throw new Error("--provider=google was requested but GOOGLE_MAPS_API_KEY is not set.");
    return {
      name,
      delayMs: GOOGLE_DELAY_MS,
      resolve: (store) => resolveGoogle(store, apiKey),
      preflightCheck: async () => {
        const results = await resolveGoogle({ geocode_query: "Mumbai, Maharashtra, India" }, apiKey);
        return results;
      },
    };
  }
  if (name === "nominatim") {
    return {
      name,
      delayMs: NOMINATIM_DELAY_MS,
      resolve: resolveNominatim,
      preflightCheck: async () => {
        const results = await nominatimSearch({ q: "Mumbai, Maharashtra, India" });
        return results.length ? normalizeNominatim(results[0], "exact", "Mumbai, Maharashtra, India") : null;
      },
    };
  }
  throw new Error(`Unknown provider "${name}" — use nominatim or google.`);
}

/** One cheap, known-good lookup before burning the real batch — fail fast on a bad key or a down/unreachable service. */
async function preflight(provider) {
  const result = await provider.preflightCheck();
  if (!result) {
    throw new Error(
      `Preflight geocode (${provider.name}) returned no result for a known-good address — something is wrong before we even start the batch.`
    );
  }
  console.log(`Preflight OK (${provider.name}) — Mumbai resolved to ${result.lat.toFixed(4)}, ${result.lng.toFixed(4)}.`);
}

// ---- Main --------------------------------------------------------------------

async function main() {
  const provider = resolveProvider();
  await preflight(provider);

  const raw = await readFile(STORES_PATH, "utf8");
  const data = JSON.parse(raw);

  const pending = data.stores.filter((s) => s.lat == null || s.lng == null);
  if (!pending.length) {
    console.log("Nothing to do — every store already has lat/lng.");
    return;
  }
  console.log(`${pending.length} of ${data.stores.length} stores need geocoding, via ${provider.name} (~${provider.delayMs}ms between requests).`);

  let geocoded = 0;
  let failed = 0;
  let coarse = 0;

  for (const store of pending) {
    try {
      const result = await provider.resolve(store);
      if (!result) {
        console.warn(`  ZERO_RESULTS (all fallbacks exhausted): ${store.store_id} — "${store.geocode_query}"`);
        failed++;
        continue;
      }
      store.lat = result.lat;
      store.lng = result.lng;
      store.geo_source = result.provider;
      store.geocode_match_tier = result.match_tier; // "exact" | "locality" | "town" | "town_base" — non-exact needs manual review
      // Kept for QA only — does NOT override the client's own geo_confidence read.
      store.geocode_formatted_address = result.formatted_address;
      store.geocode_location_type = result.location_type;
      store.geocode_query_used = result.query_used;
      geocoded++;
      if (result.match_tier !== "exact") coarse++;
      console.log(
        `  OK (${result.match_tier}): ${store.store_id} -> ${result.lat.toFixed(5)}, ${result.lng.toFixed(5)} (${result.location_type})`
      );
    } catch (err) {
      console.warn(`  FAILED: ${store.store_id} — ${err.message}`);
      failed++;
    }
    await sleep(provider.delayMs);
  }

  console.log(
    `\nDone. Geocoded ${geocoded} (${coarse} at a coarse fallback tier), failed/zero-results ${failed}, already had coords ${data.stores.length - pending.length}.`
  );

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
  console.log(`\nNext: node scripts/verify-geocode.mjs — flags anything (coarse-tier matches included) that needs a human look before it's trusted.`);
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
