#!/usr/bin/env node
/**
 * scripts/geocode-towns.mjs — one coordinate per town, written to
 * public/data/town-centroids.json.
 *
 * WHY: nine stores have no usable address-level coordinate (three have none at
 * all, six resolved only to their town centre — see docs/PINS-NEEDED.md). Every
 * pair involving one of them currently reports "Unavailable", which is roughly
 * a third of the proximity matrix showing nothing at all.
 *
 * A town-to-town distance is a genuinely useful answer to "roughly how far
 * apart are these?" — it is how anyone would reason about it on a map. What it
 * must never do is masquerade as a measured distance, so every figure derived
 * from these centroids is carried and labelled separately: the store-level
 * cannibalisation score still uses ONLY measured distances, and approximate
 * pairs are marked as such wherever they appear.
 *
 * Town names in the store file are descriptive rather than official
 * ("Bhiwandi-Kalyan belt", "Nilje / Diva", "Khoni (MIDC)"), so each is reduced
 * to a place OSM actually carries before querying.
 *
 * Usage: node scripts/geocode-towns.mjs [--force]
 */
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORES = path.join(__dirname, "..", "public", "data", "stores.json");
const OUT = path.join(__dirname, "..", "public", "data", "town-centroids.json");
const FORCE = process.argv.includes("--force");

const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const UA = "PatelRetailDiligence/1.0 (investment diligence dashboard; contact: tech@muns.io)";
const DELAY_MS = 1100;
const MAX_KM_FROM_NETWORK = 90; // same-name-wrong-district guard

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function km(a, b) {
  const R = 6371, toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(h));
}

/**
 * Reduce a store-file town label to something OSM carries. These are written
 * for a human reading a store list, not for a gazetteer: a hyphenated corridor,
 * a slashed pair of adjacent places, an industrial-estate suffix.
 */
function searchableTown(town) {
  let t = town.replace(/\s*\([^)]*\)\s*/g, " ").trim();  // "Khoni (MIDC)" -> "Khoni"
  if (t.includes("/")) t = t.split("/")[0].trim();        // "Nilje / Diva"  -> "Nilje"
  if (/belt$/i.test(t)) t = t.replace(/-.*$/, "").trim(); // "Bhiwandi-Kalyan belt" -> "Bhiwandi"
  t = t.replace(/\s+Rd$/i, "").replace(/-.*Rd$/i, "").trim();
  return t;
}

/** Candidate queries for one town, most specific first. */
function queriesFor(town, district, state) {
  const base = searchableTown(town);
  const alts = new Set([base]);
  if (/Dombivali/i.test(base)) alts.add(base.replace(/Dombivali/gi, "Dombivli"));
  if (/Ambernath/i.test(base)) alts.add(base.replace(/Ambernath/gi, "Ambarnath"));
  if (/Nilje/i.test(base)) alts.add("Diva");
  if (/Khapoli/i.test(base)) alts.add("Khopoli");
  const out = [];
  for (const a of alts) {
    out.push(`${a}, ${district}, ${state}, India`);
    out.push(`${a}, ${state}, India`);
  }
  return out;
}

async function search(q) {
  const url = new URL(NOMINATIM);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "3");
  url.searchParams.set("countrycodes", "in");
  url.searchParams.set("q", q);
  const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "en" } });
  if (res.status === 429 || res.status === 503) {
    await sleep(5000);
    return search(q);
  }
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  return res.json();
}

async function main() {
  const stores = JSON.parse(await readFile(STORES, "utf8")).stores;
  const existing = !FORCE && existsSync(OUT) ? JSON.parse(await readFile(OUT, "utf8")).towns : {};

  const located = stores.filter((s) => s.lat != null);
  const centre = {
    lat: located.reduce((a, s) => a + s.lat, 0) / located.length,
    lng: located.reduce((a, s) => a + s.lng, 0) / located.length,
  };

  // A town where some store IS precisely located needs no lookup — the mean of
  // those stores is a better centre than any gazetteer point.
  const byTown = new Map();
  for (const s of stores) {
    if (!byTown.has(s.town)) byTown.set(s.town, []);
    byTown.get(s.town).push(s);
  }

  const towns = {};
  let fromStores = 0, looked = 0, failed = 0;
  for (const [town, list] of byTown) {
    const precise = list.filter((s) => s.lat != null && !["town", "town_base"].includes(s.geocode_match_tier));
    if (precise.length) {
      towns[town] = {
        lat: Number((precise.reduce((a, s) => a + s.lat, 0) / precise.length).toFixed(6)),
        lng: Number((precise.reduce((a, s) => a + s.lng, 0) / precise.length).toFixed(6)),
        source: "mean of precisely located stores in this town",
        basis: precise.length,
      };
      fromStores++;
      continue;
    }
    if (existing[town]) {
      towns[town] = existing[town];
      continue;
    }
    const district = list[0].district, state = list[0].state;
    let hit = null;
    for (const q of queriesFor(town, district, state)) {
      let results;
      try {
        results = await search(q);
      } catch {
        await sleep(DELAY_MS);
        continue;
      }
      await sleep(DELAY_MS);
      for (const r of results) {
        const pt = { lat: Number(r.lat), lng: Number(r.lon) };
        if (km(pt, centre) > MAX_KM_FROM_NETWORK) continue; // right name, wrong district
        hit = { ...pt, source: `OpenStreetMap: ${r.display_name}`, query: q };
        break;
      }
      if (hit) break;
    }
    if (hit) {
      towns[town] = { lat: Number(hit.lat.toFixed(6)), lng: Number(hit.lng.toFixed(6)), source: hit.source, query: hit.query };
      looked++;
      console.log(`  ✓ ${town} -> ${hit.lat.toFixed(4)}, ${hit.lng.toFixed(4)}`);
    } else {
      failed++;
      console.log(`  ✗ ${town} — no usable match`);
    }
  }

  await writeFile(
    OUT,
    JSON.stringify(
      {
        note:
          "One approximate centre per town. Used ONLY to give a town-to-town distance where a store has no address-level " +
          "coordinate, so the proximity matrix can say roughly how far apart two places are instead of nothing at all. " +
          "Never used for the cannibalisation score, which stays on measured distances only. Where a town contains at " +
          "least one precisely located store, the centre is the mean of those stores rather than a gazetteer point.",
        kind: "estimate",
        generated_at: new Date().toISOString(),
        counts: { total: byTown.size, from_stores: fromStores, geocoded: looked, failed },
        towns,
      },
      null,
      2
    ) + "\n",
    "utf8"
  );
  console.log(`\n[towns] ${Object.keys(towns).length}/${byTown.size} towns have a centre (${fromStores} from stores, ${looked} looked up, ${failed} failed).`);
  console.log(`[towns] Wrote ${OUT}`);
}

main().catch((e) => {
  console.error(e.stack || e.message);
  process.exitCode = 1;
});
