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
  if (yrs < 1) return `${Math.round(yrs * 12)} months`;
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
    <div class="kpi k4">
      <div class="kpi-top"><span class="kpi-label">Newest Store</span><span class="kpi-ico"><i data-lucide="sparkles"></i></span></div>
      <div class="kpi-value" style="font-size:20px">${escapeHtml(newest.name)}</div>
      <div class="kpi-delta">${escapeHtml(newest.opened)} · ${fmtYearsAgo(yearsSince(newest.opened))} ago</div>
    </div>
  `;
  refreshIcons();
}

function renderOpeningsChart(stores) {
  const el = qs("#openingsChart");
  const withDates = stores.filter((s) => s.opened);

  const preBucketCount = withDates.filter((s) => openedYear(s) < PRE_BUCKET_YEAR).length;
  const byYear = new Map();
  for (const s of withDates) {
    const y = openedYear(s);
    if (y >= PRE_BUCKET_YEAR) byYear.set(y, (byYear.get(y) || 0) + 1);
  }
  const years = [...byYear.keys()].sort((a, b) => a - b);
  const bars = [{ label: `< ${PRE_BUCKET_YEAR}`, count: preBucketCount }, ...years.map((y) => ({ label: String(y), count: byYear.get(y) }))];
  const max = Math.max(...bars.map((b) => b.count));

  el.innerHTML = `
    <div style="display:flex; align-items:flex-end; gap:10px; height:180px; padding:10px 4px 0">
      ${bars
        .map(
          (b) => `
        <div style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:flex-end; height:100%">
          <div style="font-size:12px; font-weight:700; color:var(--text-1); margin-bottom:4px">${b.count}</div>
          <div style="width:100%; max-width:44px; height:${Math.max((b.count / max) * 100, 3)}%; border-radius:6px 6px 0 0; background:var(--grad-primary)"></div>
        </div>`
        )
        .join("")}
    </div>
    <div style="display:flex; gap:10px; padding:8px 4px 0; border-top:1px solid var(--hairline); margin-top:8px">
      ${bars.map((b) => `<div style="flex:1; text-align:center; font-size:11px; color:var(--text-3)">${escapeHtml(b.label)}</div>`).join("")}
    </div>
  `;
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
    byYear.set(y, (byYear.get(y) || 0) + 1);
  }
  const years = [...byYear.keys()].sort((a, b) => a - b);
  let cumulative = 0;
  const points = years.map((y) => {
    cumulative += byYear.get(y);
    return { year: y, count: cumulative };
  });

  const W = 720;
  const H = 160;
  const PAD = 24;
  const maxCount = points[points.length - 1].count;
  const minYear = points[0].year;
  const maxYear = points[points.length - 1].year;
  const x = (year) => PAD + ((year - minYear) / (maxYear - minYear || 1)) * (W - 2 * PAD);
  const y = (count) => H - PAD - (count / maxCount) * (H - 2 * PAD);

  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(p.year).toFixed(1)} ${y(p.count).toFixed(1)}`).join(" ");
  const areaD = `${pathD} L ${x(maxYear).toFixed(1)} ${H - PAD} L ${x(minYear).toFixed(1)} ${H - PAD} Z`;

  el.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" style="width:100%; height:${H}px" preserveAspectRatio="none">
      <path d="${areaD}" fill="var(--brand-indigo)" opacity="0.08"></path>
      <path d="${pathD}" fill="none" stroke="var(--brand-indigo)" stroke-width="2.5" stroke-linejoin="round"></path>
      ${points
        .map((p) => `<circle cx="${x(p.year).toFixed(1)}" cy="${y(p.count).toFixed(1)}" r="3" fill="var(--brand-indigo)"></circle>`)
        .join("")}
    </svg>
    <div style="display:flex; justify-content:space-between; font-size:11px; color:var(--text-3); padding:0 ${PAD - 4}px">
      <span>${minYear}${points[0].count > 0 ? ` (${points[0].count})` : ""}</span>
      <span>${maxYear} (${maxCount} stores)</span>
    </div>
  `;
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
  if (recentCount === 0) return { label: "Established — no recent additions", tone: "muted" };
  if (recentCount / total > 0.5) return { label: "Fast-forming — most of it opened in the last 2 years", tone: "warn" };
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
