# Official store list — mechanical validation of low-confidence matches

Ran against 53 listings from `stores-official.json` (fetched 2026-08-18). 5 needed no checks (store-code match + unambiguous coordinate), 34 were checked, 21 cleared automatically, 3 ties were broken mechanically. 16 genuinely need a human. 7 never resolved to a coordinate at all.

## Duplicate-coordinate check

1 cluster(s) of listings share a coordinate within 300m — flagged for review regardless of what the other two checks say:

- #38 "Kopar Road, Dombivali West" (identical point) ↔ #41 "Rajaji Path, Dombivali East" (0.2km apart)

## Auto-trusted — store-code match, unambiguous coordinate, no checks needed

| Listing | Store | Coordinate | Match basis |
|---|---|---|---|
| #3 RCM -MOHOPADAPLOT 34/B/6 , GANESH NAGAR NEW REESBESIDE APURVA HOTEL RASAYNI,MOHOPADA | **RCM** — RCM | 18.89719, 73.192043 | code_prefix |
| #4 THE,Patel R Mart Govind Heights,Opposite Chamunda Garden,Old 90 Fit Road Thakurli (E) | **THE** — THE - Patel R Mart | 19.2234296, 73.1053095 | code_prefix |
| #7 KUD,Kudus | **KUD** — KUD | 19.538248, 73.099039 | code_prefix |
| #8 KYD,Kalyan,West | **KYD** — KYD | 19.2469425, 73.1527849 | code_prefix |
| #10 DAG - DOMBIVLI (E) | **DAG/DOEMIDC** — DAG | 19.213063, 73.106209 | code_prefix |

## Validated & promoted to trusted

| Listing | Store | Coordinate | Containment check | Cross-validation check |
|---|---|---|---|---|
| #9 Ambadi Naka,Ambadi | **AVB** — Ambadi Naka | 19.4699681, 73.0838473 | ✅ 0.08km from store's own precise point | — inconclusive: address did not geocode to anything |
| #16 Opp Neral Police Station, Neral (East) | **NKR** — NK | 19.0290327, 73.3141588 | ✅ 0.49km from town centroid | — inconclusive: address did not geocode to anything |
| #17 Sudama Regency, Diva (East) | **DSR** — DSR | 19.1703623, 73.0459179 | ✅ 0.13km from store's own precise point | — inconclusive: address did not geocode to anything |
| #20 Padgha, Bhiwandi | **PAD** — Padgha | 19.3649535, 73.1712973 | ✅ 0.47km from store's own precise point | ✅ 0.47km from independent Nominatim geocode of the site's own address text |
| #24 Lalchakki Road, Ulhasnagar | **ULN4** — Lalchakki Road | 19.2120338, 73.1627263 | ✅ 1.37km from town centroid | — inconclusive: address did not geocode to anything |
| #25 Neharu Chowk, Ulhasnagar | **ULN** — Neharu Chowk | 19.2328767, 73.1599533 | ✅ 1.28km from town centroid | — inconclusive: address did not geocode to anything |
| #26 Ganesh Mandir Road, Titwala | **TTL** — Ganesh Mandir Rd | 19.2973684, 73.2128216 | ✅ 1.03km from town centroid | — inconclusive: address did not geocode to anything |
| #28 Cherpoli, Shahapur | **SHAP** — Cherpoli | 19.4573979, 73.3311053 | ✅ 0.78km from town centroid | — inconclusive: address did not geocode to anything |
| #29 Sonarpada, Murbad | **MUBD** — Sonarpada | 19.2579114, 73.3849734 | ✅ 0.61km from town centroid | — inconclusive: address did not geocode to anything |
| #30 Rambuag, Kalyan West | **KLW** — Rambaug | 19.2423646, 73.1401159 | ✅ 0.5km from store's own precise point | — inconclusive: address did not geocode to anything |
| #31 Tilak Chowk, Kalyan West | **KLT** — Tilak Chowk | 19.244229, 73.1252991 | ✅ 0.43km from town centroid | — inconclusive: address did not geocode to anything |
| #33 Netivili, Kalyan East | **KLE** — Netivili | 19.2266181, 73.1259124 | ✅ 0.68km from town centroid | — inconclusive: address did not geocode to anything |
| #34 Kolivili, Kalyan West | **KKW** — Kolivili | 19.2319087, 73.1345379 | ✅ 1.35km from town centroid | — inconclusive: address did not geocode to anything |
| #40 Phadke Road, Dombivili East | **DOF** — Phadke Road | 19.2204237, 73.0923651 | ✅ 0.15km from store's own precise point | — inconclusive: address did not geocode to anything |
| #42 Manjarli, Badlapur West | **BWM** — Manjarli | 19.1731597, 73.2347995 | ✅ 0.33km from store's own precise point | — inconclusive: address did not geocode to anything |
| #43 Sanewadi, Badlapur West | **BLWB** — Sanewadi | 19.1661425, 73.2431486 | ✅ 1.39km from town centroid | — inconclusive: address did not geocode to anything |
| #44 Katrap, Badlapur East | **BLEK** — Katrap | 19.1674057, 73.2304408 | ✅ 0.35km from store's own precise point | — inconclusive: address did not geocode to anything |
| #45 Gandhi Chowk, Badlapur East | **BLEB** — Gandhi Chowk | 19.1645321, 73.2387458 | ✅ 0.24km from store's own precise point | — inconclusive: address did not geocode to anything |
| #46 Kharvai Naka, Badlapur East | **BKHE** — Kharvai Naka | 19.1454507, 73.2471086 | ✅ 0.34km from store's own precise point | — inconclusive: address did not geocode to anything |
| #47 Shirgaon, Badlapur East | **BES** — Shirgaon | 19.1546231, 73.2345491 | ✅ 0.72km from town centroid | — inconclusive: address did not geocode to anything |
| #51 Chh.Shiwaji Chowk, Ambernath East | **AME** — Chh Shivaji Chowk | 19.2084515, 73.1855975 | ✅ 0.86km from store's own precise point | — inconclusive: address did not geocode to anything |

## Ties broken mechanically

| Listing | Winning store | Why | Other candidates ruled out |
|---|---|---|---|
| #14 Vijay Nagar Kalyan (East) | **KET** — KET | within 1km of its own precise point (0.93km) — the only candidate that was | BHAR (12.23km away), AMSN (no containment), AML (no containment) |
| #39 Manpada Road, Dombivali East | **DOM** — Manpada Road | within 1km of its own precise point (0.49km) — the only candidate that was | DWK (6.81km away) |
| #48 Station Road, Ambernath West | **PRCAME/PRCAMEN** — Ambernath | within 1km of its own precise point (0.28km) — the only candidate that was | AMW (no containment) |

## Needs a human — genuine disagreement or nothing to check against

| Listing | Proposed store(s) | Coordinate | Containment check | Cross-validation check | Why it wasn't auto-trusted |
|---|---|---|---|---|---|
| #5 TGR,Sangam Marble, Titwala - Goveli Rd, Near Icon Lawn, Kalyan Sub-District, 421605, MH, IN | **TGR** — TGR | 19.169385, 73.189713 | ❌ 13.32km from store's own EXISTING precise point | — inconclusive: address did not geocode to anything | contradicts an existing precise coordinate |
| #6 NILEJE GOAN SERVY NO 33/1/BNR CHANDRES HIMALAYA CHS BUILDING NILEJE STATION ROAD | **NSR** — Nileje Goan | 19.155487, 73.075157 | — inconclusive: town did not geocode to anything | — inconclusive: address did not geocode to anything | neither check cleared it |
| #13 Kalyan Bhiwandi Road | **BHAR** — Kalyan Naka | 19.26515, 73.086365 | ❌ 5.25km from store's own EXISTING precise point | ❌ 4.02km from independent Nominatim geocode | contradicts an existing precise coordinate |
| #15 Nisarag Hotel, Khoni MIDC | **KMR** — KMR | 19.1753225, 73.114188 | — inconclusive: town did not geocode to anything | — inconclusive: address did not geocode to anything | neither check cleared it |
| #23 Kalyan Naka, Bhiwandi | **BHAR** — Kalyan Naka | 19.2540187, 73.0393798 | ❌ 6.57km from store's own EXISTING precise point | ❌ 5.34km from independent Nominatim geocode | contradicts an existing precise coordinate |
| #27 Station Road, Shahad | **SHD** — Station Rd Shahad | 19.2426153, 73.1559273 | ❌ 2.39km from store's own EXISTING precise point | ✅ 0.24km from independent Nominatim geocode of the site's own address text | **contradicts an existing precise coordinate despite the website's own address independently agreeing with itself** — a real conflict between two provenances, not a simple failure |
| #36 Kumbharkhan Pada, Dombivali West | **DWK** — Kumbharkhan Pada | 19.2307638, 73.088131 | ❌ 5.52km from town centroid | — inconclusive: address did not geocode to anything | neither check cleared it |
| #37 Samrat Chowk, Dombivali West | **DOWSMT** — Samrat Chowk | 19.2219559, 73.0818505 | ❌ 6.62km from town centroid | — inconclusive: address did not geocode to anything | neither check cleared it |
| #38 Kopar Road, Dombivali West | **DOW** — Kopar Road | 19.2165573, 73.0833311 | ✅ 0.15km from store's own precise point | ✅ 0.15km from independent Nominatim geocode of the site's own address text | shares a coordinate with another listing |
| #41 Rajaji Path, Dombivali East | **DOE/DER** — Shilphata | 19.2153234, 73.0847615 | ❌ 8.97km from town centroid | ✅ 0.36km from independent Nominatim geocode of the site's own address text | shares a coordinate with another listing |
| #49 Palegaon, Ambernath East | **AMPL** — Palegaon | 19.1896178, 73.1769552 | — inconclusive: town did not geocode to anything | — inconclusive: address did not geocode to anything | neither check cleared it |
| #52 Chokhloli, Ambernath West | **AMCH** — Chokhloli | 19.18354, 73.2199944 | — inconclusive: town did not geocode to anything | — inconclusive: address did not geocode to anything | neither check cleared it |
| #53 Shivganga Nagar, Ambernath East | **AMSN** — Shivganga Nagar | 19.2030029, 73.1803269 | — inconclusive: town did not geocode to anything | — inconclusive: address did not geocode to anything | neither check cleared it |
| #18 Adarsh park road Bhiwandi | KBG (inconclusive) / AVB (18.2km away) / KBR (5.13km away) / BBVR (passed containment too) / BHAR (passed containment too) / Bap (4.19km away) / PAD (14.08km away) — still tied | 19.3080716, 73.05551 | — | — | containment didn't isolate a single winner |
| #35 Shilphata, Khopoli | DOE/DER (48.32km away) / KHP (inconclusive) — still tied | 18.7989122, 73.3273613 | — | — | containment didn't isolate a single winner |
| #50 Luxminagar, Ambernath East | AMSN (inconclusive) / AML (inconclusive) — still tied | 19.1994975, 73.1931952 | — | — | containment didn't isolate a single winner |

## No coordinate at all — the 7 that need a human to open the link directly

| Listing | Proposed store | Website address | Map link |
|---|---|---|---|
| #2 | KBG — KBG - Patel Mart | KBG,Patel mart bapgav near kohinoor developer | _no link on the site_ |
| #11 | DNE — Patel's R Mart | Nandivali, Dombivili East | https://www.google.com/maps/dir/'19.29489,72.8638323'/Patel's+R+Mart,+Dharmadhikari+Hall,+Near,+Gaondevi+Mandir+Road,+Nandivali+East,+Dombivli+East,+Dombivli,+Maharashtra+421201/@19.1565381,72.9674073,46231m/data=!3m2!1e3!4b1!4m22!1m8!3m7!1s0x3be7bf472a0974af:0xd92ba38c5c776156!2sPatel's+R+Mart!8m2!3d19.1996124!4d73.0851615!15sClRQYXRlbCdzIFIgTWFydCBOZWFyIERoYXJtYWRoaWthcmkgSGFsbCAsR2FvbmRldmkgbWFuZGlyIFJvYWQgLE5ldGl2YWxpIERvbWJpdmxpIEVhc3RaVCJScGF0ZWwncyByIG1hcnQgbmVhciBkaGFybWFkaGlrYXJpIGhhbGwgZ2FvbmRldmkgbWFuZGlyIHJvYWQgbmV0aXZhbGkgZG9tYml2bGkgZWFzdJIBC3N1cGVybWFya2V0qgGPARABKhIiDnBhdGVsJ3MgciBtYXJ0KAAyHxABIhvc3PJUr7UPXJGzdVRsZEW8fQs6IlOH7aLpQdEyVhACIlJwYXRlbCdzIHIgbWFydCBuZWFyIGRoYXJtYWRoaWthcmkgaGFsbCBnYW9uZGV2aSBtYW5kaXIgcm9hZCBuZXRpdmFsaSBkb21iaXZsaSBlYXN04AEA!16s%2Fg%2F11xkg3qmn8!4m12!1m5!1m1!1s0x3be7b11eb3739e33:0x881dd0d92870f0ed!2m2!1d72.8638537!2d19.2949167!1m5!1m1!1s0x3be7bf472a0974af:0xd92ba38c5c776156!2m2!1d73.0851615!2d19.1996124?entry=ttu&g_ep=EgoyMDI1MDYyNi4wIKXMDSoASAFQAw%3D%3D |
| #12 | NWM — Nice World | Kausa Talav Road, Mumbra | http://528M+983%20Nice%20world,%20Kausa,%20Mumbra,%20Thane,%20Maharashtra%20400612 |
| #19 | VGW — Vangani East | Vangani East | _no link on the site_ |
| #21 | VAS — Bhere Maidan | Bhere Maidan, Vasind | https://maps.app.goo.gl/Y6FboGYfiS6iEe4HA?g_st=iw |
| #22 | Bap — Anjurphata | Anjurphata Metro Station, Bhiwandi | https://g.co/kgs/Bs7tiyb |
| #32 | KLK — Khadakpada | Khadakpada, Kalyan West | https://g.co/kgs/Wv79XuL |

## No candidate store found

| Listing | Coordinate |
|---|---|
| #1 SURVEY NO 58/1/A HISSA NO 4684GALA NO.1,2,3,4 URAN,PIN CODE:-400702 | 18.871596, 72.941254 |

## Bottom line

29 of 53 site listings are trusted well enough to apply: 5 needed no checks, 21 cleared the containment/cross-validation checks, 3 had their tie broken mechanically. 16 still need a human read. 7 never resolved to a coordinate — those need the link opened by hand, listed above with the site's own address text. Applied to stores.json this run — see the git diff.
