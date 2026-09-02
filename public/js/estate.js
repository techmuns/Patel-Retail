/**
 * public/js/estate.js — Estate & Vintage view. Openings by year, cumulative
 * store count, age distribution, and town saturation over time — entirely
 * from public/data/stores.json's `opened` dates. No geocoding, no
 * estimates: every figure here is either a straight count or a date-math
 * derivation from a reported field.
 */
import { qs, escapeHtml, refreshIcons } from "./ui.js";
import { VINTAGE_BUCKETS, yearsSince } from "./vintage.js";

const PRE_BUCKET_YEAR = 2020; // years before this are grouped into one bar — 21 distinct single-digit-count years is clutter, not signal

async function loadStores() {
  const res = await fetch("./data/stores.json", { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load stores.json: ${res.status}`);
  return (await res.json()).stores;
}

function openedYear(store) {
  if (!store.opened) return null;
  return parseInt(store.opened.slice(0, 4), 10);
}

function fmtYearsAgo(yrs) {
  if (yrs < 1) {
    const months = Math.max(1, Math.round(yrs * 12));
    return `${months} ${months === 1 ? "month" : "months"}`;
  }
  return `${yrs.toFixed(1)} yrs`;
}

function renderKpis(stores) {
  const el = qs("#estateKpis");
  const withDates = stores.filter((s) => s.opened);

  const in2024Plus = withDates.filter((s) => openedYear(s) >= 2024).length;
  const in2024PlusPct = Math.round((in2024Plus / stores.length) * 100);

  const rollingCutoffYrs = 2;
  const rollingRecent = withDates.filter((s) => yearsSince(s.opened) < rollingCutoffYrs).length;
  const rollingRecentPct = Math.round((rollingRecent / stores.length) * 100);

  const oldest = withDates.reduce((a, b) => (a.opened < b.opened ? a : b));
  const newest = withDates.reduce((a, b) => (a.opened > b.opened ? a : b));

  el.innerHTML = `
    <div class="kpi k1">
      <div class="kpi-top"><span class="kpi-label">Opened 2024 or Later</span><span class="kpi-ico"><i data-lucide="calendar-plus"></i></span></div>
      <div class="kpi-value">${in2024Plus}<span class="unit">/ ${stores.length}</span></div>
      <div class="kpi-delta"><i data-lucide="check" class="i16"></i> ${in2024PlusPct}% of the estate</div>
    </div>
    <div class="kpi k2">
      <div class="kpi-top"><span class="kpi-label">Under 2 Years Old, Today</span><span class="kpi-ico"><i data-lucide="sprout"></i></span></div>
      <div class="kpi-value">${rollingRecentPct}<span class="unit">%</span></div>
      <div class="kpi-delta"><i data-lucide="info" class="i16"></i> ${rollingRecent} stores</div>
    </div>
    <div class="kpi k3">
      <div class="kpi-top"><span class="kpi-label">Oldest Store</span><span class="kpi-ico"><i data-lucide="landmark"></i></span></div>
      <div class="kpi-value" style="font-size:20px">${escapeHtml(oldest.name)}</div>
      <div class="kpi-delta">${escapeHtml(oldest.opened)} · ${fmtYearsAgo(yearsSince(oldest.opened))} ago</div>
    </div>
    <div class="kpi k4 kpi-clickable" data-store-id="${escapeHtml(newest.store_id)}" role="button" tabindex="0" title="Show ${escapeHtml(newest.name)} on the network map">
      <div class="kpi-top"><span class="kpi-label">Newest Store</span><span class="kpi-ico"><i data-lucide="sparkles"></i></span></div>
      <div class="kpi-value" style="font-size:20px">${escapeHtml(newest.name)}</div>
      <div class="kpi-delta">${escapeHtml(newest.opened)} · ${fmtYearsAgo(yearsSince(newest.opened))} ago <span class="kpi-cta">View on map →</span></div>
    </div>
  `;
  wireStoreLinks(el);
  refreshIcons();
}

/**
 * Any KPI marked .kpi-clickable[data-store-id] opens that store on the
 * Network Map. Uses the `patel:open-store` event app.js listens for rather
 * than importing map.js here, so the two views stay decoupled.
 */
function wireStoreLinks(root) {
  root.querySelectorAll(".kpi-clickable[data-store-id]").forEach((el) => {
    const go = () => document.dispatchEvent(new CustomEvent("patel:open-store", { detail: { storeId: el.dataset.storeId } }));
    el.addEventListener("click", go);
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        go();
      }
    });
  });
}

function renderOpeningsChart(stores) {
  const el = qs("#openingsChart");
  const withDates = stores.filter((s) => s.opened);

  const preBucket = withDates.filter((s) => openedYear(s) < PRE_BUCKET_YEAR);
  const byYear = new Map();
  for (const s of withDates) {
    const y = openedYear(s);
    if (y < PRE_BUCKET_YEAR) continue;
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y).push(s);
  }
  const years = [...byYear.keys()].sort((a, b) => a - b);
  const bars = [
    { label: `< ${PRE_BUCKET_YEAR}`, count: preBucket.length, stores: preBucket },
    ...years.map((y) => ({ label: String(y), count: byYear.get(y).length, stores: byYear.get(y) })),
  ];
  const max = Math.max(...bars.map((b) => b.count));

  // Gridlines on a rounded scale, so a bar can be read against an axis rather
  // than only against the number printed on top of it.
  const step = max > 40 ? 20 : max > 20 ? 10 : 5;
  const scaleMax = Math.ceil(max / step) * step;
  const gridValues = [];
  for (let v = 0; v <= scaleMax; v += step) gridValues.push(v);
  const GUTTER = 30;
  const PLOT_H = 190;

  el.innerHTML = `
    <div style="padding-left:${GUTTER}px">
      <div style="position:relative; height:${PLOT_H}px">
        ${gridValues
          .map(
            (v) => `
          <div style="position:absolute; left:-${GUTTER}px; right:0; top:${((scaleMax - v) / scaleMax) * 100}%; height:0; display:flex; align-items:center; gap:6px; pointer-events:none">
            <span style="width:${GUTTER - 8}px; text-align:right; font-size:10.5px; color:var(--text-4); line-height:1; transform:translateY(-0.5px)">${v}</span>
            <span style="flex:1; height:1px; background:var(--hairline)"></span>
          </div>`
          )
          .join("")}
        <div style="position:relative; display:flex; align-items:flex-end; gap:10px; height:100%">
          ${bars
            .map(
              (b, i) => `
            <button type="button" class="bar-hit" data-bar="${i}" aria-label="${escapeHtml(b.label)}: ${b.count} opened">
              <div style="font-size:12px; font-weight:700; color:var(--text-1); margin-bottom:4px">${b.count}</div>
              <div class="bar-fill" style="height:${Math.max((b.count / scaleMax) * 100, 1.5)}%"></div>
            </button>`
            )
            .join("")}
        </div>
      </div>
      <div style="display:flex; gap:10px; padding:6px 0 0; border-top:1px solid var(--hairline); margin-top:6px">
        ${bars.map((b) => `<div style="flex:1; text-align:center; font-size:11.5px; color:var(--text-2); font-weight:500">${escapeHtml(b.label)}</div>`).join("")}
      </div>
      <div id="openingsDetail" class="cume-detail" hidden></div>
    </div>
  `;
  wireOpeningsChart(el, bars);
}

/**
 * Same interaction as the cumulative chart: hover a bar for its stores, click
 * to pin, click a store to open it on the map.
 */
function wireOpeningsChart(root, bars) {
  const detail = root.querySelector("#openingsDetail");
  if (!detail) return;
  let pinned = null;
  let shown = null;

  const show = (i) => {
    if (shown === i) return;
    const b = bars[i];
    if (!b) return;
    shown = i;
    renderStorePanel(detail, b.label, `${b.count} opened`, b.stores);
  };
  let holdTimer = null;
  const cancelHold = () => {
    if (holdTimer) clearTimeout(holdTimer);
    holdTimer = null;
  };
  const clear = () => {
    cancelHold();
    holdTimer = setTimeout(() => {
      if (pinned == null) {
        detail.hidden = true;
        shown = null;
      } else {
        show(pinned);
      }
    }, 400);
  };
  detail.addEventListener("mouseenter", cancelHold);
  detail.addEventListener("mouseleave", clear);

  root.querySelectorAll(".bar-hit").forEach((hit) => {
    const i = Number(hit.dataset.bar);
    hit.addEventListener("mouseenter", () => {
      cancelHold();
      show(i);
    });
    hit.addEventListener("focus", () => {
      cancelHold();
      show(i);
    });
    hit.addEventListener("mouseleave", clear);
    hit.addEventListener("blur", clear);
    hit.addEventListener("click", () => {
      pinned = pinned === i ? null : i;
      root.querySelectorAll(".bar-hit").forEach((h) => h.classList.toggle("is-pinned", Number(h.dataset.bar) === pinned));
      clear();
    });
  });

  wireStorePanelLinks(detail);
}

function renderCumulativeChart(stores) {
  const el = qs("#cumulativeChart");
  const withDates = stores
    .filter((s) => s.opened)
    .slice()
    .sort((a, b) => a.opened.localeCompare(b.opened));

  const caption = qs("#cumulativeChartCaption");
  if (caption) {
    const excluded = stores.length - withDates.length;
    caption.textContent =
      excluded > 0
        ? `1990 → today, ${withDates.length} of ${stores.length} stores — ${excluded} excluded (no recorded opening date)`
        : `1990 → today, all ${stores.length} stores`;
  }

  const byYear = new Map();
  for (const s of withDates) {
    const y = openedYear(s);
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y).push(s);
  }
  const years = [...byYear.keys()].sort((a, b) => a - b);
  let cumulative = 0;
  const points = years.map((y) => {
    const opened = byYear.get(y);
    cumulative += opened.length;
    return { year: y, count: cumulative, opened };
  });

  // Chart geometry. The SVG is stretched to the container width with
  // preserveAspectRatio="none", which distorts anything with a shape — the
  // dots rendered as ellipses and the stroke thinned out. So the SVG now
  // carries only the line, the area and horizontal gridlines (none of which
  // read as distorted), the stroke opts out of scaling, and every label is
  // real HTML positioned over it.
  const W = 720;
  const H = 200;
  const GUTTER = 46; // room for the y-axis labels, in CSS pixels

  const maxCount = points[points.length - 1].count;
  const minYear = points[0].year;
  const maxYear = points[points.length - 1].year;
  // Round the top of the scale up to a clean number so the gridlines land on
  // whole stores rather than on 13.25.
  const step = maxCount > 40 ? 20 : maxCount > 20 ? 10 : 5;
  const scaleMax = Math.ceil(maxCount / step) * step;

  const x = (year) => ((year - minYear) / (maxYear - minYear || 1)) * W;
  const y = (count) => H - (count / scaleMax) * H;

  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(p.year).toFixed(1)} ${y(p.count).toFixed(1)}`).join(" ");
  const areaD = `${pathD} L ${W} ${H} L 0 ${H} Z`;

  const gridValues = [];
  for (let v = 0; v <= scaleMax; v += step) gridValues.push(v);

  // Year ticks: first, last, and evenly spaced years in between — two labels
  // across 36 years said nothing about when the estate actually grew.
  const tickCount = 10;
  const tickYears = [];
  for (let i = 0; i < tickCount; i++) {
    const yr = Math.round(minYear + ((maxYear - minYear) * i) / (tickCount - 1));
    if (!tickYears.includes(yr)) tickYears.push(yr);
  }

  el.innerHTML = `
    <div style="position:relative; padding-left:${GUTTER}px">
      <div style="position:relative; height:${H}px">
        ${gridValues
          .map(
            (v) => `
          <div style="position:absolute; left:-${GUTTER}px; right:0; top:${((scaleMax - v) / scaleMax) * 100}%; height:0; display:flex; align-items:center; gap:6px; pointer-events:none">
            <span style="width:${GUTTER - 10}px; text-align:right; font-size:10.5px; color:var(--text-4); line-height:1; transform:translateY(-0.5px)">${v}</span>
            <span style="flex:1; height:1px; background:var(--hairline)"></span>
          </div>`
          )
          .join("")}
        <svg viewBox="0 0 ${W} ${H}" style="width:100%; height:${H}px; display:block; position:relative" preserveAspectRatio="none" aria-hidden="true">
          <path d="${areaD}" fill="var(--brand-indigo)" opacity="0.1"></path>
          <path d="${pathD}" fill="none" stroke="var(--brand-indigo)" stroke-width="2.5"
                stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"></path>
        </svg>
      </div>
      <div class="cume-hits">
        ${points
          .map((pt, i) => {
            const pct = ((pt.year - minYear) / (maxYear - minYear || 1)) * 100;
            const topPct = ((scaleMax - pt.count) / scaleMax) * 100;
            return `<button type="button" class="cume-hit" data-year="${pt.year}" aria-label="${pt.year}: ${pt.count} stores"
              style="left:${pct}%"><span class="cume-dot" style="top:${topPct}%"></span></button>`;
          })
          .join("")}
      </div>
      <div style="position:relative; height:18px; margin-top:6px; border-top:1px solid var(--hairline); padding-top:6px">
        ${tickYears
          .map((yr) => {
            const pct = ((yr - minYear) / (maxYear - minYear || 1)) * 100;
            const align = pct <= 0 ? "left:0; transform:none" : pct >= 100 ? "right:0; transform:none" : `left:${pct}%; transform:translateX(-50%)`;
            return `<span style="position:absolute; ${align}; font-size:11px; color:var(--text-3); white-space:nowrap">${yr}</span>`;
          })
          .join("")}
      </div>
      <div id="cumulativeDetail" class="cume-detail" hidden></div>
    </div>
  `;
  wireCumulativeChart(el, points);
}

/**
 * The store-chip panel both charts share: a heading, a count, and one chip per
 * store that opens it on the network map.
 */
function renderStorePanel(detail, title, meta, stores) {
  detail.hidden = false;
  detail.innerHTML = `
    <div class="cume-detail-head">
      <span class="cume-detail-year">${escapeHtml(title)}</span>
      <span class="cume-detail-meta">${escapeHtml(meta)}</span>
    </div>
    <div class="cume-detail-list">
      ${stores
        .map(
          (st) =>
            `<button type="button" class="cume-store" data-store-id="${escapeHtml(st.store_id)}">${escapeHtml(st.name)}<span>${escapeHtml(st.locality || st.town)}</span></button>`
        )
        .join("")}
    </div>`;
}

/** Chips in a panel navigate to the map, via the same event the KPIs use. */
function wireStorePanelLinks(detail) {
  detail.addEventListener("click", (e) => {
    const btn = e.target.closest(".cume-store");
    if (!btn) return;
    document.dispatchEvent(new CustomEvent("patel:open-store", { detail: { storeId: btn.dataset.storeId } }));
  });
}

/**
 * Hover or focus a year to see its running total; click it to list the stores
 * that opened that year, each one a link through to the map. The chart was
 * previously a picture of a number nobody could interrogate — the interesting
 * question standing in front of it is always "which stores were those?".
 */
function wireCumulativeChart(root, points) {
  const detail = root.querySelector("#cumulativeDetail");
  if (!detail) return;
  const byYear = new Map(points.map((p) => [p.year, p]));
  let pinned = null;
  // What the panel is currently showing. Without this, moving the pointer off
  // a pinned year re-rendered the same content, detaching the store buttons
  // mid-gesture — the panel flickered and a click could land on a node that
  // had just been replaced.
  let shown = null;

  const show = (year) => {
    if (shown === year) return;
    const pt = byYear.get(year);
    if (!pt) return;
    shown = year;
    renderStorePanel(detail, String(pt.year), `${pt.opened.length} opened \u00b7 ${pt.count} total`, pt.opened);
  };
  // Leaving a 26px target used to blank the panel immediately, so the moment
  // you moved towards what you were reading, it disappeared. Hold it briefly,
  // and cancel the hold if the pointer lands on the panel itself.
  let holdTimer = null;
  const cancelHold = () => {
    if (holdTimer) clearTimeout(holdTimer);
    holdTimer = null;
  };
  const clear = () => {
    cancelHold();
    holdTimer = setTimeout(() => {
      if (pinned == null) {
        detail.hidden = true;
        shown = null;
      } else {
        show(pinned);
      }
    }, 400);
  };
  detail.addEventListener("mouseenter", cancelHold);
  detail.addEventListener("mouseleave", clear);

  root.querySelectorAll(".cume-hit").forEach((hit) => {
    const year = Number(hit.dataset.year);
    hit.addEventListener("mouseenter", () => {
      cancelHold();
      show(year);
    });
    hit.addEventListener("focus", () => {
      cancelHold();
      show(year);
    });
    hit.addEventListener("mouseleave", clear);
    hit.addEventListener("blur", clear);
    hit.addEventListener("click", () => {
      pinned = pinned === year ? null : year;
      root.querySelectorAll(".cume-hit").forEach((h) => h.classList.toggle("is-pinned", Number(h.dataset.year) === pinned));
      if (pinned == null) {
        detail.hidden = true;
        shown = null;
      } else {
        show(pinned);
      }
    });
  });

  wireStorePanelLinks(detail);
}

function renderAgeDistribution(stores) {
  const el = qs("#ageDistribution");
  const withDates = stores.filter((s) => s.opened);
  const counts = VINTAGE_BUCKETS.map((bucket) => ({
    bucket,
    count: withDates.filter((s) => {
      const yrs = yearsSince(s.opened);
      const prevMax = VINTAGE_BUCKETS[VINTAGE_BUCKETS.indexOf(bucket) - 1]?.maxYears ?? 0;
      return yrs > prevMax && yrs <= bucket.maxYears;
    }).length,
  }));
  const max = Math.max(...counts.map((c) => c.count));

  el.innerHTML = counts
    .map(
      ({ bucket, count }) => `
    <div style="margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:4px">
        <span style="display:flex;align-items:center;gap:6px"><span style="width:10px;height:10px;border-radius:50%;background:${bucket.color};display:inline-block"></span>${escapeHtml(bucket.label)}</span>
        <span class="mono">${count} stores</span>
      </div>
      <div style="height:8px;border-radius:99px;background:var(--hairline)">
        <div style="height:100%;width:${max ? (count / max) * 100 : 0}%;border-radius:99px;background:${bucket.color}"></div>
      </div>
    </div>`
    )
    .join("");
}

const SATURATION_TONES = {
  warn: { color: "var(--warn)", bg: "rgba(245,158,11,.12)", border: "rgba(245,158,11,.24)" },
  busy: { color: "var(--busy)", bg: "rgba(99,102,241,.12)", border: "rgba(99,102,241,.24)" },
  muted: { color: "var(--text-4)", bg: "rgba(100,116,139,.08)", border: "rgba(100,116,139,.16)" },
};

function saturationRead(recentCount, total) {
  if (recentCount === 0) return { label: "Established", tone: "muted" };
  if (recentCount / total > 0.5) return { label: "Fast-forming", tone: "warn" };
  return { label: "Still growing", tone: "busy" };
}

function renderTownSaturation(stores) {
  const body = qs("#saturationTableBody");
  const byTown = new Map();
  for (const s of stores) {
    if (!byTown.has(s.town)) byTown.set(s.town, []);
    byTown.get(s.town).push(s);
  }
  const clusters = [...byTown.entries()].filter(([, list]) => list.length >= 2).sort((a, b) => b[1].length - a[1].length);

  body.innerHTML = clusters
    .map(([town, list]) => {
      const withDates = list.filter((s) => s.opened).sort((a, b) => a.opened.localeCompare(b.opened));
      const recentCount = list.filter((s) => s.opened && yearsSince(s.opened) < 2).length;
      const read = saturationRead(recentCount, list.length);
      const t = SATURATION_TONES[read.tone];
      return `
      <tr>
        <td>${escapeHtml(town)}</td>
        <td>${list.length}</td>
        <td class="mono" style="font-size:12px">${withDates[0] ? escapeHtml(withDates[0].opened) : "—"}</td>
        <td class="mono" style="font-size:12px">${withDates[withDates.length - 1] ? escapeHtml(withDates[withDates.length - 1].opened) : "—"}</td>
        <td data-kind="derived"><span class="chip" style="color:${t.color};background:${t.bg};border-color:${t.border}"><span class="cdot"></span>${escapeHtml(read.label)}</span></td>
      </tr>`;
    })
    .join("");
}

export async function initEstate() {
  const container = qs("#viewEstate");
  try {
    const stores = await loadStores();
    renderKpis(stores);
    renderOpeningsChart(stores);
    renderCumulativeChart(stores);
    renderAgeDistribution(stores);
    renderTownSaturation(stores);
  } catch (err) {
    if (container) {
      container.innerHTML = `<div class="empty"><div class="empty-ico"><i data-lucide="alert-triangle"></i></div><h4>Couldn't load estate data</h4><p>${escapeHtml(err.message)}</p></div>`;
      refreshIcons();
    }
  }
}
