/* Small DOM helpers shared across the UI layer. */

export function $(id) { return document.getElementById(id); }

/** window.confirm, but never throws (some embedded/preview contexts block it). */
export function wConfirm(m) {
  try { return window.confirm(m); } catch (e) { return true; }
}

/**
 * True while the user has a text/number/date/etc. input or textarea
 * focused. render() replaces #root's entire innerHTML on every change,
 * including the once-a-second live-timer tick and every GPS fix — which
 * would otherwise destroy and recreate a focused input mid-interaction,
 * closing an open native date picker before a date can be selected.
 * Callers that fire on a timer/background event (not a direct user
 * action on that input) should skip emitChange() while this is true.
 */
export function userIsTyping() {
  var el = document.activeElement;
  if (!el) return false;
  var tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}
