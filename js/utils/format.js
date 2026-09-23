/* ---------------------------------------------------------------
   Pure formatting / date-key helpers.

   Ported verbatim from the original app.js — behavior is unchanged,
   only the module boundary is new. Nothing here touches storage,
   DOM, or app state, so it's trivial to unit-test in isolation.
----------------------------------------------------------------*/

export function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
    return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c];
  });
}

export function pad(n) { return (n < 10 ? "0" : "") + n; }

export function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

export function num(v, d) { var n = parseFloat(v); return isFinite(n) ? n : d; }

/** ms -> "HH:MM:SS" */
export function hms(ms) {
  var s = Math.max(0, Math.floor(ms / 1000));
  return pad(Math.floor(s / 3600)) + ":" + pad(Math.floor(s / 60) % 60) + ":" + pad(s % 60);
}

/** ms -> "1h 23m" (or "23m" under an hour) */
export function hm(ms) {
  var m = Math.round(Math.max(0, ms) / 60000), h = Math.floor(m / 60);
  return (h ? h + "h " : "") + (m % 60) + "m";
}

export function tClock(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** local calendar-day key: "yyyy-mm-dd" */
export function dayKey(ts) {
  var d = new Date(ts);
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
}

/** month key used as the log-sheet suffix: "yyyymm" */
export function monKey(ts) {
  var d = new Date(ts);
  return d.getFullYear() + "" + pad(d.getMonth() + 1);
}

/** month key used in the UI/URLs: "yyyy-mm" */
export function ymKey(ts) {
  var d = new Date(ts);
  return d.getFullYear() + "-" + pad(d.getMonth() + 1);
}

export function dayLabel(k) {
  if (k === dayKey(Date.now())) return "Today";
  if (k === dayKey(Date.now() - 864e5)) return "Yesterday";
  return new Date(k + "T00:00:00").toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });
}

export function monthLabel(ym) {
  return new Date(ym + "-01T00:00:00").toLocaleDateString([], { month: "long", year: "numeric" });
}

export function minsOfDay(ts) {
  var d = new Date(ts);
  return d.getHours() * 60 + d.getMinutes();
}

/** "HH:MM" -> minutes since midnight; defaults to 540 (09:00) on bad input, same as original. */
export function parseHM(s) {
  var m = /^(\d{1,2}):(\d{2})$/.exec(String(s || "").trim());
  return m ? (+m[1]) * 60 + (+m[2]) : 540;
}

export var DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
