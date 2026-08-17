/**
 * public/js/app.js — bootstrap for the Patel Retail dashboard.
 * NEW file (not copied from the donor — its app.js is concall-specific).
 * Wires the view tabs, the estimate-highlight toggle, and lazily inits
 * each view's module on first show.
 */
import { qs, qsa, refreshIcons } from "./ui.js";
import { initMap, invalidateMapSize } from "./map.js";
import { initEconomics } from "./economics.js";
import { initScreener } from "./screener.js";
import { initEstate } from "./estate.js";
import { initPeers } from "./peers.js";

const VIEW_INITIALIZERS = {
  map: { init: initMap, started: false },
  economics: { init: initEconomics, started: false },
  screener: { init: initScreener, started: false },
  estate: { init: initEstate, started: false },
  peers: { init: initPeers, started: false },
};
const FOOT_STATUS_LABEL = {
  map: "Network map",
  economics: "Store economics",
  screener: "Site screener",
  estate: "Estate & vintage",
  peers: "Peer benchmark",
};

function showView(view) {
  qsa(".view").forEach((el) => el.classList.add("hidden"));
  const target = qs(`#view${view.charAt(0).toUpperCase()}${view.slice(1)}`);
  if (target) target.classList.remove("hidden");

  qsa(".vtab").forEach((btn) => btn.classList.toggle("active", btn.dataset.view === view));

  const entry = VIEW_INITIALIZERS[view];
  if (entry && !entry.started) {
    entry.started = true;
    entry.init();
  } else if (view === "map") {
    // Leaflet needs this after its container was `display:none` — otherwise
    // the tiles render half-grey until the next manual resize.
    invalidateMapSize();
  }

  const footStatus = qs("#footStatus");
  if (footStatus) {
    footStatus.textContent = FOOT_STATUS_LABEL[view] || view;
  }
}

function wireTabs() {
  qsa(".vtab").forEach((btn) => {
    btn.addEventListener("click", () => showView(btn.dataset.view));
  });
}

function wireHighlightToggle() {
  const toggle = qs("#highlightEstimates");
  const app = qs("#app");
  if (!toggle || !app) return;
  toggle.addEventListener("change", () => {
    app.classList.toggle("highlight-estimates", toggle.checked);
  });
}

function init() {
  refreshIcons();
  wireTabs();
  wireHighlightToggle();
  showView("map"); // default tab, already active in the markup
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
