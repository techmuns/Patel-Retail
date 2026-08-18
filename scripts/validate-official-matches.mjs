#!/usr/bin/env node
/**
 * scripts/validate-official-matches.mjs — mechanically validate the
 * resolved_low_confidence coordinates from fetch-official-stores.mjs instead
 * of asking a human to eyeball 35 rows. Reuses proposeMatches() from that
 * script unchanged (imported, not re-derived) so the matches checked here
 * are exactly the ones docs/OFFICIAL-STORES-REVIEW.md already proposed.
 *
 * PROVENANCE HIERARCHY. Every coordinate in this project comes from one of
 * five sources, ranked by how directly it reflects where the store actually
 * is — not by how long it's been in stores.json. When a higher tier
 * disagrees with a lower tier, the higher tier wins and the change is
 * logged; it is NOT a tie decided by "which one is already there":
 *
 *   1. Company website coordinate      (this script — patelrpl.in's own map link)
 *   2. Client-supplied pin             (scripts/apply-client-coords.mjs — geo_source "client")
 *   3. Our geocode of the website's OWN full address (this script's cross-validation check)
 *   4. Our geocode of the client's locality/town string (scripts/geocode.mjs — geo_source "nominatim"/"manual_review")
 *   5. Town centroid                   (a coarse fallback, several km wide)
 *
 * A tier-4 coordinate is our GUESS at what the client's short locality
 * string means, run through a geocoder that is well documented (see
 * scripts/geocode.mjs's own header) to sometimes miss by kilometers on
 * exactly this kind of vague, road-name-only input. It is not ground truth
 * just because it was applied first. The company's own map link for its own
 * store outranks it. (Found the hard way, on the first version of this
 * script: SHD's tier-4 coordinate was compared against the new tier-1 one
 * as if the old value got a veto. It doesn't — see the git log for that
 * correction.)
 *
 * SANITY CHECK, not a tie-break. Before a higher tier is allowed to
 * overwrite a lower one, its own coordinate has to land within 5km
 * (loose — checking "is this roughly the right place", not asserting
 * precision) of the BEST available reference for that store: its own
 * existing coordinate if it has one AT ALL — precise or coarse, tier
 * doesn't matter for picking a REFERENCE, only for deciding a WINNER — or
 * a fresh geocode of its town string only when it has no coordinate
 * whatsoever. Reusing the existing coordinate as reference (rather than
 * always re-geocoding the bare town name) matters in practice: a town like
 * "Bhiwandi" free-text-geocodes to an administrative centroid several km
 * from any specific store in it, which produced false failures on this
 * check's first version for stores whose own existing coordinate actually
 * agreed with the new one to under 300m. If neither an existing
 * coordinate nor a town geocode is available, cross-validation (tier 3)
 * against the SAME store's website address stands in as a secondary
 * sanity net; if that's also inconclusive, it goes to a human too. Two
 * DIFFERENT listings at the SAME tier disagreeing (the duplicate-
 * coordinate check) always goes to a human regardless — ranking only
 * resolves a conflict BETWEEN tiers, never within one.
 *
 * Tied matches (multiple candidate stores for one listing) are a separate,
 * IDENTITY problem, not a provenance problem — which specific store does
 * this coordinate belong to, not which of several coordinates to trust.
 * Those still prefer each candidate's own tightest available reference
 * point (1km) over its town (5km), since the whole point there is
 * distinguishing two nearby candidates, not just sanity-checking one.
 *
 * Writes docs/OFFICIAL-STORES-VALIDATION.md always. Writes to stores.json
 * and regenerates proximity.json ONLY with --apply, and only ever for
 * listings that ended up trusted — everything else stays untouched,
 * unmatched, and listed for a human.
 *
 * Usage:
 *   node scripts/validate-official-matches.mjs              # report only
 *   node scripts/validate-official-matches.mjs --apply       # also write + regenerate
 */

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { proposeMatches } from "./fetch-official-stores.mjs";
import { haversineKm, round2, isCoarseTier } from "../public/js/geo.js";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORES_PATH = path.join(__dirname, "..", "public", "data", "stores.json");
const OFFICIAL_PATH = path.join(__dirname, "..", "public", "data", "stores-official.json");
const REPORT_PATH = path.join(__dirname, "..", "docs", "OFFICIAL-STORES-VALIDATION.md");
const APPLY = process.argv.includes("--apply");

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const NOMINATIM_DELAY_MS = 1100; // usage policy: max 1 req/sec — padded for safety, same as geocode.mjs
const NOMINATIM_USER_AGENT =
  "PatelRetailDashboard/1.0 (github.com/techmuns/Patel-Retail - investment-diligence tool, one-time validation pass)";
const REGION_VIEWBOX = { minLon: 72.7, minLat: 18.6, maxLon: 73.6, maxLat: 19.8 };

const IDENTITY_RADIUS_KM = 1; // tie-break only — vs. a candidate's own already-geocoded precise point
const TOWN_RADIUS_KM = 5; // sanity check for the provenance-override decision — loose on purpose
const CROSS_VALIDATE_RADIUS_KM = 0.5; // secondary sanity net when the town itself won't geocode
const DUPLICATE_RADIUS_KM = 0.05; // ~50m — "same pin"
const NEAR_DUPLICATE_RADIUS_KM = 0.3; // worth a note, not necessarily wrong — dense clusters exist
const MEANINGFUL_OVERRIDE_KM = 0.1; // below this, "changed" is just rounding noise, not worth logging

// Explicit, human-confirmed corrections to a store's `town` string when it
// doesn't match the standard spelling closely enough for Nominatim to find
// it — NOT a fuzzy-retry mechanism. Only ever add an entry here on someone
// actually telling us the right spelling; guessing alternate spellings is
// exactly the kind of invention this project's whole discipline exists to
// avoid. KHP: the client's file spells it "Khapoli"; the standard spelling
// (and what Nominatim/OSM actually indexes) is "Khopoli".
const TOWN_QUERY_OVERRIDES = {
  KHP: "Khopoli, Raigad, Maharashtra, India",
};

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
const log = (...a) => console.log("[validate]", ...a);

async function nominatimSearch(q) {
  const url = new URL(NOMINATIM_URL);
  url.searchParams.set("q", q);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "in");
  url.searchParams.set("viewbox", `${REGION_VIEWBOX.minLon},${REGION_VIEWBOX.maxLat},${REGION_VIEWBOX.maxLon},${REGION_VIEWBOX.minLat}`);
  url.searchParams.set("bounded", "1");
  const res = await fetch(url, { headers: { "User-Agent": NOMINATIM_USER_AGENT, "Accept-Language": "en" } });
  if (res.status === 429) {
    await sleep(5000);
    return nominatimSearch(q);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const results = await res.json();
  return results.length ? { lat: parseFloat(results[0].lat), lng: parseFloat(results[0].lon), display_name: results[0].display_name } : null;
}

// One live call per unique query string — many stores share a town, so this
// is far fewer than 35 network round trips.
const geocodeCache = new Map();
async function geocodeCached(q) {
  if (geocodeCache.has(q)) return geocodeCache.get(q);
  await sleep(NOMINATIM_DELAY_MS);
  let result;
  try {
    result = await nominatimSearch(q);
  } catch (e) {
    result = { error: e.message };
  }
  geocodeCache.set(q, result);
  return result;
}

function isLocatable(store) {
  return store.lat != null && store.lng != null && !isCoarseTier(store.geocode_match_tier);
}

async function geocodeTown(store) {
  const townQuery = TOWN_QUERY_OVERRIDES[store.store_id] || `${store.town}, ${store.district}, ${store.state}, India`;
  let centre = await geocodeCached(townQuery);
  if ((!centre || centre.error) && store.town.includes("/")) {
    // "Nilje / Diva" style joint town names sometimes don't parse as free text — retry on the first half.
    const fallbackTown = store.town.split("/")[0].trim();
    centre = await geocodeCached(`${fallbackTown}, ${store.district}, ${store.state}, India`);
  }
  return { centre, query: townQuery };
}

/**
 * IDENTITY check — tie-break only. Which of several candidate stores does
 * this coordinate actually belong to? Prefers a candidate's own tightest
 * available reference (its existing precise point, 1km) over its town
 * (5km), because the goal here is distinguishing nearby candidates, not
 * sanity-checking a single already-identified one.
 */
async function identityContainment(coord, store) {
  if (isLocatable(store)) {
    const km = round2(haversineKm(coord, store));
    return { method: "existing_precise_coordinate", pass: km <= IDENTITY_RADIUS_KM, km, radius_km: IDENTITY_RADIUS_KM, reference: `${store.lat}, ${store.lng} (${store.geocode_match_tier})` };
  }
  const { centre, query } = await geocodeTown(store);
  if (!centre || centre.error) {
    return { method: "town_centroid", pass: null, reason: centre?.error ? `geocode error: ${centre.error}` : "town did not geocode to anything", query };
  }
  const km = round2(haversineKm(coord, centre));
  return { method: "town_centroid", pass: km <= TOWN_RADIUS_KM, km, radius_km: TOWN_RADIUS_KM, reference: `${centre.display_name} (${centre.lat}, ${centre.lng})`, query };
}

/**
 * SANITY check for the provenance-override decision. Deliberately NOT a
 * pass/fail against a fresh town geocode alone — a bare town name (e.g.
 * "Bhiwandi") often geocodes to an administrative centroid several km from
 * where any specific store in that town actually is, which produced false
 * failures on the first version of this check (AVB, PAD, AME, AMCH, AMSN,
 * AMPL — every one of them agreed with stores.json's OWN existing
 * coordinate to under 3km, yet "failed" against a fresh, worse town
 * geocode). So: if the store has ANY existing coordinate already — precise
 * OR coarse, it doesn't matter which tier — use IT as the reference
 * instead of re-geocoding, at the same loose sanity radius. It's a
 * store-specific point, which is a strictly better reference than a
 * townwide one regardless of which provenance tier produced it; using a
 * lower tier as the REFERENCE for a sanity check is not the same as
 * letting it VETO a higher tier (that's the mistake the first version of
 * this rule made for SHD — see this file's header). Only when the store
 * has genuinely no coordinate at all does this fall back to geocoding the
 * town fresh.
 */
async function sanityContainment(coord, store) {
  if (store.lat != null && store.lng != null) {
    const km = round2(haversineKm(coord, store));
    return {
      method: isCoarseTier(store.geocode_match_tier) ? "existing_coarse_coordinate" : "existing_precise_coordinate",
      pass: km <= TOWN_RADIUS_KM,
      km,
      radius_km: TOWN_RADIUS_KM,
      reference: `${store.lat}, ${store.lng} (${store.geocode_match_tier || store.geo_source || "unlabeled"})`,
    };
  }
  const { centre, query } = await geocodeTown(store);
  if (!centre || centre.error) {
    return { method: "town_centroid", pass: null, reason: centre?.error ? `geocode error: ${centre.error}` : "town did not geocode to anything", query };
  }
  const km = round2(haversineKm(coord, centre));
  return { method: "town_centroid", pass: km <= TOWN_RADIUS_KM, km, radius_km: TOWN_RADIUS_KM, reference: `${centre.display_name} (${centre.lat}, ${centre.lng})`, query };
}

/** Secondary sanity net, used only when sanityContainment can't geocode the town at all. */
async function checkCrossValidation(coord, label) {
  const query = `${label}, Maharashtra, India`;
  const result = await geocodeCached(query);
  if (!result || result.error) {
    return { method: "nominatim_address", pass: null, reason: result?.error ? `geocode error: ${result.error}` : "address did not geocode to anything", query };
  }
  const km = round2(haversineKm(coord, result));
  return { method: "nominatim_address", pass: km <= CROSS_VALIDATE_RADIUS_KM, km, radius_km: CROSS_VALIDATE_RADIUS_KM, reference: `${result.display_name} (${result.lat}, ${result.lng})`, query };
}

function sanityRefLabel(c) {
  if (c.method === "existing_precise_coordinate") return "its own existing precise coordinate";
  if (c.method === "existing_coarse_coordinate") return "its own existing (coarse) coordinate";
  return "town centroid";
}
function fmtSanity(c) {
  if (c.pass === true) return `✅ ${c.km}km from ${sanityRefLabel(c)}`;
  if (c.pass === false) return `❌ ${c.km}km from ${sanityRefLabel(c)}`;
  return `— inconclusive: ${c.reason}`;
}
function fmtCrossVal(x) {
  if (x.pass === true) return `✅ ${x.km}km from independent Nominatim geocode of the site's own address text`;
  if (x.pass === false) return `❌ ${x.km}km from independent Nominatim geocode`;
  return `— inconclusive: ${x.reason}`;
}

function needsChecking(listing, proposed) {
  if (listing.status === "resolved_low_confidence") return true;
  if (listing.status === "resolved" && proposed && !proposed.tied) {
    return proposed.tier !== "code_prefix" && proposed.tier !== "code_token";
  }
  return false;
}

async function main() {
  const storesRaw = JSON.parse(await readFile(STORES_PATH, "utf8"));
  const stores = storesRaw.stores;
  const official = JSON.parse(await readFile(OFFICIAL_PATH, "utf8"));

  // Snapshot every store's PRE-this-run coordinate, for the override ledger
  // — computed before any mutation, so "before" always means "what was in
  // stores.json when this run started", not an intermediate state.
  const before = new Map(stores.map((s) => [s.store_id, { lat: s.lat, lng: s.lng, tier: s.geocode_match_tier, source: s.geo_source }]));

  const { proposals } = proposeMatches(official.listings, stores);

  // ---- Duplicate detection runs globally, once, up front -------------------
  const withCoord = official.listings.filter((l) => l.lat != null);
  const dupClusters = [];
  const seen = new Set();
  for (let i = 0; i < withCoord.length; i++) {
    if (seen.has(i)) continue;
    const cluster = [i];
    for (let j = i + 1; j < withCoord.length; j++) {
      if (seen.has(j)) continue;
      const km = haversineKm(withCoord[i], withCoord[j]);
      if (km <= NEAR_DUPLICATE_RADIUS_KM) cluster.push(j);
    }
    if (cluster.length > 1) {
      cluster.forEach((idx) => seen.add(idx));
      dupClusters.push(
        cluster.map((idx) => ({
          listing: withCoord[idx],
          km_from_first: idx === i ? 0 : round2(haversineKm(withCoord[i], withCoord[idx])),
          exact: (idx === i ? 0 : haversineKm(withCoord[i], withCoord[idx])) <= DUPLICATE_RADIUS_KM,
        }))
      );
    }
  }
  const flaggedIndices = new Set(dupClusters.flat().map((c) => c.listing.index));
  log(`Duplicate scan: ${withCoord.length} listings have a coordinate, ${dupClusters.length} cluster(s) found (${flaggedIndices.size} listing(s) involved).`);

  // ---- Per-listing validation ------------------------------------------------
  const autoTrusted = []; // code match + resolved coordinate, no checks needed
  const validatedTrusted = []; // cleared the sanity check (or its cross-validation fallback)
  const needsReview = []; // failed or inconclusive
  const tieBroken = [];
  const stillTied = [];
  const noCandidate = [];
  const noCoordinate = []; // the 7

  for (const p of proposals) {
    const { listing, proposed } = p;

    if (listing.lat == null) {
      if (proposed) noCoordinate.push({ listing, proposed });
      else noCandidate.push({ listing });
      continue;
    }

    if (!proposed) {
      noCandidate.push({ listing });
      continue;
    }

    if (proposed.tied) {
      const results = [];
      for (const candidate of proposed.tied) {
        const c = await identityContainment(listing, candidate);
        results.push({ store: candidate, containment: c });
      }
      const passing = results.filter((r) => r.containment.pass === true);
      if (passing.length === 1) {
        tieBroken.push({ listing, store: passing[0].store, allResults: results, via: "identity_tiebreak" });
      } else {
        stillTied.push({ listing, proposed, results });
      }
      continue;
    }

    const isDuplicate = flaggedIndices.has(listing.index);

    if (!needsChecking(listing, proposed)) {
      // Decisive code identity + unambiguous coordinate — still subject to
      // the duplicate check (two same-tier sources disagreeing always goes
      // to a human, regardless of how confident either one looks alone).
      if (isDuplicate) {
        needsReview.push({ listing, store: proposed.store, tier: proposed.tier, sanity: null, crossVal: null, isDuplicate });
      } else {
        autoTrusted.push({ listing, store: proposed.store, tier: proposed.tier });
      }
      continue;
    }

    const sanity = await sanityContainment(listing, proposed.store);
    let crossVal = null;
    let passed;
    if (sanity.pass === true) {
      passed = true;
    } else if (sanity.pass === false) {
      passed = false; // higher-tier coordinate failed its own sanity check — the link itself may be wrong
    } else {
      // Town wouldn't geocode at all — fall back to cross-validation as a secondary sanity net.
      crossVal = await checkCrossValidation(listing, listing.label);
      passed = crossVal.pass === true;
    }

    if (passed && !isDuplicate) {
      validatedTrusted.push({ listing, store: proposed.store, tier: proposed.tier, sanity, crossVal });
    } else {
      needsReview.push({ listing, store: proposed.store, tier: proposed.tier, sanity, crossVal, isDuplicate });
    }
  }

  log(`Auto-trusted (code match + resolved coord): ${autoTrusted.length}`);
  log(`Validated & promoted to trusted: ${validatedTrusted.length}`);
  log(`Needs human review: ${needsReview.length}`);
  log(`Ties broken mechanically: ${tieBroken.length}`);
  log(`Ties still unresolved: ${stillTied.length}`);
  log(`No candidate store at all: ${noCandidate.length}`);
  log(`No coordinate at all: ${noCoordinate.length}`);

  // ---- Apply (in memory first, so the report can show the override ledger
  // whether or not --apply actually writes it to disk) ------------------------
  const toApply = [...autoTrusted, ...validatedTrusted, ...tieBroken.map((t) => ({ listing: t.listing, store: t.store }))];
  const overrides = []; // meaningful before/after changes
  const newFills = []; // store had no coordinate at all before

  for (const a of toApply) {
    const store = stores.find((s) => s.store_id === a.store.store_id);
    if (!store) continue;
    const prev = before.get(store.store_id);
    if (prev.lat == null) {
      newFills.push({ store, listing: a.listing });
    } else {
      const distKm = round2(haversineKm({ lat: prev.lat, lng: prev.lng }, { lat: a.listing.lat, lng: a.listing.lng }));
      if (distKm > MEANINGFUL_OVERRIDE_KM) {
        overrides.push({ store, listing: a.listing, prevLat: prev.lat, prevLng: prev.lng, prevTier: prev.tier, prevSource: prev.source, distKm });
      }
    }
    if (APPLY) {
      store.lat = a.listing.lat;
      store.lng = a.listing.lng;
      store.geo_source = "company_website";
      store.geocode_match_tier = "client"; // same trusted tier as a client-pasted pin, per OFFICIAL-STORES-REVIEW.md's own "Next step"
      store.address_official = a.listing.label;
      delete store.geocode_formatted_address;
      delete store.geocode_location_type;
      delete store.geocode_query_used;
      delete store.geocode_review_note;
    }
  }

  // ---- Write the report ----------------------------------------------------
  const lines = [];
  lines.push("# Official store list — mechanical validation, with a provenance hierarchy");
  lines.push("");
  lines.push(
    `Ran against ${official.listings.length} listings from \`stores-official.json\` (fetched ${official.fetched_at.slice(0, 10)}). ` +
      `${autoTrusted.length} needed no checks (store-code match + unambiguous coordinate), ${validatedTrusted.length + needsReview.length} were checked, ` +
      `${validatedTrusted.length} cleared automatically, ${tieBroken.length} ties were broken mechanically. ` +
      `${needsReview.length + stillTied.length} genuinely need a human. ${noCoordinate.length} never resolved to a coordinate at all.`
  );
  lines.push("");
  lines.push(
    "**Provenance hierarchy applied:** (1) company website coordinate → (2) client-supplied pin → (3) our geocode of the website's own address → (4) our geocode of the client's locality string → (5) town centroid. " +
      "A higher tier overrides a lower one once it clears a loose town-containment sanity check (5km) — that check is against the store's OWN town, never against whatever lower-tier value happened to be there first. " +
      "Two listings at the SAME tier disagreeing (the duplicate check below) always goes to a human, regardless of what any sanity check says."
  );
  lines.push("");

  // ---- Cross-reference the review backlog against the CANONICAL precision
  // split (stores.json's own precise/coarse/no-coordinate counts, the only
  // numbers that ever sum to 53) so this worklist is never mistaken for a
  // fourth, additive bucket — found necessary after exactly that confusion
  // came up in review: "44 precise + 9 disagreements + 3 no-coordinate"
  // does not equal 53 because the 9 and the 3 are different axes measuring
  // the SAME 53 stores, not disjoint groups of them.
  const reviewStoreIds = new Set();
  for (const r of needsReview) reviewStoreIds.add(r.store.store_id);
  for (const s of stillTied) for (const r of s.results) reviewStoreIds.add(r.store.store_id);
  let reviewPrecise = 0,
    reviewCoarse = 0,
    reviewNoCoord = 0;
  for (const id of reviewStoreIds) {
    const b = before.get(id);
    if (!b || b.lat == null) reviewNoCoord++;
    else if (isCoarseTier(b.tier)) reviewCoarse++;
    else reviewPrecise++;
  }
  const canonicalNoCoord = stores.filter((s) => before.get(s.store_id)?.lat == null).length;
  const canonicalCoarse = stores.filter((s) => before.get(s.store_id)?.lat != null && isCoarseTier(before.get(s.store_id)?.tier)).length;
  const canonicalPrecise = stores.length - canonicalNoCoord - canonicalCoarse;
  lines.push(
    `**Read the review backlog against this split, not as a fourth bucket added to it.** stores.json's own precision split (the only numbers that sum to ${stores.length}) is ` +
      `**${canonicalPrecise} precise / ${canonicalCoarse} coarse (town-centroid only) / ${canonicalNoCoord} no coordinate at all**. The ${reviewStoreIds.size} distinct store(s) named below in "Needs a human" are a ` +
      `**worklist about the website source specifically** — it overlaps that split, it doesn't extend it: ${reviewPrecise} of them already have a precise coordinate from another source (the website just couldn't confirm it), ` +
      `${reviewCoarse} are already coarse for the same reason, and only **${reviewNoCoord} have no coordinate at all** — those are the only ones where resolving this backlog can actually move the precise count.`
  );
  lines.push("");

  lines.push("## Duplicate-coordinate check");
  lines.push("");
  if (dupClusters.length === 0) {
    lines.push(
      `No two listings share a coordinate within ${Math.round(NEAR_DUPLICATE_RADIUS_KM * 1000)}m of each other, out of ${withCoord.length} listings that resolved to one. ` +
        "The brand-collision worry — Google matching a generic business-name search to the wrong nearby branch — did not materialize as duplicate points."
    );
  } else {
    lines.push(`${dupClusters.length} cluster(s) of listings share a coordinate within ${Math.round(NEAR_DUPLICATE_RADIUS_KM * 1000)}m — flagged for review regardless of what the sanity check says, since this is a same-tier conflict, not a tier-ranking question:`);
    lines.push("");
    for (const cluster of dupClusters) {
      lines.push(`- ${cluster.map((c) => `#${c.listing.index} "${c.listing.label}" (${c.exact ? "identical point" : `${c.km_from_first}km apart`})`).join(" ↔ ")}`);
    }
  }
  lines.push("");

  lines.push("## Auto-trusted — store-code match, unambiguous coordinate, no checks needed");
  lines.push("");
  if (autoTrusted.length) {
    lines.push("| Listing | Store | Coordinate | Match basis |");
    lines.push("|---|---|---|---|");
    for (const a of autoTrusted) lines.push(`| #${a.listing.index} ${a.listing.label} | **${a.store.store_id}** — ${a.store.name} | ${a.listing.lat}, ${a.listing.lng} | ${a.tier} |`);
  } else {
    lines.push("_None._");
  }
  lines.push("");

  lines.push("## Validated & promoted to trusted");
  lines.push("");
  if (validatedTrusted.length) {
    lines.push("| Listing | Store | Coordinate | Town sanity check | Cross-validation (only used if town was inconclusive) |");
    lines.push("|---|---|---|---|---|");
    for (const v of validatedTrusted) {
      lines.push(`| #${v.listing.index} ${v.listing.label} | **${v.store.store_id}** — ${v.store.name} | ${v.listing.lat}, ${v.listing.lng} | ${fmtSanity(v.sanity)} | ${v.crossVal ? fmtCrossVal(v.crossVal) : "_not needed — town check passed_"} |`);
    }
  } else {
    lines.push("_None._");
  }
  lines.push("");

  lines.push("## Overridden coordinates — every meaningful before/after change, for audit");
  lines.push("");
  if (overrides.length) {
    lines.push(`${overrides.length} store(s) had an existing coordinate that this run's higher-tier data replaced (>${Math.round(MEANINGFUL_OVERRIDE_KM * 1000)}m difference — smaller differences aren't logged as they're rounding noise, not a real change):`);
    lines.push("");
    lines.push("| Store | Prior coordinate (tier) | New coordinate (company website) | Distance |");
    lines.push("|---|---|---|---|");
    for (const o of overrides) {
      lines.push(`| **${o.store.store_id}** — ${o.store.name} | ${o.prevLat}, ${o.prevLng} (${o.prevTier || "none"} / ${o.prevSource || "none"}) | ${o.listing.lat}, ${o.listing.lng} | ${o.distKm}km |`);
    }
  } else {
    lines.push("_None yet — either no prior coordinate existed for the applied stores, or every applied coordinate already agreed with what was there._");
  }
  lines.push("");
  if (newFills.length) {
    lines.push(`Separately, ${newFills.length} store(s) had no coordinate at all before this run and were filled in for the first time: ${newFills.map((f) => f.store.store_id).join(", ")}.`);
    lines.push("");
  }

  lines.push("## Ties broken mechanically");
  lines.push("");
  if (tieBroken.length) {
    lines.push("| Listing | Winning store | Why | Other candidates ruled out |");
    lines.push("|---|---|---|---|");
    for (const t of tieBroken) {
      const winner = t.allResults.find((r) => r.store.store_id === t.store.store_id);
      const others = t.allResults.filter((r) => r.store.store_id !== t.store.store_id).map((r) => `${r.store.store_id} (${r.containment.pass === false ? `${r.containment.km}km away` : "no containment"})`);
      lines.push(`| #${t.listing.index} ${t.listing.label} | **${t.store.store_id}** — ${t.store.name} | within ${winner.containment.radius_km}km of ${winner.containment.method === "existing_precise_coordinate" ? "its own precise point" : "its town centroid"} (${winner.containment.km}km) — the only candidate that was | ${others.join(", ")} |`);
    }
  } else {
    lines.push("_None — no tie had exactly one candidate pass containment._");
  }
  lines.push("");

  lines.push("## Needs a human — genuine same-tier disagreement, or a higher tier that failed its own sanity check");
  lines.push("");
  const finalListRows = []; // collected here for the "final short list" section below
  if (needsReview.length || stillTied.length) {
    lines.push("| Listing | Proposed store(s) | Coordinate | Town sanity check | Cross-validation | Why it wasn't auto-trusted |");
    lines.push("|---|---|---|---|---|---|");
    for (const r of needsReview) {
      const flags = [];
      if (r.isDuplicate) flags.push("shares a coordinate with another listing at the same tier — a real conflict, not resolved by ranking");
      else if (r.sanity?.pass === false) flags.push("the website coordinate itself failed the town sanity check — the link may be pointing at the wrong place");
      else if (!flags.length) flags.push("neither the town check nor cross-validation could confirm it");
      lines.push(
        `| #${r.listing.index} ${r.listing.label} | **${r.store.store_id}** — ${r.store.name} | ${r.listing.lat}, ${r.listing.lng} | ${r.sanity ? fmtSanity(r.sanity) : "—"} | ${r.crossVal ? fmtCrossVal(r.crossVal) : "—"} | ${flags.join("; ")} |`
      );
      finalListRows.push({ index: r.listing.index, label: r.listing.label, store: `${r.store.store_id} — ${r.store.name}`, address: r.listing.label, link: r.listing.directions_href || "_no link on the site_" });
    }
    for (const s of stillTied) {
      const cands = s.results.map((r) => `${r.store.store_id} (${r.containment.pass === true ? "passed containment too" : r.containment.pass === false ? `${r.containment.km}km away` : "inconclusive"})`);
      lines.push(`| #${s.listing.index} ${s.listing.label} | ${cands.join(" / ")} — still tied | ${s.listing.lat}, ${s.listing.lng} | — | — | containment didn't isolate a single winner |`);
      finalListRows.push({ index: s.listing.index, label: s.listing.label, store: cands.join(" / ") + " — still tied", address: s.listing.label, link: s.listing.directions_href || "_no link on the site_" });
    }
  } else {
    lines.push("_None._");
  }
  lines.push("");

  lines.push("## No coordinate at all — the 7 that need a human to open the link directly");
  lines.push("");
  if (noCoordinate.length) {
    lines.push("| Listing | Proposed store | Website address | Map link |");
    lines.push("|---|---|---|---|");
    for (const n of noCoordinate) {
      const storeCell = n.proposed?.tied ? n.proposed.tied.map((s) => s.store_id).join(" / ") + " (tied)" : n.proposed ? `${n.proposed.store.store_id} — ${n.proposed.store.name}` : "_no candidate_";
      lines.push(`| #${n.listing.index} | ${storeCell} | ${n.listing.label} | ${n.listing.directions_href || "_no link on the site_"} |`);
    }
  } else {
    lines.push("_None._");
  }
  lines.push("");

  lines.push("## No candidate store found");
  lines.push("");
  if (noCandidate.length) {
    lines.push("| Listing | Coordinate |");
    lines.push("|---|---|");
    for (const n of noCandidate) lines.push(`| #${n.listing.index} ${n.listing.label} | ${n.listing.lat != null ? `${n.listing.lat}, ${n.listing.lng}` : "_none_"} |`);
  } else {
    lines.push("_None._");
  }
  lines.push("");

  const totalTrusted = autoTrusted.length + validatedTrusted.length + tieBroken.length;
  lines.push("## Bottom line");
  lines.push("");
  lines.push(
    `${totalTrusted} of ${official.listings.length} site listings are trusted well enough to apply: ${autoTrusted.length} needed no checks, ${validatedTrusted.length} cleared the sanity check (or its cross-validation fallback), ${tieBroken.length} had their tie broken mechanically. ` +
      `${overrides.length} of those replace a meaningfully different prior coordinate — see the override ledger above. ` +
      `${needsReview.length + stillTied.length} still need a human read. ${noCoordinate.length} never resolved to a coordinate — those need the link opened by hand. ` +
      (APPLY ? "Applied to stores.json this run — see the git diff." : "Not applied — re-run with `--apply` once this looks right.") +
      ` **The precision split stays ${canonicalPrecise}/${canonicalCoarse}/${canonicalNoCoord} either way** — see the note above the duplicate-coordinate check for why these listing counts don't subtract from it directly.`
  );
  lines.push("");

  lines.push("## Final short list for hand review");
  lines.push("");
  const totalToHandle = finalListRows.length + noCoordinate.length;
  lines.push(`${totalToHandle} listing(s) total: ${finalListRows.length} same-tier disagreement(s) or unresolved tie(s) above, plus the ${noCoordinate.length} that never resolved to a coordinate at all. Each with its website address and map link to open directly. This is a worklist of LISTINGS, not a count of unlocated STORES — see the split above.`);
  lines.push("");
  lines.push("| # | Proposed store(s) | Website address | Map link |");
  lines.push("|---|---|---|---|");
  for (const r of finalListRows) lines.push(`| #${r.index} | ${r.store} | ${r.address} | ${r.link} |`);
  for (const n of noCoordinate) {
    const storeCell = n.proposed?.tied ? n.proposed.tied.map((s) => s.store_id).join(" / ") + " (tied)" : n.proposed ? `${n.proposed.store.store_id} — ${n.proposed.store.name}` : "_no candidate_";
    lines.push(`| #${n.listing.index} | ${storeCell} | ${n.listing.label} | ${n.listing.directions_href || "_no link on the site_"} |`);
  }

  await writeFile(REPORT_PATH, lines.join("\n") + "\n", "utf8");
  log(`Wrote ${REPORT_PATH}`);

  if (!APPLY) {
    log("Report-only run (pass --apply to write trusted matches to stores.json and regenerate proximity.json).");
    return { autoTrusted, validatedTrusted, tieBroken, needsReview, stillTied, noCoordinate, noCandidate, dupClusters, overrides, newFills };
  }

  await writeFile(STORES_PATH, JSON.stringify(storesRaw, null, 2) + "\n", "utf8");
  log(`Applied ${toApply.length} store(s) to ${STORES_PATH} (${overrides.length} overrides, ${newFills.length} new fills).`);

  log("Regenerating proximity.json...");
  const buildScript = path.join(__dirname, "build-proximity.mjs");
  const { stdout } = await execFileAsync(process.execPath, [buildScript]);
  console.log(stdout);

  const afterRaw = JSON.parse(await readFile(STORES_PATH, "utf8"));
  const preciseCount = afterRaw.stores.filter(isLocatable).length;
  log(`Precisely-located stores now: ${preciseCount}/${afterRaw.stores.length}.`);

  return { applied: toApply.length, overrides, newFills, preciseCount, total: afterRaw.stores.length };
}

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exitCode = 1;
});
