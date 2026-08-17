# Patel Retail Dashboard

A dashboard for Patel Retail Ltd — a 53-store Thane–Raigad value-grocery
chain — built for an investment firm doing diligence on the company.

**Start here:** [`PATEL-HANDOFF.md`](./PATEL-HANDOFF.md) — what's in this
repo, where it came from, the data schemas, the decisions already made, and
the facts already established from the client's files (§9 especially).

## Status

- **Network map** (`public/index.html`, `public/js/map.js`): renders once
  stores are geocoded. Live now: KPI strip, town-cluster table, store
  slide-over. Pending: `scripts/geocode.mjs` needs a real
  `GOOGLE_MAPS_API_KEY` to run — no store has coordinates yet, so the map
  shows its "not geocoded" empty state until then.
- **Store economics** (`public/js/economics.js`): live — surfaces the
  area/sq ft estimate label, the ₹17,280-vs-₹22,079 revenue/sq ft
  discrepancy, and the 5.4%-vs-7.9% store/peer EBITDA reconciliation flag,
  per PATEL-HANDOFF.md §9.
- **Not built**: site screener, estate & vintage screen, peer benchmark
  rebuild, reviews, export/B2B — see handoff §8 for the rest of the build
  order. Also not built by design: maturity curve, same-store sales growth,
  a store league table — these need monthly sales per store, which isn't
  available and isn't coming.

## Local development

```bash
python3 -m http.server 8000 --directory public   # serves the static site
GOOGLE_MAPS_API_KEY=... node scripts/geocode.mjs  # fills in lat/lng, once
node scripts/build-proximity.mjs                  # rebuild after geocoding
```
