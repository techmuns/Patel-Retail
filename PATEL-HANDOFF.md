# Patel Retail Dashboard — Build Handoff

**This is a NEW, SEPARATE repo.** The `ceekay-munshot/dakshamconcall` repo is a *donor* only — copy files out of it. **Never modify it, never commit to it, never dispatch its workflows.**

---

## 1. What we're building

A dashboard for **Patel Retail Ltd** — an Indian value-grocery chain (~52 stores across the Thane–Raigad belt: Ambernath, Badlapur, Dombivali, Kalyan, Bhiwandi, Ulhasnagar) plus a B2B spice and agro export arm.

The client is an **investment firm doing diligence** on Patel Retail — not the company itself. The dashboard has to look defensible, not promotional.

**The headline feature:** stop doing store-proximity and cannibalisation analysis by hand. Where is every store, which ones overlap, how far is the nearest DMart, and for a new site — who is already in that catchment.

---

## 2. First, the honest bit about "data from the concall repo"

**There is no Patel Retail data in it, and no retail peer data either.** `public/data/tearsheets.json` holds 68 analysed companies; Patel Retail, Avenue Supermarts (DMart), Vishal Mega Mart, Trent and Spencer's are all absent.

So nothing can simply be lifted. What's valuable is **the code, the design system, and the concall pipeline itself** — copy the pipeline into this repo and run it here, which gets Patel's concall data without touching the donor repo.

---

## 3. Copy list — exactly what to take from `dakshamconcall`

Clone it somewhere read-only (`git clone --depth 1`), copy these out, then forget it exists.

### Front-end — take as-is

| From | To | Notes |
|---|---|---|
| `public/js/ui.js` | `public/js/ui.js` | 124 lines, zero dependencies. `qs`, `qsa`, `escapeHtml`, `debounce`, `refreshIcons`, `gradientFor`, `initials`, `fmtDate` (already `en-IN`), `relTime`, `toast`. Use unchanged. |
| `public/css/styles.css` | `public/css/styles.css` | 2,580 lines. The whole design system. Every colour is a `:root` CSS variable — rebrand by swapping `--brand-*` / `--grad-*` only. |
| `public/assets/munshot-logo.png` + `.svg` | `public/assets/` | Used by the PDF export. |
| `.gitignore` | `.gitignore` | Already covers `node_modules`, `.env`, `.dev.vars`, `.wrangler/`. |

**Components already in `styles.css` — use these instead of writing new ones:**

| Class | For |
|---|---|
| `.kpi-grid` › `.kpi` › `.kpi-top` / `.kpi-label` / `.kpi-ico` / `.kpi-value` / `.kpi-delta` | KPI strip. Copy the markup from `public/index.html:131-171` |
| `.viewtabs` › `.vtab.active` | Module tabs. Markup at `public/index.html:74-81` |
| `.card` › `.card-head` / `.card-body` | Every panel |
| `.sheet` / `.sheet-hero` / `.sheet-scroll` / `.sheet-close` | Store detail slide-over |
| `.chip` `.badge` `.ltag` `.dirtag` | Status and provenance pills |
| `.table-scroll` `.feed-table` | Scrollable tables |
| `.heatmap` / `.hm-cell` / `.hm-legend` | Store × metric grid |
| `.skel` `.empty` `.placeholder-lines` | Loading and empty states |
| `.mesh` + `.mesh-veil` | Gradient background |
| `.fade-up` + `.d1`–`.d4` | Staggered entry |

Fonts: Space Grotesk (display) / Inter (body) / JetBrains Mono (mono), all via Google Fonts CDN.

### Front-end — copy and adapt

| From | Keep | Change |
|---|---|---|
| `public/js/report.js` (816 lines) | The A4 pagination engine — fixed pages, controlled breaks, tables pre-chunked so no row is ever cut, running header + page-numbered footer, html2canvas @2x → jsPDF. Constants `PAGE_W 794` `PAGE_H 1123` `PAD_X 54` `HEAD_TOP 82` `FOOT_ZONE 74`. Already branded *"Prepared by Munshot for Daksham Capital"*. | The content builder only. |
| `public/js/export-xlsx.js` (342 lines) | ExcelJS-via-CDN with clean CSV fallback (`if (typeof window.ExcelJS === "undefined") return exportCsv(model)`), banded sections, frozen header, autofilter, the `box()` border helper. | Sheet definitions → *Store Master* / *Proximity* / *Unit Economics*. |
| `public/js/progress.js` (309 lines) | localStorage-persisted jobs, single poller on `jobs.json`, stacked cards, survives reload, never fakes "done". | Stage labels. Only needed if you add a "refresh data" button. |

**Do NOT copy** `public/js/app.js` (1,819 lines) or `public/js/sectors.js` — concall-specific. Patterns only.

### Infrastructure — copy the shape

| From | Take |
|---|---|
| `wrangler.jsonc` | The whole config. Change `name`. Key part: `assets: { directory: "./public", binding: "ASSETS", not_found_handling: "single-page-application" }` — this is what serves the static site with no build step. |
| `worker/index.js` | The helpers: `ghHeaders`, `ghReadJson`, `ghWriteJson`, `ghDispatchWorkflow`, `b64encode`, `b64decode`, `json()`. That's the complete "commit JSON back from a Worker" mechanism. Also copy the router shape and the graceful-degradation style in `handleAnalyze` — it returns a friendly message when secrets are missing instead of 500-ing. Drop `/api/search` and `/api/analyze`. |
| `.github/workflows/analyze.yml` | The scaffold: `fetch-depth: 0` (needed for the push rebase-retry loop), Node 22, `npm install --no-save`, `npx playwright install --with-deps chromium`, `concurrency.group`, `permissions: contents: write`, artifact upload on `always()`, `TARGET_BRANCH: ${{ github.ref_name }}`. And the **cheap preflight step before expensive work** — it validates the LLM key before burning a metered API call. Do the same with the geocoding key. |

### The concall pipeline — only if you want Patel's concall data

`screener-test/` is six ES modules, ~150 KB total:

```
scrape-screener.mjs   41 KB   Playwright login + concall scraping
classify.mjs          36 KB   the 13-section framework classifier
analyze-company.mjs   38 KB   orchestrator
llm.mjs               24 KB   Bedrock primary, OpenAI fallback
discover.mjs         6.5 KB   finds companies with new concalls
check-llm.mjs        1.8 KB   the preflight
```

Copy the folder, plus `analyze.yml`, into this repo and run it **here**. You'll need the same secrets: `SCREENER_EMAIL` / `SCREENER_PASSWORD`, and `BEDROCK_API_KEY` or `OPENAI_API_KEY`.

Run it on **Patel Retail, Avenue Supermarts, Vishal Mega Mart, Trent, Spencer's**. That gives you:
- Patel's `MFG` section → plant capacity and utilisation
- The `SEG` sections → B2B vs B2C split and export commentary
- The `guidance_ledger` → guidance vs delivery across quarters

All three are things the client could not supply.

If that's too much lift for v1, **skip it** and build the map first — it isn't a dependency.

---

## 4. The output schema worth reusing

From `tearsheets.json`, per company:

```
company, ticker, industry, country, checked_at
quarters[] → concall_date, source, source_url, model, summary
             sections[]        { id, title, key_figures[], subsections[] }
             guidance_ledger[] { metric, horizon, statement, specificity, direction, status }
             risk_register[]   { risk, status, note }
```

Section ids: `FIN` · `SEG` (repeats per segment) · `TECH` · `MFG` · `MKT` · `STRAT` · `RISK` · `GUID`.

**Provenance — reuse this field, don't invent one.** `key_figures` entries already carry `kind: "reported"`. Extend it:

```json
{ "label": "Revenue per sq ft", "value": 17280, "unit": "INR/sqft/yr",
  "period": "FY26", "kind": "reported", "source": "client_file" }
```

`kind` ∈ `reported` | `derived` | `estimate`.

This matters because the client's stated objection was, verbatim: *"at the end it's an AI, I'm just trusting it."* Anything calculated or assumed must be visibly labelled on screen. Build a "highlight estimates" toggle — it's just a filter on `kind`.

---

## 5. Architecture for the new repo

```
Browser
  └── Cloudflare Worker (worker/index.js)
        ├── /api/*  → refresh trigger (optional, v2)
        └── else    → ./public via the ASSETS binding
              └── public/data/*.json ← the ONLY source of truth
                    ▲
              GitHub Actions commits JSON back
                    ▼
              Cloudflare auto-deploys on push
```

Rules inherited from the donor and worth keeping:
- **No build step.** Plain HTML + CSS + vanilla ES modules.
- **CDN libs with `typeof` guards** — the donor guards `window.echarts`, `window.jspdf`, `window.html2canvas`, `window.ExcelJS`, `window.lucide`. Match that; never assume a CDN loaded. Add `window.L` for Leaflet.
- **Committed JSON is the source of truth.** Nothing from a database at runtime.
- **Heavy work in Actions.** Geocoding, scraping, distance matrices — all precomputed. 53 stores = 1,378 pairs, trivial to precompute, keeps the browser instant.
- **Secrets only in Worker / Actions env.**

```
public/index.html
public/css/styles.css          ← copied
public/js/ui.js                ← copied
public/js/report.js            ← copied, new content builder
public/js/export-xlsx.js       ← copied, new sheets
public/js/map.js               Leaflet + store layer + competitor layer
public/js/proximity.js         nearest-neighbour, clusters, risk score
public/js/screener.js          new-site evaluation
public/js/economics.js         unit-economics model with sliders
public/js/peers.js             peer benchmark
public/data/
  stores.json  metrics.json  proximity.json  competitors.json  peers.json
scripts/geocode.mjs            one-off, caches into stores.json
scripts/scrape-dmart.mjs       Playwright
scripts/build-proximity.mjs
.github/workflows/refresh.yml
worker/index.js  wrangler.jsonc
```

---

## 6. Data schemas

**`stores.json`** — seeded already, see `stores.seed.json`. All 53 stores with a ready-made `geocode_query`; `lat`/`lng` are null until the geocode step runs.

```json
{ "store_id": "AMW", "name": "Station Rd Ambernath",
  "locality": "Station Road, Ambernath (W)", "town": "Ambernath West",
  "district": "Thane", "state": "Maharashtra",
  "status": "operational", "opened": "1990-01-14", "closed": null,
  "lat": null, "lng": null,
  "geo_confidence": "high", "geo_source": null,
  "geocode_query": "Station Road, Ambernath (W), Ambernath West, Thane, Maharashtra, India",
  "area_sqft": 5000, "area_kind": "estimate" }
```

`geo_confidence` counts in the seed: **high 33 · medium 17 · low 3.** Render low-confidence stores as an uncertainty circle, not a precise pin.

**`metrics.json`** — drives the economics model:
```json
{ "unit_economics": {
    "sqft_per_store": 5000, "revenue_per_sqft_year": 17280,
    "bills_per_day": 300, "avg_order_value": 800,
    "rent_per_sqft_month": 50, "utility_per_sqft_month": 35,
    "employees_per_store": 25, "avg_salary_month": 15000,
    "gross_margin_pct": 0.165, "private_label_pct": 0.175 },
  "revenue_mix": { "food": 0.70, "non_food": 0.205, "merchandise": 0.095 },
  "own_brand": { "indian_chaska_annual_cr": 2.2,
                 "in_own_stores_cr": 1.2, "outside_own_stores_cr": 1.0 },
  "kind": "reported", "source": "client_file_2026_08" }
```

**`proximity.json`** — all precomputed:
```json
{ "pairs": [{ "a": "BLEK", "b": "BLEB", "km": 1.4 }],
  "per_store": [{ "store_id": "BLEK",
    "nearest_own": { "store_id": "BLEB", "km": 1.4 },
    "own_within": { "1km": 1, "3km": 3, "5km": 4 },
    "nearest_competitor": { "banner": "DMart", "km": 3.2 },
    "competitors_within": { "1km": 0, "3km": 1, "5km": 2 },
    "overlap_risk": 0.72, "kind": "derived" }],
  "clusters": [{ "town": "Kalyan West", "stores": 5 }] }
```

---

## 7. Decisions already made

**Geocoding → Google Geocoding API.** 53 one-time lookups cost nothing and it beats Nominatim badly on Indian junction names. Cache into `stores.json` so it never re-runs. Hand-verify the three low-confidence rows.

**Competitors → Playwright-scrape DMart's store locator for v1.** Free, authoritative, and the workflow already installs Playwright. DMart is the threat the client named. Reliance Smart / Vishal / Star in v2 via Google Places. **v1 needs no Places key.**

**Isochrones → straight-line radii for v1.** At 1–2 km, where the real clusters sit, straight-line and drive-time rank almost identically; drive-time only matters past 5 km. No rate-limited dependency on the critical path. OSRM in v2.

**Map → Leaflet + OSM tiles.** No API key, CDN-loadable, fits the no-build-step rule.

---

## 8. Screens, in build order

1. **Network map** — 53 stores coloured by vintage (real data), competitor overlay. Click → slide-over with nearest own store, counts within 1/3/5 km, nearest DMart, modelled P&L.
2. **Proximity & cannibalisation risk** — pair table sorted by distance, town-cluster view, structural risk score labelled `derived`. Pin the closed Ambernath store as the one observed data point.
3. **Site screener** — enter an address → distance to every own store, competitor density, catchment overlap, go/no-go. *This is what the client actually asked for, and it needs no further data from them.*
4. **Store economics** — blended P&L with sliders on rev/sq ft, AOV, bills/day, rent, staff, gross margin. Must surface the reconciliation gap in §9, not silently pick a side.
5. **Estate & vintage** — openings by year, cumulative count, age mix, town saturation. All real data.
6. **Peer benchmark** — rebuilt, see §10.
7. **Reviews** — Google rating per store, then correlate against store age and cluster density.
8. **Export / B2B** — from concall tear sheets + the RHP.

Screens 1–3 are the deliverable. The rest is upside.

---

## 9. Facts already established — do not re-derive

From the client's two files (`Patel_Retail_data_Munshot.xlsx`, `Peer_Model.xlsx`):

**Estate.** 53 rows = 52 operational + 1 closed (Ambernath, `PRCAME/PRCAMEN`, closed 31-12-23). All leased. Thane 49 · Raigad 3 · Palghar 1. **31 distinct towns.**

**Vintage — 42% of the estate is under two years old.** 22 of 53 opened 2024 or later; 30 since 2020; only 21 before. Oldest: Station Road Ambernath West, 1990. By year: 2024 → 10, 2025 → 7, 2026 → 5.
*Consequence:* the blended ₹17,280/sq ft mixes mature and ramping stores. Headline growth is new-store-driven, not like-for-like. Any per-store metric applied uniformly is an `estimate`.

**Clusters — cannibalisation is visible without any sales data.** Kalyan West 5 · Dombivali East 4 · Badlapur East 4 · Ambernath East 4 · Bhiwandi 3 · Dombivali West 3 · Titwala / Kalyan East / Badlapur West / Ambernath West / Ulhasnagar 2 each · 20 towns with one store.

**Unit economics are internally consistent** — worth stating on the dashboard: 300 bills/day × ₹800 = ₹8.76 cr/store/yr; ₹17,280/sq ft × 5,000 sq ft = ₹8.64 cr. Agree within 1.4%.

**Unresolved reconciliation — surface it, don't hide it.** Built from their own metrics: revenue ₹864 L, gross profit ₹142.6 L @16.5%, less rent ₹30 L, utilities ₹21 L, staff ₹45 L → **store EBITDA ₹46.6 L = 5.4% of sales, before any head-office cost.** The peer model puts B2C EBITDA at 7.9%. Company-level cannot exceed store-level once overhead is added. Either the 45/55 revenue-based EBITDA split is the wrong allocation (likely — export probably carries the margin) or the unit metrics are conservative.

**Cross-file contradictions, still open with the client:**

| | Peer model | Store file |
|---|---|---|
| Store count | 49 | 52 (+1 closed); the call said 53 |
| Avg store size | 4,359 sq ft | 5,000 sq ft |
| **Revenue/sq ft** | **₹22,079** | **₹17,280** |
| Avg bill size | ₹907 | ₹800 |

**Other.** Private label **17.5%** — ~2× DMart's 8%, but far below Vishal 61% and Trent 74%, so "very high own-brand" doesn't survive peer context. Indian Chaska is ₹2.2 cr on ~₹449 cr retail (0.5%) — tiny, but ₹1 cr sells *outside* their own stores, which is brand behaviour not shelf-filling. B2C is only 45% of company revenue; the export arm is the majority.

**Not supplied, and not coming:** monthly sales per store, per-store sq ft, per-store rent, pincodes/coordinates, category split by store, export detail. The client has said he can't supply more. Don't design around data that won't arrive.

---

## 10. Peer model bugs to fix when rebuilding

- `B2` labels Avenue Supermarts as **"Avenue supermarket (Reliance)"** — that's DMart, a different company.
- **Trent is broken throughout.** Revenue (₹20,074 cr) and area (13 mn sq ft) are *all of Trent* — Westside + Zudio + Star — while store count (84) is Star Bazaar only. Gives avg store size 154,762 sq ft and revenue/store ₹239 cr, both impossible for a supermarket. Row 12 holds the right figure (₹3,400 cr) but never uses it.
- **`F15` bug** — Spencer's gross profit uses `=F13*F16` (private-label sales × margin) where every other column uses revenue × margin. ₹99.6 cr instead of ₹369 cr, understated 73%. Flows into rows 25 and 31.
- **`C28` is a live `#VALUE!`** because row 32 holds the text "NA".
- **Patel cities/states swapped and wrong** (rows 7–8: "1 city, 17 states"). Truth: 31 towns, 1 state, 3 districts.
- Vishal private label is `=78385.79/10`, an unexplained hardcode. Patel SSSG (row 47) is hardcoded 8% with no quarterly backup while peers average real quarters. Rows 26 and 29 duplicate. "EBIDTA" misspelled throughout.
- Patel's private-label % and gross-margin % are **both 0.17**, so rows 13 and 15 give an identical ₹80.17 cr and read like a copy-paste error. Use 0.175 and 0.165.
- **Add Osia Hyper Retail and V2 Retail** — the only peers near Patel's scale. A 52-store chain benchmarked solely against 500/795/120-store chains isn't a benchmark.

---

## 11. Gotchas inherited with the CSS

- **`body { overflow: hidden }`** — the shell never scrolls, only `.content` does. A full-height map must sit inside `.content` with an explicit height; it cannot rely on page scroll.
- **Leaflet needs `invalidateSize()`** when its container becomes visible after a tab switch, or you get the classic half-rendered grey map.
- **`refreshIcons()` after every `innerHTML` write**, or Lucide icons render as empty `<i>` tags.
- Every CDN library is `typeof`-guarded in the donor code. Keep that discipline.

---

## 12. First session, concrete steps

1. Create the new repo. `git clone --depth 1` the donor somewhere read-only.
2. Copy the §3 files across. **Make zero commits to `dakshamconcall`.**
3. Drop in `stores.seed.json` → `public/data/stores.json`.
4. Write `scripts/geocode.mjs`, run it over `geocode_query`, fill `lat`/`lng`, commit the result.
5. Write `scripts/build-proximity.mjs` → `proximity.json`.
6. Build `public/index.html` on the copied `.kpi-grid` / `.viewtabs` / `.card` classes, importing `ui.js` unchanged.
7. Ship the map + store slide-over. Then proximity, then the site screener.

**Do not** invent a new design system, a new provenance scheme, or a new deployment pattern — all three come across in the copy.

---

## 13. Copy log — what's actually landed in this repo (donor → here)

Status as of the scaffolding session, kept here instead of a separate doc so provenance stays in one place.

| File(s) in this repo | Source in `dakshamconcall` | Status |
| --- | --- | --- |
| `public/css/styles.css` | `public/css/styles.css` | Copied unchanged. |
| `public/js/ui.js` | `public/js/ui.js` | Copied unchanged. |
| `public/js/report.js` | `public/js/report.js` | Copied unchanged **so far** — still needs a Patel-specific content builder per §3; the pagination engine itself is untouched. |
| `public/js/export-xlsx.js` | `public/js/export-xlsx.js` | Copied unchanged — sheet definitions still need to become *Store Master* / *Proximity* / *Unit Economics* per §3. |
| `public/assets/munshot-logo.png`, `.svg`, `README.md` | `public/assets/` | Copied unchanged. |
| `.gitignore` | `.gitignore` | Copied unchanged. |
| `wrangler.jsonc` | `wrangler.jsonc` | Copied, then `name` changed to `patel-retail-dashboard` (was `daksham-concall-tracker`) so a deploy can't collide with the donor's live Cloudflare Worker. |
| `worker/index.js` | `worker/index.js` | Copied; only cosmetic identifiers renamed (`User-Agent`, health-check `service` string) so far. **`/api/search` and `/api/analyze` are still the donor's concall routes and have not been dropped/replaced yet** — do that before deploying (§3 says drop them; not done). |
| `.github/workflows/analyze.yml` | `.github/workflows/analyze.yml` | Copied as a shape template only, with a header comment flagging that every step still references the donor's Screener/OpenAI scraper and secrets. Not reworked into `refresh.yml` yet. |
| `screener-test/` (6 files) | `screener-test/` | **Not copied.** Optional per §3; skipped for v1 since the map doesn't need it. |
| `public/js/app.js`, `sectors.js`, `progress.js` | same | **Not copied**, per §3 (concall-specific; `progress.js` only needed if a refresh button gets added later). |

**Data landed this session:**

| File | Source | Notes |
| --- | --- | --- |
| `public/data/stores.json` | `stores.seed.json` (attached) | All 53 stores, verbatim to start. `lat`/`lng` now filled for 49/53 — see §14. |
| `public/data/metrics.json` | This doc's §6/§9 | The reported unit-economics inputs, the two conflicting revenue/sq ft figures, and the peer-model EBITDA claim — copied as given here, not re-derived. |
| `public/data/proximity.json` | Generated by `scripts/build-proximity.mjs` | Town clusters fully populated (no geocoding needed — straight from each store's `town` field, and the counts match §9's own numbers exactly: Kalyan West 5, Dombivali/Badlapur/Ambernath East 4 each, etc.). 1,176 of the possible 1,378 pairwise distances are now real (the rest involve the 4 still-ungeocoded stores). |

## 14. Geocoding run — what's real, what's still approximate

Ran `scripts/geocode.mjs` for real, Nominatim (no key). Ladder result:

| Match quality | Count | What it means |
| --- | --- | --- |
| `exact` | 17 | The store's own `geocode_query` resolved directly. Trustworthy. |
| `locality` | 3 | Resolved on `locality, district, state` (still address-level). Trustworthy. |
| `structured` | 1 | Resolved via Nominatim's structured street/city form after free text failed. Trustworthy. |
| `manual` | 7 | Automatic ladder landed on a town centroid shared with other stores; hand re-queried with a narrower string, cross-checked district + plausible distance from the centroid, accepted. See below. |
| `town` / `town_base` | 21 | **Town-centroid fallback — not the store's own location.** Multiple stores in the same town land on the identical point. Rendered on the map as an uncertainty circle, not a pin (`scripts/verify-geocode.mjs` flags every one of these). |
| *(ungeocoded)* | 4 | `KBG`, `NSR`, `KMR`, `KHP` — zero results at every fallback tier, including for `KHP` (Khapoli) with no bounding box at all. Nominatim's OSM data just doesn't have these indexed under any name tried. |

**The 7 manual corrections** (`geo_source: "manual_review"`, `geocode_match_tier: "manual"`): `NWM`, `DSR`, `BKHE`, `BLEB`, `BLEK`, `BWM`, `AME`. For each, re-queried Nominatim with a narrower locality-only string than the ladder tried, then accepted the result only if its district matched the store's own `district` field AND it landed a plausible distance from the existing town centroid (not always the top result — several candidates were **rejected** as false positives, e.g. a bare "Shirgaon" query resolved to a same-named village 82km away in Palghar, not the Badlapur one; "Station Road" alone resolved to Mumbai). This is real research-tool cross-checking, not a rubber stamp — every accepted point is individually justified in `stores.json`'s `geocode_review_note` field, and every rejected candidate is simply absent (no fabricated coordinate took its place).

**What this fixed concretely:** the worst collision — 6 different Ambernath stores (`AMSN`, `AMCH`, `AME`, `AML`, `AMPL`, `AMW`) all landing on the exact same point — is down to 5 (only `AME` extracted; no confident independent match was found for the other 5, including `AMW`, despite trying). The Badlapur East 4-way collision (`BES`, `BKHE`, `BLEB`, `BLEK`) is down to 1 (`BES` still coarse).

**Still open — genuinely needs either a human with local knowledge, a site visit, or a paid geocoder:**
- 21 stores still at a town/town_base centroid (see `scripts/verify-geocode.mjs` output for the current list — re-run it, this list will have shrunk further if anyone does more manual passes).
- 4 stores (`KBG`, `NSR`, `KMR`, `KHP`) have no coordinates at all yet.
- `map.js` renders every coarse-tier match as a dashed uncertainty circle (not a pin) regardless of the store's own `geo_confidence`, specifically so this imprecision is visible on screen rather than silently plotted as if precise.
- A `GOOGLE_MAPS_API_KEY` would very likely do better on the addresses that failed here (per the original §7 decision) — `scripts/geocode.mjs` picks it up automatically and only re-tries stores still missing `lat`/`lng`, so setting the key and re-running is non-destructive to what's already been manually verified.
