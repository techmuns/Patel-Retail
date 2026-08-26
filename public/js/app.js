/**
 * public/js/app.js — bootstrap for the Patel Retail dashboard.
 * NEW file (not copied from the donor — its app.js is concall-specific).
 * Wires the view tabs, the estimate-highlight toggle, and lazily inits
 * each view's module on first show.
 */
import { qs, qsa, refreshIcons, toast } from "./ui.js";
import { initMap, invalidateMapSize, openStoreById } from "./map.js";
import { initEconomics } from "./economics.js";
import { initScreener } from "./screener.js";
import { initEstate } from "./estate.js";
import { initPeers } from "./peers.js";
import { exportPatelReportPdf } from "./patel-report.js";
import { exportPatelXlsx } from "./patel-export-xlsx.js";

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
    entry.ready = Promise.resolve(entry.init());
  } else if (view === "map") {
    // Leaflet needs this after its container was `display:none` — otherwise
    // the tiles render half-grey until the next manual resize.
    invalidateMapSize();
  }

  const footStatus = qs("#footStatus");
  if (footStatus) {
    footStatus.textContent = FOOT_STATUS_LABEL[view] || view;
  }
  return VIEW_INITIALIZERS[view]?.ready ?? Promise.resolve();
}

/**
 * Cross-view navigation. Any view can ask for a specific store to be opened
 * on the map without importing map.js itself (which would couple the views
 * to each other); it dispatches `patel:open-store` and this is the single
 * place that knows how to service it. Awaits the map's own init first, so
 * this works even on a cold load where the map tab was never opened.
 */
function wireCrossViewNavigation() {
  document.addEventListener("patel:open-store", async (e) => {
    const storeId = e.detail?.storeId;
    if (!storeId) return;
    await showView("map");
    openStoreById(storeId);
  });
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

/** Shared busy-state handler for the two export buttons: disable + swap the
 *  icon for the donor's existing .btn-spin, restore on completion either way,
 *  and report success/failure via the existing toast system rather than
 *  silently failing if a CDN lib (jsPDF/html2canvas/ExcelJS) didn't load. */
function wireExportButton(buttonId, iconName, run) {
  const btn = qs(buttonId);
  if (!btn) return;
  const label = btn.querySelector("span");
  const icon = btn.querySelector("i");
  const originalLabel = label?.textContent || "";
  btn.addEventListener("click", async () => {
    if (btn.disabled) return;
    btn.disabled = true;
    if (icon) icon.outerHTML = '<span class="btn-spin"></span>';
    try {
      await run((stage) => {
        if (label) label.textContent = stage || originalLabel;
      });
      toast("ok", "Export ready", `${originalLabel} downloaded.`);
    } catch (err) {
      toast("err", `${originalLabel} failed`, err.message || "See console for details.");
      console.error(err);
    } finally {
      btn.disabled = false;
      if (label) label.textContent = originalLabel;
      const spin = btn.querySelector(".btn-spin");
      if (spin) spin.outerHTML = `<i data-lucide="${iconName}" class="i16"></i>`;
      refreshIcons();
    }
  });
}

function wireExports() {
  wireExportButton("#exportPdfBtn", "file-down", (onStage) => exportPatelReportPdf({ onStage }));
  wireExportButton("#exportXlsxBtn", "table", () => exportPatelXlsx());
}

function init() {
  refreshIcons();
  wireTabs();
  wireCrossViewNavigation();
  wireHighlightToggle();
  wireExports();
  showView("map"); // default tab, already active in the markup
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
