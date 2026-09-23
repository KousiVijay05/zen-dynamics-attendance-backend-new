/* ---------------------------------------------------------------
   Geolocation math: Haversine distance + bearing.
   Ported verbatim from the original app.js.
----------------------------------------------------------------*/

/** Great-circle distance between two lat/lng points, in metres. */
export function metres(aLat, aLng, bLat, bLng) {
  var R = 6371000, r = Math.PI / 180;
  var p1 = aLat * r, p2 = bLat * r, dp = (bLat - aLat) * r, dl = (bLng - aLng) * r;
  var h = Math.sin(dp / 2) * Math.sin(dp / 2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Bearing (radians) from point A to point B, used only to place the radar dot. */
export function bearing(aLat, aLng, bLat, bLng) {
  var r = Math.PI / 180, p1 = aLat * r, p2 = bLat * r, dl = (bLng - aLng) * r;
  return Math.atan2(Math.sin(dl) * Math.cos(p2), Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl));
}
