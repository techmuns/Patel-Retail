# 25 store pins needed from the client

These 25 stores currently resolve only to their **town centre** (or have no
coordinates at all) — not their own address. That means we can't measure
how close they actually are to each other, which is the one thing this
dashboard exists to answer: cannibalisation is an intra-town question, and a
town-centre approximation can't tell a 400m overlap from a 2.5km one. The
dense clusters below (Ambernath, Kalyan, Badlapur) are exactly where that
gap costs the most, so they're listed first.

**What we need:** for each store, a Google Maps pin on the actual storefront.
Fastest way to do it on a phone: open Google Maps → search the store name or
locality → long-press the correct spot on the map to drop a pin → tap the
address card at the bottom → **Share** → copy the link → paste it into the
"Google Maps link" column below (or just reply with a numbered list of
links in the same order). A plain `latitude, longitude` pair works too if
that's easier. Should take about 10 minutes for all 25.

---

## Ambernath (5 stores)

| # | Store Code | Store Name | Locality | Town | Google Maps Link |
|---|---|---|---|---|---|
| 1 | AMSN | Shivganga Nagar | Shivganga Nagar, Ambernath (E) | Ambernath East | |
| 2 | AMCH | Chokhloli | Chokhloli, Ambernath (W) | Ambernath West | |
| 3 | AML | Luxminagar | Luxminagar, Ambernath (E) | Ambernath East | |
| 4 | AMPL | Palegaon | Palegaon, Ambernath (E) | Ambernath East | |
| 5 | AMW | Station Rd Ambernath | Station Road, Ambernath (W) | Ambernath West | |

## Badlapur (2 stores)

| # | Store Code | Store Name | Locality | Town | Google Maps Link |
|---|---|---|---|---|---|
| 6 | BES | Shirgaon | Shirgaon, Badlapur (E) | Badlapur East | |
| 7 | BLWB | Sanewadi | Sanewadi, Badlapur (W) | Badlapur West | |

## Kalyan (3 stores)

| # | Store Code | Store Name | Locality | Town | Google Maps Link |
|---|---|---|---|---|---|
| 8 | KKW | Kolivili | Kolivili, Kalyan (W) | Kalyan West | |
| 9 | KLE | Netivili | Netivili, Kalyan (E) | Kalyan East | |
| 10 | KLT | Tilak Chowk | Tilak Chowk, Kalyan (W) | Kalyan West | |

## Dombivali (2 stores)

| # | Store Code | Store Name | Locality | Town | Google Maps Link |
|---|---|---|---|---|---|
| 11 | DOWSMT | Samrat Chowk | Samrat Chowk, Dombivali (W) | Dombivali West | |
| 12 | DWK | Kumbharkhan Pada | Kumbharkhan Pada, Dombivali (W) | Dombivali West | |

## Ulhasnagar (2 stores)

Not one of the originally-named clusters, but two of these 25 land in the
same town, so grouped here rather than scattered among the singles below.

| # | Store Code | Store Name | Locality | Town | Google Maps Link |
|---|---|---|---|---|---|
| 13 | ULN | Neharu Chowk | Neharu Chowk, Ulhasnagar | Ulhasnagar | |
| 14 | ULN4 | Lalchakki Road | Lalchakki Road, Ulhasnagar | Ulhasnagar | |

*(Bhiwandi has no unresolved stores in this list — its stores are already precisely located.)*

## Individual stores (11 stores)

One Patel store per town — still needed, just not part of a cluster.

| # | Store Code | Store Name | Locality | Town | Google Maps Link |
|---|---|---|---|---|---|
| 15 | KBG | KBG - Patel Mart | Bapgav (nr Kohinoor Developer) | Bhiwandi-Kalyan belt | |
| 16 | KHP | Khapoli | Khapoli | Khapoli | |
| 17 | KMR | KMR | Khoni MIDC | Khoni (MIDC) | |
| 18 | MUBD | Sonarpada | Sonarpada, Murbad | Murbad | |
| 19 | NKR | NK | opp Neral Police Stn, Neral (E) | Neral | |
| 20 | NSR | Nileje Goan | Nileje Station Rd | Nilje / Diva | |
| 21 | RCM | RCM | Mohopada / Rasayani | Rasayani | |
| 22 | SHAP | Cherpoli | Cherpoli, Shahapur | Shahapur | |
| 23 | DOE/DER | Shilphata | Shilphata (Kalyan-Dombivali) / Rajaji Path, Dombivali (E) | Shilphata | |
| 24 | TTL | Ganesh Mandir Rd | Ganesh Mandir Road, Titwala | Titwala | |
| 25 | VAS | Bhere Maidan | Bhere Maidan, Vasind | Vasind | |

---

## After the client replies

1. Paste each link (or `lat, lng` pair) into the matching store's `gmaps_link`
   field in `public/data/stores.json`.
2. Run `node scripts/apply-client-coords.mjs` — it parses every link, sets
   `geo_source: "client"`, and is safe to re-run if a link needs correcting.
3. Run `node scripts/build-proximity.mjs` to rebuild distances with the new
   coordinates.
4. Run `node scripts/verify-geocode.mjs` to confirm nothing else needs review
   (client-supplied coordinates are trusted automatically and skipped).

Four stores (`KBG`, `NSR`, `KMR`, `KHP`) had zero geocoding results at every
automated fallback tier — these are the ones a client pin will help with
most, since there's currently no fallback location for them at all.
