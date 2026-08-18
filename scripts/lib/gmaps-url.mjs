/**
 * scripts/lib/gmaps-url.mjs — shared Google/Apple Maps URL parsing.
 *
 * Factored out of apply-client-coords.mjs (which had these patterns first,
 * tested live against a real maps.app.goo.gl short link — see that file's
 * own header) so fetch-official-stores.mjs can reuse the exact same, already
 * -verified logic instead of a second copy that could quietly drift from it.
 *
 * Behaviour for the three original patterns (@lat,lng / !3d!4d / /search/)
 * and short-link resolution is UNCHANGED from what apply-client-coords.mjs
 * shipped with. Two things were added here for fetch-official-stores.mjs's
 * messier real-world data, and both are strict additions — nothing that
 * matched before stops matching:
 *   - Apple Maps' `?ll=lat,lng` param.
 *   - `g.co` as a recognized short-link host, alongside `goo.gl` /
 *     `maps.app.goo.gl` (the official site uses `g.co/kgs/...` links that
 *     apply-client-coords.mjs had never seen).
 */

const SHORT_LINK_HOSTS = ["goo.gl", "maps.app.goo.gl", "g.co"];

export function tryParseRawLatLng(input) {
  const m = input.trim().match(/^(-?\d{1,3}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)$/);
  if (!m) return null;
  return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
}

/**
 * Extract lat/lng from a (resolved, long-form) maps URL. Tries every known
 * pattern in order of how unambiguous it is — every one of these names a
 * SINGLE coordinate, never picks among several candidates.
 *
 * !3d!4d is checked BEFORE the bare @lat,lng viewport — found the hard way
 * (fetch-official-stores.mjs's first real run, see PATEL-HANDOFF.md): a
 * short link that resolves to a business-NAME search
 * (.../place/Patel's+R+Mart/@19.25,72.75,43753m/...!3d{real}!4d{real}...)
 * gives a `@` viewport that's the centre of the whole search area — wide
 * enough that two DIFFERENT stores, matched from two different short links
 * both searching the generic phrase "Patel's R Mart", resolved to the
 * IDENTICAL @-coordinate while carrying different, correct !3d!4d pairs
 * tied to each one's own matched place. A coordinate-only search/place URL
 * (no business name) still has @ and !3d!4d agree exactly, so this
 * reordering doesn't change anything for that case — it only matters, and
 * only helps, when the two disagree.
 */
export function tryParseMapsUrl(url) {
  // ...!3d19.2017!4d73.1896... — tied to a specific place's own data block,
  // not the viewport, so this wins whenever both are present.
  let m = url.match(/!3d(-?\d{1,3}\.\d+)!4d(-?\d{1,3}\.\d+)/);
  if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]), via: "!3d!4d" };

  // .../@19.2017,73.1896,17z/...  — "you're looking at this point on the map"
  m = url.match(/@(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/);
  if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]), via: "@lat,lng" };

  // .../search/19.2017,+73.1896... — what a maps.app.goo.gl "dropped pin" short link resolves to
  m = url.match(/\/search\/(-?\d{1,3}\.\d+),\+?(-?\d{1,3}\.\d+)/);
  if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]), via: "/search/" };

  // Apple Maps: maps.apple.com/place?ll=19.2017,73.1896
  m = url.match(/[?&]ll=(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/);
  if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]), via: "apple_ll" };

  // ?q=19.2017,73.1896 or ?query=19.2017,73.1896 — older / simple share form
  try {
    const u = new URL(url);
    const q = u.searchParams.get("q") || u.searchParams.get("query");
    if (q) {
      const parsed = tryParseRawLatLng(q);
      if (parsed) return { ...parsed, via: "?q=" };
    }
  } catch {
    /* not a valid URL at all — fall through to null */
  }
  return null;
}

export function isShortLink(input) {
  try {
    const u = new URL(input);
    return SHORT_LINK_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

/** Short links carry no coordinates in the URL itself — resolve the redirect to get the real one. */
export async function resolveShortLink(url) {
  const res = await fetch(url, {
    redirect: "follow",
    headers: { "User-Agent": "Mozilla/5.0 (compatible; PatelRetailDashboard/1.0)" },
  });
  return res.url; // final URL after following every redirect
}
