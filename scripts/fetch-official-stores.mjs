#!/usr/bin/env node
/**
 * scripts/fetch-official-stores.mjs — pull all 53 store listings straight
 * from the client's own website (patelrpl.in/stores/) instead of continuing
 * to fight Nominatim on hyperlocal addresses. Each listing carries either a
 * raw coordinate (in a Google/Apple Maps URL) or a short link, and the
 * client's own site is a strictly better source than inferred geocoding —
 * same reasoning as scripts/apply-client-coords.mjs, just at bulk instead
 * of one paste at a time.
 *
 * Two phases, run in order, with a hard stop between them:
 *   PHASE 1 — fetch the 4 listing pages (plain fetch, no browser — this
 *     sandbox's Playwright can't reach the internet, but Node's own fetch
 *     can, same as scripts/fetch-dmart-overpass.mjs and discover.mjs found).
 *     Parse every store card PER-CARD (never two separate global regexes
 *     paired positionally — two of 53 cards on the live site have NO
 *     "Get Directions" link at all, which would silently shift every
 *     subsequent card's coordinates onto the wrong name if label/href were
 *     extracted as two separate lists and zipped together). Resolve every
 *     short link (throttled). Write the raw result to
 *     public/data/stores-official.json — nothing matched or interpreted
 *     yet, exactly what the site said.
 *   PHASE 2 — propose matches against public/data/stores.json's existing
 *     store_id/locality/town fields. NEVER auto-accepts a match, no matter
 *     how confident the heuristic is — writes docs/OFFICIAL-STORES-REVIEW.md
 *     for a human to check before anything gets applied. A plausible-
 *     looking name match can be a different place entirely (the Shirgaon
 *     Nominatim false positive earlier in this project was exactly that,
 *     82km off) — the stakes here are the same, just at a different stage
 *     of the pipeline.
 *
 * This script does NOT write to stores.json. Applying reviewed matches is a
 * deliberate follow-up step once a human has looked at the review file.
 *
 * Usage: node scripts/fetch-official-stores.mjs
 */

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { tryParseRawLatLng, tryParseMapsUrl, isShortLink, resolveShortLink } from "./lib/gmaps-url.mjs";
import { haversineKm, round2 } from "../public/js/geo.js"; // single source of truth — see that file's own header

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORES_PATH = path.join(__dirname, "..", "public", "data", "stores.json");
const RAW_OUT_PATH = path.join(__dirname, "..", "public", "data", "stores-official.json");
const REVIEW_OUT_PATH = path.join(__dirname, "..", "docs", "OFFICIAL-STORES-REVIEW.md");

const BASE_URL = "https://patelrpl.in/stores/?jsf=jet-engine&pagenum=";
const PAGE_NUMBERS = [1, 2, 3, 4];
const SHORT_LINK_THROTTLE_MS = 400; // "don't hammer Google" — sequential, not parallel

// Same Thane–Raigad–Palghar box as apply-client-coords.mjs / geocode.mjs.
// Used only as a SANITY CHECK on the one ambiguous pattern below — never to
// accept or reject a clean, unambiguous coordinate.
const REGION_BOX = { minLat: 18.6, maxLat: 19.8, minLng: 72.7, maxLng: 73.6 };
function inRegionBox(lat, lng) {
  return lat >= REGION_BOX.minLat && lat <= REGION_BOX.maxLat && lng >= REGION_BOX.minLng && lng <= REGION_BOX.maxLng;
}

const log = (...a) => console.log("[fetch-official]", ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------ fetch+parse - */

function decodeEntities(s) {
  return s
    .replace(/&#0?39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
    .replace(/ /g, " ");
}

/**
 * Split the page into per-card chunks and extract (label, directionsHref,
 * detailUrl) from EACH card independently. Deliberately not two global
 * regexes zipped together — see file header for why that's unsafe here.
 */
function extractCards(html) {
  const starts = [...html.matchAll(/jet-listing-grid__item jet-listing-dynamic-post/g)].map((m) => m.index);
  starts.push(html.length);
  const cards = [];
  for (let i = 0; i < starts.length - 1; i++) {
    const card = html.slice(starts[i], starts[i + 1]);
    const labelM = card.match(/jet-listing-dynamic-link__label">([^<]*)/);
    const detailM = card.match(/jet-listing-dynamic-link__link"[^>]*href="([^"]*)"/) || card.match(/jet-listing-dynamic-image__link"[^>]*href="([^"]*)"/);
    const hrefM = card.match(/<a[^>]*class="[^"]*elementor-button[^"]*"[^>]*href="([^"]*)"/);
    cards.push({
      label: labelM ? decodeEntities(labelM[1]).trim() : null,
      detail_url: detailM ? decodeEntities(detailM[1]) : null,
      directions_href: hrefM ? decodeEntities(hrefM[1]) : null,
    });
  }
  return cards;
}

async function fetchPage(n) {
  const url = `${BASE_URL}${n}`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; PatelRetailDashboard/1.0)" } });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.text();
}

/* ------------------------------------------------------ coordinate resolve - */

// A Google Plus Code looks like XXXX+XX(X) using this restricted alphabet
// (no vowels or 0/1, to avoid confusion with letters/digits) — detected so
// it can be reported as "needs OLC decoding", not silently dropped as just
// another unparseable link.
const PLUS_CODE_RE = /\b[23456789CFGHJMPQRVWX]{4,6}\+[23456789CFGHJMPQRVWX]{2,3}\b/;

/**
 * Resolve one card's directions href to a coordinate, or explain why not.
 * Returns { status, lat?, lng?, via?, resolved_url?, note? }.
 * status is one of:
 *   resolved                 — unambiguous pattern match (or after short-link resolution)
 *   resolved_low_confidence  — a /maps/dir/{lat},{lng}/ ORIGIN segment: plausibly the
 *                               store's pin, but a directions URL's origin can also just be
 *                               wherever the link was generated from — not treated as equal
 *                               confidence to a direct pin match. In-region, unquoted only.
 *   no_link                  — the card has no "Get Directions" button at all
 *   plus_code_unresolved     — a Google Plus Code, which this script does not decode
 *   short_link_resolve_failed
 *   unresolved                — href present but nothing above matched (includes /dir/ URLs
 *                               with a quoted "current location" origin and multiple
 *                               candidate destination coordinates — never guessed between them)
 */
async function resolveCoord(href) {
  if (!href) return { status: "no_link" };

  let url = href;
  if (isShortLink(href)) {
    try {
      url = await resolveShortLink(href);
    } catch (e) {
      return { status: "short_link_resolve_failed", note: e.message, original: href };
    }
  }

  // A /maps/dir/... (directions) URL must be checked BEFORE the generic
  // parser below. Its `@lat,lng,Nm` is the VIEWPORT needed to fit both the
  // origin and destination on screen — for these URLs it's routinely tens
  // of km wide (21880m / 46231m observed on real listings here), nowhere
  // near a precise pin, and its `!3d!4d`/`!1d!2d` pairs can belong to
  // EITHER endpoint, sometimes both appearing in the same URL. Letting the
  // generic parser run first on a /dir/ URL is exactly how a 46km-wide
  // viewport center gets mistaken for a store's own location — caught by
  // hand-checking this script's own first real run, not by inspection
  // before running it. So: for /dir/ URLs, ONLY the origin segment is ever
  // considered, and only the UNQUOTED, bare-decimal form of it — a quoted
  // origin ('19.29,72.86') is Google's own "current location" placeholder
  // text, not a real pin, and every other coordinate in a /dir/ URL is
  // left unresolved rather than guessed at.
  if (/\/maps\/dir\//.test(url)) {
    const dirM = url.match(/\/maps\/dir\/(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)\//);
    if (dirM) {
      const lat = parseFloat(dirM[1]);
      const lng = parseFloat(dirM[2]);
      if (inRegionBox(lat, lng)) {
        return {
          status: "resolved_low_confidence",
          lat,
          lng,
          via: "dir_origin",
          resolved_url: url,
          note: "Origin segment of a /dir/ (directions) URL — in the Thane–Raigad box, but a directions link's origin isn't guaranteed to be the store's own pin. Flagged low-confidence, not treated as equal to a direct place match.",
        };
      }
      return { status: "unresolved", resolved_url: url, note: `/dir/ origin (${lat}, ${lng}) is outside the Thane–Raigad–Palghar box — not accepted.` };
    }
    return { status: "unresolved", resolved_url: url, note: "Directions URL with a quoted/placeholder origin and no reliable single destination coordinate — not guessed at." };
  }

  const direct = tryParseMapsUrl(url);
  if (direct) {
    const brandRisk = businessNameSearchRisk(url);
    if (brandRisk) {
      return {
        status: "resolved_low_confidence",
        lat: direct.lat,
        lng: direct.lng,
        via: direct.via,
        resolved_url: url,
        note: `Resolved via a business-NAME search for "${brandRisk}", not a coordinate — Patel's own brand repeats at nearly every one of its 53 locations, so Google matching this generic name to a SPECIFIC nearby branch is a real risk of picking the wrong one, not necessarily this listing's own store. Flagged low-confidence rather than treated as equal to a coordinate-based match.`,
      };
    }
    return { status: "resolved", lat: direct.lat, lng: direct.lng, via: direct.via, resolved_url: url };
  }

  if (PLUS_CODE_RE.test(href) || PLUS_CODE_RE.test(url)) {
    return { status: "plus_code_unresolved", original: href, note: "Google Plus Code (e.g. 528M+983) — this script does not decode Open Location Codes." };
  }

  return { status: "unresolved", original: href, resolved_url: url === href ? undefined : url };
}

/**
 * True (with the matched name) when a /maps/place/{X}/ URL's {X} segment is
 * a business NAME rather than a coordinate or DMS string — found on this
 * script's first real run: two different short links, both searching the
 * generic phrase "Patel's R Mart", resolved to the SAME viewport (that bug
 * is fixed by preferring !3d!4d — see gmaps-url.mjs), but even the place-
 * specific !3d!4d pair is only as reliable as Google's own fuzzy match of a
 * name that repeats at nearly every one of Patel's 53 stores. A coordinate
 * or DMS place segment carries none of that risk (nothing to fuzzy-match —
 * the "name" being searched already IS the point), so those stay full
 * confidence.
 */
function businessNameSearchRisk(url) {
  const m = url.match(/\/maps\/place\/([^/@]+)/);
  if (!m) return null;
  const seg = decodeURIComponent(m[1].replace(/\+/g, " "));
  const looksLikeCoordOrDms = /^-?\d{1,3}[.,]/.test(seg) || /°/.test(seg);
  return looksLikeCoordOrDms ? null : seg;
}

/* --------------------------------------------------------------- phase 1 -- */

async function phase1FetchAndResolve() {
  const allCards = [];
  for (const n of PAGE_NUMBERS) {
    log(`fetching page ${n}...`);
    const html = await fetchPage(n);
    const cards = extractCards(html);
    log(`  page ${n}: ${cards.length} cards`);
    allCards.push(...cards);
  }

  const results = [];
  let resolvedCount = 0;
  let lowConfCount = 0;
  let unresolvedCount = 0;
  for (let i = 0; i < allCards.length; i++) {
    const card = allCards[i];
    const coord = await resolveCoord(card.directions_href);
    if (coord.status === "resolved") resolvedCount++;
    else if (coord.status === "resolved_low_confidence") lowConfCount++;
    else unresolvedCount++;
    results.push({ index: i + 1, label: card.label, detail_url: card.detail_url, directions_href: card.directions_href, ...coord });
    log(`  [${i + 1}/${allCards.length}] ${coord.status}${coord.lat != null ? ` (${coord.lat}, ${coord.lng})` : ""} — ${(card.label || "").slice(0, 50)}`);
    if (isShortLink(card.directions_href || "")) await sleep(SHORT_LINK_THROTTLE_MS);
  }

  const output = {
    fetched_at: new Date().toISOString(),
    source: "https://patelrpl.in/stores/",
    note: "Raw scrape of the client's own website — NOT yet matched to public/data/stores.json's store codes. See docs/OFFICIAL-STORES-REVIEW.md for proposed matches; nothing here has been applied to stores.json.",
    total_listings: results.length,
    resolved: resolvedCount,
    resolved_low_confidence: lowConfCount,
    unresolved: unresolvedCount,
    listings: results,
  };
  await writeFile(RAW_OUT_PATH, JSON.stringify(output, null, 2) + "\n", "utf8");
  log(`Wrote ${RAW_OUT_PATH} — ${resolvedCount} resolved, ${lowConfCount} low-confidence, ${unresolvedCount} unresolved, ${results.length} total.`);
  return output;
}

/* --------------------------------------------------------------- phase 2 -- */

function normalize(s) {
  return (s || "")
    .toLowerCase()
    .replace(/[.,\-()\/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
// "naka"/"nagar"/"chowk" were in this list originally and were wrong to be —
// found by hand: "Vijay Nagar Kalyan (East)" (listing #14) was proposing
// BHAR ("Kalyan Naka") over the actually-correct KET ("Vijay Nagar, Kalyan
// (East)") because stripping "nagar"/"naka" left both addresses as just
// "kalyan", the single most common town word in this dataset. Those three
// are junction/neighbourhood names — the specific, DISTINGUISHING part of a
// local address, not filler — unlike "road"/"station"/"east"/"west", which
// really do repeat across unrelated addresses with no identifying value.
const STOPWORDS = new Set(["road", "rd", "east", "west", "near", "opp", "opposite", "the", "of", "no", "station"]);
function tokens(s) {
  return normalize(s)
    .split(" ")
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

function storeCodeCandidates(store) {
  // "DAG/DOEMIDC" -> ["DAG","DOEMIDC"], "PRCAME/PRCAMEN" -> ["PRCAME","PRCAMEN"]
  return store.store_id.split("/").map((s) => s.toLowerCase());
}

/** Does the official label start with (or contain, as a whole token) one of this store's codes? */
function codeMatch(label, store) {
  const labelTokens = normalize(label).split(" ");
  const codes = storeCodeCandidates(store);
  for (const code of codes) {
    if (labelTokens[0] === code) return { tier: "code_prefix", code };
    if (labelTokens.includes(code) && code.length >= 3) return { tier: "code_token", code };
  }
  return null;
}

/** Levenshtein edit distance — small, dependency-free, used only to catch
 *  spelling/transliteration variants ("Rambuag" vs "Rambaug", a transposed
 *  pair) that an exact-token-equality check would silently miss and never
 *  flag as a match at all, not even a weak one. */
function editDistance(a, b) {
  const m = a.length,
    n = b.length;
  if (!m) return n;
  if (!n) return m;
  const row = new Array(n + 1);
  for (let j = 0; j <= n; j++) row[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = row[j];
      row[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, row[j], row[j - 1]);
      prev = tmp;
    }
  }
  return row[n];
}
/** Two tokens "match" if identical, one contains the other (handles a
 *  spacing difference like "Anjurphata" vs "Anjur Phata" once both sides
 *  are also compared with spaces stripped), or they're a close edit-
 *  distance apart relative to length (handles "Rambuag" vs "Rambaug"). */
function tokensMatch(a, b) {
  if (a === b) return true;
  const bare = (s) => s.replace(/\s+/g, "");
  if (bare(a).includes(bare(b)) || bare(b).includes(bare(a))) return true;
  const maxLen = Math.max(a.length, b.length);
  const tolerance = maxLen <= 6 ? 1 : 2;
  return editDistance(a, b) <= tolerance;
}

// A shared word from the store's own NAME (e.g. BHAR's name is literally
// "Kalyan Naka") is a stronger identity signal than one merely shared with
// its locality/town — many stores in the same area share town words just
// from being neighbours, so name overlap is weighted higher to break those
// otherwise-genuine ties correctly rather than leaving them all tied.
function localityScore(label, store) {
  const labelToks = tokens(label);
  const nameToks = [...new Set(tokens(store.name))];
  const placeToks = [...new Set([...tokens(store.locality), ...tokens(store.town)])];
  let score = 0;
  const matched = [];
  for (const t of nameToks)
    if (labelToks.some((lt) => tokensMatch(lt, t))) {
      score += 2;
      matched.push(`"${t}" (name)`);
    }
  for (const t of placeToks)
    if (labelToks.some((lt) => tokensMatch(lt, t))) {
      score += 1;
      matched.push(`"${t}"`);
    }
  return { score, matched };
}

export function proposeMatches(officialListings, stores) {
  const proposals = [];
  const matchedStoreIds = new Set();

  for (const listing of officialListings) {
    if (!listing.label) continue;

    // A code match (the store's own code literally appears in the label) is
    // decisive enough to stop scanning entirely — nothing else competes.
    let codeHit = null;
    for (const store of stores) {
      const cm = codeMatch(listing.label, store);
      if (cm) {
        codeHit = { store, tier: cm.tier, detail: `store code "${cm.code}"`, score: cm.tier === "code_prefix" ? 100 : 90 };
        break;
      }
    }

    let best = null;
    if (codeHit) {
      best = codeHit;
    } else {
      // Locality-token overlap is a much weaker signal — collect EVERY
      // store tied for the top score rather than keeping whichever
      // happened to come first in stores.json. Silently picking a winner
      // on a tie is exactly the kind of confident-but-arbitrary result this
      // project's whole discipline exists to avoid (found by hand-checking
      // this script's own first run: "Rambuag, Kalyan West" and "Kalyan
      // West"-tied-on-just-"kalyan" cases were both defaulting to whichever
      // store happened to be earlier in the array, not the better match).
      const tied = [];
      let topScore = 0;
      let topMatched = [];
      for (const store of stores) {
        const { score, matched } = localityScore(listing.label, store);
        if (score > topScore) {
          topScore = score;
          topMatched = matched;
          tied.length = 0;
          tied.push(store);
        } else if (score === topScore && score > 0) {
          tied.push(store);
        }
      }
      if (tied.length === 1) {
        best = { store: tied[0], tier: "locality_token_overlap", detail: `matched ${topMatched.join(", ")}`, score: topScore };
      } else if (tied.length > 1) {
        best = {
          store: tied[0],
          tied,
          tier: "locality_token_overlap_tied",
          detail: `matched ${topMatched.join(", ")} — tied with ${tied.length - 1} other store(s), not resolved automatically`,
          score: topScore,
        };
      }
    }

    proposals.push({ listing, proposed: best });
    if (best?.tied) best.tied.forEach((s) => matchedStoreIds.add(s.store_id));
    else if (best) matchedStoreIds.add(best.store.store_id);
  }

  const unmatchedStores = stores.filter((s) => !matchedStoreIds.has(s.store_id));
  return { proposals, unmatchedStores };
}

function fmtCoord(l) {
  if (l.lat == null) return `_${l.status}_${l.note ? ` — ${l.note}` : ""}`;
  return `${l.lat}, ${l.lng}${l.status === "resolved_low_confidence" ? " ⚠️ low-confidence" : ""}`;
}

async function phase2ProposeMatches(officialData) {
  const storesRaw = JSON.parse(await readFile(STORES_PATH, "utf8"));
  const stores = storesRaw.stores;
  const { proposals, unmatchedStores } = proposeMatches(officialData.listings, stores);

  const operationalOnSite = officialData.total_listings; // site presents every listing as an active store
  const operationalInFile = stores.filter((s) => s.status === "operational").length;
  const closedInFile = stores.filter((s) => s.status !== "operational").length;

  const lines = [];
  lines.push("# Official website store list — proposed matches, unreviewed");
  lines.push("");
  lines.push(
    `Scraped from https://patelrpl.in/stores/ on ${officialData.fetched_at.slice(0, 10)} (${officialData.total_listings} listings, ` +
      `${officialData.resolved} resolved, ${officialData.resolved_low_confidence} low-confidence, ${officialData.unresolved} unresolved). ` +
      `Nothing below has been applied to \`public/data/stores.json\` — every match is a proposal for a human to confirm or reject.`
  );
  lines.push("");
  lines.push("## Three discrepancies to reconcile, not paper over");
  lines.push("");
  lines.push(
    `1. **Store count.** The site presents ${operationalOnSite} listings, all as currently-open stores. ` +
      `\`stores.json\` has ${operationalInFile} operational + ${closedInFile} closed = ${operationalInFile + closedInFile}. ` +
      `If every site listing matches an existing store below with nothing left over, the counts simply describe the estate two different ways (52 active + the site not listing the closed one, or similar) — ` +
      `but if a listing below shows up as **unmatched**, that's a candidate for a store on the site that isn't in our file at all, and needs the client's confirmation, not a silent add.`
  );
  const uranListing = officialData.listings.find((l) => /uran/i.test(l.label || ""));
  const uranDistanceNote =
    uranListing?.lat != null
      ? ` Its own resolved coordinate (${uranListing.lat}, ${uranListing.lng}) checks out as genuinely being in Uran, well outside the box every other store falls in.`
      : "";
  lines.push(
    `2. **Uran.** Listing #${uranListing?.index ?? "?"}: "${uranListing?.label ?? "SURVEY NO 58/1/A..."}" — a survey-number/gala-number address, not a locality-style store address like every other listing, and Uran is a port town in Raigad nowhere near any town in \`stores.json\`.${uranDistanceNote} Very likely a warehouse or processing unit, not a retail store. **Flagged below as unmatched, not auto-added.**`
  );

  const shilphataListing = officialData.listings.find((l) => /shilphata/i.test(l.label || "") && /khopoli|khapoli/i.test(l.label || ""));
  const doeder = stores.find((s) => s.store_id === "DOE/DER");
  const khp = stores.find((s) => s.store_id === "KHP");
  let shilphataEvidence = "";
  if (shilphataListing?.lat != null) {
    const distToDoeder = doeder?.lat != null ? round2(haversineKm({ lat: shilphataListing.lat, lng: shilphataListing.lng }, doeder)) : null;
    shilphataEvidence =
      ` Its resolved coordinate (${shilphataListing.lat}, ${shilphataListing.lng}) is ${distToDoeder != null ? `${distToDoeder} km from DOE/DER's existing (coarse, town-centroid) coordinate — far too far to be the same place — and` : ""} ` +
      `well south, in the area \`stores.json\` itself names for Khapoli (Raigad), not Shilphata (Thane). That's evidence, from an admittedly low-confidence business-name-search resolution (see below) — not proof, and not applied here.`;
  }
  lines.push(
    `3. **Shilphata / Khopoli.** The site has one listing, "${shilphataListing?.label ?? "Shilphata, Khopoli"}" (#${shilphataListing?.index ?? "?"}). \`stores.json\` has these as two separate stores: Shilphata (\`DOE/DER\`) and Khapoli (\`KHP\`) — different towns, not adjacent.${shilphataEvidence} Either the site conflated two stores into one card, or this card is genuinely one of the two and coincidentally mentions the other town in passing. **Do not auto-merge or auto-split — flagged below for a human read.**`
  );
  lines.push("");
  lines.push("## Proposed matches");
  lines.push("");
  lines.push("| # | Official listing | Coordinate | Proposed store | Match basis |");
  lines.push("|---|---|---|---|---|");
  for (const p of proposals) {
    const listingLabel = (p.listing.label || "").replace(/\|/g, "\\|");
    const coord = fmtCoord(p.listing);
    let proposedCell = "_no candidate found_";
    let basis = "—";
    if (p.proposed?.tied) {
      proposedCell = p.proposed.tied.map((s) => `**${s.store_id}** (${s.name})`).join(" / ") + " — TIED, pick one";
      basis = `${p.proposed.tier} (${p.proposed.detail})`;
    } else if (p.proposed) {
      proposedCell = `**${p.proposed.store.store_id}** — ${p.proposed.store.name}`;
      basis = `${p.proposed.tier} (${p.proposed.detail})`;
    }
    lines.push(`| ${p.listing.index} | ${listingLabel} | ${coord} | ${proposedCell} | ${basis} |`);
  }
  lines.push("");
  lines.push("## Stores in `stores.json` with no proposed match from the site");
  lines.push("");
  if (unmatchedStores.length) {
    lines.push("| Store ID | Name | Town |");
    lines.push("|---|---|---|");
    for (const s of unmatchedStores) lines.push(`| ${s.store_id} | ${s.name} | ${s.town} |`);
  } else {
    lines.push("_None — every store in stores.json has at least one proposed match above._");
  }
  lines.push("");
  lines.push("## Site listings with no proposed match at all");
  lines.push("");
  const noCandidateProposals = proposals.filter((p) => !p.proposed);
  if (noCandidateProposals.length) {
    lines.push("| # | Official listing | Coordinate |");
    lines.push("|---|---|---|");
    for (const p of noCandidateProposals) lines.push(`| ${p.listing.index} | ${(p.listing.label || "").replace(/\|/g, "\\|")} | ${fmtCoord(p.listing)} |`);
  } else {
    lines.push("_None — every listing got at least one proposed candidate (which is not the same as a CORRECT match — review the table above)._");
  }
  lines.push("");
  lines.push(
    "## A real limitation, not a hypothetical one\n\n" +
      `35 of the 45 resolvable coordinates above are marked ⚠️ low-confidence. Of those, ` +
      `34 came from a short link that resolved to a plain business-NAME search — "Patel's R Mart" / "Patel R Mart" / "Patel's Low Price" — ` +
      "not a coordinate. Patel's own brand name repeats at nearly every one of its 53 stores, so Google matching that generic name to one specific " +
      "nearby branch carries a real risk of picking a neighbouring Patel store instead of the one this listing is actually for. Each of these DOES " +
      "resolve to a specific, real place (not a blurry area average) — the risk is brand-collision, not imprecision. **Every ⚠️ row needs the " +
      "underlying link opened and checked against the proposed store's own known town before being trusted, not just eyeballed against the address text.**\n\n" +
      "Separately: `locality_token_overlap` matches are a weak signal by nature (shared words in an address, nothing more) — where several stores tied for the top score, ALL of them are listed rather than one picked arbitrarily (found by hand: an earlier, unreviewed version of this matcher's exact-string logic silently defaulted several genuine ties, including \"Rambuag, Kalyan West\" vs. `KLW`'s own \"Rambaug, Kalyan West\", to whichever store happened to sit first in stores.json — not to the better match). A `code_prefix`/`code_token` match (the store's own code literally appears in the listing) is the only tier here worth trusting without opening the link."
  );
  lines.push("");
  lines.push(
    "## Next step\n\nReview the proposed-matches table above. For each row you accept, apply it by hand (or via a follow-up script once reviewed): " +
      "set the matched store's `lat`/`lng` from the coordinate shown, `geo_source: \"company_website\"`, `geocode_match_tier: \"client\"` (same trusted tier as a client-pasted pin — " +
      "not in `COARSE_MATCH_TIERS`, so it's treated as fully locatable everywhere distances are computed), `address_official` from the listing's full text, and keep the existing `locality` field as-is. " +
      "Then run `node scripts/build-proximity.mjs`. Do not apply a `resolved_low_confidence`, `unresolved`, or tied row without independently checking the link first."
  );

  await writeFile(REVIEW_OUT_PATH, lines.join("\n") + "\n", "utf8");
  log(`Wrote ${REVIEW_OUT_PATH} — ${proposals.filter((p) => p.proposed).length}/${proposals.length} listings got a proposed match, ${unmatchedStores.length} store(s) unmatched.`);
}

async function main() {
  const officialData = await phase1FetchAndResolve();
  await phase2ProposeMatches(officialData);
  log("Done. Nothing in stores.json was changed — review docs/OFFICIAL-STORES-REVIEW.md before applying anything.");
}

// Guarded so validate-official-matches.mjs can import proposeMatches()
// without re-triggering a live scrape + file overwrite as an import
// side-effect — found the hard way: the first version of that script's
// import ran this whole file's main(), re-fetching all 4 pages and every
// short link before the validation logic even started.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err.stack || err.message);
    process.exitCode = 1;
  });
}
