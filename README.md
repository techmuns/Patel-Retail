# Patel Retail Dashboard

A dashboard for Patel Retail Ltd — a 53-store Thane–Raigad value-grocery
chain — built for an investment firm doing diligence on the company.

**Start here:** [`PATEL-HANDOFF.md`](./PATEL-HANDOFF.md) — what's in this
repo, where it came from, the data schemas, the decisions already made, and
the facts already established from the client's files (§9 especially).

## Status

- **Network map** (`public/index.html`, `public/js/map.js`): live. 50/53
  stores have coordinates, and **44/53 are precisely located** (up from 28
  before this round of work — see the official-stores-website bullet below)
  — the other 6 resolved only to a town centroid and correctly show as an
  uncertainty circle with "Distance unavailable," never a fabricated
  number (see PATEL-HANDOFF.md §15.1 — this was a real bug, now fixed). 3
  stores have no coordinates at all. KPI strip, town-cluster table, and the
  store slide-over's risk-score explainer are all live. A closed store's
  slide-over now says why its risk score is blank ("closed, not scored")
  instead of a bare dash; `proximity.json` emits all 1,378 possible pairs
  with a stated `unavailable_reason` on every suppressed one, not just the
  ones with a real distance. See PATEL-HANDOFF.md §22 and §24–25.
- **Official store locations from the client's own website** — built, run,
  mechanically validated against an explicit provenance hierarchy, and
  applied. `scripts/fetch-official-stores.mjs` pulls all 53 stores from
  patelrpl.in and proposes matches against `stores.json`
  (`docs/OFFICIAL-STORES-REVIEW.md`); `scripts/validate-official-matches.mjs`
  ranks every coordinate source (company website > client-supplied pin >
  our geocode of the website's address > our geocode of the client's
  locality string > town centroid) and lets a higher tier override a lower
  one once it clears a loose town-containment sanity check — checked
  against the store's own best available reference (its existing
  coordinate if it has one, precise or coarse, never a worse fresh town
  geocode), not against whichever value happened to be applied first
  (`docs/OFFICIAL-STORES-VALIDATION.md`).
  **34 of 53 cleared automatically and were applied**: 5 needed no checks,
  25 passed validation, 4 ties were broken mechanically (one via an
  explicit, human-confirmed town-spelling correction for `KHP`). **11
  single-match disagreements plus 2 unresolved ties need a human** —
  genuine conflicts the checks surfaced rather than resolved silently,
  including a real instance of the brand-collision risk the low-confidence
  flag was warning about (two different stores' listings briefly resolving
  to the same point, deliberately left untouched even though one of them
  passes its own sanity check) and one store (`BHAR`) proposed — and
  failing — on two different listings, worth a specific look. **7 never
  resolved to a coordinate** at all and need a link opened by hand; **1**
  (Uran) reads as a warehouse, not a store, and was never added.
  **Precisely-located stores: 28/53 → 44/53** — the real number, not
  rounded up. `docs/OFFICIAL-STORES-VALIDATION.md` ends with an 18-row
  final list — every remaining listing with its website address and map
  link, ready to open directly. See PATEL-HANDOFF.md §23–25 for the full
  mechanism and every check's actual distance.
- **Store economics** (`public/js/economics.js`): live — surfaces the
  area/sq ft estimate label, the ₹17,280-vs-₹22,079 revenue/sq ft
  discrepancy, and the 5.4%-vs-7.9% store/peer EBITDA reconciliation flag,
  per PATEL-HANDOFF.md §9.
- **Site screener** (`public/js/screener.js`): live — enter an address,
  client-side Nominatim geocode, distance to every own store (only ever
  computed against precisely-located ones), counts within 1/3/5km, and a
  go/no-go read using the identical risk formula as the map. Nearest-DMart
  is live too, now that `competitors.json` exists.
- **Competitors** (`public/data/competitors.json`): live — 18 DMart
  locations from OpenStreetMap's Overpass API (free, no key, no browser;
  see PATEL-HANDOFF.md §15.3 for why Overpass replaced an earlier Playwright
  draft — the query is anchored to exclude a "food mart" false-positive
  found and fixed this round). Not yet joined into the map's precomputed
  risk score — the Screener picks it up live, the map doesn't yet.
- **Getting the remaining 9 store locations right**: down from 25 at the
  start of this round. `docs/OFFICIAL-STORES-VALIDATION.md`'s "Final short
  list for hand review" is the single place to work from — 18 rows total
  (9 single-match disagreements + 2 unresolved ties + 7 that never resolved
  to a coordinate), each with its website address and map link to open
  directly, no re-deriving needed. Two of the 9 disagreements are really
  one story worth a specific look: `BHAR` was proposed — and failed its
  sanity check — on two unrelated listings ("Kalyan Bhiwandi Road" and
  "Kalyan Naka, Bhiwandi"), a weak `locality_token_overlap` match both
  times. [`docs/PINS-NEEDED.md`](./docs/PINS-NEEDED.md) (the earlier client
  ask) is the fallback if any of these links themselves turn out to be
  wrong. See PATEL-HANDOFF.md §16 and §23–25.
- **Estate & Vintage** (`public/js/estate.js`): live — openings by year,
  cumulative growth, age distribution, and a town-saturation table labelling
  each cluster "Fast-forming," "Still growing," or "Established" from its
  own opened-date spread. Surfaces a real discrepancy rather than hiding
  it: the handoff's "42% under 2 years" is a fixed calendar-year fact
  (22/53 opened 2024+); read as an actual rolling 2-year window as of
  today it's 28% (15/53) — both shown, with the reason for the gap stated
  on screen. The cumulative-growth chart's caption is now computed from the
  actual plotted count rather than hardcoded, so it can't silently drift
  from what's on screen (it read "all 53 stores" while plotting 52). See
  PATEL-HANDOFF.md §17 and §22.
- **Peer Benchmark** (`public/js/peers.js`): live — all 10 bugs from
  handoff §10 with an honest status each (fixed / partially fixed /
  confirmed harmless / not applicable / needs the source file re-opened).
  Trent's revenue **and now revenue/store** are corrected with real
  numbers; Spencer's gross profit is corrected; Osia Hyper Retail and V2
  Retail get an explicit "not supplied" card, not invented figures. See
  PATEL-HANDOFF.md §17.
- **Primary source files cross-verified** (`Patel_Retail_data_Munshot.xlsx`,
  `Peer_Model.xlsx`, the client's own spreadsheets, not the handoff's
  paraphrase of them): confirmed all 53 store codes match exactly; upgraded
  three unit-economics figures (margins, non-food/merchandise mix) to
  explicitly label them as range midpoints; tightened Vishal's private-label
  % to its exact value (60.7%, was rounded to 61%); added Patel's
  total-company revenue/EBITDA/PAT and showed the 7.9% EBITDA figure is
  identical at B2C or total-company level; confirmed Osia/V2 are genuinely
  absent from the peer model, not an omission on our end. See
  PATEL-HANDOFF.md §19.
- **PDF & Excel export**: live — the "Export PDF" / "Export Excel" buttons
  in the topbar. PDF reuses `report.js`'s donor pagination engine unchanged
  (measurement/split/pack + html2canvas→jsPDF) with new content
  (`public/js/patel-report.js`): cover, the full store table with a
  colour-coded precision badge, Estate & Vintage findings, the Peer
  Benchmark with corrections, and Unit Economics with both contested
  figures side by side (including the ~5,000 sq ft area-per-store estimate,
  which the PDF was dropping) — every reported/derived/estimate label
  survives into print. Excel (`public/js/patel-export-xlsx.js`) is three
  sheets — Store Master, Proximity (every one of the 1,378 possible pairs
  is a row now, each with its own "Unavailable" + specific reason where a
  distance can't be shown, never an omitted row or a blank), and Unit
  Economics (the derived store P&L as **live formula cells**, not a frozen
  snapshot). See PATEL-HANDOFF.md §20 and §22.
- **Peer concall pipeline** (`screener-test/`, `.github/workflows/analyze.yml`
  + `check-llm.yml`): ported from the donor, unmodified except identity text
  — the logic is company-agnostic, takes a ticker in and writes a tear sheet
  out. **Built and verified structurally, not run for real** — this sandbox
  can't reach Screener (Playwright has no outbound access here, as
  throughout this project) or call an LLM (no key available). What's
  actually verified — preflight fails closed, the pipeline reaches the
  Screener-login boundary cleanly with no earlier crash, and the pure
  scheduling/classification logic is confirmed correct against synthetic
  data — plus what a real run needs (secrets, and whether Patel Retail
  itself has a Screener page — genuinely unresolved, not assumed either
  way) is all in PATEL-HANDOFF.md §21. No cron trigger on purpose: this
  is a curated pull for five named peers, not the donor's auto-discovered
  board.
- **Full consistency audit** (every on-screen number checked against
  `stores.json`/`metrics.json`/`proximity.json`, every export checked
  against the screen, every "unavailable" state checked for a stated
  reason): found 14 real issues. The 4 most severe are fixed (above — the
  missing Excel pairs, the estate caption, the closed-store risk dash, the
  PDF's dropped area estimate). The other 10 are triaged, not fixed yet:
  the `reported`/`derived`/`estimate` kind-label isn't applied consistently
  on every screen (Estate & Vintage has none at all yet), store revenue is
  computed slightly differently in `economics.js` vs. the exports, one
  peer's revenue/store is rounded to a different precision on screen than
  in the PDF, `map.js` hand-copies logic that already lives in `geo.js`,
  and a couple of `metrics.json` note fields are computed but never
  rendered anywhere. Full list and reasons in PATEL-HANDOFF.md §22.
- **Not built**: a dedicated pair-distance table (screen 2 in handoff §8 —
  the map's cluster table and per-store risk score cover much of this
  already), reviews, B2B export — see handoff §8 for the full build order.
  Also not built by design: maturity curve, same-store sales growth, a
  store league table — these need monthly sales per store, which isn't
  available and isn't coming. Osia Hyper Retail / V2 Retail financials are
  still "not supplied" everywhere (including both exports) — they're
  public data this sandbox can't reach; see PATEL-HANDOFF.md §20. A
  dashboard screen for the concall pipeline's output isn't built either —
  no real data exists yet to show.

## Local development

```bash
python3 -m http.server 8000 --directory public       # serves the static site
node scripts/geocode.mjs                              # Nominatim, no key — fills remaining lat/lng
node scripts/apply-client-coords.mjs                   # apply pasted gmaps_link / lat,lng values
node scripts/verify-geocode.mjs                        # flags anything that needs a human look
node scripts/build-proximity.mjs                        # rebuild after any geocoding change
node scripts/fetch-dmart-overpass.mjs                    # refresh competitors.json

# Peer concall pipeline (needs real secrets — see PATEL-HANDOFF.md §21):
npm install --no-save playwright pdfjs-dist            # ad-hoc deps, matches the CI step; not committed
node screener-test/check-llm.mjs                        # preflight — run this first, always
TICKER=DMART node screener-test/analyze-company.mjs      # one company; TICKER must be the exact Screener slug
```
