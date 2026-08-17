# Patel Retail Dashboard — Handoff

> Read this first. It records what this repo is, what has been copied in and
> from where, and — importantly — what is **still missing** before real
> feature work (the store map) can start.

## What this is

A dashboard about **Patel Retail**, being built for a client that is an
**investment firm doing diligence** — not the company itself. That framing
matters for everything downstream:

- Anything this dashboard *calculates* (rather than shows verbatim from a
  source) must be **labelled as an estimate on screen**. The client's own
  words: *"at the end it's an AI, I'm just trusting it."*
- We do **not** have, and are not expecting to get, monthly sales per store,
  per-store square footage, per-store rent, or export detail. Build with
  what's actually available — don't design features around data that isn't
  coming.

## Donor repo

Code, design system, and pipeline scaffolding were copied from
[`ceekay-munshot/dakshamconcall`](https://github.com/ceekay-munshot/dakshamconcall)
(the "Daksham Concall Tracker", an unrelated Munshot product for a different
client). That repo is a **donor only**:

- Cloned **read-only**.
- Nothing was committed or pushed to it.
- Files were copied out, not linked or submoduled.

### What was copied (this commit)

| File(s) in this repo | Source | Status |
| --- | --- | --- |
| `public/css/styles.css` | `public/css/styles.css` | Copied unchanged. Full design system (KPI boxes, tabs, cards, tables, slide-overs, loading states). All colours are CSS variables in `:root` for rebranding. |
| `public/js/ui.js` | `public/js/ui.js` | Copied unchanged. Shared helpers (date formatting, toasts, icons). |
| `public/js/report.js` | `public/js/report.js` | Copied unchanged **for now**. Has a working PDF page-layout engine, but several of its helpers (`quarterMatrix`, `normPeriod`, etc.) are concall/quarter-specific and will need to be reworked to feed Patel store/retail data instead. |
| `public/js/export-xlsx.js` | `public/js/export-xlsx.js` | Copied unchanged. Working Excel export with CSV fallback. |
| `public/assets/munshot-logo.png`, `.svg`, `README.md` | `public/assets/` | Copied unchanged. Branding for PDF/Excel exports. |
| `wrangler.jsonc` | `wrangler.jsonc` | Copied, then **renamed** (`name` → `patel-retail-dashboard`) so deploying it does not collide with the donor's live Cloudflare Worker. Comment header updated to flag the `/api/*` routes below as unreworked. |
| `worker/index.js` | `worker/index.js` | Copied, then **renamed** identifiers only (`User-Agent`, health-check `service` string). The static-asset serving and the GitHub Contents API helpers (`ghReadJson`/`ghWriteJson`) are generic and reusable. The actual routes (`/api/search` — Muns stock search, `/api/analyze` — concall track+dispatch) are still the **donor's** routes and need to be replaced with whatever API this dashboard actually needs. |
| `.github/workflows/analyze.yml` | `.github/workflows/analyze.yml` | Copied as a **template** for its shape (checkout → Node → Playwright/Chromium → run a scraper script → commit JSON → Cloudflare auto-deploys). Every step still references the donor's Screener/OpenAI concall scraper and secrets, none of which exist here — this needs to be reworked to run this project's own store-list scraper (e.g. for DMart's store list) before it will run successfully. |

### Deliberately **not** copied

- `public/js/app.js`, `public/js/sectors.js`, `public/js/progress.js` — concall-tracker-only logic (search/analyze UI flow, sector insight cards, analyze progress dock). Nothing here needs them.
- `public/index.html`, `public/data/*.json`, `.github/workflows/check-llm.yml` — donor-specific content/data/CI, not part of the copy list.
- `screener-test/` (the Screener/OpenAI concall scraper, 6 files) — **optional, not copied yet.** It's only needed if/when this project wants Patel's *concall* commentary data; it is not needed for the store map. If it's wanted later, copy it into this repo (e.g. under `screener-test/` or `scripts/concall/`) and run it here — never in the donor repo.

## ⚠️ Missing — blocking the actual map feature

Two inputs this handoff process assumes already exist were **not** provided
to the session that did this scaffolding, and are not available anywhere
else this session could reach (checked the donor repo and the rest of the
`techmuns`/`ceekay-munshot` GitHub orgs — no match):

1. **`stores.seed.json`** — the 53 Patel Retail stores (name/address/city/
   state, ready to geocode) that the map is meant to be built on. **Not
   fabricated here** — inventing store locations for a real company under
   real investment-firm diligence would be actively misleading. This file
   needs to be supplied (or pointed to) before geocoding/map work can start.
2. **The schemas and product/design decisions** referenced as "already
   made" for this project (data shapes, what the map should show, how
   estimates get flagged in the UI, etc.) — same situation: not included in
   what this session received, so not invented here.

Until those land, this repo is scaffolding only: a design system, export
tooling, hosting shell, and a pipeline template — no Patel Retail data, no
map, no store schema.

## Constraints to keep in mind once real work starts

- No monthly sales per store, no per-store sq ft, no per-store rent, no
  export detail — and none of that is expected to arrive later.
- Every derived/estimated number on screen needs a visible "estimate" label.
- Client is doing diligence, not running the company — build for an
  external analyst's view, not an internal operator's.
