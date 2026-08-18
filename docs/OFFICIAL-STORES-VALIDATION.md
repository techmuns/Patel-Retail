# Official store list — mechanical validation, with a provenance hierarchy

Ran against 53 listings from `stores-official.json` (fetched 2026-08-18). 5 needed no checks (store-code match + unambiguous coordinate), 34 were checked, 25 cleared automatically, 4 ties were broken mechanically. 11 genuinely need a human. 7 never resolved to a coordinate at all.

**Provenance hierarchy applied:** (1) company website coordinate → (2) client-supplied pin → (3) our geocode of the website's own address → (4) our geocode of the client's locality string → (5) town centroid. A higher tier overrides a lower one once it clears a loose town-containment sanity check (5km) — that check is against the store's OWN town, never against whatever lower-tier value happened to be there first. Two listings at the SAME tier disagreeing (the duplicate check below) always goes to a human, regardless of what any sanity check says.

**Read the review backlog against this split, not as a fourth bucket added to it.** stores.json's own precision split (the only numbers that sum to 53) is **44 precise / 6 coarse (town-centroid only) / 3 no coordinate at all**. The 16 distinct store(s) named below in "Needs a human" are a **worklist about the website source specifically** — it overlaps that split, it doesn't extend it: 9 of them already have a precise coordinate from another source (the website just couldn't confirm it), 4 are already coarse for the same reason, and only **3 have no coordinate at all** — those are the only ones where resolving this backlog can actually move the precise count.

## Duplicate-coordinate check

1 cluster(s) of listings share a coordinate within 300m — flagged for review regardless of what the sanity check says, since this is a same-tier conflict, not a tier-ranking question:

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

| Listing | Store | Coordinate | Town sanity check | Cross-validation (only used if town was inconclusive) |
|---|---|---|---|---|
| #9 Ambadi Naka,Ambadi | **AVB** — Ambadi Naka | 19.4699681, 73.0838473 | ✅ 0km from its own existing precise coordinate | _not needed — town check passed_ |
| #16 Opp Neral Police Station, Neral (East) | **NKR** — NK | 19.0290327, 73.3141588 | ✅ 0km from its own existing precise coordinate | _not needed — town check passed_ |
| #17 Sudama Regency, Diva (East) | **DSR** — DSR | 19.1703623, 73.0459179 | ✅ 0km from its own existing precise coordinate | _not needed — town check passed_ |
| #20 Padgha, Bhiwandi | **PAD** — Padgha | 19.3649535, 73.1712973 | ✅ 0km from its own existing precise coordinate | _not needed — town check passed_ |
| #24 Lalchakki Road, Ulhasnagar | **ULN4** — Lalchakki Road | 19.2120338, 73.1627263 | ✅ 0km from its own existing precise coordinate | _not needed — town check passed_ |
| #25 Neharu Chowk, Ulhasnagar | **ULN** — Neharu Chowk | 19.2328767, 73.1599533 | ✅ 0km from its own existing precise coordinate | _not needed — town check passed_ |
| #26 Ganesh Mandir Road, Titwala | **TTL** — Ganesh Mandir Rd | 19.2973684, 73.2128216 | ✅ 0km from its own existing precise coordinate | _not needed — town check passed_ |
| #27 Station Road, Shahad | **SHD** — Station Rd Shahad | 19.2426153, 73.1559273 | ✅ 0km from its own existing precise coordinate | _not needed — town check passed_ |
| #28 Cherpoli, Shahapur | **SHAP** — Cherpoli | 19.4573979, 73.3311053 | ✅ 0km from its own existing precise coordinate | _not needed — town check passed_ |
| #29 Sonarpada, Murbad | **MUBD** — Sonarpada | 19.2579114, 73.3849734 | ✅ 0km from its own existing precise coordinate | _not needed — town check passed_ |
| #30 Rambuag, Kalyan West | **KLW** — Rambaug | 19.2423646, 73.1401159 | ✅ 0km from its own existing precise coordinate | _not needed — town check passed_ |
| #31 Tilak Chowk, Kalyan West | **KLT** — Tilak Chowk | 19.244229, 73.1252991 | ✅ 0km from its own existing precise coordinate | _not needed — town check passed_ |
| #33 Netivili, Kalyan East | **KLE** — Netivili | 19.2266181, 73.1259124 | ✅ 0km from its own existing precise coordinate | _not needed — town check passed_ |
| #34 Kolivili, Kalyan West | **KKW** — Kolivili | 19.2319087, 73.1345379 | ✅ 0km from its own existing precise coordinate | _not needed — town check passed_ |
| #40 Phadke Road, Dombivili East | **DOF** — Phadke Road | 19.2204237, 73.0923651 | ✅ 0km from its own existing precise coordinate | _not needed — town check passed_ |
| #42 Manjarli, Badlapur West | **BWM** — Manjarli | 19.1731597, 73.2347995 | ✅ 0km from its own existing precise coordinate | _not needed — town check passed_ |
| #43 Sanewadi, Badlapur West | **BLWB** — Sanewadi | 19.1661425, 73.2431486 | ✅ 0km from its own existing precise coordinate | _not needed — town check passed_ |
| #44 Katrap, Badlapur East | **BLEK** — Katrap | 19.1674057, 73.2304408 | ✅ 0km from its own existing precise coordinate | _not needed — town check passed_ |
| #45 Gandhi Chowk, Badlapur East | **BLEB** — Gandhi Chowk | 19.1645321, 73.2387458 | ✅ 0km from its own existing precise coordinate | _not needed — town check passed_ |
| #46 Kharvai Naka, Badlapur East | **BKHE** — Kharvai Naka | 19.1454507, 73.2471086 | ✅ 0km from its own existing precise coordinate | _not needed — town check passed_ |
| #47 Shirgaon, Badlapur East | **BES** — Shirgaon | 19.1546231, 73.2345491 | ✅ 0km from its own existing precise coordinate | _not needed — town check passed_ |
| #49 Palegaon, Ambernath East | **AMPL** — Palegaon | 19.1896178, 73.1769552 | ✅ 0km from its own existing precise coordinate | _not needed — town check passed_ |
| #51 Chh.Shiwaji Chowk, Ambernath East | **AME** — Chh Shivaji Chowk | 19.2084515, 73.1855975 | ✅ 0km from its own existing precise coordinate | _not needed — town check passed_ |
| #52 Chokhloli, Ambernath West | **AMCH** — Chokhloli | 19.18354, 73.2199944 | ✅ 0km from its own existing precise coordinate | _not needed — town check passed_ |
| #53 Shivganga Nagar, Ambernath East | **AMSN** — Shivganga Nagar | 19.2030029, 73.1803269 | ✅ 0km from its own existing precise coordinate | _not needed — town check passed_ |

## Overridden coordinates — every meaningful before/after change, for audit

_None yet — either no prior coordinate existed for the applied stores, or every applied coordinate already agreed with what was there._

## Ties broken mechanically

| Listing | Winning store | Why | Other candidates ruled out |
|---|---|---|---|
| #14 Vijay Nagar Kalyan (East) | **KET** — KET | within 1km of its own precise point (0km) — the only candidate that was | BHAR (12.23km away), AMSN (4.93km away), AML (no containment) |
| #35 Shilphata, Khopoli | **KHP** — Khapoli | within 1km of its own precise point (0km) — the only candidate that was | DOE/DER (48.32km away) |
| #39 Manpada Road, Dombivali East | **DOM** — Manpada Road | within 1km of its own precise point (0km) — the only candidate that was | DWK (6.81km away) |
| #48 Station Road, Ambernath West | **PRCAME/PRCAMEN** — Ambernath | within 1km of its own precise point (0km) — the only candidate that was | AMW (no containment) |

## Needs a human — genuine same-tier disagreement, or a higher tier that failed its own sanity check

| Listing | Proposed store(s) | Coordinate | Town sanity check | Cross-validation | Why it wasn't auto-trusted |
|---|---|---|---|---|---|
| #5 TGR,Sangam Marble, Titwala - Goveli Rd, Near Icon Lawn, Kalyan Sub-District, 421605, MH, IN | **TGR** — TGR | 19.169385, 73.189713 | ❌ 13.32km from its own existing precise coordinate | — | the website coordinate itself failed the town sanity check — the link may be pointing at the wrong place |
| #6 NILEJE GOAN SERVY NO 33/1/BNR CHANDRES HIMALAYA CHS BUILDING NILEJE STATION ROAD | **NSR** — Nileje Goan | 19.155487, 73.075157 | — inconclusive: town did not geocode to anything | — inconclusive: address did not geocode to anything | neither the town check nor cross-validation could confirm it |
| #13 Kalyan Bhiwandi Road | **BHAR** — Kalyan Naka | 19.26515, 73.086365 | ❌ 5.25km from its own existing precise coordinate | — | the website coordinate itself failed the town sanity check — the link may be pointing at the wrong place |
| #15 Nisarag Hotel, Khoni MIDC | **KMR** — KMR | 19.1753225, 73.114188 | — inconclusive: town did not geocode to anything | — inconclusive: address did not geocode to anything | neither the town check nor cross-validation could confirm it |
| #23 Kalyan Naka, Bhiwandi | **BHAR** — Kalyan Naka | 19.2540187, 73.0393798 | ❌ 6.57km from its own existing precise coordinate | — | the website coordinate itself failed the town sanity check — the link may be pointing at the wrong place |
| #36 Kumbharkhan Pada, Dombivali West | **DWK** — Kumbharkhan Pada | 19.2307638, 73.088131 | ❌ 5.52km from its own existing (coarse) coordinate | — | the website coordinate itself failed the town sanity check — the link may be pointing at the wrong place |
| #37 Samrat Chowk, Dombivali West | **DOWSMT** — Samrat Chowk | 19.2219559, 73.0818505 | ❌ 6.62km from its own existing (coarse) coordinate | — | the website coordinate itself failed the town sanity check — the link may be pointing at the wrong place |
| #38 Kopar Road, Dombivali West | **DOW** — Kopar Road | 19.2165573, 73.0833311 | ✅ 0.15km from its own existing precise coordinate | — | shares a coordinate with another listing at the same tier — a real conflict, not resolved by ranking |
| #41 Rajaji Path, Dombivali East | **DOE/DER** — Shilphata | 19.2153234, 73.0847615 | ❌ 8.97km from its own existing (coarse) coordinate | — | shares a coordinate with another listing at the same tier — a real conflict, not resolved by ranking |
| #18 Adarsh park road Bhiwandi | KBG (inconclusive) / AVB (18.25km away) / KBR (5.13km away) / BBVR (passed containment too) / BHAR (passed containment too) / Bap (4.19km away) / PAD (13.7km away) — still tied | 19.3080716, 73.05551 | — | — | containment didn't isolate a single winner |
| #50 Luxminagar, Ambernath East | AMSN (1.41km away) / AML (inconclusive) — still tied | 19.1994975, 73.1931952 | — | — | containment didn't isolate a single winner |

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

34 of 53 site listings are trusted well enough to apply: 5 needed no checks, 25 cleared the sanity check (or its cross-validation fallback), 4 had their tie broken mechanically. 0 of those replace a meaningfully different prior coordinate — see the override ledger above. 11 still need a human read. 7 never resolved to a coordinate — those need the link opened by hand. Not applied — re-run with `--apply` once this looks right. **The precision split stays 44/6/3 either way** — see the note above the duplicate-coordinate check for why these listing counts don't subtract from it directly.

## Final short list for hand review

18 listing(s) total: 11 same-tier disagreement(s) or unresolved tie(s) above, plus the 7 that never resolved to a coordinate at all. Each with its website address and map link to open directly. This is a worklist of LISTINGS, not a count of unlocated STORES — see the split above.

| # | Proposed store(s) | Website address | Map link |
|---|---|---|---|
| #5 | TGR — TGR | TGR,Sangam Marble, Titwala - Goveli Rd, Near Icon Lawn, Kalyan Sub-District, 421605, MH, IN | https://www.google.com/maps/dir/19.169385,73.189713/sangam+marble,+Titwala+-+Goveli+Rd,+near+icon+lawn,+east,+Titwala,+kalyan,+Maharashtra+421605/@19.230192,73.121009,21880m/data=!3m2!1e3!4b1!4m13!1m2!2m1!1ssangam+marble!4m9!1m1!4e1!1m5!1m1!1s0x3be791c976a21a79:0x4c127f95e94f681b!2m2!1d73.228598!2d19.291643!3e9?hl=en&entry=ttu&g_ep=EgoyMDI2MDIwOS4wIKXMDSoASAFQAw%3D%3D |
| #6 | NSR — Nileje Goan | NILEJE GOAN SERVY NO 33/1/BNR CHANDRES HIMALAYA CHS BUILDING NILEJE STATION ROAD | https://www.google.com/maps/place/19%C2%B009'19.8%22N+73%C2%B004'30.6%22E/@19.155487,73.075157,17z/data=!3m1!4b1!4m4!3m3!8m2!3d19.155487!4d73.075157?entry=ttu&g_ep=EgoyMDI1MTEyMy4xIKXMDSoASAFQAw%3D%3D |
| #13 | BHAR — Kalyan Naka | Kalyan Bhiwandi Road | https://maps.apple.com/place?ll=19.265150,73.086365&q=My%20Location&t=m |
| #15 | KMR — KMR | Nisarag Hotel, Khoni MIDC | https://maps.app.goo.gl/4iavrvBUwFTS9YiU8 |
| #23 | BHAR — Kalyan Naka | Kalyan Naka, Bhiwandi | https://maps.app.goo.gl/JGnrLkH6DfG1a5Wa6 |
| #36 | DWK — Kumbharkhan Pada | Kumbharkhan Pada, Dombivali West | https://maps.app.goo.gl/J4xuffCiN1RGmG977 |
| #37 | DOWSMT — Samrat Chowk | Samrat Chowk, Dombivali West | https://maps.app.goo.gl/qiDp8ShSR9efkfL18 |
| #38 | DOW — Kopar Road | Kopar Road, Dombivali West | https://maps.app.goo.gl/ZNgWy3LSzV19zZcY9 |
| #41 | DOE/DER — Shilphata | Rajaji Path, Dombivali East | https://maps.app.goo.gl/Qh1phjdAqcfrz4Jd7 |
| #18 | KBG (inconclusive) / AVB (18.25km away) / KBR (5.13km away) / BBVR (passed containment too) / BHAR (passed containment too) / Bap (4.19km away) / PAD (13.7km away) — still tied | Adarsh park road Bhiwandi | https://maps.app.goo.gl/Jyh3oZuxxmVSjWFE8 |
| #50 | AMSN (1.41km away) / AML (inconclusive) — still tied | Luxminagar, Ambernath East | https://maps.app.goo.gl/J4itbQvksJRviySS6 |
| #2 | KBG — KBG - Patel Mart | KBG,Patel mart bapgav near kohinoor developer | _no link on the site_ |
| #11 | DNE — Patel's R Mart | Nandivali, Dombivili East | https://www.google.com/maps/dir/'19.29489,72.8638323'/Patel's+R+Mart,+Dharmadhikari+Hall,+Near,+Gaondevi+Mandir+Road,+Nandivali+East,+Dombivli+East,+Dombivli,+Maharashtra+421201/@19.1565381,72.9674073,46231m/data=!3m2!1e3!4b1!4m22!1m8!3m7!1s0x3be7bf472a0974af:0xd92ba38c5c776156!2sPatel's+R+Mart!8m2!3d19.1996124!4d73.0851615!15sClRQYXRlbCdzIFIgTWFydCBOZWFyIERoYXJtYWRoaWthcmkgSGFsbCAsR2FvbmRldmkgbWFuZGlyIFJvYWQgLE5ldGl2YWxpIERvbWJpdmxpIEVhc3RaVCJScGF0ZWwncyByIG1hcnQgbmVhciBkaGFybWFkaGlrYXJpIGhhbGwgZ2FvbmRldmkgbWFuZGlyIHJvYWQgbmV0aXZhbGkgZG9tYml2bGkgZWFzdJIBC3N1cGVybWFya2V0qgGPARABKhIiDnBhdGVsJ3MgciBtYXJ0KAAyHxABIhvc3PJUr7UPXJGzdVRsZEW8fQs6IlOH7aLpQdEyVhACIlJwYXRlbCdzIHIgbWFydCBuZWFyIGRoYXJtYWRoaWthcmkgaGFsbCBnYW9uZGV2aSBtYW5kaXIgcm9hZCBuZXRpdmFsaSBkb21iaXZsaSBlYXN04AEA!16s%2Fg%2F11xkg3qmn8!4m12!1m5!1m1!1s0x3be7b11eb3739e33:0x881dd0d92870f0ed!2m2!1d72.8638537!2d19.2949167!1m5!1m1!1s0x3be7bf472a0974af:0xd92ba38c5c776156!2m2!1d73.0851615!2d19.1996124?entry=ttu&g_ep=EgoyMDI1MDYyNi4wIKXMDSoASAFQAw%3D%3D |
| #12 | NWM — Nice World | Kausa Talav Road, Mumbra | http://528M+983%20Nice%20world,%20Kausa,%20Mumbra,%20Thane,%20Maharashtra%20400612 |
| #19 | VGW — Vangani East | Vangani East | _no link on the site_ |
| #21 | VAS — Bhere Maidan | Bhere Maidan, Vasind | https://maps.app.goo.gl/Y6FboGYfiS6iEe4HA?g_st=iw |
| #22 | Bap — Anjurphata | Anjurphata Metro Station, Bhiwandi | https://g.co/kgs/Bs7tiyb |
| #32 | KLK — Khadakpada | Khadakpada, Kalyan West | https://g.co/kgs/Wv79XuL |
