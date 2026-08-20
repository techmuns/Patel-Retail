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
| `screener-test/` (6 files) | `screener-test/` | Copied, byte-identical except one header comment, once the coordinate work went client-blocked and this became the largest remaining unblocked value — see §21. |
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

**Still open — genuinely needs either a human with local knowledge, a site visit, or the client:**
- ~21 stores still at a town/town_base centroid (see `scripts/verify-geocode.mjs` output for the current, authoritative list — it shrinks as more corrections land).
- 4 stores (`KBG`, `NSR`, `KMR`, `KHP`) have no coordinates at all yet.
- `map.js` renders every coarse-tier match as a dashed uncertainty circle (not a pin) regardless of the store's own `geo_confidence`, specifically so this imprecision is visible on screen rather than silently plotted as if precise.
- **Superseded recommendation, kept for history:** this section used to suggest a `GOOGLE_MAPS_API_KEY` as the next step. §15 below changes that — asking the client for the ~24 remaining pins directly is cheaper and more authoritative than another automated pass, so that's the actual next step now, not a paid API key.

## 15. Distance suppression, client-supplied coordinates, and DMart via Overpass

Three fixes/changes from a review of the first geocoding pass — read this before touching `scripts/build-proximity.mjs`, `map.js`, or `screener.js`'s distance logic.

### 15.1 Fabricated distances were a real bug, now fixed

The first geocoding pass computed haversine distance between town-centroid coordinates same as any other pair. Consequence: the 5-way Ambernath collision (`AMSN`/`AMCH`/`AME`†/`AML`/`AMPL`/`AMW`, † `AME` since manually corrected) reported **"0.0 km apart, overlap_risk 1.00"** between stores whose real distance from each other is unknown — a confident-looking number with nothing behind it, in exactly the intra-town question (cannibalisation) this dashboard exists to answer. An uncertainty circle on the map doesn't fix this: people read the number in the slide-over, not the circle's presence.

**Fixed in `scripts/build-proximity.mjs`, `public/js/geo.js`, `map.js`, `screener.js`:**
- `public/js/geo.js` now exports `isLocatable(store)` / `isCoarseTier(tier)` — the single source of truth for "is this store's own position trustworthy enough to measure to/from." A tier of `"town"` or `"town_base"` is not; everything else (`exact`, `locality`, `structured`, `manual`, `client`) is.
- `proximity.json` `pairs[]`: any pair where **either** store isn't locatable gets `km: null, precision: "town_centroid"` instead of a computed number. Pair count metadata now reports `pairs_with_real_distance` vs `pairs_suppressed_town_centroid` separately.
- `proximity.json` `per_store[]`: `nearest_own` / `own_within` are computed **only** against other locatable, operational stores — never against a coarse one, and never at all if the store itself isn't locatable. Each entry now also carries `locatable_others` and `total_other_operational`, so "N of M stores locatable" can be shown honestly instead of a bare count with no denominator. `overlap_risk` is `null` (not a low number, not zero — `null`) whenever its inputs are unavailable.
- The map's KPI strip headlines **"Precisely Located"** (the locatable count), not the raw geocoded count, since a town-centroid match technically "has coordinates" but isn't a location — the first number on screen shouldn't overstate confidence.
- The store slide-over and the Site Screener both show **"Distance unavailable"** with the specific reason (not geocoded yet / only located to town centre / no locatable neighbours to compare against) wherever a figure would otherwise appear, instead of silently showing "—".
- The Site Screener's own distance table lists every store (locatable or not — "distance to every own store" is a literal promise), sorts locatable ones nearest-first, and sinks unavailable ones to the bottom rather than mixing them in.

Verified with a synthetic-coordinate test before touching real data: 3 clustered precise stores got real, distinct risk scores (0.96/0.93/0.93); 3 coincidentally-coplaced coarse stores got `locatable: false, overlap_risk: null` — not a fabricated 1.00. Re-ran against the real (58% coarse) dataset afterward: **28/53 stores are now correctly reported as precisely located** (down from a misleadingly-inflated 49/53 "geocoded" figure last round — geocoded and precisely-located are not the same thing, and the KPI strip now says so).

### 15.2 Client-supplied coordinates (the cheap, authoritative fix)

Query-ladder geocoding has hit its ceiling — more automated passes were not attempted after this review, per instruction. Instead: **the client can drop a pin on Google Maps for the ~24 still-approximate stores and paste the link** — minutes of his time, and authoritative rather than inferred.

- Every store in `stores.json` now has an optional `gmaps_link` field (`null` by default).
- **To use it:** paste a Google Maps link (long share link, the address-bar URL after opening a pin, or a `maps.app.goo.gl` short link — all handled) or a bare `"lat, lng"` string into a store's `gmaps_link`, then run `node scripts/apply-client-coords.mjs`. It sets `lat`/`lng`, `geo_source: "client"`, `geocode_match_tier: "client"`, and is safe to re-run (a corrected link overwrites the old point — client input always wins, unlike `geocode.mjs`'s ladder which skips anything already filled in).
- Short-link resolution (`maps.app.goo.gl/...`) works over a plain HTTP redirect fetch — no browser needed. **Verified against a real live short link** during this session (not just the long-URL regex patterns): it resolved to a `.../search/lat,+lng` URL shape that the first version of the parser didn't handle, which is exactly why that pattern is now in the list — found by testing against something real, not assumed to work.
- `scripts/verify-geocode.mjs` now excludes `geo_source: "client"` stores from all four checks entirely — that's authoritative input, not an inference to second-guess. It reports how many were trusted-without-checking in its summary line.
- A parsed coordinate outside the Thane–Raigad–Palghar box still prints a loud warning (a mis-paste is possible even from a trusted source) but is applied anyway — the check is a nudge to double-check, not a veto over client input.

### 15.3 DMart via Overpass, not Playwright

`scripts/scrape-dmart.mjs` (the Playwright draft) is **deleted**. Confirmed this session: DMart has no public locator for its physical stores — only a "DMart Ready" pickup-point finder, a different thing (same finding as before, now acted on instead of hedged around). Replaced with `scripts/fetch-dmart-overpass.mjs`, which queries OpenStreetMap's Overpass API — free, no key, no browser, plain HTTP (which this sandbox can already do, unlike a headless browser reaching arbitrary sites).

Query, run verbatim as specified:
```
[out:json];
node["shop"="supermarket"]["name"~"DMart|D-Mart|D Mart",i]
  (18.6,72.7,19.8,73.6);
out;
```

**Run for real this session** (the public Overpass instance is shared infrastructure and flaky — took 1–3 retries via the script's built-in backoff, not a config problem). First run (unanchored `"DMart|D-Mart|D Mart"` name regex, exactly as first specified): `public/data/competitors.json`, **19 locations**, 13 confirmed by an OSM `brand="DMart"` tag. Inspecting the 6 unconfirmed ones found a genuine false positive: a "food mart" in Navi Mumbai matches `"D Mart"` as a case-insensitive **substring** of "foo**d mart**" — the pattern had no anchor. **Fixed** by anchoring it to the start of the name — `"^[Dd][- ]?[Mm]art"` — and re-run: **18 locations**, same 13 brand-confirmed, and a before/after diff confirms exactly one row removed (the "food mart" node, osm `3217172641`) and nothing else changed. The remaining 5 unconfirmed rows are legitimately DMart-shaped names (`"Dmart"`, `"D Mart"`, `"d-mart"`) that just lack a `brand` tag in OSM — `brand_tag_confirms_dmart` still flags them for a human to spot-check rather than the script asserting either way. `DMART-014` carries OSM `branch: "Ambernath"` — a real DMart sitting close to Patel's densest cluster.

**Completeness caveat, stated plainly:** 13–18 DMart locations across the whole Thane–Raigad–Palghar box is plausible but almost certainly an undercount — OSM coverage is community-maintained, not authoritative. Cross-checking against Avenue Supermarts' own annual report store count for Maharashtra is the right next step and hasn't been done (no access to that report from here) — noted as an open item, not silently skipped.

**Caveat, stated in `competitors.json` itself, not hidden:** OSM coverage is community-maintained and incomplete — absence of a DMart here doesn't mean one doesn't exist; treat this as a lower bound.

**Deliberately not done this round** (scope discipline — the ask was to fix the distance bug first and land this data, not build a new feature on top of it): `nearest_competitor` / `competitors_within` are still not joined into `build-proximity.mjs` or the risk score. The Site Screener's live view *does* pick up `competitors.json` automatically (it already had the code to, from before this data existed) and shows a real "Nearest DMart" figure now — but the composite risk score itself still only blends the two own-store components, and says so on screen.

## 16. The client-pin request (docs/PINS-NEEDED.md)

Per §15.2's mechanism, the actual ask went out as [`docs/PINS-NEEDED.md`](../docs/PINS-NEEDED.md) — a numbered table of the 25 unlocated stores (21 coarse-tier + 4 fully ungeocoded), grouped by cluster with the densest first (Ambernath 5, Badlapur 2, Kalyan 3, Dombivali 2, an unnamed-but-real Ulhasnagar pair, then 11 true singles), plus instructions for dropping a Google Maps pin and pasting the link. **This is the critical path now** — don't run more geocoding query ladders against the remaining stores; wait for the client's links, then `apply-client-coords.mjs` → `build-proximity.mjs` → `verify-geocode.mjs`.

## 17. Estate & Vintage and Peer Benchmark — built while the pins are pending

Both need zero geocoding, so they landed this round instead of more automated location-guessing.

**Estate & Vintage** (`public/js/estate.js`, factored age-math into `public/js/vintage.js` so map.js and this screen share one bucket definition): openings-by-year (pre-2020 grouped into one bar, then 2020–2026 individually), a cumulative-count curve (inline SVG, no charting library), age distribution, and a town-saturation table for every 2+-store town — labelled "Fast-forming," "Still growing," or "Established" purely from each cluster's own opened-date spread (Bhiwandi: 3 stores, first Feb-2024, 2 of 3 within the last 2 years → fast-forming; Ambernath East: 4 stores, last opened 2019, none recent → established).

**A real discrepancy surfaced and reconciled, not hidden:** §9 says "42% of the estate is under two years old," which is exactly 22/53 (opened 2024 or later) — a fixed calendar fact. Recomputed live as an actual rolling "opened in the trailing 2 years, as of today," the number is 15/53 = 28%, smaller, because the 2024 cohort keeps aging past the 2-year mark while the calendar-year count doesn't move. **Both are shown on screen, side by side, with the reason for the gap stated plainly** — the same "don't pick one silently" discipline as the revenue/sq ft discrepancy on Store Economics — rather than either quietly repeating the now-loosely-accurate 42% or quietly replacing it with 28% and losing the original finding.

**Peer Benchmark** (`public/js/peers.js`, data in `metrics.json`'s new `peer_model_bugs` / `peer_model_corrections` / `peer_scale_gap` keys): all 10 bugs from §10, each with an honest status — `fixed` (Trent's *revenue* — corrected to ₹3,400cr using the model's own unused row 12; Spencer's gross profit — corrected to ₹369cr; Patel's footprint — 31 towns/1 state/3 districts, verified live against `stores.json`, not just quoted; Patel's private-label/gross-margin — 17.5%/16.5%; the Reliance mislabel and the misspelling), `partially_fixed` (Trent — revenue fixed, but its area and store count are still Trent-wide, not Star-Bazaar-specific, so no corrected avg-store-size or revenue/store is shown — that needs the source spreadsheet, not a guess), `not_applicable` (Vishal's private-label hardcode — this dashboard uses the reported 60.7% directly, not the broken formula; Patel's SSSG — not built here at all, by design, no monthly sales data), `confirmed_harmless` (the duplicate rows 26/29 — verified byte-for-byte identical, nothing downstream reads row 29 separately) and `needs_source_file` (the `#VALUE!` cell — no correct value was ever given, only that the current one is wrong). See §19 for the primary-source re-verification that upgraded several of these from secondhand quotes to cell-checked facts.

**Osia Hyper Retail and V2 Retail — genuinely not supplied.** No financial data for either exists anywhere in this handoff or anywhere else this session could reach. Per the same rule as everything else in this project: not fabricated. `peer_scale_gap` in `metrics.json` names them and states plainly that real figures are the next step, not a placeholder to fill with an estimate.

## 18. A real CSS parsing bug, found and fixed this round

Not a data-honesty issue, but worth recording because it was sneaky: adding a 5th tab (Estate & Vintage) pushed the header's "Highlight estimates" toggle off-screen at normal desktop widths — `styles.css`'s `.viewtabs` is `flex-shrink: 0` (fine for the donor's original 2 tabs, not fine for 5). The fix (`.topbar .viewtabs` becomes the flexible, internally-scrollable element in `patel.css`) looked right but silently had no effect. Root cause, found by inspecting the live `CSSStyleSheet.cssRules` in a headless browser: `patel.css`'s very first comment block contained the literal text `--brand-*/--text-*` — the `*` immediately followed by `/` is a **real CSS comment-closing token**, closing that comment several lines early. Everything from there until the next parseable rule boundary silently vanished from the stylesheet, with no console error, no visual break in anything already relying on `styles.css` — it only became visible once a *new* rule happened to land in the corrupted span. Fixed by rewording that comment (commas instead of slashes) and adding `@charset "UTF-8";` as the file's first line as a second, independent layer of insurance (this session's local test server sends `Content-Type: text/css` with no charset, which was mangling the file's em-dashes — a separate, real risk on top of the comment bug, worth guarding against regardless of what the real Cloudflare host sends). **Lesson for future editors of `patel.css`: never write `-*/` or `*/`-shaped text inside a comment, even by accident of adjacent punctuation** — verify the fix by checking `cssRules.length` in a browser, not just visually, since a swallowed rule fails silently.

## 19. Primary source files received — cross-verified cell by cell, not re-quoted

This round the client sent the two actual source files — `Patel_Retail_data_Munshot.xlsx` and `Peer_Model.xlsx` — rather than us continuing to work from this handoff's prose paraphrase of them (§9, §10). Both were dumped with `openpyxl` in two passes (formulas, then cached values) and checked line by line against everything already built. The point of this exercise: find out whether anything already on screen was subtly wrong, and add precision only where the primary source actually supports it — not to change any figure that was already right.

**Store file (`Patel_Retail_data_Munshot.xlsx`), confirmed exactly as before:**
- All 53 store codes in `stores.json` match the file's column F one-for-one, including the single closed store (`PRCAME/PRCAMEN`, "Closed 31-12-23" in cell G54) — checked by automated diff, not spot-check.
- Nothing exists in the file beyond what was already captured: columns A–G (store roster), I2 ("no stores shut except 1"), K2–K19 (unit economics), P2/P5–P8 (upcoming-stores note, and the explicit "this data isn't available with me" for export figures). No per-store sqft/rent/sales anywhere — confirms that gap is real, not an oversight on our end.
- `L19` (private-label sales, 0.175) is a single exact figure, not a range — matches what was already used.

**Store file, upgraded for precision:** three unit-economics inputs were being displayed as flat numbers but are actually stated as *ranges* in the source, with the midpoint silently chosen and not labelled as such: "Margins" `L18` = **16–17%** (16.5% used), "Non food" `L14` = **20–21%** (20.5% used), "Merchandise" `L15` = **9–10%** (9.5% used). `metrics.json` now carries a `*_note` field next to each explaining it's a midpoint of a stated range, and both the range and the resolution are visible on screen — the same "don't silently pick one number" rule already applied to the revenue/sq ft contradiction now applies here too.

**Peer model (`Peer_Model.xlsx`), verified and upgraded (all cell references below checked directly against the file, not the earlier secondhand summary):**
- **Trent revenue/store is now correctable, not just revenue.** Row 39 in the model itself notes store count 84 is "*only for star bazaar" — so once revenue is corrected to ₹3,400 cr (row 12), revenue/store is a valid ₹40.48 cr (₹4,047.62 lakh), not the impossible ₹238.98 cr the broken model implied. Area (13 mn sq ft) is still all-of-Trent, so avg store *size* still can't be corrected — that half of `partially_fixed` stands.
- **Vishal's `D13 = 78385.79/10` is not actually unexplained.** It evaluates to ₹7,838.58 cr, which equals `D11×D14` (₹12,906 cr revenue × 60.74% private-label share) to within rounding — a real, internally consistent number that was pasted in as a result instead of written as a live formula, so it silently goes stale if `D11`/`D14` ever change. Status stays `not_applicable` (this dashboard doesn't show Vishal's private-label sales in ₹cr, only the %), but the bug's characterization is upgraded from "unverifiable" to "verified consistent, just not formula-driven."
- **Rows 26/29 confirmed byte-for-byte identical** (same label, same formula, same values in every column) and nothing downstream reads row 29 separately — reclassified from `needs_source_file` to `confirmed_harmless`.
- **`C28`'s `#VALUE!` root cause confirmed exactly:** `(C11×10^7)/(C32×10^5)`, where `C32` holds the text `"NA"`. Trent's own bill-cut count was simply never filled in — still `needs_source_file`, now with the precise formula on record.
- **Vishal's private-label % tightened** from the rounded 61% to the exact `D14` value, 60.74% — shown in both the Store Economics peer-comparison bars and the Peer Benchmark screen.
- **Patel's total-company figures newly surfaced:** revenue ₹1,048 cr, EBITDA ₹83 cr, PAT ₹39.1 cr, with the B2C column (`E11/E17/E19`) built as exactly 45% of each. Worth stating plainly: the 7.9% EBITDA-margin figure that clashes with store-level economics is mathematically identical whether read at B2C-only or total-company level (37.35/471.6 = 83/1048 = 7.92%, since the 45% factor cancels out of the ratio) — so it isn't an artifact of the B2C split, it's a company-wide number. Added to `store_pnl_reconciliation` in `metrics.json` and surfaced on the Store Economics reconciliation flag.
- **Osia Hyper Retail and V2 Retail confirmed genuinely absent** — checked all 47 rows of the actual file this time, not just the handoff's prose. `peer_scale_gap`'s "not supplied" status is unchanged, now with a note that it was directly verified rather than inferred.
- One thing noticed but deliberately **not** flagged as a confirmed bug: Vishal's avg bill size (`D28` = 800, hardcoded) is identical to Patel's own store-file AOV (also 800). Could be coincidence, could be a copy-paste from the wrong column — there's no way to tell from the file alone, so it isn't asserted as an error anywhere in the dashboard, just noted here for whoever next has access to Vishal's actual disclosures.

Nothing above changes what's used in the dashboard's headline figures — every correction already on screen (Trent revenue, Spencer's gross profit, Patel's footprint, the 0.17 copy-paste) checked out exactly as previously documented. This round only tightened precision and closed the gap between "quoted from the handoff" and "read from the client's own file directly."

## 20. PDF and Excel export — wired up, per §3's original plan

§3 said to copy `report.js`'s pagination engine and `export-xlsx.js`'s sheet-building patterns and change only the content. That's what this round does — the two donor files sat unused since round one; this makes them live.

**`report.js` — surgically refactored, not rewritten.** The measurement/split/greedy-pack algorithm (`packBlocksIntoPages`, newly extracted and exported — previously inlined in `composePages`) and the canvas-batching/jsPDF-assembly loop inside `exportReportPdf` are byte-identical in behaviour to before; the only change is that both now accept an override (`composePagesFn`, `getFileName`) that defaults to the original concall-tear-sheet path, so nothing about the existing function signatures broke. `loadLogo`, `logoMark`, `injectStyles`, and the page-size constants (`PAGE_W`/`PAGE_H`/`PAD_X`/`HEAD_TOP`/`FOOT_ZONE`/`CONTENT_W`/`CONTENT_H`/`BLOCK_GAP`) are now exported so a second content builder can reuse them instead of redefining the same geometry.

**`public/js/patel-report.js` (new)** is that second content builder — cover (estate summary tiles: store count, precisely-located count, the contested revenue/sq ft, the contested EBITDA), the full 53-store table with a colour-coded precision badge (green *Precise* / amber *Town centroid* / rose *Not geocoded*) and `geo_source`, Estate & Vintage findings (the same 22-of-53-vs-15-of-53 dual figure as the screen, age-distribution table, town-saturation table), the Peer Benchmark (all 10 bugs with status, Trent's revenue **and now revenue/store** correction, Spencer's, the Osia/V2 not-supplied card with its "where to get it" note, Patel's contested figures), and Unit Economics (revenue/sq ft side by side, a **live-computed** store P&L using the identical formula as `economics.js`, the reconciliation flag with the total-company framing note, revenue mix with range-midpoint labelling, private-label peer comparison). Every reported/derived/estimate label that exists on screen has a matching print badge — the provenance discipline survives the export.

One real bug found and fixed in this round, worth recording: a table-only block (no `<p>`/`<ul>` inside) that exceeds one page's height falls through `splitToFit`'s text-splitting fallback, which searches for a `p`/`.rpt-card-body`/`.rpt-risk-note` selector and, finding none, clones the **whole block** repeatedly while only ever mutating a paragraph that isn't there — silently corrupting the table into duplicated/truncated fragments with no console error (the same *class* of silent-corruption bug as the CSS comment issue in §18, different mechanism). Fixed by chunking every table into page-sized row groups before pushing it as a block (`chunk(items, N)`, mirroring `report.js`'s own `chunk(figs, 16)` pattern) rather than ever handing the pagination engine a single oversized table. Verified by rendering all 8 (now 7, after a column-width fix shortened one row) pages to PNG and reading them, not just checking `innerText` — a first pass of automated text-content checks gave false negatives from CSS `text-transform: uppercase` on badges (`innerText` reflects rendered case) and a wrong expected decimal precision, both fixed in the test, not the product, once the screenshots confirmed the content was actually correct and complete.

**`public/js/patel-export-xlsx.js` (new)**, self-contained (no import from `export-xlsx.js` — the two share no data shape) — three sheets:
- **Store Master**: all 53 stores, coordinates, a computed precision tier, `geocode_match_tier`, `geo_confidence`, `geo_source`, area. Frozen header, autofilter.
- **Proximity**: all 1,176 emitted pairs. A `null` km renders as the literal string `"Unavailable"` plus a full-sentence reason in the adjacent column — never a blank cell, matching the map/screener rule in §15.1.
- **Unit Economics**: the reported inputs as blue hardcoded-input cells (xlsx-skill convention), and the derived store P&L as **live formula cells** (`=ROUND(B3*B4/100000,2)` etc.) referencing those input cells directly — not a frozen snapshot. Change the area or revenue/sq ft input in the delivered file and the whole P&L recalculates in Excel. Cached results are set alongside every formula (rounded to match what the formula itself will produce on recalculation) so the file reads correctly even before Excel's own recalc runs. Verified formula-by-formula against `metrics.json`'s `store_pnl_reconciliation` by hand (all six matched exactly) — LibreOffice's own headless recalc (`recalc.py`) timed out twice in this sandbox on the full file (likely the 1,176-row Proximity sheet), a sandbox resource limitation noted here rather than treated as a defect, same as the Playwright/internet limitation elsewhere in this project.

**Where they're wired:** two buttons in the topbar (`#exportPdfBtn`, `#exportXlsxBtn`), styled with the donor's existing `.btn.ghost.sm`, disabled + spinner while running, reporting success/failure via the existing toast system rather than failing silently if a CDN library didn't load.

**Not done, on purpose:** Osia Hyper Retail and V2 Retail still show "not supplied" everywhere, including in both exports — this round added a `where_to_get_it` note (they're publicly listed; annual reports / exchange filings / Screener.in) rather than inventing figures, since this sandbox has no live internet access to pull and verify them. That is the one remaining action item the client's earlier message named directly ("I'll get them").

## 21. The concall pipeline, ported — built and verified structurally, NOT run

The coordinate work is now client-blocked (docs/PINS-NEEDED.md, still outstanding). This was the largest remaining piece of value that wasn't, so `screener-test/` (6 modules, ~148 KB) plus `analyze.yml`/`check-llm.yml` are copied in from `ceekay-munshot/dakshamconcall`, unmodified except identity/branding text — the pipeline logic itself needed **zero changes** to point at different companies, because it already takes a ticker in and writes a tear sheet out with nothing Daksham-specific baked into the logic (confirmed by grepping all 6 files for "daksham": exactly one hit, a docstring comment, now reworded).

**What changed, and why:**
- The one docstring comment in `analyze-company.mjs` and the workflow file headers — cosmetic, but also used to record where this came from and what to watch for (see below).
- `git config user.name` in `analyze.yml`: `daksham-bot` → `patel-retail-diligence-bot` (it's the commit author for automated commits; leaving the old name would misattribute them).
- **The nightly cron trigger is removed, on purpose.** The donor's schedule exists so "the board fills itself" across every BSE-listed company via `discover.mjs`'s announcement-feed scan — a different product goal than this repo's, which is a curated pull for five named peers for one diligence engagement. Leaving the cron in would silently turn this repo into a miniature version of the donor's whole tracked-company product, spending Screener/LLM quota on companies nobody asked about. `workflow_dispatch` (manual, one ticker at a time) is the only trigger now. `discover.mjs` itself is still copied and untouched — it's harmless to have, and available if a future round genuinely wants auto-discovery — it's just not wired to run on its own.

**What this unlocks, precisely** (the client's characterization was close but not exact — worth being precise since this dashboard's whole discipline is precision): `classify.mjs`'s fixed 11-section schema (`SECTIONS`, unchanged) gives `MFG` (capacity/utilization — the plant data the client said outright he doesn't have) and `guidance_ledger` (guidance vs. delivery, finalized deterministically in code via `diffGuidance`, not left to the model) exactly as described. The domestic/export split lives in **`GEO`** ("domestic/export split, regions, channels, new markets"), not `SEG` — `SEG` is segment/brand/division revenue and mix, which is where a B2B-vs-B2C split would land if the source discusses it. Worth knowing which section to read once real data lands, rather than searching the wrong one.

**Verified in this sandbox (evidence, not assertion):**
- All 6 `.mjs` files and both workflow YAMLs parse cleanly (`node --check`, `yaml.safe_load`).
- `check-llm.mjs` fails closed with no key set, printing which providers it checked — exactly the preflight behaviour the workflow depends on:
  ```
  [llm] no provider key set
  keys present: BEDROCK_API_KEY=no OPENAI_API_KEY=no (preferred: openai)
  FAIL — No LLM key set — provide BEDROCK_API_KEY or OPENAI_API_KEY
  ```
- `analyze-company.mjs` runs end-to-end up to the real boundary and stops there cleanly, both with `TICKER=TRENT` set and in refresh mode — no earlier crash, no silent swallow:
  ```
  [analyze] [llm] no provider key set
  [analyze] browser/login init failed: No Screener credentials set (need SCREENER_PREMIUM_EMAIL/SCREENER_PREMIUM_PASSWORD or SCREENER_EMAIL/SCREENER_PASSWORD)
  ```
- The pure, network-free logic was exercised against synthetic data, not just imported: `isConcallFiling`/`candidatesFrom` (discovery filtering + de-dup, newest-filing-wins), `planDay` (daily-cap pacing, carries yesterday's pending forward), `cycleKey`/`currentCycle`/`isCurrent` (the forward-running-cycle math) — all produced the expected output against hand-built fixtures.
- Unexpected but real: `discoverConcalls()`'s plain `fetch()` call to BSE's public announcements API actually reached the internet from this sandbox and returned live data (14 real filings) — this sandbox's network restriction is specifically on Playwright's browser process (confirmed repeatedly all session), not on Node's own `fetch`. Doesn't change anything decided above (the cron is still off, for product-scope reasons, not because discovery can't run) — just worth recording accurately.
- Local testing needed `npm install --no-save playwright pdfjs-dist` first (matching the CI step exactly) since this repo, like the rest of it, commits no `package.json`/`node_modules` — done in an isolated scratch copy, never inside this repo, and cleaned up after.

**NOT verified — needs a real CI run with real secrets, and this is not asserted as working:**
- Screener login and scraping (`launchAndLogin`, `scrapeCompany`) — this sandbox's Playwright cannot reach any outbound site (established all session; confirmed again here).
- The LLM structured-output call itself (`llmStructured`) — no `BEDROCK_API_KEY`/`OPENAI_API_KEY` available here.
- Classification quality on real transcripts/summaries — entirely unexercised.
- **Whether Patel Retail itself has a Screener.in page at all — genuinely unresolved, not an assumption.** An earlier draft of this section asserted Patel Retail is privately held; that was never actually established anywhere in this project and the client corrected it directly — "53 outlets as per the latest filing" and the pointer to "refer annual reports, transcript" for the export data (§9) both cut the other way, since concall transcripts only exist for a listed company. Resolve this with `resolveTicker(context, "Patel Retail")` — already exported from `scrape-screener.mjs` for exactly this — once real credentials exist, and keep Patel in the run alongside the four peers. If it genuinely has no Screener page, report that back as a finding for the client, not something to have assumed upfront.
- Exact Screener ticker slugs for the four listed peers. Reasonably confident from general knowledge, **not checked against the live site**: `DMART` (Avenue Supermarts), `TRENT` (Trent Ltd). Genuinely uncertain: Vishal Mega Mart (IPO'd Dec 2024 — slug not confirmed) and Spencer's Retail (commonly `SPENCERSRETAIL` or similar — not confirmed). `resolveTicker(context, companyName)` is already exported from `scrape-screener.mjs` for exactly this — whoever runs this with real credentials should resolve names to slugs first rather than guess from this list.
- Whether Osia Hyper Retail or V2 Retail have Screener.in concall coverage — plausible, unverified. If either does, this pipeline may close the "not supplied" gap in §17/§19 without a separate manual pull.

**Secrets needed for a real run** (`workflow_dispatch` inputs plus repo secrets, same names as the donor): `SCREENER_EMAIL`/`SCREENER_PASSWORD` (or the `_PREMIUM_` pair), and one of `BEDROCK_API_KEY`/`OPENAI_API_KEY`. Run `check-llm.yml` first — it is the preflight, cheap, and tells you which provider answered before any Screener quota is spent.

**Not built this round, deliberately:** a dashboard screen to display `tearsheets.json` once it exists. There's no real data yet — building a UI now would mean either an empty state or something invented to fill it, and the whole point of this pipeline is real, sourced concall data. Once a real run lands data for the five companies, wiring a Peer Concalls view is the natural next step, not started here. Still not started, per standing instruction: the reviews layer (needs a Places key not available) and the B2B/export screen (needs the RHP).

## 22. Consistency audit — three real bugs fixed, more triaged

A full audit (four independent passes: map/screener, economics/peers, estate, PDF/Excel-vs-screen, each verified by hand afterward rather than trusted at face value) found 14 disagreements. The three that would embarrass in front of the client are fixed here; the rest are triaged into a priority list for the next round.

- **Estate & Vintage's cumulative-chart caption was wrong.** Said "all 53 stores," the chart only plots 52 — the closed store (`PRCAME/PRCAMEN`) has no `opened` date to plot. Fixed to compute the real count live (`estate.js`'s `renderCumulativeChart` now writes `#cumulativeChartCaption` itself: "52 of 53 stores — 1 excluded (no recorded opening date)"), not a second hardcoded number that could drift the same way again.
- **The closed store's risk score showed a bare "—" with no reason.** `build-proximity.mjs` deliberately doesn't score risk for a closed store ("nothing left here for another store to cannibalise" — a real, good reason, previously only a code comment). Now carried as data (`per_store[].risk_unavailable_reason: "closed"`) and surfaced in `map.js`'s slide-over: "No risk score — this store is closed (31 Dec 2023). There's nothing left here for another store to cannibalise, so a score isn't computed."
- **The PDF dropped the 5,000 sq ft area estimate entirely** — present on screen (KPI + dedicated callout, both `data-kind="estimate"`) and in the Excel, silently absent from `patel-report.js`'s Unit Economics section despite the printed store P&L being built on exactly that number. Added, with its estimate badge, ahead of the P&L table it feeds.
- **202 of 1,378 possible store pairs were missing from `proximity.json` and the Excel Proximity sheet entirely — not shown as unavailable, just absent as rows.** `build-proximity.mjs`'s pair loop only ever iterated the 49 *geocoded* stores; pairs touching any of the 4 fully-ungeocoded stores were never emitted at all. An absent row is worse than a null one — nothing tells a reader it should exist. Fixed: the loop now runs over all 53 stores, every pair gets a row, `unavailable_reason` is `"not_geocoded"` or `"town_centroid"` (never both, never neither, whenever `km` is null — verified: 0 inconsistent pairs across all 1,378). `pairs_suppressed_not_geocoded` (202) sits alongside the existing `pairs_suppressed_town_centroid` (798) in `metadata`. The Excel sheet's header now cites `total_possible_pairs` directly and gives each reason its own status text instead of one hardcoded string.

**Triaged, not fixed this round** (kept as a punch list, not lost): a systemic gap where `data-kind`/`kind-pill` labelling exists only on the handful of components it was first built for (`map.js`'s KPI strip/cluster table, `screener.js`'s KPI strip/table, `estate.js` — the entire screen — and several `economics.js`/`peers.js` callouts all render figures with no kind label); the Excel's store-P&L revenue formula (`area × revenue/sq ft`, live) and the screen's/PDF's (`store_pnl_reconciliation.revenue_l` read directly) are two different computations that only agree because the JSON was hand-kept consistent; Trent's revenue/store figure rounds to a different number of decimals on screen (0) than in the PDF (1); `map.js` hand-copies the coarse-tier test inline instead of importing `isCoarseTier()` from `geo.js`, despite that file's own docstring claiming it's the shared source of truth; the PDF hardcodes "16–17%"/"20–21%"/"9–10%" as literals instead of reading the same `*_note` fields the Excel builder already reads; `private_label_pct_note` and `peer_model_b2c_ebitda_kind` exist in `metrics.json` and are never rendered anywhere.

## 23. Store locations from the client's own website — a much better source than more geocoding

`docs/PINS-NEEDED.md` is still outstanding — but the client pointed out the obvious alternative: patelrpl.in/stores/ lists all 53 stores with a "Get Directions" link each, fetched in 4 pages (`?jsf=jet-engine&pagenum=1..4`, 15+15+15+8). Plain `fetch()` reaches it — no browser needed, same as the BSE announcements feed and Overpass turned out to work in this sandbox.

**`scripts/fetch-official-stores.mjs`** (new) runs two phases:

1. **Fetch + resolve.** Parses every store card **per-card**, not via two separate global regexes zipped together by position — 2 of the 53 cards (`KBG`, `Vangani East`) have no "Get Directions" link at all on the live site, which would have silently shifted every subsequent card's coordinates onto the wrong name under the naive approach (caught before writing the real script, by diffing a per-card parse against the two-global-regex one). Writes the untouched raw result to `public/data/stores-official.json` — nothing matched or interpreted yet.
2. **Propose matches** against `stores.json`, writing `docs/OFFICIAL-STORES-REVIEW.md`. **Never auto-accepts a match and never writes to `stores.json`** — this run stops there, per instruction, for a human to review first.

**Coordinate extraction found two real, non-hypothetical fabrication risks along the way — both hand-caught by inspecting this script's own first real run, not by inspecting the site beforehand:**

- **A `/maps/dir/` (directions) URL's `@lat,lng,Nm` is the VIEWPORT needed to fit both endpoints on screen, not a pin** — 21–46 km wide on real listings here. The generic parser (borrowed from `apply-client-coords.mjs`, which was written for simple "you clicked a pin" URLs) matched this as high-confidence before the fix; a `/dir/` URL now only ever considers its unquoted origin segment, downgraded to `resolved_low_confidence`.
- **A short link resolving to a business-NAME search — "Patel's R Mart" / "Patel R Mart" / "Patel's Low Price," which repeat at nearly every one of Patel's 53 stores — carries a real risk of Google matching a neighbouring branch, not the intended one.** 34 of 45 initially-"resolved" coordinates were this shape (confirmed concretely: two different short links, both searching the generic phrase, resolved to the exact same coarse viewport while carrying different place-specific `!3d!4d` pairs — proof the brand-name collision is real, not theoretical). All 34 are downgraded to `resolved_low_confidence` with the specific reason stated. Final tally: **11 resolved / 35 low-confidence / 7 unresolved**, not the "45 resolved" a naive first pass would have reported.

**The name-matching heuristic (`scripts/fetch-official-stores.mjs` phase 2) had its own real bugs, found by hand-checking specific rows, not assumed correct because it ran without error:**

- Exact-string token matching missed spelling/transliteration variants ("Rambuag" vs. `KLW`'s own "Rambaug") and spacing differences ("Anjurphata" vs. `Bap`'s "Anjur Phata") — both were proposing the generic-Bhiwandi store `KBG` instead. Fixed with a small Levenshtein-distance tolerance plus a space-stripped substring check.
- **Ties were silently resolved to whichever store happened to sit first in `stores.json`**, not the better match — found because "Vijay Nagar Kalyan (East)" (unambiguously `KET`, whose own `locality` field is nearly that exact string) was proposing `BHAR` ("Kalyan Naka") instead, purely because `naka`/`nagar`/`chowk` were being stripped as filler words, leaving both addresses as just "kalyan" — the single most common town word in this dataset. Fixed two ways: those three are junction/neighbourhood names, the actually-distinguishing part of a local address, and were removed from the stopword list; and genuine ties are now **all listed** ("`KET` / `BHAR` / `AMSN` / `AML` — TIED, pick one") rather than one being picked arbitrarily. A store's own `name` field, when it's a real descriptive phrase rather than just its code, is now weighted higher than a locality/town word for exactly this reason (`BHAR`'s name literally is "Kalyan Naka").

**Three discrepancies the client asked to be reconciled, not papered over — all in `docs/OFFICIAL-STORES-REVIEW.md`, with evidence, not just flagged:**

1. **Store count** — the site presents all 53 as open; `stores.json` has 52 operational + 1 closed. Every site listing got a proposed match (0 unmatched stores in `stores.json`, 1 unmatched site listing — see below), so this is very likely two ways of describing the same 53, not a missing store — but it's stated as a live check, not asserted.
2. **Uran** (listing #1: "SURVEY NO 58/1/A HISSA NO 4684GALA NO.1,2,3,4 URAN,PIN CODE:-400702") — its own resolved coordinate genuinely sits in Uran, a Raigad port town nowhere near any store in `stores.json`, and the address format (survey/gala/PIN, no locality) matches nothing else on the site. Very likely a warehouse or processing unit. **Flagged as unmatched, not auto-added.**
3. **Shilphata / Khopoli** — the site has one combined listing. Its resolved coordinate is 48.32 km from `DOE/DER`'s (Shilphata) existing town-centroid coordinate, and sits in the area `stores.json` itself names for `KHP` (Khapoli) — real, computed evidence, though from a low-confidence business-name resolution, so stated as evidence, not fact. **Not auto-merged or auto-split.**

**Not done, per instruction:** nothing has been written to `stores.json`, and `build-proximity.mjs` has not been re-run against new coordinates. `docs/OFFICIAL-STORES-REVIEW.md` needs a human pass — especially every ⚠️ row and every TIED row — before anything from `stores-official.json` gets applied.

## 24. Official-stores matches, validated mechanically instead of eyeballed, and applied

§23 left 35 low-confidence rows for a human to open one by one. Rather than hand-review each, `scripts/validate-official-matches.mjs` runs three mechanical checks against every listing that needs one (the 35 low-confidence coordinates, plus a few `resolved`-coordinate rows whose *match* was still the weak `locality_token_overlap` tier — full coordinate confidence doesn't excuse a weak identity match), cheapest and most decisive first:

1. **Containment.** Compare the listing's coordinate against the matched store's own known location — its already-geocoded precise point where one exists (28/53 stores, free, no network call, tightest radius at 1km), or its `town` field geocoded fresh otherwise (5km radius — a town can be several km across, so this is a sanity check, not a precision claim).
2. **Duplicate detection.** Scanned across every listing that resolved to a coordinate at all (46 of 53), not just the low-confidence ones — the brand-collision worry makes a specific, testable prediction (two different stores landing on the same point), so this checks for it directly.
3. **Cross-validation.** The website's own richer address text (several include pincodes the client's file doesn't) hadn't been used for anything before this — only its map links. Geocoding that text independently via Nominatim and comparing it against the short-link-resolved coordinate is a genuinely separate second source.

A listing is auto-trusted only if it clears containment or cross-validation *and* isn't caught in a duplicate cluster. One important refinement, found by hand-checking the first run's output before trusting it: when a store already has a precise coordinate, cross-validation alone isn't allowed to override a containment failure against that existing point — cross-validation there is really just a second derivation of the *new* source agreeing with itself, not a second independent source. `SHD` (Station Road, Shahad) hit exactly this: the website's coordinate and an independent re-geocode of the website's own address agreed with each other to within 240m, while both disagreed with `SHD`'s existing "exact"-tier coordinate by 2.39km — a real conflict between two provenances, correctly left for a human rather than resolved silently either way.

**Results, run against the live site again (identical to §23's data — confirmed by diff, only the fetch timestamp moved):**

- **5** needed no checks at all (store-code match + unambiguous coordinate).
- **21** passed containment and/or cross-validation and were promoted to trusted.
- **3** of the 6 tied matches (§23) were broken mechanically — exactly one candidate's own reference point contained the coordinate, the others didn't (`KET` vs. `BHAR`/`AMSN`/`AML` for "Vijay Nagar Kalyan (East)"; `DOM` vs. `DWK` for "Manpada Road"; `PRCAME/PRCAMEN` vs. `AMW` for "Station Road, Ambernath West").
- **13 + 3 = 16** genuinely need a human — real disagreements (containment or cross-validation actively failed, not just inconclusive), the `SHD` contradiction above, the `Kopar Road`/`Rajaji Path` duplicate pair (see below), and 3 ties containment couldn't isolate to a single winner. Full detail, every check's actual distance, in `docs/OFFICIAL-STORES-VALIDATION.md`.
- **7** still never resolved to a coordinate — listed with the site's own address text and short link for a human to open directly (unchanged from §23).
- **1** (Uran) still has no candidate store — unchanged from §23.

**The duplicate check caught the brand-collision fear actually happening once:** listing #41 "Rajaji Path, Dombivali East" (a low-confidence business-name-search match proposed against `DOE/DER`) resolved to a coordinate 0.2km from listing #38 "Kopar Road, Dombivali West"'s (a different, unrelated store, `DOW`). Both are flagged for a human rather than either being trusted — this is precisely the risk §23 named as hypothetical, now showing up as a concrete pair.

**Applied — 29 stores** (the 5 + 21 + 3 above): `lat`/`lng` set from the site coordinate, `geo_source: "company_website"`, `geocode_match_tier: "client"` (same trusted tier as a client-pasted pin), `address_official` set to the listing's full text, `locality` left as the client's original wording — exactly the field mapping `docs/OFFICIAL-STORES-REVIEW.md` specified. `build-proximity.mjs` re-run afterward.

**Precisely-located stores: 28/53 → 40/53.** Not 44, not "near-complete," not 53 — 40, honestly, with the other 13 either needing a human look at a real disagreement or a hand-opened link. `proximity.json`: 780/1,378 pairs now carry a real distance (was 378), 396 suppressed as town-centroid (was 798), 202 still suppressed as not-geocoded (unchanged — those are the 4 stores with literally no coordinate). Verified: `node --check` on every touched script, `JSON.parse` on every touched data file, `scripts/verify-geocode.mjs` re-run clean (only already-known coarse-tier stores flagged, nothing new), and a headless-browser load of the live page confirming the KPI strip and `proximity.json`'s own metadata agree on 40/53 with no page errors.

Also fixed in passing: importing `fetch-official-stores.mjs` for its `proposeMatches()` function was re-running that file's entire `main()` as an import side-effect (re-scraping the live site, re-resolving every short link, overwriting `stores-official.json` and the review doc) — caught by diffing those files after the first validation run and seeing only the fetch timestamp had moved. Fixed with a standard `import.meta.url === file://${process.argv[1]}` entry-point guard; `node scripts/fetch-official-stores.mjs` run directly is unaffected.

**Discrepancy #3 (Shilphata/Khopoli) is still unresolved, correctly** — containment rules `DOE/DER` out decisively (48.32km) but doesn't clear `KHP` (its town didn't geocode cleanly), so the tie-break couldn't isolate a winner and it stays flagged for a human, same as §23 left it.

## 25. §24's "existing coordinate wins" rule was backwards — a provenance hierarchy, and a real bug in the sanity check

§24's rule — an existing precise coordinate gets to veto a new one it disagrees with — was wrong, and a fix was correctly demanded before trusting it further. `SHD`'s "existing precise" coordinate wasn't authoritative; it was Nominatim's interpretation of the client's bare "Station Road, Shahad" — a road name, exactly the kind of input that produces a multi-km error. Against it, the company's own map link and an independent geocode of the company's own fuller address agreed with each other to 240m. The company knows where its own store is; a locality-string guess doesn't outrank it.

**Fixed with an explicit, ranked provenance hierarchy** instead of an ad-hoc rule: (1) company website coordinate → (2) client-supplied pin → (3) our geocode of the website's own address → (4) our geocode of the client's locality string → (5) town centroid. A higher tier overrides a lower one once its own coordinate clears a loose (5km) town-containment sanity check — checking "is this roughly the right place," not asserting precision. It does NOT get compared against the lower-tier value to decide whether to trust it; the existing value has no veto. Two listings at the SAME tier disagreeing (the duplicate-coordinate check) still always goes to a human — ranking only resolves a conflict BETWEEN tiers, never within one.

**A second bug, found while building the fix, not asserted from the paste:** the first version of the new sanity check compared every new coordinate against a FRESH geocode of the store's bare `town` field, always — even for stores that already had a good existing coordinate. That backfired specifically for towns like "Bhiwandi": a bare `q=Bhiwandi, Thane, Maharashtra, India` query resolves to an administrative centroid that can sit 18+ km from a specific store in that town, so stores whose website coordinate agreed with their OWN existing data almost exactly (`AVB` 0.08km, `PAD` 0.47km, `AME` 0.86km) were failing the new check anyway, against a worse reference than the one already in `stores.json`. Fixed by using whatever coordinate the store already has — precise OR coarse, tier doesn't matter for picking a REFERENCE, only for deciding a winner — as the sanity-check reference whenever one exists, and only falling back to a fresh town geocode for the handful of stores with no coordinate at all. This resolved `AMPL`/`AMCH`/`AMSN` too (2.1–2.9km from their shared coarse Ambernath centroid, comfortably inside 5km) without any new network calls for them.

**`KHP` fixed per instruction** — its `town` field is spelled "Khapoli" (client's file); the query now uses the explicit override `"Khopoli, Raigad, Maharashtra, India"` (an admitted, human-confirmed correction, not a guessed alternate spelling — kept in a small, auditable `TOWN_QUERY_OVERRIDES` map, not a fuzzy-retry mechanism). That resolved discrepancy #3: `KHP`'s town now geocodes 2.13km from the listing's coordinate, `DOE/DER` stays ruled out at 48.32km, so the Shilphata/Khopoli tie broke cleanly in `KHP`'s favor.

**Rajaji Path / Kopar Road left alone, per instruction** — `DOW` (Kopar Road) actually now clears its own sanity check (0.15km from its existing point), but the duplicate-coordinate flag against `Rajaji Path` still forces it to a human regardless, exactly as the hierarchy rule specifies (same-tier conflicts aren't resolved by ranking). Not touched.

**Results:** validated-trusted rose from 21 to 25, ties broken from 3 to 4 (the `KHP` fix), needing a human fell from 13 to 9 single-match cases (`BHAR` on both its listings, `NSR`, `KMR`, `TGR`, `DWK`, `DOWSMT`, plus the `DOW`/`DOE-DER` duplicate pair) + 2 still-unresolved ties (`#18` seven-way in Bhiwandi, `#50` `AMSN`/`AML`). `BHAR`'s two listings are a genuinely interesting finding, not a check artifact: both fail their sanity check by a similar margin (5.25km, 6.57km) against `BHAR`'s own real coordinate — worth a specific look, since it's the same store proposed twice from a weak `locality_token_overlap` match both times.

**Applied — 34 stores total** (5 auto + 25 validated + 4 tie-broken), 5 more than §24's 29: `SHD`/`AMPL`/`AMCH`/`AMSN` as genuine overrides of a meaningfully different prior coordinate (logged with exact before/after distance in `docs/OFFICIAL-STORES-VALIDATION.md`), `KHP` as a first-time fill. `build-proximity.mjs` re-run.

**Precisely-located stores: 40/53 → 44/53.** `proximity.json`: 946/1,378 pairs now carry a real distance (was 780), 279 suppressed as town-centroid (was 396), 153 suppressed as not-geocoded (was 202 — `KHP` moved out of that bucket). Verified: `node --check`, `JSON.parse` on every touched file, `scripts/verify-geocode.mjs` re-run clean (the only new flag is `KHP`'s pre-existing low `geo_confidence`, not a new problem), headless-browser load confirming the KPI strip and `proximity.json`'s own metadata agree on 44/53 with no page errors.

`docs/OFFICIAL-STORES-VALIDATION.md` now ends with a "Final short list for hand review" section — 18 listings total (11 single-match disagreements/ties + the 7 that never resolved to a coordinate), each with its website address and map link, built specifically so the remaining work can be done by opening links directly rather than re-deriving anything from this report.

## 26. Live-site fixes, a genuine peer table, and the dark-store overlay — from real deployment feedback and a client call

This round's changes were driven by the dashboard actually being deployed and shown to the client, not by further internal review. Full detail is in each commit message; summarized here:

**Live bugs, found only once deployed** (this sandbox has no outbound access to `tile.openstreetmap.org` or real browsers, so none of these were ever visible before a real deploy): the OSM tile URL had `{z}/{y}/{x}.png` instead of the correct `{z}/{x}/{y}.png}` — every tile request hit the wrong coordinates, so the map rendered as a flat colour with no street imagery, since the first commit that added the map. Scroll-wheel zoom was on unconditionally, so a normal page-scroll over the map zoomed it out instead, landing on a whole-world view with no way back except a refresh — fixed by turning it off permanently (not just until first click, which would silently reintroduce the trap) and adding a one-click reset-to-53-stores control. Two CSS overflow bugs on the Peer Benchmark screen: a shared table class's hardcoded column widths squeezed a content-heavy column into 12%, and a CSS Grid item's default `min-width:auto` blew a card out past its container instead of wrapping.

**A reporting bug, not a data bug:** an earlier summary presented "44 precisely located," "9 disagreements," and "3 no-coordinate" as three exclusive buckets that should sum to 53 — they don't, because the 9 is a different, overlapping axis (a worklist about the website source specifically, not a partition of the 53 stores). Fixed at the source: `scripts/validate-official-matches.mjs` now computes and prints the cross-reference automatically on every run.

**The Peer Benchmark screen led with "Known bugs in the client's peer model"** — read by the client as an internal work log, correctly. Replaced with a genuine cross-company comparison table (Patel + Avenue Supermarts/DMart + Vishal Mega Mart + Trent + Spencer's + Osia + V2) as the first thing on the screen; the bug-tracking table (real, useful content) moved to the bottom under a retitled "Peer Model Data Quality Review" heading that doesn't cite an internal filename on screen.

**Osia Hyper Retail and V2 Retail got real financials** (revenue, EBITDA margin, PAT, sourced to Screener) replacing the "not supplied" placeholder — store count/area/private-label stay `null` and render as "Not available," genuinely not disclosed by either company, not filled in. Osia's 5% operating margin was also added to the Store Economics screen as a third, clearly-labelled element next to the existing 5.4%-vs-7.9% store/peer EBITDA contradiction — evidence for the reader to weigh, the contradiction itself still not resolved.

**Quick-commerce dark-store overlay — the headline addition.** A call transcript with the fund reviewing this dashboard surfaced the actual reason they've held off investing: dark-store (Blinkit/Zepto/Swiggy Instamart) cannibalization risk near Patel's own stores, which wasn't in the dashboard at all. `scripts/fetch-darkstores.mjs` pulls `github.com/jatin-dot-py/darkstores` (a public repo, live demo, technical write-up — the same class of source the fund's own team already uses for this exact purpose) via plain HTTPS, filtered to the Thane–Raigad–Palghar box: 148 Blinkit + 118 Zepto + 86 Swiggy Instamart = 352 dark stores. Two caveats carried through everywhere this data shows: it's a static March 2026 snapshot, not live, and the source repo has no explicit LICENSE file (public, openly demoed, used here as attributed research data — a judgement call made explicitly, not silently). `map.js` renders it as an off-by-default, per-brand toggleable Leaflet layer (own 53 stores still drive the initial view/bounds/reset), plus a separate "nearest dark store" stat on each store's detail sheet — deliberately NOT folded into the existing `overlap_risk` composite score, which stays reserved for the fund's own scoring methodology once they supply it (their own team said the score should be "built on your algorithm," not one this project invented).

Also fixed in passing while already importing from `geo.js` for the above: `map.js`'s two inline `geocode_match_tier === "town" || ... === "town_base"` checks now import `isCoarseTier()` from `geo.js` instead of hand-copying it (P3 audit finding #4, previously deferred).

**Still not done** (unchanged from §22's triage): the kind-label sweep across `estate.js`/`peers.js`/`screener.js`/`economics.js`, unifying revenue derivation between `economics.js` and the exports, the Trent revenue/store rounding mismatch, and two unrendered `metrics.json` note fields.
