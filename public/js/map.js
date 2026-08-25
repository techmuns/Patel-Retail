/**
 * public/js/map.js — Network Map view: the Leaflet map of every store in
 * stores.json (count varies — see its own `counts` field), its KPI strip,
 * the town-cluster table, and the store slide-over.
 *
 * Leaflet + OSM tiles per PATEL-HANDOFF.md §7 ("no API key, CDN-loadable,
 * fits the no-build-step rule"), guarded by `typeof window.L` like every
 * other CDN lib the donor uses. public/data/*.json is the only source of
 * truth — nothing here calls a live API.
 */
import { qs, escapeHtml, fmtDate, refreshIcons, toast } from "./ui.js";
import { VINTAGE_BUCKETS, yearsSince, vintageBucketFor } from "./vintage.js";
import { haversineKm, round2, isLocatable, isCoarseTier, overlapRisk, RISK_PROXIMITY_HORIZON_KM, RISK_DENSITY_SATURATION } from "./geo.js";

const OSM_TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const CENTER_FALLBACK = [19.22, 73.15]; // roughly the Thane–Raigad belt, used only if nothing is geocoded

const CLOSED_COLOR = "var(--text-4)";
const LOW_CONFIDENCE_COLOR = "var(--warn)";

// Approximate each brand's own colour, for at-a-glance recognition on the
// map — not a trademark reproduction, just distinguishable markers.
const DARKSTORE_BRAND_COLORS = { Blinkit: "#f8cb46", Zepto: "#8025fb", "Swiggy Instamart": "#fc8019" };

let map = null;
let storesById = new Map();
let proximityByStoreId = new Map();
let darkstoresData = null; // public/data/darkstores.json, or null if it hasn't been fetched yet

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

  // Headline the LOCATABLE count, not the raw geocoded count — a town-centroid
  // match technically "has coordinates" but isn't a precise location, and this
  // KPI is the first number anyone sees, so it shouldn't overstate confidence.
  const locatable = proximity?.metadata?.locatable_count ?? 0;
  const coarse = proximity?.metadata?.coarse_count ?? 0;
  const total = proximity?.metadata?.total_stores ?? stores.length;
  const pending = total - locatable - coarse;
  const geocodeDelta =
    locatable === 0
      ? `<i data-lucide="alert-triangle" class="i16"></i> Run scripts/geocode.mjs`
      : locatable === total
      ? `<i data-lucide="check" class="i16"></i> All precisely located`
      : `<i data-lucide="info" class="i16"></i> ${coarse} town-centroid only · ${pending} pending`;

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
      <div class="kpi-top"><span class="kpi-label">Precisely Located</span><span class="kpi-ico"><i data-lucide="crosshair"></i></span></div>
      <div class="kpi-value">${locatable}<span class="unit">/ ${total}</span></div>
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
    <span class="lg-item"><span class="lg-ring"></span>Low-confidence address</span>
  `;
}

function openStoreSheet(store) {
  const prox = proximityByStoreId.get(store.store_id);
  qs("#sheetName").textContent = store.name;

  const statusChip =
    store.status === "operational"
      ? `<span class="chip done"><span class="cdot"></span>Operational</span>`
      : `<span class="chip failed"><span class="cdot"></span>Closed ${store.closed ? fmtDate(store.closed) : ""}</span>`;
  const confChip = `<span class="chip ${store.geo_confidence === "low" ? "queued" : store.geo_confidence === "medium" ? "src-transcript" : "src-ai"}">${escapeHtml(store.geo_confidence)} confidence</span>`;
  const isCoarseMatch = isCoarseTier(store.geocode_match_tier);
  const coarseChip = isCoarseMatch ? `<span class="chip queued">town-centroid pin</span>` : "";

  qs("#sheetMeta").innerHTML = `
    <span class="sh-pill">${escapeHtml(store.store_id)}</span>
    ${statusChip}
    ${confChip}
    ${coarseChip}
  `;

  const nearest = prox?.nearest_own;
  const within = prox?.own_within;
  const risk = prox?.overlap_risk;
  const locatableOthers = prox?.locatable_others;
  const totalOtherOperational = prox?.total_other_operational;

  const UNAVAILABLE_REASON_TEXT = {
    not_geocoded: "This store isn't geocoded yet.",
    town_centroid:
      "Located to town centre only, not its own address.",
    no_locatable_neighbors: "No other stores precisely located to compare against.",
  };
  const RISK_UNAVAILABLE_REASON_TEXT = {
    closed: `No risk score — this store is closed${store.closed ? ` (${fmtDate(store.closed)})` : ""}. There's nothing left here for another store to cannibalise, so a score isn't computed.`,
  };
  const riskUnavailableText = risk == null ? RISK_UNAVAILABLE_REASON_TEXT[prox?.risk_unavailable_reason] : null;

  const riskBlock =
    nearest == null
      ? `
    <div class="risk-block" data-kind="derived">
      <div class="risk-block-head">
        <span class="kind-pill kind-derived">derived</span>
        <span class="risk-block-title">Cannibalisation risk score</span>
      </div>
      <p class="risk-sentence">
        <strong>Distance unavailable.</strong> ${escapeHtml(UNAVAILABLE_REASON_TEXT[prox?.unavailable_reason] || "Not computed.")}
      </p>
    </div>`
      : `
    <div class="risk-block" data-kind="derived">
      <div class="risk-block-head">
        <span class="kind-pill kind-derived">derived</span>
        <span class="risk-block-title">Cannibalisation risk score</span>
      </div>
      <div class="risk-inputs">
        <div class="risk-input">
          <span class="ri-label">Nearest own store</span>
          <span class="ri-value">${nearest.km} km (${escapeHtml(nearest.store_id)})</span>
        </div>
        <div class="risk-input">
          <span class="ri-label">Own stores within 3 km</span>
          <span class="ri-value">${within["3km"]} <span style="color:var(--text-4);font-weight:400">(of ${locatableOthers} of ${totalOtherOperational} other stores precisely located)</span></span>
        </div>
        <div class="risk-input muted">
          <span class="ri-label">Nearest competitor</span>
          <span class="ri-value">See Site Screener</span>
        </div>
      </div>
      <div class="risk-score-row">
        <span>Composite score</span>
        <span class="risk-score-value">${risk != null ? risk.toFixed(2) : "Not scored"}</span>
      </div>
      <p class="risk-caveat">${
        riskUnavailableText
          ? escapeHtml(riskUnavailableText)
          : "Geography-only screening signal — 0–1, no sales data."
      }</p>
    </div>`;

  // Deliberately a SEPARATE block from the risk score above, not folded
  // into it — the composite score is reserved for the fund's own
  // methodology once supplied (see scripts/fetch-darkstores.mjs), and this
  // is third-party data on a different confidence footing (a March 2026
  // snapshot, not Patel's own coordinates) that shouldn't quietly change
  // an existing, already-explained number.
  let darkstoreBlock = "";
  if (darkstoresData?.darkstores?.length) {
    if (!isLocatable(store)) {
      darkstoreBlock = `
    <div class="risk-block" data-kind="derived" style="margin-top:14px">
      <div class="risk-block-head">
        <span class="kind-pill kind-derived">derived</span>
        <span class="risk-block-title">Quick-commerce dark stores nearby</span>
      </div>
      <p class="risk-sentence"><strong>Distance unavailable</strong> — store not precisely located.</p>
    </div>`;
    } else {
      let nearestKm = Infinity;
      let nearestBrand = null;
      let within1km = 0;
      for (const d of darkstoresData.darkstores) {
        const km = haversineKm(store, d);
        if (km < nearestKm) {
          nearestKm = km;
          nearestBrand = d.brand;
        }
        if (km <= 1) within1km++;
      }
      // Asked the fund directly whether they have their own cannibalisation
      // formula (weights, thresholds, etc.) — they said no: they just look
      // at these same metrics (the Excel financials, dark-store proximity,
      // DMart/peer data) together, without a formula they could hand over.
      // So there's no real methodology waiting to replace this — this IS
      // the synthesis, for as long as it stays true. Still labelled
      // "estimate," not "derived": it's our own numeric combination of the
      // same proximity+density weights already trusted for the
      // store-network score above, not something the fund has reviewed or
      // endorsed as correct. The one judgment call made here: density
      // counted within 1 km, not the 3 km used for the store-network score
      // — quick-commerce delivery radii are themselves ~1-2 km, so 3 km
      // would blur every store in a dense town into the same saturated
      // reading.
      const combinedScore = overlapRisk(nearestKm, within1km);
      darkstoreBlock = `
    <div class="risk-block" data-kind="estimate" style="margin-top:14px">
      <div class="risk-block-head">
        <span class="kind-pill kind-estimate">estimate</span>
        <span class="risk-block-title">Quick-commerce cannibalisation — our combined read</span>
      </div>
      <div class="risk-inputs">
        <div class="risk-input">
          <span class="ri-label">Nearest dark store</span>
          <span class="ri-value">${round2(nearestKm)} km (${escapeHtml(nearestBrand)})</span>
        </div>
        <div class="risk-input">
          <span class="ri-label">Dark stores within 1 km</span>
          <span class="ri-value">${within1km} <span style="color:var(--text-4);font-weight:400">(of ${darkstoresData.darkstores.length} in the region)</span></span>
        </div>
      </div>
      <div class="risk-score-row">
        <span>Combined score</span>
        <span class="risk-score-value">${combinedScore != null ? combinedScore.toFixed(2) : "Not scored"}</span>
      </div>
      <p class="risk-caveat">Blinkit / Zepto / Swiggy Instamart · third-party data, March 2026 snapshot.</p>
    </div>`;
    }
  }

  qs("#sheetScroll").innerHTML = `
    <div style="padding: 4px 26px 26px">
      <table class="metric-table">
        <tr><td>Locality</td><td style="text-align:left;font-family:inherit;font-weight:400;color:var(--text-2)">${escapeHtml(store.locality)}</td></tr>
        <tr><td>Town</td><td style="text-align:left;font-family:inherit;font-weight:400;color:var(--text-2)">${escapeHtml(store.town)}</td></tr>
        <tr><td>District</td><td style="text-align:left;font-family:inherit;font-weight:400;color:var(--text-2)">${escapeHtml(store.district)}, ${escapeHtml(store.state)}</td></tr>
        <tr><td>Opened</td><td style="text-align:left;font-family:inherit;font-weight:400;color:var(--text-2)">${store.opened ? fmtDate(store.opened) : "—"}</td></tr>
        <tr><td>Area</td><td style="text-align:left;font-family:inherit;font-weight:400;color:var(--text-2)">${store.area_sqft.toLocaleString("en-IN")} sq ft <span class="kind-pill kind-estimate" data-kind="estimate">estimate</span></td></tr>
      </table>
      ${
        store.source_note
          ? `<div class="flag-card" data-kind="reported" style="margin-top:10px">
               <span class="flag-ico"><i data-lucide="newspaper" class="i16"></i></span>
               <div>
                 <span class="flag-title">Not from the client's own store file</span>
                 <p>${escapeHtml(store.source_note)}</p>
               </div>
             </div>`
          : ""
      }
      ${
        isCoarseMatch
          ? `<p class="risk-caveat" style="margin-top:10px">Pin is a ${escapeHtml(store.town)} town centroid, not this store's address.</p>`
          : ""
      }
      ${riskBlock}
      ${darkstoreBlock}
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
        <code>node scripts/geocode.mjs</code> (Nominatim, no key needed) or set
        <code>GOOGLE_MAPS_API_KEY</code> for the more precise provider, then
        re-run <code>scripts/build-proximity.mjs</code> to see them here.
      </p>
    </div>
  `;
  refreshIcons();
}

function initLeafletMap(container, geocodedStores, totalStoreCount) {
  // scrollWheelZoom is deliberately OFF, permanently — not just disabled
  // until the first click. With it on, a normal mouse-wheel scroll down the
  // page zooms the map out instead whenever the cursor happens to be over
  // it, and enough of that lands on a whole-world view with no obvious way
  // back (found via a live report on the deployed dashboard). Turning it
  // back on after the user's first click into the map — e.g. to open a
  // store's popup, the primary way to interact with it — would silently
  // reintroduce the exact same trap on the very next scroll past the map.
  // The +/− buttons and double-click zoom are enabled by default and are
  // enough to navigate; nothing here needs the wheel.
  map = window.L.map(container, { scrollWheelZoom: false });

  window.L.tileLayer(OSM_TILE_URL, { attribution: OSM_ATTRIBUTION, maxZoom: 19 }).addTo(map);

  const bounds = [];
  for (const store of geocodedStores) {
    const isClosed = store.status === "closed";
    // Two independent reasons a pin isn't trustworthy: the client's own
    // address-quality read (geo_confidence), or the geocoder having fallen
    // back to a town-level centroid (geocode_match_tier) — a coarse match
    // is just as imprecise regardless of what geo_confidence says, since
    // several stores in the same town land on the literal same point.
    const isCoarseMatch = isCoarseTier(store.geocode_match_tier);
    const isLowConfidence = store.geo_confidence === "low";
    const isUncertain = isCoarseMatch || isLowConfidence;
    const bucket = vintageBucketFor(store);
    const color = isClosed ? resolveCssVar(CLOSED_COLOR) : isUncertain ? resolveCssVar(LOW_CONFIDENCE_COLOR) : resolveCssVar(bucket.color);

    let layer;
    if (isUncertain) {
      // Uncertainty circle, not a precise pin. A town-centroid fallback can
      // be off by the width of the whole town, so it gets a bigger radius
      // than a merely low-confidence address (~street-level uncertainty).
      layer = window.L.circle([store.lat, store.lng], {
        radius: isCoarseMatch ? 2200 : 1200,
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

  // Dark-store overlay added AFTER fitBounds/reset-view are set up from
  // Patel's own stores only — 352 extra points would otherwise pull the
  // initial zoom out far past the network itself, and the reset button
  // should always mean "back to my own stores," not "back to whatever's
  // currently toggled on."
  if (darkstoresData?.darkstores?.length) addDarkstoreLayers(map);

  if (bounds.length) {
    map.fitBounds(bounds, { padding: [30, 30], maxZoom: 14 });
    addResetViewControl(map, bounds, totalStoreCount);
  } else {
    map.setView(CENTER_FALLBACK, 10);
  }
}

/**
 * Quick-commerce dark-store overlay (Blinkit / Zepto / Swiggy Instamart) —
 * see scripts/fetch-darkstores.mjs for why this exists and its caveats
 * (third-party data, March 2026 snapshot, not live). Off by default so the
 * first thing anyone sees is Patel's own stores; a Leaflet layer
 * control makes each brand a one-click toggle.
 */
function addDarkstoreLayers(mapInstance) {
  const byBrand = new Map();
  for (const d of darkstoresData.darkstores) {
    if (!byBrand.has(d.brand)) byBrand.set(d.brand, window.L.layerGroup());
    const color = DARKSTORE_BRAND_COLORS[d.brand] || "#888";
    const marker = window.L.circleMarker([d.lat, d.lng], {
      radius: 4,
      color: "#fff",
      weight: 1,
      fillColor: color,
      fillOpacity: 0.85,
    });
    marker.bindPopup(
      `<strong>${escapeHtml(d.brand)} dark store</strong>${d.label ? `<br>${escapeHtml(d.label)}` : ""}${
        d.accuracy_m != null ? `<br><span style="color:var(--text-4)">±${d.accuracy_m}m</span>` : ""
      }<br><span style="color:var(--text-4);font-size:11px">Third-party data, March 2026 snapshot — not live</span>`
    );
    marker.addTo(byBrand.get(d.brand));
  }

  const overlays = {};
  for (const [brand, group] of byBrand) {
    const count = darkstoresData.counts?.[brand]?.in_region ?? "?";
    overlays[`<span style="color:${DARKSTORE_BRAND_COLORS[brand] || "#888"};font-weight:700">●</span> ${brand} (${count})`] = group;
  }
  window.L.control.layers(null, overlays, { collapsed: false, position: "topright" }).addTo(mapInstance);
}

/**
 * A one-click way back to "all own stores" after zooming/panning around —
 * without it, the only way back is a page refresh, which loses whatever
 * else the user was looking at elsewhere on the page.
 */
function addResetViewControl(mapInstance, bounds, totalStoreCount) {
  const ResetControl = window.L.Control.extend({
    options: { position: "topleft" },
    onAdd() {
      const el = window.L.DomUtil.create("div", "leaflet-bar map-reset-control");
      el.innerHTML = `<a href="#" title="Reset to all ${totalStoreCount} stores" role="button" aria-label="Reset map view">⤢</a>`;
      window.L.DomEvent.on(el, "click", (e) => {
        window.L.DomEvent.preventDefault(e);
        window.L.DomEvent.stopPropagation(e);
        mapInstance.fitBounds(bounds, { padding: [30, 30], maxZoom: 14 });
      });
      window.L.DomEvent.disableClickPropagation(el);
      return el;
    },
  });
  new ResetControl().addTo(mapInstance);
}

/** Called when the map tab becomes visible after being hidden — Leaflet needs this or the tiles render half-grey. */
export function invalidateMapSize() {
  if (map) map.invalidateSize();
}

export async function initMap() {
  const container = qs("#mapContainer");
  try {
    const [storesData, proximity, darkstores] = await Promise.all([
      loadJson("./data/stores.json"),
      loadJson("./data/proximity.json"),
      // Optional: darkstores.json only exists once someone has run
      // scripts/fetch-darkstores.mjs. Missing it degrades gracefully —
      // everything else on this view still works without it.
      loadJson("./data/darkstores.json").catch(() => null),
    ]);
    const stores = storesData.stores;
    storesById = new Map(stores.map((s) => [s.store_id, s]));
    proximityByStoreId = new Map((proximity.per_store || []).map((p) => [p.store_id, p]));
    darkstoresData = darkstores;

    const titleEl = qs("#mapNetworkTitle");
    if (titleEl) titleEl.textContent = `${stores.length}-Store Network`;
    const hintCountEl = qs("#mapHintCount");
    if (hintCountEl) hintCountEl.textContent = `all ${stores.length} stores`;

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

    initLeafletMap(container, geocodedStores, stores.length);
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
