/**
 * public/js/screener.js — Site Screener view. Enter a candidate address,
 * geocode it client-side (Nominatim — no key, no server round-trip), and
 * show distance to every own store, counts within 1/3/5km, nearest DMart
 * (once competitor data exists), and a go/no-go read using the SAME
 * overlap-risk formula the store slide-over uses (public/js/geo.js) — this
 * is deliberately not a second, invented metric.
 *
 * "This is what Patel Retail's own team currently does by hand" — the whole
 * point is reusing the geocoder and the proximity math that already exist,
 * not building a parallel system.
 */
import { qs, qsa, escapeHtml, refreshIcons, toast } from "./ui.js";
import { haversineKm, round2, overlapRisk, isLocatable, CATCHMENT_DECAY_KM, OVERLAP_REFERENCE } from "./geo.js";

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
// Same bounding box as scripts/geocode.mjs — Thane–Raigad–Palghar belt.
const REGION_VIEWBOX = { minLon: 72.7, minLat: 18.6, maxLon: 73.6, maxLat: 19.8 };

let storesCache = null;
let competitorsCache = null; // null until public/data/competitors.json exists

async function loadJson(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  return res.json();
}

/** EVERY store, not just geocoded ones — "distance to every own store" is a literal promise; unlocatable ones show as such rather than being silently dropped. */
async function getStores() {
  if (!storesCache) {
    const data = await loadJson("./data/stores.json");
    storesCache = data.stores;
  }
  return storesCache;
}

/** null if the file doesn't exist yet (scripts/fetch-dmart-overpass.mjs hasn't run) — a fetch 404 is expected, not an error. */
async function getCompetitors() {
  if (competitorsCache !== null) return competitorsCache;
  try {
    competitorsCache = await loadJson("./data/competitors.json");
  } catch {
    competitorsCache = { stores: [] };
  }
  return competitorsCache;
}

async function geocodeAddress(address) {
  const url = new URL(NOMINATIM_URL);
  url.searchParams.set("q", `${address}, Maharashtra, India`);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "in");
  url.searchParams.set(
    "viewbox",
    `${REGION_VIEWBOX.minLon},${REGION_VIEWBOX.maxLat},${REGION_VIEWBOX.maxLon},${REGION_VIEWBOX.minLat}`
  );
  // Not `bounded=1` here (unlike the batch script) — a candidate site being
  // just outside the drawn box shouldn't silently vanish; let it resolve and
  // let the user see where it landed.

  // Browsers refuse a script-set User-Agent header; Nominatim's usage policy
  // accepts the browser's own Referer for this instead (it's sent automatically).
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Geocoding service returned ${res.status}`);
  const results = await res.json();
  if (!results.length) return null;
  const top = results[0];
  return { lat: parseFloat(top.lat), lng: parseFloat(top.lon), formatted_address: top.display_name };
}

function renderKpis(candidate, nearest, within, nearestCompetitor, locatableCount, totalOperational) {
  const el = qs("#screenerKpis");
  el.innerHTML = `
    <div class="kpi k1">
      <div class="kpi-top"><span class="kpi-label">Nearest Own Store</span><span class="kpi-ico"><i data-lucide="building-2"></i></span></div>
      <div class="kpi-value" style="font-size:22px">${nearest ? nearest.km + " km" : "—"}</div>
      <div class="kpi-delta">${nearest ? escapeHtml(nearest.store.name) : `Unavailable — 0 of ${totalOperational} own stores precisely located`}</div>
    </div>
    <div class="kpi k2">
      <div class="kpi-top"><span class="kpi-label">Own Stores Within 3km</span><span class="kpi-ico"><i data-lucide="circle-dot"></i></span></div>
      <div class="kpi-value">${within["3km"]}</div>
      <div class="kpi-delta"><i data-lucide="crosshair" class="i16"></i> ${within["1km"]} within 1km · ${within["5km"]} within 5km <span style="color:var(--text-4)">(of ${locatableCount} of ${totalOperational} locatable)</span></div>
    </div>
    <div class="kpi k3">
      <div class="kpi-top"><span class="kpi-label">Nearest DMart</span><span class="kpi-ico"><i data-lucide="store"></i></span></div>
      <div class="kpi-value" style="font-size:${nearestCompetitor ? "22px" : "15px"}">${nearestCompetitor ? nearestCompetitor.km + " km" : "Not available yet"}</div>
      <div class="kpi-delta">${nearestCompetitor ? "<i data-lucide=\"info\" class=\"i16\"></i> OpenStreetMap — coverage may be incomplete" : `<i data-lucide="info" class="i16"></i> No competitor data available`}</div>
    </div>
    <div class="kpi k4">
      <div class="kpi-top"><span class="kpi-label">Candidate Site</span><span class="kpi-ico"><i data-lucide="map-pin"></i></span></div>
      <div class="kpi-value" style="font-size:14px; line-height:1.4">${escapeHtml(candidate.formatted_address.split(",").slice(0, 2).join(","))}</div>
      <div class="kpi-delta mono" style="font-size:11px">${candidate.lat.toFixed(4)}, ${candidate.lng.toFixed(4)}</div>
    </div>
  `;
  refreshIcons();
}

function renderTable(ranked) {
  const body = qs("#screenerTableBody");
  body.innerHTML = ranked
    .map((r) => {
      const coarse = r.store.geocode_match_tier === "town" || r.store.geocode_match_tier === "town_base";
      const label = coarse ? "Town-level only" : "No coordinates";
      const why = coarse
        ? "Geocoded to the town centre, not this store's address — every store in the town lands on the same point, so a distance from it would be invented"
        : "No address match in OpenStreetMap, so there is no point to measure from";
      const distanceCell =
        r.km != null
          ? `<td class="mono">${r.km} km</td>`
          : `<td class="mono"><span class="no-data" title="${escapeHtml(why)}">${label}</span></td>`;
      return `
    <tr${r.km == null ? ' class="row-nodata"' : ""}>
      <td>${escapeHtml(r.store.name)} <span class="mono cell-code">${escapeHtml(r.store.store_id)}</span>${r.store.status === "closed" ? ' <span class="chip failed" style="padding:2px 7px;font-size:10px">closed</span>' : ""}</td>
      <td>${escapeHtml(r.store.town)}</td>
      ${distanceCell}
    </tr>`;
    })
    .join("");
}

function goNoGoRead(risk) {
  if (risk == null) return { label: "Not computed", tone: "muted" };
  if (risk >= 0.7) return { label: "High geographic overlap — think twice", tone: "err" };
  if (risk >= 0.4) return { label: "Moderate overlap — worth a closer look", tone: "warn" };
  return { label: "Low overlap at the geography level", tone: "ok" };
}

function renderRiskCard(risk, nearest, within, locatableCount, totalOperational) {
  const el = qs("#screenerRiskCard");
  const read = goNoGoRead(risk);
  const toneColor = { ok: "var(--ok)", warn: "var(--warn)", err: "var(--err)", muted: "var(--text-4)" }[read.tone];

  const unavailableNote =
    risk == null
      ? `<p class="risk-sentence"><strong>Distance unavailable</strong> — no stores precisely located to compare against.</p>`
      : "";

  el.innerHTML = `
    <div class="card-head">
      <div>
        <h3>
          <span class="card-ico" style="background: var(--grad-warm)"><i data-lucide="gauge" class="i16"></i></span>
          Go / no-go read
        </h3>
      </div>
    </div>
    <div class="card-body">
      <div style="display:flex; align-items:center; gap:10px; margin-bottom:14px" data-kind="derived">
        <span style="width:12px;height:12px;border-radius:50%;background:${toneColor};flex-shrink:0"></span>
        <strong style="font-size:14px">${escapeHtml(read.label)}</strong>
      </div>
      <div class="risk-block" data-kind="derived" style="margin-top:0">
        <div class="risk-block-head">
          <span class="kind-pill kind-derived">derived</span>
          <span class="risk-block-title">Same formula as the network map</span>
        </div>
        ${
          unavailableNote ||
          `
        <div class="risk-inputs">
          <div class="risk-input"><span class="ri-label">Nearest own store</span><span class="ri-value">${nearest.km} km (${escapeHtml(nearest.store.store_id)})</span></div>
          <div class="risk-input"><span class="ri-label">Own stores within 3 km</span><span class="ri-value">${within["3km"]} <span style="color:var(--text-4);font-weight:400">(of ${locatableCount} of ${totalOperational} locatable)</span></span></div>
          <div class="risk-input muted"><span class="ri-label">Nearest competitor</span><span class="ri-value">Shown above (KPI) — not a factor in this composite</span></div>
        </div>
        <div class="risk-score-row">
          <span>Composite score</span>
          <span class="risk-score-value">${risk.toFixed(2)}</span>
        </div>
        <p class="risk-caveat">Geography-only screening signal, not a decision.</p>`
        }
      </div>
    </div>
  `;
  refreshIcons();
}

async function runScreen(address) {
  const submitBtn = qs("#screenerSubmit");
  submitBtn.disabled = true;
  const originalHtml = submitBtn.innerHTML;
  submitBtn.innerHTML = `<span class="btn-spin"></span><span>Checking…</span>`;
  refreshIcons();

  try {
    const candidate = await geocodeAddress(address);
    if (!candidate) {
      toast("err", "Couldn't locate that address", "Try adding a landmark, town, or being more specific.");
      return;
    }

    const [stores, competitors] = await Promise.all([getStores(), getCompetitors()]);

    // Distance to every own store — but a store that's only geocoded to its
    // town centroid can't honestly report one (its real position could be
    // anywhere in town), so it gets `km: null` instead of a number computed
    // from a centroid. Same rule build-proximity.mjs applies store-to-store.
    const ranked = stores
      .map((store) => ({
        store,
        km: isLocatable(store) ? round2(haversineKm(candidate, store)) : null,
      }))
      .sort((a, b) => {
        if (a.km == null && b.km == null) return a.store.name.localeCompare(b.store.name);
        if (a.km == null) return 1; // unavailable rows sink to the bottom, not mixed into "nearest first"
        if (b.km == null) return -1;
        return a.km - b.km;
      });

    // Risk/nearest/within are about live cannibalisation threat, so — same
    // as map.js/build-proximity.mjs — only OPERATIONAL, LOCATABLE stores count.
    const operationalLocatable = ranked.filter((r) => r.store.status === "operational" && r.km != null);
    const totalOperational = stores.filter((s) => s.status === "operational").length;

    const within = { "1km": 0, "3km": 0, "5km": 0 };
    for (const r of operationalLocatable) {
      if (r.km <= 1) within["1km"]++;
      if (r.km <= 3) within["3km"]++;
      if (r.km <= 5) within["5km"]++;
    }
    const nearest = operationalLocatable[0] || null;
    // Every located store contributes, decayed by distance — same call shape
    // as build-proximity.mjs, so a screened site is scored on the identical
    // scale as the existing network.
    const risk = nearest ? overlapRisk(operationalLocatable.map((r) => r.km)) : null;

    let nearestCompetitor = null;
    if (competitors.stores?.length) {
      const compRanked = competitors.stores
        .filter((c) => c.lat != null && c.lng != null)
        .map((c) => ({ store: c, km: round2(haversineKm(candidate, c)) }))
        .sort((a, b) => a.km - b.km);
      nearestCompetitor = compRanked[0] || null;
    }

    renderKpis(candidate, nearest, within, nearestCompetitor, operationalLocatable.length, totalOperational);
    renderTable(ranked);
    renderRiskCard(risk, nearest, within, operationalLocatable.length, totalOperational);

    qs("#screenerResults").style.display = "";
    qs("#screenerEmpty").innerHTML = "";
  } catch (err) {
    toast("err", "Site check failed", err.message);
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalHtml;
    refreshIcons();
  }
}

function renderInitialEmpty() {
  qs("#screenerEmpty").innerHTML = `
    <div class="empty">
      <div class="empty-ico"><i data-lucide="search-check"></i></div>
      <h4>Enter an address above</h4>
      <p>Distance to every own store, catchment density, and a geography-only read — computed live, nothing precomputed for a candidate site.</p>
    </div>
  `;
  refreshIcons();
}

export async function initScreener() {
  renderInitialEmpty();
  const form = qs("#screenerForm");
  if (!form) return;
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const address = qs("#screenerAddress").value.trim();
    if (!address) return;
    runScreen(address);
  });
}
