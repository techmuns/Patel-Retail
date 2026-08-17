/**
 * public/js/peers.js — Peer Benchmark view. Rebuilds the client's broken
 * peer model per PATEL-HANDOFF.md §10 (all 10 documented bugs), surfacing
 * the two fixes that actually matter (Trent's revenue/area mismatch,
 * Spencer's gross-profit formula bug) prominently. Everything shown is
 * either a number given directly in the handoff or computed live from
 * stores.json — nothing here is estimated to fill a gap. Where the correct
 * number genuinely isn't available (Osia/V2 financials, a few bug-affected
 * cells), that's stated plainly instead of guessed.
 */
import { qs, escapeHtml, refreshIcons } from "./ui.js";

const STATUS_META = {
  fixed: { label: "Fixed here", tone: "ok" },
  partially_fixed: { label: "Partially fixed", tone: "warn" },
  needs_source_file: { label: "Needs source file", tone: "err" },
  not_applicable: { label: "Not applicable here", tone: "muted" },
  confirmed_harmless: { label: "Confirmed harmless", tone: "ok" },
};

async function loadMetrics() {
  const res = await fetch("./data/metrics.json", { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load metrics.json: ${res.status}`);
  return res.json();
}

async function loadStores() {
  const res = await fetch("./data/stores.json", { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load stores.json: ${res.status}`);
  return (await res.json()).stores;
}

function fmtCr(value) {
  return `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 1 })} cr`;
}
function fmtLakh(value) {
  return `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 0 })} L`;
}
function fmtPct(value, digits = 1) {
  return `${(value * 100).toFixed(digits)}%`;
}

function renderPeerBugsTable(metrics) {
  const body = qs("#peerBugsTableBody");
  body.innerHTML = metrics.peer_model_bugs.items
    .map((item) => {
      const meta = STATUS_META[item.status] || STATUS_META.needs_source_file;
      return `
    <tr>
      <td style="max-width:340px">${escapeHtml(item.issue)}</td>
      <td style="max-width:280px;color:var(--text-3);font-size:12.5px">${escapeHtml(item.effect)}</td>
      <td><span class="chip ${meta.tone === "ok" ? "done" : meta.tone === "warn" ? "queued" : meta.tone === "err" ? "failed" : "src-none"}"><span class="cdot"></span>${escapeHtml(meta.label)}</span></td>
    </tr>
    ${item.verified_note ? `<tr><td colspan="3" style="color:var(--text-4);font-size:11.5px;padding-top:0"><strong style="color:var(--text-3)">Verified against primary source:</strong> ${escapeHtml(item.verified_note)}</td></tr>` : ""}`;
    })
    .join("");
}

function renderTrentFixCard(metrics) {
  const t = metrics.peer_model_corrections.trent;
  const el = qs("#trentFixCard");
  el.innerHTML = `
    <div class="card-head">
      <div>
        <h3><span class="card-ico" style="background: var(--grad-warm)"><i data-lucide="triangle-alert" class="i16"></i></span>Trent revenue — fixed</h3>
      </div>
    </div>
    <div class="card-body">
      <div class="compare-row">
        <div class="compare-box" data-kind="reported">
          <div class="cb-label">Old model (wrong)</div>
          <div class="cb-value">${fmtCr(t.wrong_revenue_cr)}</div>
          <div class="cb-source">${escapeHtml(t.wrong_note)}</div>
        </div>
        <div class="compare-box used" data-kind="reported">
          <div class="cb-label">Corrected</div>
          <div class="cb-value">${fmtCr(t.corrected_revenue_cr)}</div>
          <div class="cb-source">${escapeHtml(t.corrected_note)}</div>
        </div>
      </div>
      <div class="compare-row">
        <div class="compare-box" data-kind="derived">
          <div class="cb-label">Revenue/store (old, wrong)</div>
          <div class="cb-value">${fmtLakh(t.wrong_revenue_per_store_lakh)}</div>
        </div>
        <div class="compare-box used" data-kind="derived">
          <div class="cb-label">Revenue/store (corrected)</div>
          <div class="cb-value">${fmtLakh(t.corrected_revenue_per_store_lakh)}</div>
        </div>
      </div>
      <div class="flag-card" data-kind="derived">
        <span class="flag-ico"><i data-lucide="info" class="i16"></i></span>
        <div><p>${escapeHtml(t.revenue_per_store_note)}</p></div>
      </div>
      <div class="flag-card">
        <span class="flag-ico"><i data-lucide="info" class="i16"></i></span>
        <div><p>${escapeHtml(t.still_needs_source_file)}</p></div>
      </div>
    </div>
  `;
  refreshIcons();
}

function renderSpencersFixCard(metrics) {
  const s = metrics.peer_model_corrections.spencers;
  const el = qs("#spencersFixCard");
  el.innerHTML = `
    <div class="card-head">
      <div>
        <h3><span class="card-ico" style="background: var(--grad-warm)"><i data-lucide="triangle-alert" class="i16"></i></span>Spencer's gross profit — fixed</h3>
      </div>
    </div>
    <div class="card-body">
      <div class="compare-row">
        <div class="compare-box" data-kind="reported">
          <div class="cb-label">Old model (wrong)</div>
          <div class="cb-value">${fmtCr(s.wrong_gross_profit_cr)}</div>
          <div class="cb-source">${escapeHtml(s.wrong_formula)}</div>
        </div>
        <div class="compare-box used" data-kind="reported">
          <div class="cb-label">Corrected</div>
          <div class="cb-value">${fmtCr(s.corrected_gross_profit_cr)}</div>
          <div class="cb-source">${escapeHtml(s.corrected_formula)}</div>
        </div>
      </div>
      <div class="flag-card">
        <span class="flag-ico"><i data-lucide="triangle-alert" class="i16"></i></span>
        <div>
          <span class="flag-title">Understated by ${fmtPct(s.understated_pct, 0)}</span>
          <p>${escapeHtml(s.still_needs_source_file)}</p>
        </div>
      </div>
    </div>
  `;
  refreshIcons();
}

function renderPeerScaleCard(metrics) {
  const gap = metrics.peer_scale_gap;
  const el = qs("#peerScaleCard");
  el.innerHTML = `
    <div class="card-head">
      <div>
        <h3><span class="card-ico" style="background: var(--grad-cool)"><i data-lucide="scale" class="i16"></i></span>Missing peers near Patel's scale</h3>
      </div>
    </div>
    <div class="card-body">
      <div class="empty" style="padding:24px 16px; min-height:auto">
        <div class="empty-ico" style="width:52px;height:52px;font-size:22px"><i data-lucide="scale"></i></div>
        <h4 style="font-size:15px">${gap.companies.map(escapeHtml).join(" · ")}</h4>
        <p>${escapeHtml(gap.note)}</p>
        ${gap.verified_against_primary_source ? `<p style="font-size:11.5px;color:var(--text-4);margin-top:8px">${escapeHtml(gap.verified_against_primary_source)}</p>` : ""}
      </div>
    </div>
  `;
  refreshIcons();
}

function renderPrivateLabelBlock(metrics) {
  const el = qs("#peerPrivateLabelBlock");
  const pl = metrics.peer_comparison.private_label_pct;
  const rows = [
    { label: "Patel Retail", value: pl.patel, highlight: true },
    { label: "DMart", value: pl.dmart },
    { label: "Vishal Mega Mart", value: pl.vishal_mega_mart },
    { label: "Trent", value: pl.trent },
  ];
  const max = Math.max(...rows.map((r) => r.value));
  el.innerHTML = `
    <div data-kind="reported">
      ${rows
        .map(
          (r) => `
        <div style="margin-bottom:12px">
          <div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:4px">
            <span style="color:${r.highlight ? "var(--text-1)" : "var(--text-3)"};font-weight:${r.highlight ? 700 : 500}">${escapeHtml(r.label)}</span>
            <span class="mono">${fmtPct(r.value, 1)}</span>
          </div>
          <div style="height:8px;border-radius:99px;background:var(--hairline)">
            <div style="height:100%;width:${(r.value / max) * 100}%;border-radius:99px;background:${r.highlight ? "var(--grad-primary)" : "var(--text-4)"}"></div>
          </div>
        </div>`
        )
        .join("")}
      <p style="font-size:12px;color:var(--text-4);margin:8px 0 0">${escapeHtml(pl.note)}</p>
      <p style="font-size:11px;color:var(--text-4);margin:4px 0 0">Osia Hyper Retail / V2 Retail private label % not supplied either — same gap as above.</p>
    </div>
  `;
}

function renderPeerContradictionsTable(metrics, storeCount) {
  const body = qs("#peerContradictionsTableBody");
  const c = metrics.cross_file_contradictions;
  const rows = [
    { metric: "Store count", peer: c.store_count.peer_model, store: `${c.store_count.store_file_operational} (+${c.store_count.store_file_operational_plus_closed - c.store_count.store_file_operational} closed) = ${c.store_count.store_file_operational_plus_closed}`, note: c.store_count.note },
    { metric: "Avg store size", peer: `${c.avg_store_size_sqft.peer_model.toLocaleString("en-IN")} sq ft`, store: `${c.avg_store_size_sqft.store_file.toLocaleString("en-IN")} sq ft` },
    { metric: "Revenue / sq ft / yr", peer: `₹${c.revenue_per_sqft_year.peer_model.toLocaleString("en-IN")}`, store: `₹${c.revenue_per_sqft_year.store_file.toLocaleString("en-IN")}`, note: `${(c.revenue_per_sqft_year.gap_pct * 100).toFixed(0)}% gap — store-file value used in this dashboard throughout` },
    { metric: "Avg bill size", peer: `₹${c.avg_bill_size.peer_model}`, store: `₹${c.avg_bill_size.store_file}` },
    { metric: "Footprint", peer: escapeHtml(metrics.peer_model_corrections.patel_footprint.wrong), store: escapeHtml(metrics.peer_model_corrections.patel_footprint.corrected), note: `Verified live against stores.json — ${storeCount} stores` },
  ];
  body.innerHTML = rows
    .map(
      (r) => `
    <tr>
      <td>${escapeHtml(r.metric)}</td>
      <td class="mono">${r.peer}</td>
      <td class="mono">${r.store}</td>
    </tr>
    ${r.note ? `<tr><td colspan="3" style="color:var(--text-4);font-size:11.5px;padding-top:0">${escapeHtml(r.note)}</td></tr>` : ""}`
    )
    .join("");
}

export async function initPeers() {
  const container = qs("#viewPeers");
  try {
    const [metrics, stores] = await Promise.all([loadMetrics(), loadStores()]);
    renderPeerBugsTable(metrics);
    renderTrentFixCard(metrics);
    renderSpencersFixCard(metrics);
    renderPeerScaleCard(metrics);
    renderPrivateLabelBlock(metrics);
    renderPeerContradictionsTable(metrics, stores.length);
  } catch (err) {
    if (container) {
      container.innerHTML = `<div class="empty"><div class="empty-ico"><i data-lucide="alert-triangle"></i></div><h4>Couldn't load peer data</h4><p>${escapeHtml(err.message)}</p></div>`;
      refreshIcons();
    }
  }
}
