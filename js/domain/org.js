/* ---------------------------------------------------------------
   Workplace-level settings: the site geofence/behavior settings
   (Admin -> Settings) and the payroll rules (Admin -> Payroll ->
   Rules). Ported from the "offday", "savepay" and "savecfg" event
   handler branches of the original app.js — field names, defaults
   and validation are unchanged.
----------------------------------------------------------------*/

import { state, emitChange } from "../core/store.js";
import { sset } from "../storage/storage-api.js";
import { num, uid } from "../utils/format.js";

function saveCfg() { return sset("org:config", state.cfg, true); }

/**
 * Shift Master (Admin -> Shifts). Shifts live in state.cfg.shifts, saved
 * through the same org:config key as site/pay settings, so a shift an
 * admin creates on one device reaches every other device once Google
 * Sheets storage is wired up — unlike storing them in this device's own
 * localStorage, which never syncs.
 */
export function addShift(fields) {
  var name = (fields.name || "").trim();
  var start = (fields.start || "").trim();
  var end = (fields.end || "").trim();
  if (!name || !start || !end) throw new Error("Enter shift name, start time and end time.");

  state.cfg.shifts.push({ id: uid(), name: name, start: start, end: end });
  return saveCfg().then(function () { return "Shift added."; });
}

export function updateShift(id, fields) {
  var s = state.cfg.shifts.filter(function (x) { return x.id === id; })[0];
  if (!s) throw new Error("That shift no longer exists.");

  var name = (fields.name || "").trim();
  var start = (fields.start || "").trim();
  var end = (fields.end || "").trim();
  if (!name || !start || !end) throw new Error("Enter shift name, start time and end time.");

  s.name = name; s.start = start; s.end = end;
  state.editShiftId = null;
  return saveCfg().then(function () { return "Shift updated."; });
}

export function deleteShift(id) {
  state.cfg.shifts = state.cfg.shifts.filter(function (s) { return s.id !== id; });
  /* Also drop the shift from anyone it's assigned to, so a stale id never
     silently disappears from someone's clock-in without explanation. */
  state.roster.forEach(function (p) {
    if (Array.isArray(p.shifts)) p.shifts = p.shifts.filter(function (sid) { return sid !== id; });
  });
  return Promise.all([saveCfg(), sset("org:roster", state.roster, true)]).then(function () { return "Shift deleted."; });
}

export function startEditShift(id) { state.editShiftId = id; state.msg = ""; emitChange(); }
export function cancelEditShift() { state.editShiftId = null; state.msg = ""; emitChange(); }

/**
 * Toggles one weekday in/out of the weekly-off set. This only
 * updates in-memory state (matching the original) — it's persisted
 * the next time saveSiteSettings/savePayRules runs, same as before.
 */
export function toggleWeeklyOff(dayIndex) {
  var i = state.cfg.pay.weeklyOff.indexOf(dayIndex);
  if (i >= 0) state.cfg.pay.weeklyOff.splice(i, 1);
  else state.cfg.pay.weeklyOff.push(dayIndex);
  emitChange();
}

/** Saves the full payroll rules form (Admin -> Payroll -> Rules). */
export function savePayRules(fields) {
  var P = state.cfg.pay;
  P.currency = fields.currency;
  P.basis = fields.basis;
  P.fixedDays = num(fields.fixedDays, 26);
  P.stdHours = num(fields.stdHours, 8);
  P.fullDayHours = num(fields.fullDayHours, 7);
  P.halfDayHours = num(fields.halfDayHours, 4);
  P.shiftStart = (fields.shiftStart || "").trim() || "09:00";
  P.lateGrace = num(fields.lateGrace, 5);
P.lateMarksPerDeduct = Math.max(1, num(fields.lateMarksPerDeduct, 1));
P.lateDeductDays = num(fields.lateDeductDays, 1);
  P.paidLeave = num(fields.paidLeave, 0);
  P.leavePerYear = num(fields.leavePerYear, 15);
  P.otEnabled = !!fields.otEnabled;
  P.otRate = num(fields.otRate, 1.5);
  return saveCfg().then(function () { return "Rules saved."; });
}

/** Saves the site/geofence settings form (Admin -> Settings). */
export function saveSiteSettings(fields) {
  var la2 = fields.lat, ln2 = fields.lng, r2 = fields.radius, g2 = num(fields.graceMin, 0);
  if (!isFinite(la2) || !isFinite(ln2) || Math.abs(la2) > 90 || Math.abs(ln2) > 180) {
    throw new Error("Those coordinates aren't valid.");
  }
  state.cfg.org = (fields.org || "").trim() || state.cfg.org;
  state.cfg.site = { lat: la2, lng: ln2, radius: isFinite(r2) && r2 >= 10 ? r2 : 100 };
  state.cfg.lockOutside = !!fields.lockOutside;
  state.cfg.graceMin = Math.max(0, g2);
  state.cfg.adminAnywhere = !!fields.adminAnywhere;
  state.cfg.demo = !!fields.demo;
  return saveCfg().then(function () { return "Settings saved."; });
}
