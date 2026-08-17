# Patel Retail Dashboard

A dashboard for Patel Retail Ltd — a 53-store Thane–Raigad value-grocery
chain — built for an investment firm doing diligence on the company.

**Start here:** [`PATEL-HANDOFF.md`](./PATEL-HANDOFF.md) — what's in this
repo, where it came from, the data schemas, the decisions already made, and
the facts already established from the client's files (§9 especially).

## Status

- **Network map** (`public/index.html`, `public/js/map.js`): live. 49/53
  stores have coordinates, but only **28/53 are precisely located** — the
  other 21 resolved only to a town centroid and correctly show as an
  uncertainty circle with "Distance unavailable," never a fabricated
  number (see PATEL-HANDOFF.md §15.1 — this was a real bug, now fixed).
  4 stores have no coordinates at all. KPI strip, town-cluster table, and
  the store slide-over's risk-score explainer are all live.
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
- **Getting the remaining 25 store locations right — the critical path
  right now**: [`docs/PINS-NEEDED.md`](./docs/PINS-NEEDED.md) is the actual
  client ask, grouped by cluster (densest first). Don't run more geocoding
  passes until it comes back — see PATEL-HANDOFF.md §16. Once it does:
  paste each link into the matching store's `gmaps_link` field and run
  `node scripts/apply-client-coords.mjs`.
- **Estate & Vintage** (`public/js/estate.js`): live — openings by year,
  cumulative growth, age distribution, and a town-saturation table labelling
  each cluster "Fast-forming," "Still growing," or "Established" from its
  own opened-date spread. Surfaces a real discrepancy rather than hiding
  it: the handoff's "42% under 2 years" is a fixed calendar-year fact
  (22/53 opened 2024+); read as an actual rolling 2-year window as of
  today it's 28% (15/53) — both shown, with the reason for the gap stated
  on screen. See PATEL-HANDOFF.md §17.
- **Peer Benchmark** (`public/js/peers.js`): live — all 10 bugs from
  handoff §10 with an honest status each (fixed / partially fixed / not
  applicable / needs the source file re-opened). Trent's revenue and
  Spencer's gross profit are corrected with real numbers; Osia Hyper Retail
  and V2 Retail get an explicit "not supplied" card, not invented figures.
  See PATEL-HANDOFF.md §17.
- **Not built**: a dedicated pair-distance table (screen 2 in handoff §8 —
  the map's cluster table and per-store risk score cover much of this
  already), reviews, export/B2B — see handoff §8 for the full build order.
  Also not built by design: maturity curve, same-store sales growth, a
  store league table — these need monthly sales per store, which isn't
  available and isn't coming.

## Local development

```bash
python3 -m http.server 8000 --directory public       # serves the static site
node scripts/geocode.mjs                              # Nominatim, no key — fills remaining lat/lng
node scripts/apply-client-coords.mjs                   # apply pasted gmaps_link / lat,lng values
node scripts/verify-geocode.mjs                        # flags anything that needs a human look
node scripts/build-proximity.mjs                        # rebuild after any geocoding change
node scripts/fetch-dmart-overpass.mjs                    # refresh competitors.json
```
