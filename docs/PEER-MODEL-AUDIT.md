# Peer model audit — backend record

The fund supplied two spreadsheets: `Peer_Model.xlsx` and
`Patel_Retail_data_Munshot.xlsx`. This file records what was found in them and
what was done about it. It is deliberately NOT on the dashboard.

Checking someone else's spreadsheet is backend work. The dashboard carries the
corrected figures and, where the two files disagree, names the value it did not
use on the same line as the one it did (Store Economics -> "Source of every
figure"). It does not carry the list of what was wrong with the files.

Kept here because it is the audit trail: if anyone asks why a dashboard figure
differs from the fund's own model, the answer is in this file.

## Where the two source files disagree

Four inputs differ between the store file and the peer model. The dashboard uses
the store-file value throughout; the peer-model value is named beside it on
screen but never used in a calculation.

| Input | Peer model | Store file | Dashboard uses |
|---|---|---|---|
| Store count | 49 | 52 operational (+1 closed) | Live from `stores.json` |
| Avg store size | 4,359 sq ft | 5,000 sq ft | Store file |
| Revenue / sq ft / yr | ₹22,079 | ₹17,280 | Store file |
| Avg bill size | ₹907 | ₹800 | Store file |

The revenue/sq ft gap is 28% and is the one that matters: every derived
per-store figure on the dashboard inherits it.

> Patel Retail cited 53 on the call.

## The ten defects in `Peer_Model.xlsx`

### 1. Avenue Supermarts mislabelled "Avenue supermarket (Reliance)" (cell B2)

**Effect.** Wrong company association implied — DMart has no Reliance link

**Status.** Corrected on the dashboard

### 2. Trent: revenue (₹20,074cr) and area (13mn sq ft) are ALL of Trent (Westside + Zudio + Star Bazaar), while store count (84) is Star Bazaar only

**Effect.** Avg store size (154,762 sq ft) and revenue/store (₹239cr) are both impossible for a supermarket format

**Status.** Partly corrected

### 3. Spencer's gross profit (cell F15) uses private-label sales × margin, where every other column uses revenue × margin

**Effect.** Understated 73% — ₹99.6cr instead of ₹369cr — flows into rows 25 and 31

**Status.** Corrected on the dashboard

### 4. Cell C28 is a live #VALUE! error because row 32 holds the text "NA"

**Effect.** Breaks any calculation reading C28

**Status.** Needs the source file

**Verified.** Confirmed the exact formula: C28 = (C11×10^7)/(C32×10^5) — Trent's revenue divided by its own bill-cut count. C32 was simply never filled in (holds the text "NA" instead of a number), so this isn't a formula bug, just a missing input. Still needs the real figure from Trent's own disclosures — not guessed here.

### 5. Patel's own cities/states swapped and wrong (rows 7-8: "1 city, 17 states")

**Effect.** Wildly wrong footprint description for the subject company itself

**Status.** Corrected on the dashboard

### 6. Vishal's private label sales (cell D13) hardcoded as =78385.79/10 with no stated meaning, rather than a live formula

**Effect.** Looked unexplained and unverifiable feeding the peer comparison

**Status.** Not carried over

**Verified.** Re-checked directly against Peer_Model.xlsx: 78385.79/10 = ₹7,838.58cr, which equals D11×D14 (₹12,906cr revenue × 60.74% private-label share) to within rounding. The number itself is real and internally consistent — it just should have been the live formula =D11*D14 instead of a pasted-in result, so it silently goes stale if D11 or D14 is ever updated.

### 7. Patel's same-store sales growth (row 47) hardcoded at 8% with no quarterly backup, while peers average real quarters

**Effect.** Overstates confidence in a number with no supporting data

**Status.** Not carried over

### 8. Rows 26 and 29 duplicate

**Effect.** Data hygiene issue, possible double-count downstream

**Status.** Verified harmless

**Verified.** Re-checked directly against Peer_Model.xlsx: rows 26 and 29 are byte-for-byte identical — same label ("EBIDTA per store (Rs lakh)"), same formula in every column, same values. Nothing else in the model references row 29, so the duplicate is confirmed harmless rather than a live double-count risk.

### 9. "EBIDTA" misspelled throughout

**Effect.** Cosmetic, but signals the model wasn't proofread

**Status.** Corrected on the dashboard

### 10. Patel's private-label % and gross-margin % both hardcoded at 0.17 (identical — a copy-paste error)

**Effect.** Silently wrong inputs to every downstream calculation using either figure

**Status.** Corrected on the dashboard

## What "status" means

- **Corrected on the dashboard** — the dashboard shows the right figure instead.
- **Partly corrected** — corrected as far as the supplied data allows; the rest
  needs a disclosure the company has not published.
- **Needs the source file** — the correct value was never supplied anywhere.
  Only that the current one is wrong is known. It is not guessed.
- **Not carried over** — the dashboard does not build that metric, so the defect
  has no route into it.
- **Verified harmless** — checked, and it changes nothing downstream.

## The two corrections that reach the screen

Trent's revenue/store and Spencer's gross profit each move a number a reader
would otherwise act on, so they keep their own cards on Peer Benchmark with the
before and after side by side. Every other item above is file hygiene and stays
in this document.
