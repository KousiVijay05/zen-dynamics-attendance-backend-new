/* ---------------------------------------------------------------
   Leave requests: staff request a date range, an admin approves or
   rejects it, against a per-year allowance (state.cfg.pay.leavePerYear,
   default 15).

   Storage, per staff member (so database rules can keep each person to
   their own records):
     leave:<staffId>     their requests  [{ id, from, to, days, reason, requestedAt }]
                         — written by that person (and admins)
     leavedec:<staffId>  decisions       { <requestId>: { status, decidedAt, decidedBy } }
                         — written by admins ONLY, so nobody can approve
                           their own leave
   A request with no decision is "pending". allLeaves() returns the
   combined, flat shape the rest of the app has always used.

   A pending request reserves its days against the balance (so two
   overlapping requests can't both be approved past the allowance);
   the reservation is released if the request is rejected or cancelled.
----------------------------------------------------------------*/

import { state } from "../core/store.js";
import { sget, sset } from "../storage/storage-api.js";
import { uid } from "../utils/format.js";

function data(staffId) {
  state.leaveData = state.leaveData || {};
  return state.leaveData[staffId] || (state.leaveData[staffId] = { reqs: [], dec: {} });
}

/** Loads one person's requests + decisions into state.leaveData. */
export function loadLeaves(staffId) {
  return Promise.all([sget("leave:" + staffId, true), sget("leavedec:" + staffId, true)]).then(function (r) {
    var d = data(staffId);
    d.reqs = Array.isArray(r[0]) ? r[0] : [];
    d.dec = r[1] && typeof r[1] === "object" ? r[1] : {};
  });
}

/** Every loaded request, flattened with its staffId and decision. */
export function allLeaves() {
  var out = [];
  Object.keys(state.leaveData || {}).forEach(function (staffId) {
    var d = state.leaveData[staffId];
    d.reqs.forEach(function (q) {
      var dec = d.dec[q.id] || {};
      out.push({
        id: q.id, staffId: staffId, from: q.from, to: q.to, days: q.days, reason: q.reason || "",
        requestedAt: q.requestedAt, status: dec.status || "pending",
        decidedAt: dec.decidedAt || null, decidedBy: dec.decidedBy || null
      });
    });
  });
  return out;
}

/** Inclusive day count between two "yyyy-mm-dd" dates. */
export function leaveDaysBetween(from, to) {
  var a = new Date(from + "T00:00:00").getTime();
  var b = new Date(to + "T00:00:00").getTime();
  return Math.round((b - a) / 864e5) + 1;
}

export function leavesFor(staffId) {
  return allLeaves().filter(function (l) { return l.staffId === staffId; });
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

  var d = data(staffId);
  d.reqs.unshift({ id: uid(), from: from, to: to, days: days, reason: reason, requestedAt: Date.now() });
  return sset("leave:" + staffId, d.reqs, true).then(function () { return "Leave request submitted."; });
}

/** Staff-facing: withdraw a request that's still pending. */
export function cancelLeave(id, staffId) {
  var d = data(staffId);
  if (d.dec[id] || !d.reqs.some(function (q) { return q.id === id; })) throw new Error("That request can't be cancelled.");
  d.reqs = d.reqs.filter(function (q) { return q.id !== id; });
  return sset("leave:" + staffId, d.reqs, true).then(function () { return "Request cancelled."; });
}

/** Admin-facing: approve or reject a pending request. */
export function decideLeave(id, approve, byName) {
  var l = allLeaves().filter(function (x) { return x.id === id; })[0];
  if (!l || l.status !== "pending") throw new Error("That request was already decided.");
  var d = data(l.staffId);
  d.dec[id] = { status: approve ? "approved" : "rejected", decidedAt: Date.now(), decidedBy: byName || null };
  return sset("leavedec:" + l.staffId, d.dec, true).then(function () { return approve ? "Leave approved." : "Leave rejected."; });
}

/** Used by payroll.js: is `dayK` ("yyyy-mm-dd") covered by an approved leave for this staff member? */
export function isOnApprovedLeave(staffId, dayK) {
  return leavesFor(staffId).some(function (l) {
    return l.status === "approved" && dayK >= l.from && dayK <= l.to;
  });
}
