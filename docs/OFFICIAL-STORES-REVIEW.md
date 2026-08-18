# Official website store list — proposed matches, unreviewed

Scraped from https://patelrpl.in/stores/ on 2026-08-18 (53 listings, 11 resolved, 35 low-confidence, 7 unresolved). Nothing below has been applied to `public/data/stores.json` — every match is a proposal for a human to confirm or reject.

## Three discrepancies to reconcile, not paper over

1. **Store count.** The site presents 53 listings, all as currently-open stores. `stores.json` has 52 operational + 1 closed = 53. If every site listing matches an existing store below with nothing left over, the counts simply describe the estate two different ways (52 active + the site not listing the closed one, or similar) — but if a listing below shows up as **unmatched**, that's a candidate for a store on the site that isn't in our file at all, and needs the client's confirmation, not a silent add.
2. **Uran.** Listing #1: "SURVEY NO 58/1/A HISSA NO 4684GALA NO.1,2,3,4 URAN,PIN CODE:-400702" — a survey-number/gala-number address, not a locality-style store address like every other listing, and Uran is a port town in Raigad nowhere near any town in `stores.json`. Its own resolved coordinate (18.871596, 72.941254) checks out as genuinely being in Uran, well outside the box every other store falls in. Very likely a warehouse or processing unit, not a retail store. **Flagged below as unmatched, not auto-added.**
3. **Shilphata / Khopoli.** The site has one listing, "Shilphata, Khopoli" (#35). `stores.json` has these as two separate stores: Shilphata (`DOE/DER`) and Khapoli (`KHP`) — different towns, not adjacent. Its resolved coordinate (18.7989122, 73.3273613) is 48.32 km from DOE/DER's existing (coarse, town-centroid) coordinate — far too far to be the same place — and well south, in the area `stores.json` itself names for Khapoli (Raigad), not Shilphata (Thane). That's evidence, from an admittedly low-confidence business-name-search resolution (see below) — not proof, and not applied here. Either the site conflated two stores into one card, or this card is genuinely one of the two and coincidentally mentions the other town in passing. **Do not auto-merge or auto-split — flagged below for a human read.**

## Proposed matches

| # | Official listing | Coordinate | Proposed store | Match basis |
|---|---|---|---|---|
| 1 | SURVEY NO 58/1/A HISSA NO 4684GALA NO.1,2,3,4 URAN,PIN CODE:-400702 | 18.871596, 72.941254 | _no candidate found_ | — |
| 2 | KBG,Patel mart bapgav near kohinoor developer | _no_link_ | **KBG** — KBG - Patel Mart | code_prefix (store code "kbg") |
| 3 | RCM -MOHOPADAPLOT 34/B/6 , GANESH NAGAR NEW REESBESIDE APURVA HOTEL RASAYNI,MOHOPADA | 18.89719, 73.192043 | **RCM** — RCM | code_prefix (store code "rcm") |
| 4 | THE,Patel R Mart Govind Heights,Opposite Chamunda Garden,Old 90 Fit Road Thakurli (E) | 19.2234296, 73.1053095 | **THE** — THE - Patel R Mart | code_prefix (store code "the") |
| 5 | TGR,Sangam Marble, Titwala - Goveli Rd, Near Icon Lawn, Kalyan Sub-District, 421605, MH, IN | 19.169385, 73.189713 ⚠️ low-confidence | **TGR** — TGR | code_prefix (store code "tgr") |
| 6 | NILEJE GOAN SERVY NO 33/1/BNR CHANDRES HIMALAYA CHS BUILDING NILEJE STATION ROAD | 19.155487, 73.075157 | **NSR** — Nileje Goan | locality_token_overlap (matched "nileje" (name), "goan" (name), "nileje", "nilje") |
| 7 | KUD,Kudus | 19.538248, 73.099039 | **KUD** — KUD | code_prefix (store code "kud") |
| 8 | KYD,Kalyan,West | 19.2469425, 73.1527849 | **KYD** — KYD | code_prefix (store code "kyd") |
| 9 | Ambadi Naka,Ambadi | 19.4699681, 73.0838473 | **AVB** — Ambadi Naka | locality_token_overlap (matched "ambadi" (name), "naka" (name), "ambadi", "naka") |
| 10 | DAG - DOMBIVLI (E) | 19.213063, 73.106209 | **DAG/DOEMIDC** — DAG | code_prefix (store code "dag") |
| 11 | Nandivali, Dombivili East | _unresolved_ — Directions URL with a quoted/placeholder origin and no reliable single destination coordinate — not guessed at. | **DNE** — Patel's R Mart | locality_token_overlap (matched "nandivali", "dombivli", "dombivali") |
| 12 | Kausa Talav Road, Mumbra | _plus_code_unresolved_ — Google Plus Code (e.g. 528M+983) — this script does not decode Open Location Codes. | **NWM** — Nice World | locality_token_overlap (matched "kausa", "talav", "mumbra") |
| 13 | Kalyan Bhiwandi Road | 19.26515, 73.086365 | **BHAR** — Kalyan Naka | locality_token_overlap (matched "kalyan" (name), "kalyan", "bhiwandi") |
| 14 | Vijay Nagar Kalyan (East) | 19.222075, 73.1379476 ⚠️ low-confidence | **KET** (KET) / **BHAR** (Kalyan Naka) / **AMSN** (Shivganga Nagar) / **AML** (Luxminagar) — TIED, pick one | locality_token_overlap_tied (matched "vijay", "nagar", "kalyan" — tied with 3 other store(s), not resolved automatically) |
| 15 | Nisarag Hotel, Khoni MIDC | 19.1753225, 73.114188 ⚠️ low-confidence | **KMR** — KMR | locality_token_overlap (matched "khoni", "midc") |
| 16 | Opp Neral Police Station, Neral (East) | 19.0290327, 73.3141588 ⚠️ low-confidence | **NKR** — NK | locality_token_overlap (matched "neral", "police") |
| 17 | Sudama Regency, Diva (East) | 19.1703623, 73.0459179 ⚠️ low-confidence | **DSR** — DSR | locality_token_overlap (matched "sudama", "regency", "diva") |
| 18 | Adarsh park road Bhiwandi | 19.3080716, 73.05551 ⚠️ low-confidence | **KBG** (KBG - Patel Mart) / **AVB** (Ambadi Naka) / **KBR** (KBR) / **BBVR** (BBVR) / **BHAR** (Kalyan Naka) / **Bap** (Anjurphata) / **PAD** (Padgha) — TIED, pick one | locality_token_overlap_tied (matched "bhiwandi" — tied with 6 other store(s), not resolved automatically) |
| 19 | Vangani East | _no_link_ | **VGW** — Vangani East | locality_token_overlap (matched "vangani" (name), "vangani") |
| 20 | Padgha, Bhiwandi | 19.3649535, 73.1712973 ⚠️ low-confidence | **PAD** — Padgha | locality_token_overlap (matched "padgha" (name), "padgha", "bhiwandi") |
| 21 | Bhere Maidan, Vasind | _plus_code_unresolved_ — Google Plus Code (e.g. 528M+983) — this script does not decode Open Location Codes. | **VAS** — Bhere Maidan | locality_token_overlap (matched "bhere" (name), "maidan" (name), "bhere", "maidan", "vasind") |
| 22 | Anjurphata Metro Station, Bhiwandi | _unresolved_ | **Bap** — Anjurphata | locality_token_overlap (matched "anjurphata" (name), "anjur", "phata", "bhiwandi") |
| 23 | Kalyan Naka, Bhiwandi | 19.2540187, 73.0393798 ⚠️ low-confidence | **BHAR** — Kalyan Naka | locality_token_overlap (matched "kalyan" (name), "naka" (name), "kalyan", "naka", "bhiwandi") |
| 24 | Lalchakki Road, Ulhasnagar | 19.2120338, 73.1627263 ⚠️ low-confidence | **ULN4** — Lalchakki Road | locality_token_overlap (matched "lalchakki" (name), "lalchakki", "ulhasnagar") |
| 25 | Neharu Chowk, Ulhasnagar | 19.2328767, 73.1599533 ⚠️ low-confidence | **ULN** — Neharu Chowk | locality_token_overlap (matched "neharu" (name), "chowk" (name), "neharu", "chowk", "ulhasnagar") |
| 26 | Ganesh Mandir Road, Titwala | 19.2973684, 73.2128216 ⚠️ low-confidence | **TTL** — Ganesh Mandir Rd | locality_token_overlap (matched "ganesh" (name), "mandir" (name), "ganesh", "mandir", "titwala") |
| 27 | Station Road, Shahad | 19.2426153, 73.1559273 | **SHD** — Station Rd Shahad | locality_token_overlap (matched "shahad" (name), "shahad") |
| 28 | Cherpoli, Shahapur | 19.4573979, 73.3311053 ⚠️ low-confidence | **SHAP** — Cherpoli | locality_token_overlap (matched "cherpoli" (name), "cherpoli", "shahapur") |
| 29 | Sonarpada, Murbad | 19.2579114, 73.3849734 ⚠️ low-confidence | **MUBD** — Sonarpada | locality_token_overlap (matched "sonarpada" (name), "sonarpada", "murbad") |
| 30 | Rambuag, Kalyan West | 19.2423646, 73.1401159 ⚠️ low-confidence | **KLW** — Rambaug | locality_token_overlap (matched "rambaug" (name), "rambaug", "kalyan") |
| 31 | Tilak Chowk, Kalyan West | 19.244229, 73.1252991 ⚠️ low-confidence | **KLT** — Tilak Chowk | locality_token_overlap (matched "tilak" (name), "chowk" (name), "tilak", "chowk", "kalyan") |
| 32 | Khadakpada, Kalyan West | _unresolved_ | **KLK** — Khadakpada | locality_token_overlap (matched "khadakpada" (name), "khadakpada", "kalyan") |
| 33 | Netivili, Kalyan East | 19.2266181, 73.1259124 ⚠️ low-confidence | **KLE** — Netivili | locality_token_overlap (matched "netivili" (name), "netivili", "kalyan") |
| 34 | Kolivili, Kalyan West | 19.2319087, 73.1345379 ⚠️ low-confidence | **KKW** — Kolivili | locality_token_overlap (matched "kolivili" (name), "kolivili", "kalyan") |
| 35 | Shilphata, Khopoli | 18.7989122, 73.3273613 ⚠️ low-confidence | **DOE/DER** (Shilphata) / **KHP** (Khapoli) — TIED, pick one | locality_token_overlap_tied (matched "shilphata" (name), "shilphata" — tied with 1 other store(s), not resolved automatically) |
| 36 | Kumbharkhan Pada, Dombivali West | 19.2307638, 73.088131 ⚠️ low-confidence | **DWK** — Kumbharkhan Pada | locality_token_overlap (matched "kumbharkhan" (name), "pada" (name), "kumbharkhan", "pada", "dombivali") |
| 37 | Samrat Chowk, Dombivali West | 19.2219559, 73.0818505 ⚠️ low-confidence | **DOWSMT** — Samrat Chowk | locality_token_overlap (matched "samrat" (name), "chowk" (name), "samrat", "chowk", "dombivali") |
| 38 | Kopar Road, Dombivali West | 19.2165573, 73.0833311 | **DOW** — Kopar Road | locality_token_overlap (matched "kopar" (name), "kopar", "dombivali") |
| 39 | Manpada Road, Dombivali East | 19.206952, 73.0954209 ⚠️ low-confidence | **DWK** (Kumbharkhan Pada) / **DOM** (Manpada Road) — TIED, pick one | locality_token_overlap_tied (matched "pada" (name), "pada", "dombivali" — tied with 1 other store(s), not resolved automatically) |
| 40 | Phadke Road, Dombivili East | 19.2204237, 73.0923651 ⚠️ low-confidence | **DOF** — Phadke Road | locality_token_overlap (matched "phadke" (name), "phadke", "dombivli", "dombivali") |
| 41 | Rajaji Path, Dombivali East | 19.2153234, 73.0847615 ⚠️ low-confidence | **DOE/DER** — Shilphata | locality_token_overlap (matched "dombivali", "rajaji", "path") |
| 42 | Manjarli, Badlapur West | 19.1731597, 73.2347995 ⚠️ low-confidence | **BWM** — Manjarli | locality_token_overlap (matched "manjarli" (name), "manjarli", "badlapur") |
| 43 | Sanewadi, Badlapur West | 19.1661425, 73.2431486 ⚠️ low-confidence | **BLWB** — Sanewadi | locality_token_overlap (matched "sanewadi" (name), "sanewadi", "badlapur") |
| 44 | Katrap, Badlapur East | 19.1674057, 73.2304408 ⚠️ low-confidence | **BLEK** — Katrap | locality_token_overlap (matched "katrap" (name), "katrap", "badlapur") |
| 45 | Gandhi Chowk, Badlapur East | 19.1645321, 73.2387458 ⚠️ low-confidence | **BLEB** — Gandhi Chowk | locality_token_overlap (matched "gandhi" (name), "chowk" (name), "gandhi", "chowk", "badlapur") |
| 46 | Kharvai Naka, Badlapur East | 19.1454507, 73.2471086 ⚠️ low-confidence | **BKHE** — Kharvai Naka | locality_token_overlap (matched "kharvai" (name), "naka" (name), "kharvai", "naka", "badlapur") |
| 47 | Shirgaon, Badlapur East | 19.1546231, 73.2345491 ⚠️ low-confidence | **BES** — Shirgaon | locality_token_overlap (matched "shirgaon" (name), "shirgaon", "badlapur") |
| 48 | Station Road, Ambernath West | 19.2113568, 73.1869246 ⚠️ low-confidence | **AMW** (Station Rd Ambernath) / **PRCAME/PRCAMEN** (Ambernath) — TIED, pick one | locality_token_overlap_tied (matched "ambernath" (name), "ambernath" — tied with 1 other store(s), not resolved automatically) |
| 49 | Palegaon, Ambernath East | 19.1896178, 73.1769552 ⚠️ low-confidence | **AMPL** — Palegaon | locality_token_overlap (matched "palegaon" (name), "palegaon", "ambernath") |
| 50 | Luxminagar, Ambernath East | 19.1994975, 73.1931952 ⚠️ low-confidence | **AMSN** (Shivganga Nagar) / **AML** (Luxminagar) — TIED, pick one | locality_token_overlap_tied (matched "nagar" (name), "nagar", "ambernath" — tied with 1 other store(s), not resolved automatically) |
| 51 | Chh.Shiwaji Chowk, Ambernath East | 19.2084515, 73.1855975 ⚠️ low-confidence | **AME** — Chh Shivaji Chowk | locality_token_overlap (matched "chh" (name), "shivaji" (name), "chowk" (name), "chh", "shivaji", "chowk", "ambernath") |
| 52 | Chokhloli, Ambernath West | 19.18354, 73.2199944 ⚠️ low-confidence | **AMCH** — Chokhloli | locality_token_overlap (matched "chokhloli" (name), "chokhloli", "ambernath") |
| 53 | Shivganga Nagar, Ambernath East | 19.2030029, 73.1803269 ⚠️ low-confidence | **AMSN** — Shivganga Nagar | locality_token_overlap (matched "shivganga" (name), "nagar" (name), "shivganga", "nagar", "ambernath") |

## Stores in `stores.json` with no proposed match from the site

_None — every store in stores.json has at least one proposed match above._

## Site listings with no proposed match at all

| # | Official listing | Coordinate |
|---|---|---|
| 1 | SURVEY NO 58/1/A HISSA NO 4684GALA NO.1,2,3,4 URAN,PIN CODE:-400702 | 18.871596, 72.941254 |

## A real limitation, not a hypothetical one

35 of the 45 resolvable coordinates above are marked ⚠️ low-confidence. Of those, 34 came from a short link that resolved to a plain business-NAME search — "Patel's R Mart" / "Patel R Mart" / "Patel's Low Price" — not a coordinate. Patel's own brand name repeats at nearly every one of its 53 stores, so Google matching that generic name to one specific nearby branch carries a real risk of picking a neighbouring Patel store instead of the one this listing is actually for. Each of these DOES resolve to a specific, real place (not a blurry area average) — the risk is brand-collision, not imprecision. **Every ⚠️ row needs the underlying link opened and checked against the proposed store's own known town before being trusted, not just eyeballed against the address text.**

Separately: `locality_token_overlap` matches are a weak signal by nature (shared words in an address, nothing more) — where several stores tied for the top score, ALL of them are listed rather than one picked arbitrarily (found by hand: an earlier, unreviewed version of this matcher's exact-string logic silently defaulted several genuine ties, including "Rambuag, Kalyan West" vs. `KLW`'s own "Rambaug, Kalyan West", to whichever store happened to sit first in stores.json — not to the better match). A `code_prefix`/`code_token` match (the store's own code literally appears in the listing) is the only tier here worth trusting without opening the link.

## Next step

Review the proposed-matches table above. For each row you accept, apply it by hand (or via a follow-up script once reviewed): set the matched store's `lat`/`lng` from the coordinate shown, `geo_source: "company_website"`, `geocode_match_tier: "client"` (same trusted tier as a client-pasted pin — not in `COARSE_MATCH_TIERS`, so it's treated as fully locatable everywhere distances are computed), `address_official` from the listing's full text, and keep the existing `locality` field as-is. Then run `node scripts/build-proximity.mjs`. Do not apply a `resolved_low_confidence`, `unresolved`, or tied row without independently checking the link first.
