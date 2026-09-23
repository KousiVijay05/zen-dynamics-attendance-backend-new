/* ---------------------------------------------------------------
   Leave requests: staff request a date range, an admin approves or
   rejects it, against a per-year allowance (state.cfg.pay.leavePerYear,
   default 15). Stored in state.cfg.leaves, saved through the same
   org:config key as site/pay settings and shifts — so a request made
   on one device, and its approval on another, both reach every device
   once Google Sheets storage is wired up.

   A pending request reserves its days against the balance (so two
   overlapping requests can't both be approved past the allowance);
   the reservation is released if the request is rejected or cancelled.
----------------------------------------------------------------*/

import { state } from "../core/store.js";
import { sset } from "../storage/storage-api.js";
import { uid } from "../utils/format.js";

function saveCfg() { return sset("org:config", state.cfg, true); }

/** Inclusive day count between two "yyyy-mm-dd" dates. */
export function leaveDaysBetween(from, to) {
  var a = new Date(from + "T00:00:00").getTime();
  var b = new Date(to + "T00:00:00").getTime();
  return Math.round((b - a) / 864e5) + 1;
}

export function leavesFor(staffId) {
  return (state.cfg.leaves || []).filter(function (l) { return l.staffId === staffId; });
}

/** { total, used, pending, remaining } for one staff member in a given calendar year. */
export function leaveBalance(staffId, year) {
  var y = year || new Date().getFullYear();
  var used = 0, pending = 0;
  leavesFor(staffId).forEach(function (l) {
    if (+l.from.slice(0, 4) !== y) return;
    if (l.status === "approved") used += l.days;
    else if (l.status === "pending") pending += l.days;
  });
  var total = (state.cfg.pay && state.cfg.pay.leavePerYear) || 15;
  return { total: total, used: used, pending: pending, remaining: Math.max(0, total - used - pending) };
}

/** Staff-facing: submit a new leave request. `fields` = { from, to, reason }. */
export function requestLeave(staffId, fields) {
  var from = (fields.from || "").trim();
  var to = (fields.to || "").trim() || from;
  var reason = (fields.reason || "").trim();

  if (!from) throw new Error("Pick a start date.");
  if (to < from) throw new Error("End date can't be before the start date.");

  var days = leaveDaysBetween(from, to);
  var bal = leaveBalance(staffId, +from.slice(0, 4));
  if (days > bal.remaining) throw new Error("Only " + bal.remaining + " day(s) of leave left this year.");

  state.cfg.leaves = state.cfg.leaves || [];
  state.cfg.leaves.unshift({
    id: uid(), staffId: staffId, from: from, to: to, days: days, reason: reason,
    status: "pending", requestedAt: Date.now(), decidedAt: null, decidedBy: null
  });
  return saveCfg().then(function () { return "Leave request submitted."; });
}

/** Staff-facing: withdraw a request that's still pending. */
export function cancelLeave(id, staffId) {
  var l = (state.cfg.leaves || []).filter(function (x) { return x.id === id; })[0];
  if (!l || l.staffId !== staffId || l.status !== "pending") throw new Error("That request can't be cancelled.");
  state.cfg.leaves = state.cfg.leaves.filter(function (x) { return x.id !== id; });
  return saveCfg().then(function () { return "Request cancelled."; });
}

/** Admin-facing: approve or reject a pending request. */
export function decideLeave(id, approve, byName) {
  var l = (state.cfg.leaves || []).filter(function (x) { return x.id === id; })[0];
  if (!l || l.status !== "pending") throw new Error("That request was already decided.");
  l.status = approve ? "approved" : "rejected";
  l.decidedAt = Date.now();
  l.decidedBy = byName || null;
  return saveCfg().then(function () { return approve ? "Leave approved." : "Leave rejected."; });
}

/** Used by payroll.js: is `dayK` ("yyyy-mm-dd") covered by an approved leave for this staff member? */
export function isOnApprovedLeave(staffId, dayK) {
  return leavesFor(staffId).some(function (l) {
    return l.status === "approved" && dayK >= l.from && dayK <= l.to;
  });
}
