/**
 * public/js/map.js — Network Map view: the 53-store Leaflet map, its KPI
 * strip, the town-cluster table, and the store slide-over.
 *
 * Leaflet + OSM tiles per PATEL-HANDOFF.md §7 ("no API key, CDN-loadable,
 * fits the no-build-step rule"), guarded by `typeof window.L` like every
 * other CDN lib the donor uses. public/data/*.json is the only source of
 * truth — nothing here calls a live API.
 */
import { qs, escapeHtml, fmtDate, refreshIcons, toast } from "./ui.js";

const OSM_TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{y}/{x}.png";
const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const CENTER_FALLBACK = [19.22, 73.15]; // roughly the Thane–Raigad belt, used only if nothing is geocoded

const VINTAGE_BUCKETS = [
  { maxYears: 2, color: "var(--brand-teal)", label: "< 2 yrs" },
  { maxYears: 5, color: "var(--brand-sky)", label: "2–5 yrs" },
  { maxYears: 10, color: "var(--brand-indigo)", label: "5–10 yrs" },
  { maxYears: Infinity, color: "var(--brand-violet)", label: "10+ yrs" },
];
const CLOSED_COLOR = "var(--text-4)";
const LOW_CONFIDENCE_COLOR = "var(--warn)";

let map = null;
let storesById = new Map();
let proximityByStoreId = new Map();

function yearsSince(dateStr) {
  if (!dateStr) return null;
  const opened = new Date(dateStr);
  if (isNaN(opened)) return null;
  return (Date.now() - opened.getTime()) / (365.25 * 24 * 3600 * 1000);
}

function vintageBucketFor(store) {
  const yrs = yearsSince(store.opened);
  if (yrs == null) return VINTAGE_BUCKETS[VINTAGE_BUCKETS.length - 1];
  return VINTAGE_BUCKETS.find((b) => yrs <= b.maxYears) || VINTAGE_BUCKETS[VINTAGE_BUCKETS.length - 1];
}

function resolveCssVar(varExpr) {
  // "var(--brand-teal)" -> the computed colour, so Leaflet (which wants a
  // real colour string, not always happy with var() in every browser/canvas
  // path) gets something it can rely on.
  const name = varExpr.replace(/^var\(|\)$/g, "");
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#6366f1";
}

async function loadJson(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  return res.json();
}

function renderKpis(stores, proximity) {
  const el = qs("#mapKpis");
  if (!el) return;

  const operational = stores.filter((s) => s.status === "operational");
  const closed = stores.filter((s) => s.status === "closed");
  const towns = new Set(stores.map((s) => s.town));
  const districts = new Map();
  for (const s of stores) districts.set(s.district, (districts.get(s.district) || 0) + 1);
  const districtSummary = [...districts.entries()].sort((a, b) => b[1] - a[1]).map(([d, n]) => `${d} ${n}`).join(" · ");

  const under2yr = stores.filter((s) => {
    const yrs = yearsSince(s.opened);
    return yrs != null && yrs < 2;
  }).length;
  const under2yrPct = Math.round((under2yr / stores.length) * 100);

  const geocoded = proximity?.metadata?.geocoded_count ?? 0;
  const total = proximity?.metadata?.total_stores ?? stores.length;
  const geocodeDelta =
    geocoded === 0
      ? `<i data-lucide="alert-triangle" class="i16"></i> Run scripts/geocode.mjs`
      : geocoded === total
      ? `<i data-lucide="check" class="i16"></i> Fully geocoded`
      : `<i data-lucide="loader" class="i16"></i> ${total - geocoded} pending`;

  el.innerHTML = `
    <div class="kpi k1">
      <div class="kpi-top"><span class="kpi-label">Total Stores</span><span class="kpi-ico"><i data-lucide="building-2"></i></span></div>
      <div class="kpi-value">${stores.length}</div>
      <div class="kpi-delta"><i data-lucide="check" class="i16"></i> ${operational.length} operational · ${closed.length} closed</div>
    </div>
    <div class="kpi k2">
      <div class="kpi-top"><span class="kpi-label">Towns Covered</span><span class="kpi-ico"><i data-lucide="map-pin"></i></span></div>
      <div class="kpi-value">${towns.size}</div>
      <div class="kpi-delta"><i data-lucide="landmark" class="i16"></i> ${escapeHtml(districtSummary)}</div>
    </div>
    <div class="kpi k3">
      <div class="kpi-top"><span class="kpi-label">Under 2 Years Old</span><span class="kpi-ico"><i data-lucide="sprout"></i></span></div>
      <div class="kpi-value">${under2yrPct}<span class="unit">%</span></div>
      <div class="kpi-delta"><i data-lucide="info" class="i16"></i> Blended metrics mix mature + ramping stores</div>
    </div>
    <div class="kpi k4">
      <div class="kpi-top"><span class="kpi-label">Geocoded</span><span class="kpi-ico"><i data-lucide="crosshair"></i></span></div>
      <div class="kpi-value">${geocoded}<span class="unit">/ ${total}</span></div>
      <div class="kpi-delta">${geocodeDelta}</div>
    </div>
  `;
  refreshIcons();
}

function renderClusters(proximity) {
  const body = qs("#clusterTableBody");
  if (!body) return;
  const clusters = (proximity?.clusters || []).filter((c) => c.stores >= 2);
  if (!clusters.length) {
    body.innerHTML = `<tr><td colspan="3" style="color:var(--text-4);padding:16px;">No multi-store towns.</td></tr>`;
    return;
  }
  body.innerHTML = clusters
    .map(
      (c) => `
    <tr>
      <td>${escapeHtml(c.town)}</td>
      <td>${c.stores}</td>
      <td class="mono" style="font-size:12px;color:var(--text-3)">${c.store_ids.map(escapeHtml).join(", ")}</td>
    </tr>`
    )
    .join("");
}

function renderLegend() {
  const el = qs("#mapLegend");
  if (!el) return;
  const vintageItems = VINTAGE_BUCKETS.map(
    (b) => `<span class="lg-item"><span class="lg-dot" style="background:${b.color}"></span>${b.label}</span>`
  ).join("");
  el.innerHTML = `
    ${vintageItems}
    <span class="lg-item"><span class="lg-dot" style="background:${CLOSED_COLOR}"></span>Closed</span>
    <span class="lg-item"><span class="lg-ring"></span>Low-confidence address (uncertainty radius, not a pin)</span>
  `;
}

function sheetStatBlock(value, label) {
  return `<div class="sheet-stat"><div class="ss-value">${value}</div><div class="ss-label">${escapeHtml(label)}</div></div>`;
}

function openStoreSheet(store) {
  const prox = proximityByStoreId.get(store.store_id);
  qs("#sheetName").textContent = store.name;

  const statusChip =
    store.status === "operational"
      ? `<span class="chip done"><span class="cdot"></span>Operational</span>`
      : `<span class="chip failed"><span class="cdot"></span>Closed ${store.closed ? fmtDate(store.closed) : ""}</span>`;
  const confChip = `<span class="chip ${store.geo_confidence === "low" ? "queued" : store.geo_confidence === "medium" ? "src-transcript" : "src-ai"}">${escapeHtml(store.geo_confidence)} confidence</span>`;

  qs("#sheetMeta").innerHTML = `
    <span class="sh-pill">${escapeHtml(store.store_id)}</span>
    ${statusChip}
    ${confChip}
  `;

  const nearest = prox?.nearest_own;
  const within = prox?.own_within;
  const risk = prox?.overlap_risk;

  const statRow = `
    <div class="sheet-stat-row">
      ${sheetStatBlock(nearest ? `${nearest.km} km` : "—", nearest ? `Nearest: ${nearest.store_id}` : "Nearest own store")}
      ${sheetStatBlock(within ? within["3km"] : "—", "Own stores within 3km")}
      ${sheetStatBlock(risk != null ? risk.toFixed(2) : "—", "Overlap risk (derived)")}
    </div>`;

  const riskNote =
    risk != null
      ? `<p style="font-size:12.5px;color:var(--text-3);line-height:1.6">
           <span class="kind-pill kind-derived">derived</span>
           Geography-only heuristic — a screening signal, not a validated prediction (no store-level sales data exists to calibrate it against).
         </p>`
      : `<p style="font-size:12.5px;color:var(--text-3)">Not computed — this store isn't geocoded yet.</p>`;

  qs("#sheetScroll").innerHTML = `
    <div style="padding: 4px 26px 26px">
      <table class="metric-table">
        <tr><td>Locality</td><td style="text-align:left;font-family:inherit;font-weight:400;color:var(--text-2)">${escapeHtml(store.locality)}</td></tr>
        <tr><td>Town</td><td style="text-align:left;font-family:inherit;font-weight:400;color:var(--text-2)">${escapeHtml(store.town)}</td></tr>
        <tr><td>District</td><td style="text-align:left;font-family:inherit;font-weight:400;color:var(--text-2)">${escapeHtml(store.district)}, ${escapeHtml(store.state)}</td></tr>
        <tr><td>Opened</td><td style="text-align:left;font-family:inherit;font-weight:400;color:var(--text-2)">${store.opened ? fmtDate(store.opened) : "—"}</td></tr>
        <tr><td>Area</td><td style="text-align:left;font-family:inherit;font-weight:400;color:var(--text-2)">${store.area_sqft.toLocaleString("en-IN")} sq ft <span class="kind-pill kind-estimate" data-kind="estimate">estimate</span></td></tr>
      </table>
      ${statRow}
      ${riskNote}
    </div>
  `;
  qs("#sheetModal").classList.add("open");
  refreshIcons();
}

function wireSheetClose() {
  const modal = qs("#sheetModal");
  const close = qs("#sheetClose");
  if (!modal || !close) return;
  close.addEventListener("click", () => modal.classList.remove("open"));
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.classList.remove("open");
  });
}

function renderEmptyMap(container, pendingCount, total) {
  container.innerHTML = `
    <div class="empty">
      <div class="empty-ico"><i data-lucide="map-pin-off"></i></div>
      <h4>${pendingCount === total ? "Not geocoded yet" : "Partially geocoded"}</h4>
      <p>
        ${pendingCount} of ${total} stores don't have coordinates yet. Run
        <code>scripts/geocode.mjs</code> with a <code>GOOGLE_MAPS_API_KEY</code>,
        then re-run <code>scripts/build-proximity.mjs</code> to see them here.
      </p>
    </div>
  `;
  refreshIcons();
}

function initLeafletMap(container, geocodedStores) {
  map = window.L.map(container, { scrollWheelZoom: true });

  window.L.tileLayer(OSM_TILE_URL, { attribution: OSM_ATTRIBUTION, maxZoom: 19 }).addTo(map);

  const bounds = [];
  for (const store of geocodedStores) {
    const isClosed = store.status === "closed";
    const isLowConfidence = store.geo_confidence === "low";
    const bucket = vintageBucketFor(store);
    const color = isClosed ? resolveCssVar(CLOSED_COLOR) : isLowConfidence ? resolveCssVar(LOW_CONFIDENCE_COLOR) : resolveCssVar(bucket.color);

    let layer;
    if (isLowConfidence) {
      // Uncertainty circle, not a precise pin — the address quality doesn't support one.
      layer = window.L.circle([store.lat, store.lng], {
        radius: 1200,
        color,
        weight: 2,
        dashArray: "5,5",
        fillColor: color,
        fillOpacity: 0.12,
      });
    } else {
      layer = window.L.circleMarker([store.lat, store.lng], {
        radius: isClosed ? 6 : 8,
        color: "#fff",
        weight: 2,
        fillColor: color,
        fillOpacity: isClosed ? 0.55 : 0.9,
      });
    }

    layer.bindPopup(
      `<strong>${escapeHtml(store.name)}</strong><br>${escapeHtml(store.locality)}<br>${escapeHtml(store.town)}${isClosed ? "<br><em>Closed</em>" : ""}`
    );
    layer.on("click", () => openStoreSheet(store));
    layer.addTo(map);
    bounds.push([store.lat, store.lng]);
  }

  if (bounds.length) {
    map.fitBounds(bounds, { padding: [30, 30], maxZoom: 14 });
  } else {
    map.setView(CENTER_FALLBACK, 10);
  }
}

/** Called when the map tab becomes visible after being hidden — Leaflet needs this or the tiles render half-grey. */
export function invalidateMapSize() {
  if (map) map.invalidateSize();
}

export async function initMap() {
  const container = qs("#mapContainer");
  try {
    const [storesData, proximity] = await Promise.all([loadJson("./data/stores.json"), loadJson("./data/proximity.json")]);
    const stores = storesData.stores;
    storesById = new Map(stores.map((s) => [s.store_id, s]));
    proximityByStoreId = new Map((proximity.per_store || []).map((p) => [p.store_id, p]));

    renderKpis(stores, proximity);
    renderLegend();
    renderClusters(proximity);
    wireSheetClose();

    const geocodedStores = stores.filter((s) => s.lat != null && s.lng != null);
    const pending = stores.length - geocodedStores.length;

    if (!window.L) {
      container.innerHTML = `<div class="empty"><div class="empty-ico"><i data-lucide="wifi-off"></i></div><h4>Map library didn't load</h4><p>Leaflet failed to load from its CDN. Everything else on this page still works.</p></div>`;
      refreshIcons();
      toast("err", "Map unavailable", "Leaflet didn't load from the CDN.");
      return;
    }

    if (!geocodedStores.length) {
      renderEmptyMap(container, pending, stores.length);
      return;
    }

    initLeafletMap(container, geocodedStores);
    if (pending > 0) {
      toast("info", "Partially geocoded", `${pending} of ${stores.length} stores aren't geocoded yet — run scripts/geocode.mjs to fill in the rest.`);
    }
  } catch (err) {
    container.innerHTML = `<div class="empty"><div class="empty-ico"><i data-lucide="alert-triangle"></i></div><h4>Couldn't load store data</h4><p>${escapeHtml(err.message)}</p></div>`;
    refreshIcons();
  }
}

export function getStoresById() {
  return storesById;
}
