#!/usr/bin/env node
/**
 * scripts/fetch-screener-kpis.mjs — pull Patel Retail's (and each peer's)
 * headline KPIs and financial tables from Screener.in using the PAID account,
 * and write public/data/screener-kpis.json.
 *
 * WHY: the peer figures on the Peer Benchmark screen were typed in by hand
 * from Screener after reading them off the page. That is exactly the stale
 * data problem — the moment a company files a new quarter, this dashboard is
 * wrong and nobody knows. This makes the same numbers a scheduled fetch.
 *
 * AUTH: reuses launchAndLogin() from screener-test/scrape-screener.mjs, which
 * already handles the premium-then-free credential fallback and never logs
 * credentials. Set as GitHub Actions secrets, never in the repo:
 *   SCREENER_PREMIUM_EMAIL / SCREENER_PREMIUM_PASSWORD   (preferred)
 *   SCREENER_EMAIL / SCREENER_PASSWORD                   (fallback)
 * With no credentials set this exits non-zero with a clear message rather
 * than writing a half-empty file over good data.
 *
 * SCOPE — this reads the company page's own tables:
 *   - the top ratio strip (market cap, current price, P/E, book value,
 *     dividend yield, ROCE, ROE, face value, high/low)
 *   - Quarterly Results, Profit & Loss, Balance Sheet, Cash Flow, Ratios,
 *     and Shareholding Pattern, each as {columns, rows}
 * Nothing is computed or interpreted here. Interpretation stays in the UI,
 * where it carries a provenance label.
 *
 * NOT RUNNABLE FROM THIS SANDBOX: Playwright's browser has no outbound
 * network access here (established repeatedly in PATEL-HANDOFF.md §21), so
 * this script is written to run in CI, where it does. Verify it from the
 * Actions run log, not from a local run.
 *
 * Usage: node scripts/fetch-screener-kpis.mjs
 *        TICKERS=PATELRMART,DMART node scripts/fetch-screener-kpis.mjs
 */

import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { launchAndLogin, activeTier, activeCredentialEnv, detectAccountTier } from "../screener-test/scrape-screener.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.join(__dirname, "..", "public", "data", "screener-kpis.json");
const BASE = "https://www.screener.in";

// Patel first, then the peer set the dashboard actually shows. Consolidated
// where the company reports it; Screener redirects when it doesn't exist.
const DEFAULT_TICKERS = [
  { ticker: "PATELRMART", label: "Patel Retail Ltd", consolidated: false, subject: true },
  { ticker: "DMART", label: "Avenue Supermarts Ltd", consolidated: true },
  { ticker: "VMM", label: "Vishal Mega Mart Ltd", consolidated: true },
  { ticker: "TRENT", label: "Trent Ltd", consolidated: true },
  { ticker: "SPENCERS", label: "Spencer's Retail Ltd", consolidated: true },
  { ticker: "OSIAHYPER", label: "Osia Hyper Retail Ltd", consolidated: false },
  { ticker: "V2RETAIL", label: "V2 Retail Ltd", consolidated: false },
];

function tickersFromEnv() {
  if (!process.env.TICKERS) return DEFAULT_TICKERS;
  const wanted = new Set(process.env.TICKERS.split(",").map((t) => t.trim().toUpperCase()).filter(Boolean));
  const picked = DEFAULT_TICKERS.filter((t) => wanted.has(t.ticker));
  for (const t of wanted) {
    if (!picked.some((p) => p.ticker === t)) picked.push({ ticker: t, label: t, consolidated: true });
  }
  return picked;
}

/** Everything below runs INSIDE the page, against Screener's own DOM. */
async function extractCompany(page) {
  return page.evaluate(() => {
    const clean = (s) => (s || "").replace(/\s+/g, " ").trim();

    // Top ratio strip: <li><span class="name">P/E</span><span class="value">42.3</span></li>
    const ratios = {};
    document.querySelectorAll("#top-ratios li").forEach((li) => {
      const name = clean(li.querySelector(".name")?.textContent);
      if (!name) return;
      const valueEl = li.querySelector(".value");
      const display = clean(valueEl?.textContent);
      // Screener wraps each figure in its own .number span; join them so
      // "High / Low" (two numbers) survives, and expose a parsed single value
      // where there is exactly one.
      const numbers = [...(valueEl?.querySelectorAll(".number") || [])].map((n) => clean(n.textContent)).filter(Boolean);
      const parsed = numbers.length === 1 ? Number(numbers[0].replace(/,/g, "")) : null;
      // Screener renders the unit even when it has no figure (Spencer's ROE
      // reads "%" on its own). A bare unit is not a value — record null so the
      // UI shows "not reported" rather than a stray percent sign.
      const hasDigit = /\d/.test(display);
      ratios[name] = {
        display: hasDigit ? display : null,
        numbers,
        value: Number.isFinite(parsed) ? parsed : null,
      };
    });

    // Each financial section is a <section id="..."> holding one data table.
    const sectionIds = {
      quarterly_results: "quarters",
      profit_loss: "profit-loss",
      balance_sheet: "balance-sheet",
      cash_flow: "cash-flow",
      ratios: "ratios",
      shareholding: "shareholding",
    };
    const tableFrom = (root) => {
      const table = root?.querySelector("table");
      if (!table) return null;
      const columns = [...table.querySelectorAll("thead th")].map((th) => clean(th.textContent));
      const rows = [...table.querySelectorAll("tbody tr")]
        .map((tr) => {
          const cells = [...tr.querySelectorAll("td")].map((td) => clean(td.textContent));
          if (!cells.length) return null;
          return { label: cells[0].replace(/[+\-]\s*$/, "").trim(), values: cells.slice(1) };
        })
        .filter(Boolean)
        .filter((r) => r.label);
      return columns.length || rows.length ? { columns, rows } : null;
    };

    const sections = {};
    for (const [key, id] of Object.entries(sectionIds)) {
      sections[key] = tableFrom(document.querySelector(`#${id}`));
    }

    const about = clean(document.querySelector(".company-profile .about p, #company-info p")?.textContent) || null;
    const name = clean(document.querySelector("h1")?.textContent) || null;

    return { name, about, ratios, sections };
  });
}

async function main() {
  const tickers = tickersFromEnv();
  console.log(`[screener] fetching ${tickers.length} company page(s)...`);

  const { browser, context, page } = await launchAndLogin();
  // launchAndLogin() already asked Screener which plan this account is on;
  // re-read the page only to capture the evidence for the output file.
  const tierInfo = await detectAccountTier(page);
  console.log(`[screener] credentials from ${activeCredentialEnv}; plan: ${activeTier}.`);

  const companies = [];
  const failures = [];

  /** Load one company page and wait until its figures have actually rendered. */
  async function readPage(url) {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector("#top-ratios", { timeout: 30000 });
    // The ratio strip renders its shell first and fills the figures in
    // afterwards; waiting only for the container captured "₹ Cr." with no
    // digits. Wait for an actual number to land before reading.
    await page.waitForFunction(
      () => {
        const n = document.querySelector("#top-ratios .number");
        return n && n.textContent.trim().length > 0;
      },
      { timeout: 30000 }
    );
    return extractCompany(page);
  }

  try {
    for (const t of tickers) {
      const wanted = t.consolidated ? "consolidated" : "standalone";
      const other = t.consolidated ? "standalone" : "consolidated";
      const primary = `${BASE}/company/${t.ticker}/${t.consolidated ? "consolidated/" : ""}`;
      const alternate = `${BASE}/company/${t.ticker}/${t.consolidated ? "" : "consolidated/"}`;

      // Consolidated and standalone are DIFFERENT NUMBERS, not two routes to
      // the same one — Spencer's FY2026 revenue is ₹1,800 cr consolidated and
      // ₹1,523 cr standalone. A transient timeout once silently swapped the
      // basis mid-refresh and still reported success, which is how a
      // substituted figure reaches a client unnoticed. So: retry the basis we
      // actually want before considering the other one at all, and when the
      // other one is used, record that fact rather than burying it.
      let record = null;
      let lastErr = null;
      for (let attempt = 1; attempt <= 2 && !record; attempt++) {
        try {
          const data = await readPage(primary);
          record = { url: primary, basis: wanted, basis_fallback: false, data };
          const nSections = Object.values(data.sections).filter(Boolean).length;
          const retried = attempt > 1 ? " (on retry)" : "";
          console.log(`  ✓ ${t.ticker}: ${Object.keys(data.ratios).length} ratios, ${nSections}/6 tables${retried}`);
        } catch (err) {
          lastErr = err;
          if (attempt === 1) console.log(`  … ${t.ticker}: ${wanted} page did not render — retrying the same basis`);
        }
      }

      if (!record) {
        // Not every company publishes on both bases, so the other path is
        // worth trying — but it is a different figure and is labelled as such.
        try {
          const data = await readPage(alternate);
          record = { url: alternate, basis: other, basis_fallback: true, data };
          console.log(`  ! ${t.ticker}: ${wanted} unavailable after 2 attempts — using ${other} figures instead (DIFFERENT BASIS, flagged in the output)`);
        } catch (secondErr) {
          failures.push({
            ticker: t.ticker,
            tried: [primary, alternate],
            error: `${lastErr?.message} | fallback: ${secondErr.message}`,
          });
          console.log(`  ✗ ${t.ticker}: ${lastErr?.message}`);
          continue;
        }
      }

      companies.push({
        ticker: t.ticker,
        label: t.label,
        subject: Boolean(t.subject),
        url: record.url,
        basis: record.basis,
        basis_requested: wanted,
        basis_fallback: record.basis_fallback,
        ...record.data,
        fetched_at: new Date().toISOString(),
      });
    }
  } finally {
    await browser.close();
  }

  if (!companies.length) {
    throw new Error("No company pages could be read — refusing to overwrite screener-kpis.json with an empty result.");
  }

  const output = {
    source: "Screener.in company pages (logged in)",
    account_tier: activeTier,
    account_tier_source: "Read off screener.in/premium/ for the logged-in account, not inferred from the credential variable name.",
    account_tier_evidence: tierInfo,
    credential_env: activeCredentialEnv,
    kind: "reported",
    note:
      "Read directly off each company's Screener page on a schedule — not typed in by hand. Values are exactly as Screener presents them (₹ crore unless the row says otherwise); nothing here is recomputed or interpreted.",
    fetched_at: new Date().toISOString(),
    counts: {
      requested: tickers.length,
      fetched: companies.length,
      failed: failures.length,
      basis_fallbacks: companies.filter((c) => c.basis_fallback).length,
    },
    failures,
    companies,
  };

  await writeFile(OUT_PATH, JSON.stringify(output, null, 2) + "\n", "utf8");
  console.log(`\n[screener] Wrote ${OUT_PATH} — ${companies.length}/${tickers.length} companies.`);
  if (failures.length) console.log(`[screener] ${failures.length} failed (recorded in the file, not silently dropped).`);
}

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exitCode = 1;
});
