#!/usr/bin/env node
/**
 * scripts/scrape-dmart.mjs — scrape DMart (Avenue Supermarts) locations near
 * Patel Retail's operating towns and write public/data/competitors.json.
 *
 * ⚠️ IMPORTANT CAVEAT, read before trusting this script's output:
 *
 * PATEL-HANDOFF.md §7 calls this "Playwright-scrape DMart's store locator
 * for v1 — free, authoritative." Researching dmart.in (web search + fetch,
 * no live browser — see below) turned up no public locator for DMart's
 * physical supermarkets. What exists is the "DMart Ready" PICKUP POINT
 * locator (dmart.in/whatispickuppoint) — online-order collection points
 * across Mumbai/Navi Mumbai/Thane/Pune/etc., which is NOT necessarily the
 * same set of locations as DMart's physical big-box stores. They may
 * overlap heavily in practice, or they may not — that hasn't been verified.
 * This script scrapes that locator (the only public location-finder DMart
 * actually exposes) as the closest available v1 proxy, but the output is
 * labelled accordingly and should be spot-checked against a couple of known
 * physical DMart addresses before anyone treats it as "DMart's store
 * network."
 *
 * ⚠️ SECOND CAVEAT: this script has NOT been run or verified against the
 * live site. The sandbox this was written in has outbound network access
 * for plain HTTP tools (curl, Node's fetch) but headless Chromium inside it
 * cannot open any outbound connection at all (confirmed: even
 * https://example.com resets) — so Playwright could not be launched against
 * dmart.in here to find/confirm real selectors. The selectors below are a
 * best-effort guess from the page's rendered text content (fetched without
 * JS execution), not verified DOM structure. TREAT THIS AS A DRAFT: run it
 * with `--headed` in an environment with real browser network access, watch
 * it hit the search box and render results, and fix the selectors marked
 * NEEDS VERIFICATION below before relying on its output.
 *
 * Seeds the search from Patel's own town list (public/data/stores.json) —
 * a natural, non-arbitrary scope: we only need DMart's proximity to towns
 * Patel actually operates in, not a nationwide crawl.
 *
 * Usage:
 *   node scripts/scrape-dmart.mjs                 # all Patel towns
 *   node scripts/scrape-dmart.mjs --headed         # watch it run, for debugging selectors
 *   node scripts/scrape-dmart.mjs --town="Kalyan West"   # one town, for testing
 */

import { chromium } from "playwright";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORES_PATH = path.join(__dirname, "..", "public", "data", "stores.json");
const OUT_PATH = path.join(__dirname, "..", "public", "data", "competitors.json");
const LOCATOR_URL = "https://www.dmart.in/whatispickuppoint";

const HEADED = process.argv.includes("--headed");
const SINGLE_TOWN = process.argv.find((a) => a.startsWith("--town="))?.split("=")[1];
const REQUEST_DELAY_MS = 1500; // be polite — this is a live consumer site, not an API

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getSearchTowns() {
  const raw = await readFile(STORES_PATH, "utf8");
  const data = JSON.parse(raw);
  if (SINGLE_TOWN) return [SINGLE_TOWN];
  // Distinct towns, base name (strip " East"/" (E)" etc.) since the locator
  // likely indexes by locality/city rather than Patel's own East/West split.
  const towns = new Set(
    data.stores.map((s) => s.town.replace(/\s*\((E|W)\)\s*$/i, "").replace(/\s+(East|West)$/i, "").trim())
  );
  return [...towns];
}

/**
 * NEEDS VERIFICATION: guessed selectors. Open the page in a real browser,
 * inspect the search box and result cards, and correct these before trusting
 * any output. Structured as "search box -> type town -> wait for results ->
 * scrape cards" because that's the interaction the page's own copy describes
 * ("Enter your area, locality, pincode or pick up point name...").
 */
const SELECTORS = {
  searchInput: 'input[placeholder*="area" i], input[placeholder*="pincode" i], input[type="search"]',
  searchButton: 'button:has-text("Search"), button[type="submit"]',
  resultCard: '[class*="pickup" i][class*="card" i], [class*="pickup" i][class*="item" i], [class*="store" i][class*="card" i]',
  resultName: '[class*="name" i], h3, h4',
  resultAddress: '[class*="address" i], p',
};

async function scrapeTown(page, town) {
  await page.goto(LOCATOR_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
  const input = page.locator(SELECTORS.searchInput).first();
  await input.waitFor({ timeout: 15000 });
  await input.fill(town);
  await sleep(600); // let any autocomplete/debounce settle before submitting
  const button = page.locator(SELECTORS.searchButton).first();
  if (await button.count()) {
    await button.click();
  } else {
    await input.press("Enter");
  }
  await page.waitForTimeout(2500); // NEEDS VERIFICATION: replace with a real waitForSelector once result markup is confirmed

  const cards = page.locator(SELECTORS.resultCard);
  const count = await cards.count();
  const results = [];
  for (let i = 0; i < count; i++) {
    const card = cards.nth(i);
    const name = (await card.locator(SELECTORS.resultName).first().textContent().catch(() => null))?.trim();
    const address = (await card.locator(SELECTORS.resultAddress).first().textContent().catch(() => null))?.trim();
    if (name || address) results.push({ name: name || null, address: address || null, searched_town: town });
  }
  return results;
}

async function main() {
  const towns = await getSearchTowns();
  console.log(`Scraping DMart Ready pickup points for ${towns.length} town(s): ${towns.join(", ")}`);
  console.log(`⚠️  Unverified selectors (see file header) — run with --headed and watch it before trusting output.\n`);

  const browser = await chromium.launch({ headless: !HEADED });
  const page = await browser.newPage();

  const allResults = [];
  const errors = [];
  for (const town of towns) {
    try {
      const results = await scrapeTown(page, town);
      console.log(`  ${town}: ${results.length} result(s)`);
      allResults.push(...results);
    } catch (err) {
      console.warn(`  ${town}: FAILED — ${err.message}`);
      errors.push({ town, error: err.message });
    }
    await sleep(REQUEST_DELAY_MS);
  }

  await browser.close();

  // De-dupe by name+address (multiple towns can surface the same pickup point).
  const seen = new Set();
  const deduped = allResults.filter((r) => {
    const key = `${r.name}|${r.address}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const output = {
    source: "dmart_ready_pickup_point_locator",
    source_url: LOCATOR_URL,
    caveat:
      "This is DMart Ready's online-order PICKUP POINT locator, not a confirmed list of DMart's physical supermarket locations — dmart.in has no public store locator for the physical big-box format. Pickup points may or may not correspond 1:1 with physical stores. Verify against a couple of known DMart addresses before treating this as DMart's store network. Selectors used to scrape it are unverified — see this script's header comment.",
    scraped_at: new Date().toISOString(),
    lat: null, // pickup points have addresses, not coordinates, from this locator — run scripts/geocode.mjs-style geocoding on `stores[].address` separately if needed
    banner: "DMart Ready",
    stores: deduped.map((r, i) => ({
      competitor_id: `DMART-${String(i + 1).padStart(3, "0")}`,
      banner: "DMart Ready",
      name: r.name,
      address: r.address,
      searched_town: r.searched_town,
      lat: null,
      lng: null,
    })),
    errors,
  };

  await writeFile(OUT_PATH, JSON.stringify(output, null, 2) + "\n", "utf8");
  console.log(`\nWrote ${OUT_PATH} — ${deduped.length} unique result(s), ${errors.length} town(s) failed.`);
  console.log("Next: geocode competitors[].address the same way stores.json was geocoded, then re-run scripts/build-proximity.mjs to wire nearest_competitor into the risk score.");
}

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exitCode = 1;
});
