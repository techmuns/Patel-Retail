#!/usr/bin/env node
/**
 * scripts/geocode-retry.mjs — second pass at the stores the main geocoder
 * could not place precisely.
 *
 * WHY A SECOND SCRIPT: geocode.mjs walks a fixed ladder (exact query ->
 * locality -> structured -> town) built strictly from each store's own
 * fields. For nine stores that ladder ends at the town centroid or at
 * nothing, because OSM does not carry the address as written. The failures
 * are overwhelmingly SPELLING, not missing data: OSM says "Dombivli", the
 * store file says "Dombivali"; "Laxmi Nagar" vs "Luxminagar"; "Nilje" vs
 * "Nileje"; "Bapgaon" vs "Bapgav". This script retries those stores with
 * transliteration variants the first ladder never generates.
 *
 * WHAT IT WILL NOT DO: accept a settlement centroid. A result whose OSM type
 * is a town/city/village/borough/administrative area is the middle of a
 * place, not a shop, and every store in that town lands on the identical
 * point — which is exactly the fabricated precision the dashboard suppresses
 * today. Such results are rejected, and so is anything landing within
 * CENTROID_TOLERANCE_M of a coordinate already known to be a centroid.
 *
 * Usage:
 *   node scripts/geocode-retry.mjs            # dry run, reports only
 *   node scripts/geocode-retry.mjs --write    # apply accepted matches
 */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORES = path.join(__dirname, "..", "public", "data", "stores.json");
const WRITE = process.argv.includes("--write");

const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const UA = "PatelRetailDiligence/1.0 (investment diligence dashboard; contact: tech@muns.io)";
const DELAY_MS = 1100; // Nominatim asks for <=1 req/sec
const CENTROID_TOLERANCE_M = 120;
/**
 * A match further than this from the network's centre is the wrong place with
 * the right name, not this store. Real hazard, not hypothetical: "Samrat
 * Chowk, Maharashtra" resolves to a junction in Wakad, Pune — 100+ km from
 * Patel's estate, correctly typed as a junction, and with nothing else to
 * reject it on. Every store here is inside Thane/Raigad/Palghar.
 */
const MAX_KM_FROM_NETWORK = 80;

/** OSM result types that are a settlement, not a place inside one. */
const SETTLEMENT_TYPES = new Set([
  "town", "city", "village", "borough", "hamlet", "suburb", "quarter",
  "municipality", "county", "state", "region", "province", "district",
  "administrative", "postcode", "political",
]);
/** Types precise enough to measure a distance from. */
const PRECISE_TYPES = new Set([
  "road", "residential", "primary", "secondary", "tertiary", "unclassified",
  "living_street", "service", "pedestrian", "trunk", "path",
  "house", "building", "yes", "commercial", "retail", "industrial",
  "supermarket", "convenience", "mall", "marketplace", "shop",
  "neighbourhood", "city_block", "square", "station", "halt", "junction",
  "amenity", "school", "hospital", "place_of_worship", "bank",
]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function metresBetween(a, b) {
  const R = 6371000, toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(h));
}

/**
 * Transliteration variants. Indian place names have several accepted Roman
 * spellings and OSM picked one; the store file often picked another.
 */
const SPELLING = [
  [/\bDombivali\b/gi, "Dombivli"],
  [/\bDombivli\b/gi, "Dombivali"],
  [/\bLuxminagar\b/gi, "Laxmi Nagar"],
  [/\bNileje\b/gi, "Nilje"],
  [/\bBapgav\b/gi, "Bapgaon"],
  [/\bAmbernath\b/gi, "Ambarnath"],
  [/\bKumbharkhan Pada\b/gi, "Kumbharkhanpada"],
  [/\bBhere\b/gi, "Bhere Maidan"],
];

function cleanLocality(raw) {
  return (raw || "")
    .replace(/\(([^)]*)\)/g, " $1 ")      // "(nr Kohinoor Developer)" -> keep the words
    .replace(/\bnr\.?\b/gi, " ")           // "nr" is not part of any name
    .replace(/\bMIDC\b/gi, "MIDC")
    .replace(/\s*\/\s*/g, ", ")            // "Nilje / Diva" is two places
    .replace(/\s+/g, " ")
    .trim();
}

/** Every query worth trying for one store, most specific first. */
function variantsFor(store) {
  const loc = cleanLocality(store.locality);
  const town = cleanLocality(store.town).split(",")[0].trim();
  const D = store.district, S = store.state;
  const base = [
    `${loc}, ${town}, ${D}, ${S}, India`,
    `${loc}, ${D}, ${S}, India`,
    `${loc}, ${town}, ${S}, India`,
    `${town}, ${D}, ${S}, India`,
  ];
  // Apply each spelling swap to every base query.
  const out = new Set(base);
  for (const q of base) {
    for (const [re, to] of SPELLING) {
      if (re.test(q)) out.add(q.replace(re, to));
    }
  }
  return [...out].filter(Boolean);
}

async function search(q) {
  const url = new URL(NOMINATIM);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", "5");
  url.searchParams.set("countrycodes", "in");
  url.searchParams.set("q", q);
  const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "en" } });
  if (res.status === 429 || res.status === 503) {
    await sleep(5000);
    return search(q);
  }
  if (!res.ok) throw new Error(`Nominatim ${res.status} for "${q}"`);
  return res.json();
}

/** Is this result precise enough to measure from, and not a centroid we know? */
function judge(hit, centroids, networkCentre) {
  const type = (hit.type || "").toLowerCase();
  const addrType = (hit.addresstype || "").toLowerCase();
  if (SETTLEMENT_TYPES.has(type) || SETTLEMENT_TYPES.has(addrType)) {
    return { ok: false, why: `settlement centroid (${addrType || type})` };
  }
  if (!PRECISE_TYPES.has(type) && !PRECISE_TYPES.has(addrType)) {
    return { ok: false, why: `type not precise enough (${addrType || type})` };
  }
  const pt = { lat: Number(hit.lat), lng: Number(hit.lon) };
  if (networkCentre) {
    const km = metresBetween(pt, networkCentre) / 1000;
    if (km > MAX_KM_FROM_NETWORK) {
      return { ok: false, why: `${Math.round(km)} km from the estate — same name, wrong place` };
    }
  }
  for (const c of centroids) {
    const m = metresBetween(pt, c);
    if (m < CENTROID_TOLERANCE_M) {
      return { ok: false, why: `lands ${Math.round(m)}m from a known town centroid` };
    }
  }
  return { ok: true, point: pt, type: addrType || type };
}

async function main() {
  const doc = JSON.parse(await readFile(STORES, "utf8"));
  const stores = doc.stores;
  const COARSE = new Set(["town", "town_base"]);
  const targets = stores.filter((s) => s.lat == null || COARSE.has(s.geocode_match_tier));
  // Points we already know are centroids — never accept a "match" on one.
  const centroids = stores
    .filter((s) => COARSE.has(s.geocode_match_tier) && s.lat != null)
    .map((s) => ({ lat: s.lat, lng: s.lng }));

  // Mean of every precisely located store — the estate's centre of gravity,
  // used only to reject same-name matches in another district.
  const located = stores.filter((s) => s.lat != null && !COARSE.has(s.geocode_match_tier));
  const networkCentre = located.length
    ? {
        lat: located.reduce((a, s) => a + s.lat, 0) / located.length,
        lng: located.reduce((a, s) => a + s.lng, 0) / located.length,
      }
    : null;

  console.log(`[retry] ${targets.length} stores to retry; ${centroids.length} known centroids to avoid.`);
  if (networkCentre) {
    console.log(`[retry] estate centre ${networkCentre.lat.toFixed(4)}, ${networkCentre.lng.toFixed(4)} — rejecting matches over ${MAX_KM_FROM_NETWORK} km away.\n`);
  }
  const accepted = [];

  for (const store of targets) {
    console.log(`${store.store_id} — ${store.locality || "(no locality)"} / ${store.town}`);
    let done = false;
    for (const q of variantsFor(store)) {
      if (done) break;
      let hits;
      try {
        hits = await search(q);
      } catch (err) {
        console.log(`    ! ${err.message}`);
        await sleep(DELAY_MS);
        continue;
      }
      await sleep(DELAY_MS);
      if (!hits.length) {
        console.log(`    · no result   "${q}"`);
        continue;
      }
      for (const hit of hits) {
        const v = judge(hit, centroids, networkCentre);
        if (!v.ok) continue;
        console.log(`    ✓ ${v.type.padEnd(14)} ${v.point.lat.toFixed(5)}, ${v.point.lng.toFixed(5)}`);
        console.log(`      via "${q}"`);
        console.log(`      ${hit.display_name}`);
        accepted.push({ store, point: v.point, type: v.type, query: q, display: hit.display_name });
        done = true;
        break;
      }
      if (!done) {
        const reasons = hits.slice(0, 2).map((h) => judge(h, centroids, networkCentre).why).join("; ");
        console.log(`    · rejected    "${q}" — ${reasons}`);
      }
    }
    if (!done) console.log(`    ✗ still unresolved`);
    console.log("");
  }

  console.log(`\n[retry] ${accepted.length} of ${targets.length} resolved to a precise point.`);
  if (!accepted.length) return;

  if (!WRITE) {
    console.log("[retry] Dry run — re-run with --write to apply.");
    return;
  }
  for (const a of accepted) {
    a.store.lat = Number(a.point.lat.toFixed(7));
    a.store.lng = Number(a.point.lng.toFixed(7));
    a.store.geocode_match_tier = "retry_precise";
    a.store.geo_source = "nominatim";
    a.store.geo_confidence = "medium";
    a.store.geocode_query = a.query;
    a.store.geocode_result = a.display;
  }
  await writeFile(STORES, JSON.stringify(doc, null, 2) + "\n", "utf8");
  console.log(`[retry] Wrote ${STORES} — ${accepted.length} store(s) updated.`);
}

main().catch((e) => {
  console.error(e.stack || e.message);
  process.exitCode = 1;
});
