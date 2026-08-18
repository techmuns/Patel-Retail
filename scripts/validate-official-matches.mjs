#!/usr/bin/env node
/**
 * scripts/validate-official-matches.mjs — mechanically validate the
 * resolved_low_confidence coordinates from fetch-official-stores.mjs instead
 * of asking a human to eyeball 35 rows. Reuses proposeMatches() from that
 * script unchanged (imported, not re-derived) so the matches checked here
 * are exactly the ones docs/OFFICIAL-STORES-REVIEW.md already proposed.
 *
 * Three checks, cheapest and most decisive first:
 *
 *   1. CONTAINMENT. Every matched store has a known location already — its
 *      own precise lat/lng where one was already geocoded (28/53 stores),
 *      or failing that its `town` field. Check whether the low-confidence
 *      coordinate actually falls near that reference point: within 1km of
 *      an existing precise coordinate (the tighter, more authoritative
 *      check, and free — no network call), or within 5km of the town's own
 *      geocoded centroid otherwise (a town can be several km across, so
 *      this is deliberately loose — it's a sanity check, not a precision
 *      claim).
 *   2. DUPLICATES. The brand-collision worry (Google matching a generic
 *      "Patel's R Mart" search to the wrong nearby branch) makes a specific
 *      prediction: two different stores would land on the identical point.
 *      Checked across every listing that resolved to a coordinate at all,
 *      not just the low-confidence ones.
 *   3. CROSS-VALIDATION. The website's own address text (richer than the
 *      client's file — several include pincodes) hasn't been used for
 *      anything yet, only its map links. Geocode that text independently
 *      via Nominatim and compare against the short-link-resolved
 *      coordinate. Agreement from two independent sources is trusted
 *      without a human opening the link; disagreement is a real flag.
 *
 * A listing is auto-trusted if it clears (1) or (3) and isn't caught in a
 * duplicate cluster from (2). A `resolved` (non-low-confidence) coordinate
 * whose match basis is still a weak `locality_token_overlap` (not a
 * store-code match) gets the same three checks — full coordinate
 * confidence doesn't excuse a weak identity match, per the review doc's own
 * stated discipline. `code_prefix`/`code_token` matches on a `resolved`
 * coordinate need no checks — both axes are already as strong as this
 * dataset gets.
 *
 * Tied matches (6 of them) get a best-effort tie-break attempt using the
 * same containment logic against EACH candidate; only clears if exactly one
 * candidate's own reference point contains the coordinate.
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

const EXISTING_COORD_RADIUS_KM = 1; // vs. a store's own already-geocoded precise point
const TOWN_RADIUS_KM = 5; // vs. a geocoded town centroid — loose on purpose
const CROSS_VALIDATE_RADIUS_KM = 0.5; // two independent sources agreeing
const DUPLICATE_RADIUS_KM = 0.05; // ~50m — "same pin"
const NEAR_DUPLICATE_RADIUS_KM = 0.3; // worth a note, not necessarily wrong — dense clusters exist

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
// is far fewer than 35 network round trips even before counting the free
// existing-coordinate shortcut.
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

/** Check 1: does `coord` fall near `store`'s own known location? */
async function checkContainment(coord, store) {
  if (isLocatable(store)) {
    const km = round2(haversineKm(coord, store));
    return { method: "existing_precise_coordinate", pass: km <= EXISTING_COORD_RADIUS_KM, km, radius_km: EXISTING_COORD_RADIUS_KM, reference: `${store.lat}, ${store.lng} (${store.geocode_match_tier})` };
  }
  const townQuery = `${store.town}, ${store.district}, ${store.state}, India`;
  let centre = await geocodeCached(townQuery);
  if ((!centre || centre.error) && store.town.includes("/")) {
    // "Nilje / Diva" style joint town names sometimes don't parse as free text — retry on the first half.
    const fallbackTown = store.town.split("/")[0].trim();
    centre = await geocodeCached(`${fallbackTown}, ${store.district}, ${store.state}, India`);
  }
  if (!centre || centre.error) {
    return { method: "town_centroid", pass: null, reason: centre?.error ? `geocode error: ${centre.error}` : "town did not geocode to anything", query: townQuery };
  }
  const km = round2(haversineKm(coord, centre));
  return { method: "town_centroid", pass: km <= TOWN_RADIUS_KM, km, radius_km: TOWN_RADIUS_KM, reference: `${centre.display_name} (${centre.lat}, ${centre.lng})`, query: townQuery };
}

/** Check 3: does an independent Nominatim geocode of the site's OWN address text agree? */
async function checkCrossValidation(coord, label) {
  const query = `${label}, Maharashtra, India`;
  const result = await geocodeCached(query);
  if (!result || result.error) {
    return { method: "nominatim_address", pass: null, reason: result?.error ? `geocode error: ${result.error}` : "address did not geocode to anything", query };
  }
  const km = round2(haversineKm(coord, result));
  return { method: "nominatim_address", pass: km <= CROSS_VALIDATE_RADIUS_KM, km, radius_km: CROSS_VALIDATE_RADIUS_KM, reference: `${result.display_name} (${result.lat}, ${result.lng})`, query };
}

function fmtContainment(c) {
  if (c.pass === true) return `✅ ${c.km}km from ${c.method === "existing_precise_coordinate" ? "store's own precise point" : "town centroid"}`;
  if (c.pass === false) return `❌ ${c.km}km from ${c.method === "existing_precise_coordinate" ? "store's own EXISTING precise point" : "town centroid"}`;
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

  const { proposals } = proposeMatches(official.listings, stores);
  const byIndex = new Map(proposals.map((p) => [p.listing.index, p]));

  // ---- Check 2 (duplicate detection) runs globally, once, up front -------
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

  // ---- Per-listing validation --------------------------------------------
  const autoTrusted = []; // code match + resolved coordinate, no checks needed
  const validatedTrusted = []; // passed checks
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
        const c = await checkContainment(listing, candidate);
        results.push({ store: candidate, containment: c });
      }
      const passing = results.filter((r) => r.containment.pass === true);
      if (passing.length === 1) {
        tieBroken.push({ listing, store: passing[0].store, allResults: results, via: "containment_tiebreak" });
      } else {
        stillTied.push({ listing, proposed, results });
      }
      continue;
    }

    if (!needsChecking(listing, proposed)) {
      autoTrusted.push({ listing, store: proposed.store, tier: proposed.tier });
      continue;
    }

    const containment = await checkContainment(listing, proposed.store);
    const crossVal = await checkCrossValidation(listing, listing.label);
    const isDuplicate = flaggedIndices.has(listing.index);

    // When the store already has a precise coordinate, containment IS the
    // comparison against that prior-trusted point — cross-validation only
    // re-derives the NEW source a second way (geocoding the same website
    // address text), so it can corroborate the new source internally but
    // can't override a disagreement with the OLD one. Two agreeing
    // derivations of a possibly-wrong new source isn't the same as two
    // genuinely independent sources agreeing — a contradiction here is a
    // real conflict between provenances and goes to a human, never
    // resolved silently either way (found by hand-checking this exact
    // case: SHD's website coordinate and an independent re-geocode of its
    // own address agreed with EACH OTHER to within 240m while both
    // disagreed with SHD's existing "exact"-tier coordinate by 2.39km).
    const hasExistingPoint = containment.method === "existing_precise_coordinate";
    const passed = hasExistingPoint ? containment.pass === true : containment.pass === true || crossVal.pass === true;
    const clearFail = containment.pass === false || crossVal.pass === false;

    if (passed && !isDuplicate) {
      validatedTrusted.push({ listing, store: proposed.store, tier: proposed.tier, containment, crossVal });
    } else {
      needsReview.push({ listing, store: proposed.store, tier: proposed.tier, containment, crossVal, isDuplicate, clearFail });
    }
  }

  log(`Auto-trusted (code match + resolved coord): ${autoTrusted.length}`);
  log(`Validated & promoted to trusted: ${validatedTrusted.length}`);
  log(`Needs human review: ${needsReview.length}`);
  log(`Ties broken mechanically: ${tieBroken.length}`);
  log(`Ties still unresolved: ${stillTied.length}`);
  log(`No candidate store at all: ${noCandidate.length}`);
  log(`No coordinate at all: ${noCoordinate.length}`);

  // ---- Write the report ----------------------------------------------------
  const lines = [];
  lines.push("# Official store list — mechanical validation of low-confidence matches");
  lines.push("");
  lines.push(
    `Ran against ${official.listings.length} listings from \`stores-official.json\` (fetched ${official.fetched_at.slice(0, 10)}). ` +
      `${autoTrusted.length} needed no checks (store-code match + unambiguous coordinate), ${validatedTrusted.length + needsReview.length} were checked, ` +
      `${validatedTrusted.length} cleared automatically, ${tieBroken.length} ties were broken mechanically. ` +
      `${needsReview.length + stillTied.length} genuinely need a human. ${noCoordinate.length} never resolved to a coordinate at all.`
  );
  lines.push("");

  lines.push("## Duplicate-coordinate check");
  lines.push("");
  if (dupClusters.length === 0) {
    lines.push(
      `No two listings share a coordinate within ${Math.round(NEAR_DUPLICATE_RADIUS_KM * 1000)}m of each other, out of ${withCoord.length} listings that resolved to one. ` +
        "The brand-collision worry — Google matching a generic business-name search to the wrong nearby branch — did not materialize as duplicate points. That's evidence the coordinates are landing on distinct places, not proof each one is the CORRECT place (see the containment and cross-validation checks below for that)."
    );
  } else {
    lines.push(`${dupClusters.length} cluster(s) of listings share a coordinate within ${Math.round(NEAR_DUPLICATE_RADIUS_KM * 1000)}m — flagged for review regardless of what the other two checks say:`);
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
    lines.push("| Listing | Store | Coordinate | Containment check | Cross-validation check |");
    lines.push("|---|---|---|---|---|");
    for (const v of validatedTrusted) {
      lines.push(`| #${v.listing.index} ${v.listing.label} | **${v.store.store_id}** — ${v.store.name} | ${v.listing.lat}, ${v.listing.lng} | ${fmtContainment(v.containment)} | ${fmtCrossVal(v.crossVal)} |`);
    }
  } else {
    lines.push("_None._");
  }
  lines.push("");

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

  lines.push("## Needs a human — genuine disagreement or nothing to check against");
  lines.push("");
  if (needsReview.length || stillTied.length) {
    lines.push("| Listing | Proposed store(s) | Coordinate | Containment check | Cross-validation check | Why it wasn't auto-trusted |");
    lines.push("|---|---|---|---|---|---|");
    for (const r of needsReview) {
      const flags = [];
      if (r.isDuplicate) flags.push("shares a coordinate with another listing");
      if (r.containment.method === "existing_precise_coordinate" && r.containment.pass === false) {
        flags.push(r.crossVal.pass === true ? "**contradicts an existing precise coordinate despite the website's own address independently agreeing with itself** — a real conflict between two provenances, not a simple failure" : "contradicts an existing precise coordinate");
      } else if (!flags.length) {
        flags.push("neither check cleared it");
      }
      lines.push(`| #${r.listing.index} ${r.listing.label} | **${r.store.store_id}** — ${r.store.name} | ${r.listing.lat}, ${r.listing.lng} | ${fmtContainment(r.containment)} | ${fmtCrossVal(r.crossVal)} | ${flags.join("; ")} |`);
    }
    for (const s of stillTied) {
      const cands = s.results.map((r) => `${r.store.store_id} (${r.containment.pass === true ? "passed containment too" : r.containment.pass === false ? `${r.containment.km}km away` : "inconclusive"})`);
      lines.push(`| #${s.listing.index} ${s.listing.label} | ${cands.join(" / ")} — still tied | ${s.listing.lat}, ${s.listing.lng} | — | — | containment didn't isolate a single winner |`);
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
    `${totalTrusted} of ${official.listings.length} site listings are trusted well enough to apply: ${autoTrusted.length} needed no checks, ${validatedTrusted.length} cleared the containment/cross-validation checks, ${tieBroken.length} had their tie broken mechanically. ` +
      `${needsReview.length + stillTied.length} still need a human read. ${noCoordinate.length} never resolved to a coordinate — those need the link opened by hand, listed above with the site's own address text. ` +
      (APPLY ? "Applied to stores.json this run — see the git diff." : "Not applied — re-run with `--apply` once this looks right.")
  );

  await writeFile(REPORT_PATH, lines.join("\n") + "\n", "utf8");
  log(`Wrote ${REPORT_PATH}`);

  if (!APPLY) {
    log("Report-only run (pass --apply to write trusted matches to stores.json and regenerate proximity.json).");
    return { autoTrusted, validatedTrusted, tieBroken, needsReview, stillTied, noCoordinate, noCandidate, dupClusters };
  }

  // ---- Apply ---------------------------------------------------------------
  const toApply = [...autoTrusted, ...validatedTrusted, ...tieBroken.map((t) => ({ listing: t.listing, store: t.store }))];
  let applied = 0;
  for (const a of toApply) {
    const store = stores.find((s) => s.store_id === a.store.store_id);
    if (!store) continue;
    store.lat = a.listing.lat;
    store.lng = a.listing.lng;
    store.geo_source = "company_website";
    store.geocode_match_tier = "client"; // same trusted tier as a client-pasted pin, per OFFICIAL-STORES-REVIEW.md's own "Next step"
    store.address_official = a.listing.label;
    delete store.geocode_formatted_address;
    delete store.geocode_location_type;
    delete store.geocode_query_used;
    delete store.geocode_review_note;
    applied++;
  }
  await writeFile(STORES_PATH, JSON.stringify(storesRaw, null, 2) + "\n", "utf8");
  log(`Applied ${applied} store(s) to ${STORES_PATH}.`);

  log("Regenerating proximity.json...");
  const buildScript = path.join(__dirname, "build-proximity.mjs");
  const { stdout } = await execFileAsync(process.execPath, [buildScript]);
  console.log(stdout);

  const afterRaw = JSON.parse(await readFile(STORES_PATH, "utf8"));
  const preciseCount = afterRaw.stores.filter(isLocatable).length;
  log(`Precisely-located stores now: ${preciseCount}/${afterRaw.stores.length}.`);

  return { applied, preciseCount, total: afterRaw.stores.length };
}

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exitCode = 1;
});
