/* ---------------------------------------------------------------
   Geofencing: distance-to-site, watch/tick timers.

   Ported verbatim from the "geofence" section of the original
   app.js (distanceNow/inZone/startWatch/startTick). Behavior,
   including demo mode and the accuracy/error handling, is
   unchanged — only the module boundary and JSDoc are new.
----------------------------------------------------------------*/

import { state, geo, fenceState, emitChange } from "../core/store.js";
import { metres } from "../utils/geomath.js";
import { userIsTyping } from "../ui/dom.js";

/**
 * Distance in metres from the device to the configured site, or
 * null when we don't have enough information yet (no config, no
 * fix). Demo mode always reports 0 (treats everyone as on site).
 */
export function distanceNow() {
  if (!state.cfg || !state.cfg.site) return null;
  if (state.cfg.demo) return 0;
  if (!geo.ok) return null;
  return metres(state.cfg.site.lat, state.cfg.site.lng, geo.lat, geo.lng);
}

export function inZone() {
  var d = distanceNow();
  return d !== null && d <= state.cfg.site.radius;
}

/**
 * Starts the browser's continuous location watch. Safe to call more
 * than once — only the first call does anything. Repaints the
 * current view on every fix/error while the staff or sign-in screen
 * is showing, exactly like the original.
 */
export function startWatch() {
  if (fenceState.watching) return;
  fenceState.watching = true;
  if (!navigator.geolocation) {
    geo.err = "This device can't report a location.";
    return;
  }
  navigator.geolocation.watchPosition(function (p) {
    geo.ok = true; geo.err = null;
    geo.lat = p.coords.latitude; geo.lng = p.coords.longitude; geo.acc = p.coords.accuracy || 0;
    if ((state.view === "staff" || state.view === "signin") && !userIsTyping()) emitChange();
  }, function (e) {
    geo.ok = false;
    geo.err = e.code === 1 ? "Location permission is off. Allow it in your browser settings."
      : "No location fix yet. Move outdoors and wait a moment.";
    if ((state.view === "staff" || state.view === "signin") && !userIsTyping()) emitChange();
  }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
}

/** One-shot re-request, used by the "Enable location" retry button. */
export function retryLocation() {
  return new Promise(function (resolve) {
    if (!navigator.geolocation) {
      geo.err = "This device can't report a location.";
      resolve(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(function (p) {
      geo.ok = true; geo.err = null;
      geo.lat = p.coords.latitude; geo.lng = p.coords.longitude; geo.acc = p.coords.accuracy || 0;
      resolve(true);
    }, function (e) {
      geo.ok = false;
      geo.err = e.code === 1 ? "Location is blocked here. Allow it in site settings, or open the app from an https address."
        : "Still no fix. Move outdoors and try again.";
      resolve(false);
    }, { enableHighAccuracy: true, timeout: 20000 });
  });
}

/** Starts the 1s clock ticker that keeps the live shift timer moving. */
export function startTick() {
  if (fenceState.ticking) return;
  fenceState.ticking = true;
  setInterval(function () {
    if ((state.view === "staff" || state.view === "signin") && !userIsTyping()) emitChange();
  }, 1000);
}
