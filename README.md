# Patel Retail Dashboard

A dashboard for Patel Retail Ltd — a 53-store Thane–Raigad value-grocery
chain — built for an investment firm doing diligence on the company.

**Start here:** [`PATEL-HANDOFF.md`](./PATEL-HANDOFF.md) — what's in this
repo, where it came from, the data schemas, the decisions already made, and
the facts already established from the client's files (§9 especially).

## Status

- **Network map** (`public/index.html`, `public/js/map.js`): live. 49/53
  stores geocoded (Nominatim, no key needed — see PATEL-HANDOFF.md §14 for
  the full breakdown and the manual corrections applied). 21 of those 49 are
  still a town-centroid approximation and render as an uncertainty circle,
  not a pin; 4 stores have no coordinates yet. KPI strip, town-cluster
  table, and store slide-over (with the risk-score explainer) are all live.
- **Store economics** (`public/js/economics.js`): live — surfaces the
  area/sq ft estimate label, the ₹17,280-vs-₹22,079 revenue/sq ft
  discrepancy, and the 5.4%-vs-7.9% store/peer EBITDA reconciliation flag,
  per PATEL-HANDOFF.md §9.
- **Site screener** (`public/js/screener.js`): live — enter an address,
  client-side Nominatim geocode, distance to every own store, counts within
  1/3/5km, and a go/no-go read using the identical risk formula as the map.
  Nearest-DMart stays "not available yet" until competitor data lands.
- **Competitors**: `scripts/scrape-dmart.mjs` is drafted but **unverified**
  — DMart has no public locator for its physical stores, only a "DMart
  Ready" pickup-point finder, and this sandbox's headless browser can't
  reach the outbound internet at all, so the scraper's selectors have never
  been run against the live site. Read its header comment before using it.
- **Not built**: estate & vintage screen, peer benchmark rebuild, reviews,
  export/B2B — see handoff §8 for the rest of the build order. Also not
  built by design: maturity curve, same-store sales growth, a store league
  table — these need monthly sales per store, which isn't available and
  isn't coming.

## Local development

```bash
python3 -m http.server 8000 --directory public   # serves the static site
node scripts/geocode.mjs                          # Nominatim, no key — fills remaining lat/lng
GOOGLE_MAPS_API_KEY=... node scripts/geocode.mjs   # or the more precise provider
node scripts/verify-geocode.mjs                    # flags anything that needs a human look
node scripts/build-proximity.mjs                   # rebuild after geocoding changes
```
