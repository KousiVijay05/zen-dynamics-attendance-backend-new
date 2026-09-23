/* ---------------------------------------------------------------
   The "how far am I from site" radar + status block, and the
   locked-out message shown when clocking is disabled. Ported
   verbatim (markup and logic) from radarSvg/proxBlock/lockedBlock
   in the original app.js, styling refreshed in styles/*.css only.
----------------------------------------------------------------*/

import { state, geo } from "../../core/store.js";
import { esc } from "../../utils/format.js";
import { bearing } from "../../utils/geomath.js";
import { distanceNow } from "../../domain/geofence.js";

export function radarSvg(d) {
  var cx = 48, cy = 48, fill = "var(--ring-idle)";
  if (state.cfg.site && d !== null) {
    var px = Math.min(d / state.cfg.site.radius, 1.55) * 30;
    var b = state.cfg.demo ? 0 : bearing(state.cfg.site.lat, state.cfg.site.lng, geo.lat, geo.lng);
    cx = (48 + Math.sin(b) * px).toFixed(1);
    cy = (48 - Math.cos(b) * px).toFixed(1);
    /* the moving dot is the one real-time status signal here: green inside, red outside */
    fill = d <= state.cfg.site.radius ? "var(--status-good)" : "var(--status-bad)";
  }
  /* the dashed ring + center point mark the site itself (a fixed reference, not a
     status), so they're brand gold rather than green */
  return '<svg class="radar" viewBox="0 0 96 96" aria-hidden="true">' +
    '<circle cx="48" cy="48" r="45" fill="none" stroke="var(--line)"/>' +
    '<circle cx="48" cy="48" r="30" fill="var(--gold-soft)" stroke="var(--gold)" stroke-width="1.5" stroke-dasharray="3 3"/>' +
    '<circle cx="48" cy="48" r="2.5" fill="var(--gold-strong)"/>' +
    '<circle cx="' + cx + '" cy="' + cy + '" r="5" fill="' + fill + '" stroke="var(--panel)" stroke-width="2"/></svg>';
}

export function proxBlock() {
  var d = distanceNow(), s = state.cfg.site;
  var cls = d === null ? "prox" : (d <= s.radius ? "prox inside" : "prox outside");
  var txt = d === null ? "—" : (d < 1000 ? Math.round(d) + ' <small>m from site</small>'
    : (d / 1000).toFixed(1) + ' <small>km from site</small>');
  var note = state.cfg.demo ? "Demo mode — location is simulated."
    : d === null ? (geo.err || "Finding your location…")
    : d <= s.radius ? ("Inside the " + s.radius + " m zone. Accuracy ±" + Math.round(geo.acc) + " m.")
    : ("The app unlocks within " + s.radius + " m of the site.");
  return '<div class="' + cls + '">' + radarSvg(d) +
    '<div><div class="dist">' + txt + '</div><div class="prox-note">' + esc(note) + "</div></div></div>";
}

export function lockedBlock(d, closed) {
  var noFix = d === null;
  var title = noFix ? "Location unavailable" : "Outside the site";
  var cap = noFix ? (geo.err || "Waiting for a location fix.")
    : closed ? "Your shift was closed when you left."
    : "Return within " + state.cfg.site.radius + " m to clock in.";
  return '<div class="clock locked"><div class="read">' + title + '</div><div class="cap">' + esc(cap) + "</div></div>" +
    (noFix ? '<div class="btnrow"><button class="btn wide" data-act="retryloc">Enable location</button></div>' +
      '<p class="why">The app needs location to know you\'re on site. It must be served over https — a sandboxed preview or a file:// page will always be blocked.</p>' : "");
}
