/* Small DOM helpers shared across the UI layer. */

export function $(id) { return document.getElementById(id); }

/** window.confirm, but never throws (some embedded/preview contexts block it). */
export function wConfirm(m) {
  try { return window.confirm(m); } catch (e) { return true; }
}
