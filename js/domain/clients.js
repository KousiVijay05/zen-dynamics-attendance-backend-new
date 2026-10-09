/* ---------------------------------------------------------------
   Clients: membership plans, daily attendance ticks, renewals and
   payments.

   Storage (who can read/write is enforced by firebase/database.rules.json):
     kv/cl:roster          [client]  — every coach reads (names + plan
                                       status), admins write
     kv/cl:private         { id: { phone, notes, history: [plan] } }
                                     — admins only (phone numbers)
     kv/cl:pay:<yyyymm>    [payment] — admins only
     clsess/<yyyymmdd>/<sid> { batch, batchName, by, byName, start, at, clients }
                                     — a submitted session; never changed
     clatt/<yyyymmdd>/<id> { by, byName, at, sid, batch, batchName, void? }
                                     — one mark per client per day, written
                                       when a session is submitted. Marks are
                                       never deleted: the coach who made one
                                       can void it within 10 minutes, an admin
                                       any time (with a reason); a voided mark
                                       stays, shown as voided, and doesn't count

   client = { id, name, active, joined, plan }
   plan   = { type: "time",  name, start, end }            months-based
          | { type: "pack",  name, start, sessions, end? } N visits, optional
                                                            validity end date
   A session pack uses one session per day ticked from its start date
   (to its end date, if it has one).
----------------------------------------------------------------*/

import { state, emitChange } from "../core/store.js";
import { sget, sset } from "../storage/storage-api.js";
import { uid, dayKey, shortDate, num, ymKey } from "../utils/format.js";

function A() { return window.storageAuth; }
var DAY = 864e5;

export var PAY_MODES = ["Cash", "UPI", "Card", "Bank transfer", "Other"];

/* Zen & Dynamics' timetable and price list — the starting setup. Once an
   admin adds or removes a batch/package, the edited list is saved in
   org:config and used instead. */
export var DEFAULT_BATCHES = [
  { id: "b0600", name: "6–7 AM", start: "06:00", end: "07:00" },
  { id: "b0800", name: "8–9 AM", start: "08:00", end: "09:00" },
  { id: "b0930", name: "9:30–10:30 AM", start: "09:30", end: "10:30" },
  { id: "b1700", name: "5–6 PM", start: "17:00", end: "18:00" },
  { id: "b1900", name: "7–8 PM", start: "19:00", end: "20:00" }
];
export var DEFAULT_PACKAGES = [
  { id: "m6-1", group: "6 days/week", name: "1M · 6 days/week", type: "time", months: 1, fee: 4000 },
  { id: "m6-3", group: "6 days/week", name: "3M · 6 days/week", type: "time", months: 3, fee: 10500 },
  { id: "m6-6", group: "6 days/week", name: "6M · 6 days/week", type: "time", months: 7, fee: 16500, note: "valid 7 months incl. 1-month pause" },
  { id: "m6-12", group: "6 days/week", name: "12M · 6 days/week", type: "time", months: 13, fee: 22200, note: "valid 13 months incl. 1-month pause" },
  { id: "m3-1", group: "3 days/week", name: "1M · 3 days/week", type: "time", months: 1, fee: 3000 },
  { id: "m3-3", group: "3 days/week", name: "3M · 3 days/week", type: "time", months: 3, fee: 7900 },
  { id: "m3-6", group: "3 days/week", name: "6M · 3 days/week", type: "time", months: 7, fee: 12400, note: "valid 7 months incl. 1-month pause" },
  { id: "m3-12", group: "3 days/week", name: "12M · 3 days/week", type: "time", months: 13, fee: 16500, note: "valid 13 months incl. 1-month pause" },
  { id: "s1", group: "Sessions", name: "1 session", type: "pack", sessions: 1, fee: 400 },
  { id: "s3", group: "Sessions", name: "3 sessions", type: "pack", sessions: 3, days: 7, fee: 999 },
  { id: "s6", group: "Sessions", name: "6 sessions", type: "pack", sessions: 6, days: 7, fee: 1499 },
  { id: "s8", group: "Sessions", name: "8 sessions", type: "pack", sessions: 8, days: 45, fee: 2500 },
  { id: "s10", group: "Sessions", name: "10 sessions", type: "pack", sessions: 10, days: 45, fee: 3000 },
  { id: "s12", group: "Sessions", name: "12 sessions", type: "pack", sessions: 12, days: 45, fee: 3500 }
];
export function packages() { return (state.cfg && Array.isArray(state.cfg.packages)) ? state.cfg.packages : DEFAULT_PACKAGES; }
export function packageById(id) { return packages().filter(function (x) { return x.id === id; })[0] || null; }
/** "valid 45 days" / "valid 3 months" / "no expiry" */
export function packageValidity(k) {
  if (k.note) return k.note;
  if (k.days) return "valid " + (k.days % 7 === 0 && k.days < 28 ? (k.days / 7) + " week" + (k.days === 7 ? "" : "s") : k.days + " days");
  if (k.months) return "valid " + k.months + " month" + (k.months === 1 ? "" : "s");
  return "no expiry date";
}

export function today() { return dayKey(Date.now()); }
function k8(d) { return d.replace(/-/g, ""); }                 // "2026-10-09" -> "20261009"

/* ---------- loading + live updates ---------- */

var unwatch = null, watchFrom = null;

/** Load the client list (and, for admins, phones/notes), then watch ticks live. */
/* Names of staff (for "Coach" when taking a session). Coaches can't read the
   staff list itself, so admins keep this small names-only copy up to date. */
export function coachList() {
  var list = state.staffNames && state.staffNames.length ? state.staffNames
    : state.roster.map(function (p) { return { id: p.id, name: p.name, active: p.active !== false }; });
  return list.filter(function (x) { return x.active !== false; });
}
function syncStaffNames() {
  if (!state.me || !state.me.admin || !state.roster.length) return;
  var want = state.roster.map(function (p) { return { id: p.id, name: p.name, active: p.active !== false }; });
  if (JSON.stringify(want) !== JSON.stringify(state.staffNames || [])) { state.staffNames = want; sset("org:staffnames", want, true); }
}

export function loadClients() {
  var jobs = [sget("cl:roster", true).then(function (r) { state.clients = Array.isArray(r) ? r : []; }),
              sget("org:staffnames", true).then(function (n) { state.staffNames = Array.isArray(n) ? n : []; syncStaffNames(); })];
  if (state.me && state.me.admin) jobs.push(sget("cl:private", true).then(function (p) { state.clientPriv = p || {}; }));
  return Promise.all(jobs).then(function () { watchTicks(); state.clLoaded = true; emitChange(); });
}

/* Ticks are watched from the earliest active plan's start (so session packs
   count correctly), and at least the last 62 days. */
export function watchTicks() {
  var from = dayKey(Date.now() - 62 * DAY);
  state.clients.forEach(function (c) {
    if (c.active !== false && c.plan && c.plan.start && c.plan.start < from) from = c.plan.start;
  });
  from = k8(from);
  if (unwatch && from === watchFrom) return;
  if (unwatch) unwatch();
  watchFrom = from;
  var u1 = A().watch("clatt", from, function (v) { state.clAtt = v; emitChange(); });
  var sessFrom = k8(dayKey(Date.now() - 62 * DAY));
  var u2 = A().watch("clsess", sessFrom, function (v) { state.clSess = v; emitChange(); });
  unwatch = function () { u1(); u2(); };
  restoreSession();
}

export function stopClients() {
  if (unwatch) unwatch();
  unwatch = null; watchFrom = null;
  state.clients = []; state.clientPriv = {}; state.clAtt = {}; state.clSess = {}; state.clPays = {}; state.clOld = {}; state.clLoaded = false; state.clPaysAll = false;
  state.session = null; state.staffNames = [];
}

/* ---------- plans + status ---------- */

/** "yyyy-mm-dd" + n months, minus one day: a 1-month plan from 9 Oct ends 8 Nov. */
export function planEnd(start, months) {
  var d = new Date(start + "T00:00:00");
  var y = d.getFullYear(), m = d.getMonth() + months, day = d.getDate();
  var last = new Date(y, m + 1, 0).getDate();
  var r = new Date(y, m, Math.min(day, last));
  r.setDate(r.getDate() - 1);
  return dayKey(r.getTime());
}

/** Build a plan from form fields. Throws with a readable message on bad input. */
function addDays(k, n) { return dayKey(new Date(k + "T12:00:00").getTime() + n * DAY); }

export function makePlan(f) {
  var start = (f.start || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) throw new Error("Pick the plan's start date.");
  if (f.pkg && f.pkg !== "custom") {
    var k = packageById(f.pkg);
    if (!k) throw new Error("That package no longer exists — pick another.");
    var pl = { type: k.type, name: k.name, start: start, pkg: k.id };
    if (k.type === "pack") {
      pl.sessions = k.sessions;
      var u = Math.round(num(f.usedBefore, 0));
      if (u < 0 || u >= k.sessions) throw new Error("Sessions already used must be less than " + k.sessions + ".");
      if (u) pl.usedBefore = u;
    }
    if (k.days) pl.end = addDays(start, k.days - 1);
    else if (k.months) pl.end = planEnd(start, k.months);
    if (k.type === "time" && !pl.end) throw new Error("This package has no validity — fix it in Admin → Shifts → Packages.");
    return pl;
  }
  if (f.type === "pack") {
    var n = Math.round(num(f.sessions, 0));
    if (n < 1 || n > 500) throw new Error("Sessions must be between 1 and 500.");
    var vm = Math.round(num(f.months, 0));
    if (vm < 0 || vm > 36) throw new Error("Validity must be 0–36 months (0 = no expiry date).");
    var used = Math.round(num(f.usedBefore, 0));
    if (used < 0 || used >= n) throw new Error("Sessions already used must be less than the pack size (" + n + ").");
    var p = { type: "pack", name: n + " sessions", start: start, sessions: n };
    if (used) p.usedBefore = used;
    if (vm) { p.end = planEnd(start, vm); p.name += " · " + vm + " month" + (vm === 1 ? "" : "s"); }
    return p;
  }
  var months = Math.round(num(f.months, 0));
  if (months < 1 || months > 36) throw new Error("Months must be between 1 and 36.");
  return { type: "time", name: months + " month" + (months === 1 ? "" : "s"), start: start, end: planEnd(start, months) };
}

/** Days `c` was ticked within its current plan. */
export function usedSessions(c) {
  if (!c.plan) return 0;
  var s = k8(c.plan.start), e = c.plan.end ? k8(c.plan.end) : "99999999", n = c.plan.usedBefore || 0;
  Object.keys(state.clAtt || {}).forEach(function (d) {
    var m = state.clAtt[d] && state.clAtt[d][c.id];
    if (d >= s && d <= e && m && !m.void) n++;
  });
  return n;
}

/* "30 Sep", or "30 Sep 2027" when it isn't this year */
function dateLabel(k) { return shortDate(k) + (k.slice(0, 4) !== today().slice(0, 4) ? " " + k.slice(0, 4) : ""); }

function daysBetween(a, b) { return Math.round((new Date(b + "T00:00:00") - new Date(a + "T00:00:00")) / DAY); }

/**
 * { kind: "active" | "soon" | "expired" | "future" | "none" | "off", label, short }
 * "soon" = ends within 7 days, or 2 or fewer sessions left.
 */
export function clientStatus(c) {
  if (c.active === false) return { kind: "off", label: "Turned off", short: "Off" };
  var p = c.plan, t = today();
  if (!p) return { kind: "none", label: "No plan yet", short: "No plan" };
  if (p.start > t) return { kind: "future", label: "Starts " + dateLabel(p.start), short: "Starts " + dateLabel(p.start) };
  var daysLeft = p.end ? daysBetween(t, p.end) : null;
  if (p.type === "pack") {
    var left = p.sessions - usedSessions(c);
    if (left <= 0) return { kind: "expired", label: "All " + p.sessions + " sessions used", short: "No sessions left", left: 0 };
    if (daysLeft !== null && daysLeft < 0) return { kind: "expired", label: "Expired " + dateLabel(p.end) + " (" + left + " unused)", short: "Expired", left: left };
    var txt = left + " session" + (left === 1 ? "" : "s") + " left" + (daysLeft !== null ? " · till " + dateLabel(p.end) : "");
    if (left <= 2 || (daysLeft !== null && daysLeft <= 7)) return { kind: "soon", label: txt, short: left + " left", left: left, daysLeft: daysLeft };
    return { kind: "active", label: txt, short: left + " left", left: left, daysLeft: daysLeft };
  }
  if (daysLeft < 0) return { kind: "expired", label: "Expired " + dateLabel(p.end), short: "Expired", daysLeft: daysLeft };
  var lab = daysLeft === 0 ? "Ends today" : daysLeft + " day" + (daysLeft === 1 ? "" : "s") + " left · till " + dateLabel(p.end);
  if (daysLeft <= 7) return { kind: "soon", label: lab, short: daysLeft === 0 ? "Ends today" : daysLeft + "d left", daysLeft: daysLeft };
  return { kind: "active", label: "Till " + dateLabel(p.end), short: "Till " + dateLabel(p.end), daysLeft: daysLeft };
}

/* ---------- marks + sessions (coaches and admins) ---------- */

var UNDO_MS = 10 * 60000;

/** Today's mark for client `id` (including a voided one), or null. */
export function markToday(id) { var d = (state.clAtt || {})[k8(today())]; return d ? d[id] || null : null; }
/** Today's counted (not voided) mark, or null. */
export function tickedToday(id) { var m = markToday(id); return m && !m.void ? m : null; }

/** Day -> last visit ("yyyy-mm-dd") for every client, from watched marks. */
export function lastVisits() {
  var out = {};
  Object.keys(state.clAtt || {}).sort().forEach(function (d) {
    var day = state.clAtt[d] || {};
    Object.keys(day).forEach(function (cid) { if (!day[cid].void) out[cid] = d.slice(0, 4) + "-" + d.slice(4, 6) + "-" + d.slice(6, 8); });
  });
  return out;
}

/* Batches are admin-defined time slots (Admin → Shifts), kept in org:config. */
export function batches() { return (state.cfg && Array.isArray(state.cfg.batches)) ? state.cfg.batches : DEFAULT_BATCHES; }
function batchById(id) { return batches().filter(function (b) { return b.id === id; })[0] || null; }
/** The batch running now, or the next one today, or the last one. */
export function suggestedBatch() {
  var list = batches().slice().sort(function (a, b) { return a.start < b.start ? -1 : 1; });
  if (!list.length) return null;
  var d = new Date(), now = (d.getHours() < 10 ? "0" : "") + d.getHours() + ":" + (d.getMinutes() < 10 ? "0" : "") + d.getMinutes();
  var running = list.filter(function (b) { return b.start <= now && (!b.end || b.end >= now); })[0];
  if (running) return running;
  var next = list.filter(function (b) { return b.start > now; })[0];
  return next || list[list.length - 1];
}

/* The session being taken on this phone survives a refresh (per person). */
function sessKey() { return "zd-session:" + (state.me ? state.me.id : ""); }
function persist() { try { if (state.session) localStorage.setItem(sessKey(), JSON.stringify(state.session)); else localStorage.removeItem(sessKey()); } catch (e) {} }
function restoreSession() {
  if (state.session || !state.me) return;
  try {
    var s = JSON.parse(localStorage.getItem(sessKey()) || "null");
    if (s && s.day === today()) state.session = s; else localStorage.removeItem(sessKey());
  } catch (e) {}
}

export function startSession(batchId, coachId) {
  var b = batchById(batchId);
  var co = coachList().filter(function (x) { return x.id === coachId; })[0] || { id: state.me.id, name: state.me.name };
  state.session = { sid: uid(), day: today(), batch: b ? b.id : "general", batchName: b ? b.name : "General session",
                    coach: co.id, coachName: co.name, start: Date.now(), picked: {} };
  persist(); emitChange();
}
export function discardSession() { state.session = null; persist(); emitChange(); }

/** Pick / unpick a client in the session being taken (nothing is saved until Submit). */
export function togglePick(id) {
  var s = state.session;
  if (!s) return;
  if (tickedToday(id)) throw new Error("Already marked today.");
  if (s.picked[id]) delete s.picked[id]; else s.picked[id] = true;
  persist(); emitChange();
}

/** Save the session and one mark per picked client, in one all-or-nothing write. */
export function submitSession() {
  var s = state.session;
  if (!s) return Promise.reject(new Error("No session in progress."));
  var ids = Object.keys(s.picked).filter(function (id) { return !tickedToday(id); });
  if (!ids.length) return Promise.reject(new Error("Tick at least one client first."));
  /* "at" is stamped by the server, not this phone, so a wrong phone clock
     can't backdate (or forward-date) a mark — the rules require it. */
  var day = k8(s.day), at = { ".sv": "timestamp" }, paths = {}, clients = {};
  ids.forEach(function (id) {
    var old = markToday(id);
    var mark = { by: state.me.id, byName: state.me.name, at: at, sid: s.sid, batch: s.batch, batchName: s.batchName,
                 coach: s.coach || state.me.id, coachName: s.coachName || state.me.name };
    if (old && old.void) mark.prev = old;            // re-marking a voided mark keeps the old one inside
    paths["clatt/" + day + "/" + id] = mark;
    clients[id] = true;
  });
  paths["clsess/" + day + "/" + s.sid] = { batch: s.batch, batchName: s.batchName, by: state.me.id, byName: state.me.name,
                                          coach: s.coach || state.me.id, coachName: s.coachName || state.me.name,
                                          start: s.start, at: at, clients: clients };
  return A().update(paths).then(function () {
    state.session = null; persist(); emitChange();
    return s.batchName + ": " + ids.length + " client" + (ids.length === 1 ? "" : "s") + " marked.";
  }, function (err) {
    if (/^Not allowed/.test(err.message)) throw new Error("Someone else just marked one of these clients. The list has been refreshed — check and submit again.");
    throw err;
  });
}

/** Can the signed-in person void this mark now? */
export function canVoid(m) {
  if (!m || m.void || !state.me) return false;
  if (state.me.admin) return true;
  return m.by === state.me.id && Date.now() - m.at < UNDO_MS;
}
export function undoMinutesLeft(m) { return Math.max(0, Math.ceil((UNDO_MS - (Date.now() - m.at)) / 60000)); }

/** Void (never delete) a mark: within 10 minutes by the coach who made it, any time by an admin. */
export function voidMark(dayK, id, reason) {
  var day = k8(dayK), m = (state.clAtt[day] || {})[id];
  if (!canVoid(m)) return Promise.reject(new Error(state.me.admin ? "That mark is already voided." : "Marks can only be undone by the coach who made them, within 10 minutes. Ask an admin."));
  var v = Object.assign({}, m, { void: { by: state.me.id, byName: state.me.name, at: Date.now(), reason: String(reason || "").trim().slice(0, 200) || "Marked by mistake" } });
  return A().setPath("clatt/" + day + "/" + id, v).then(function () { return "Mark voided — it stays in the records as voided."; });
}

/** Sessions on day k ("yyyy-mm-dd"), newest first. */
export function sessionsOn(k) {
  var d = (state.clSess || {})[k8(k)] || {};
  return Object.keys(d).map(function (sid) { return Object.assign({ sid: sid }, d[sid]); }).sort(function (a, b) { return b.at - a.at; });
}

/* ---------- finding clients ---------- */

export var DEFAULT_FILTER = { status: "all", window: "", seen: "", plan: "", balance: "", sort: "name" };

function minusDays(n) { return dayKey(Date.now() - n * DAY); }

/** Clients matching `f` (see DEFAULT_FILTER) and search text `q`, sorted. */
export function filterClients(f, q) {
  f = Object.assign({}, DEFAULT_FILTER, f || {});
  q = String(q || "").trim().toLowerCase();
  var t = today(), lv = lastVisits(), priv = state.clientPriv || {};
  var list = state.clients.filter(function (c) {
    var st = clientStatus(c), p = c.plan || {};
    if (f.status === "all" && st.kind === "off") return false;
    if (f.status !== "all" && f.status !== st.kind) return false;
    if (f.window) {
      var w = f.window.split(":"), n = +w[1];
      if (w[0] === "ends" && !(p.end && p.end >= t && p.end <= dayKey(Date.now() + n * DAY))) return false;
      if (w[0] === "expired" && !(st.kind === "expired" && p.end && p.end >= minusDays(n))) return false;
      if (w[0] === "expiredbefore" && !(st.kind === "expired" && (!p.end || p.end < minusDays(n)))) return false;
    }
    if (f.seen) {
      var last = lv[c.id];
      if (f.seen === "never" ? !!last : (last && last >= minusDays(+f.seen))) return false;
    }
    if (f.plan && p.name !== f.plan) return false;
    if (f.balance === "due" && !/balance due/i.test((priv[c.id] || {}).notes || "")) return false;
    if (q && c.name.toLowerCase().indexOf(q) < 0 && ((priv[c.id] || {}).phone || "").indexOf(q) < 0) return false;
    return true;
  });
  var by = {
    name: function (a, b) { return a.name.localeCompare(b.name); },
    end: function (a, b) { return ((a.plan || {}).end || "9999") < ((b.plan || {}).end || "9999") ? -1 : 1; },
    endlast: function (a, b) { return ((a.plan || {}).end || "0000") > ((b.plan || {}).end || "0000") ? -1 : 1; },
    seen: function (a, b) { return (lv[a.id] || "0000") < (lv[b.id] || "0000") ? -1 : 1; },
    since: function (a, b) { return (a.joined || "") < (b.joined || "") ? -1 : 1; }
  };
  return list.sort(by[f.sort] || by.name);
}

/** Distinct plan names (for the filter). */
export function planNames() {
  var m = {};
  state.clients.forEach(function (c) { if (c.plan && c.plan.name) m[c.plan.name] = (m[c.plan.name] || 0) + 1; });
  return Object.keys(m).sort();
}

/** Excel of the filtered list. */
export function exportFiltered(list) {
  if (typeof XLSX === "undefined") throw new Error("Excel library didn't load. Check the connection and reload.");
  var lv = lastVisits(), priv = state.clientPriv || {};
  var rows = [["Client", "Phone", "Status", "Plan", "Start", "End", "Last visit", "Member since", "Notes"]];
  list.forEach(function (c) {
    var p = c.plan || {};
    rows.push([c.name, (priv[c.id] || {}).phone || "", clientStatus(c).label, p.name || "", p.start || "", p.end || "", lv[c.id] || "", c.joined || "", (priv[c.id] || {}).notes || ""]);
  });
  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Clients");
  XLSX.writeFile(wb, "clients-filtered-" + today() + ".xlsx");
  return list.length + " clients exported.";
}

/* ---------- admin: add / edit / renew ---------- */

function cleanPhone(p) {
  var s = String(p || "").trim();
  if (!s) return "";
  var d = s.replace(/[^\d+]/g, "");
  if (!/^\+?\d{10,15}$/.test(d)) throw new Error("Enter a valid phone number (10 digits, or with country code).");
  return d;
}

function payRecord(c, plan, f) {
  var amount = num(f.amount, 0);
  if (amount < 0 || amount > 10000000) throw new Error("Enter a valid amount.");
  if (!amount) return null;
  var mode = PAY_MODES.indexOf(f.mode) >= 0 ? f.mode : "Cash";
  var date = /^\d{4}-\d{2}-\d{2}$/.test(f.payDate || "") ? f.payDate : today();
  return { id: uid(), clientId: c.id, name: c.name, plan: plan.name, start: plan.start, end: plan.end || null,
           amount: Math.round(amount * 100) / 100, mode: mode, date: date, by: state.me.name, at: Date.now() };
}

/* One all-or-nothing write of the list, the private details and (maybe) a payment. */
function save(roster, priv, pay) {
  var paths = {};
  paths["kv/cl:roster"] = JSON.stringify(roster);
  paths["kv/cl:private"] = JSON.stringify(priv);
  var pays = !pay ? [] : Array.isArray(pay) ? pay : [pay];
  var byKey = {};
  pays.forEach(function (x) { var k = "cl:pay:" + x.date.slice(0, 7).replace("-", ""); (byKey[k] = byKey[k] || []).push(x); });
  var keys = Object.keys(byKey);
  return Promise.all(keys.map(function (k) { return sget(k, true); })).then(function (lists) {
    var merged = {};
    keys.forEach(function (k, i) { merged[k] = (Array.isArray(lists[i]) ? lists[i] : []).concat(byKey[k]); paths["kv/" + k] = JSON.stringify(merged[k]); });
    return A().update(paths).then(function () { keys.forEach(function (k) { state.clPays[k] = merged[k]; }); });
  });
}

export function addClient(f) {
  var name = (f.name || "").trim();
  if (!name) throw new Error("Enter the client's name.");
  if (name.length > 80) throw new Error("That name is too long.");
  var phone = cleanPhone(f.phone);
  if (state.clients.some(function (c) { return c.name.toLowerCase() === name.toLowerCase() && c.active !== false; }) && !f.allowDuplicate) {
    throw new Error("A client called " + name + " already exists. Add a surname or initial to tell them apart.");
  }
  var plan = makePlan(f);
  var c = { id: uid(), name: name, active: true, joined: today(), plan: plan };
  var pay = payRecord(c, plan, f);
  var roster = state.clients.concat([c]);
  var priv = Object.assign({}, state.clientPriv);
  priv[c.id] = { phone: phone, notes: (f.notes || "").trim().slice(0, 500), history: [] };
  return save(roster, priv, pay).then(function () {
    state.clients = roster; state.clientPriv = priv; watchTicks(); emitChange();
    return name + " added" + (pay ? " · payment of " + pay.amount + " recorded." : ".");
  });
}

export function updateClient(id, f) {
  var c = state.clients.filter(function (x) { return x.id === id; })[0];
  if (!c) throw new Error("That client no longer exists.");
  var name = (f.name || "").trim();
  if (!name) throw new Error("Enter the client's name.");
  var phone = cleanPhone(f.phone);
  var roster = state.clients.map(function (x) { return x.id === id ? Object.assign({}, x, { name: name }) : x; });
  var priv = Object.assign({}, state.clientPriv);
  priv[id] = Object.assign({ history: [] }, priv[id], { phone: phone, notes: (f.notes || "").trim().slice(0, 500) });
  return save(roster, priv, null).then(function () { state.clients = roster; state.clientPriv = priv; emitChange(); return "Saved."; });
}

export function renewClient(id, f) {
  var c = state.clients.filter(function (x) { return x.id === id; })[0];
  if (!c) throw new Error("That client no longer exists.");
  var plan = makePlan(f);
  var pay = payRecord(c, plan, f);
  var roster = state.clients.map(function (x) { return x.id === id ? Object.assign({}, x, { plan: plan, active: true }) : x; });
  var priv = Object.assign({}, state.clientPriv);
  var mine = Object.assign({ phone: "", notes: "", history: [] }, priv[id]);
  if (c.plan) mine.history = (mine.history || []).concat([Object.assign({ used: usedSessions(c) }, c.plan)]).slice(-50);
  priv[id] = mine;
  return save(roster, priv, pay).then(function () {
    state.clients = roster; state.clientPriv = priv; watchTicks(); emitChange();
    return "Renewed: " + plan.name + " from " + shortDate(plan.start) + (pay ? " · payment recorded." : ".");
  });
}

export function setClientActive(id, on) {
  var roster = state.clients.map(function (x) { return x.id === id ? Object.assign({}, x, { active: !!on }) : x; });
  return save(roster, state.clientPriv, null).then(function () { state.clients = roster; emitChange(); return on ? "Client restored." : "Client turned off."; });
}

/** The renewal "suggested" start: the day after the current plan ends (if still ahead), else today. */
export function suggestedStart(c) {
  var t = today();
  if (c && c.plan && c.plan.end && c.plan.end >= t) return dayKey(new Date(c.plan.end + "T12:00:00").getTime() + DAY);
  return t;
}

/* ---------- WhatsApp reminder to a client ---------- */

export function clientPhone(id) { return ((state.clientPriv || {})[id] || {}).phone || ""; }

export function reminderText(c) {
  var st = clientStatus(c), org = (state.cfg && state.cfg.org) || "the gym";
  var first = c.name.split(" ")[0];
  var line = st.kind === "expired"
    ? (c.plan && c.plan.type === "pack" && st.left === 0 ? "you've used all the sessions in your " + c.plan.name + " plan." : "your " + (c.plan ? c.plan.name + " " : "") + "membership ended on " + dateLabel(c.plan.end) + ".")
    : c.plan && c.plan.type === "pack"
      ? "you have " + st.left + " session" + (st.left === 1 ? "" : "s") + " left in your " + c.plan.name + " plan" + (c.plan.end ? " (valid till " + dateLabel(c.plan.end) + ")" : "") + "."
      : "your " + (c.plan ? c.plan.name + " " : "") + "membership ends on " + dateLabel(c.plan.end) + ".";
  return "Hi " + first + ", greetings from " + org + "! 🙏\n\nA friendly reminder: " + line +
    "\n\nRenew to keep your training going — just reply here or speak to us at the gym.\n\nThank you! 💪";
}

/** wa.me link straight to the client's chat (Indian numbers get +91 when 10 digits). */
export function waLinkTo(phone, text) {
  var d = String(phone || "").replace(/[^\d]/g, "");
  if (d.length === 10) d = "91" + d;
  return "https://wa.me/" + d + "?text=" + encodeURIComponent(text);
}

/* ---------- reports ---------- */

/** Ticks for month ym ("yyyy-mm"): from the live watch if covered, else read once. */
export function loadMonth(ym) {
  var from = ym.replace("-", "") + "01", to = ym.replace("-", "") + "31";
  var payKey = "cl:pay:" + ym.replace("-", "");
  var jobs = [sget(payKey, true).then(function (v) { state.clPays[payKey] = Array.isArray(v) ? v : []; })];
  if (!watchFrom || from < watchFrom) {
    jobs.push(A().readRange("clatt", from, to).then(function (v) { state.clOld[ym] = v; }));
  }
  return Promise.all(jobs).then(emitChange);
}

export function monthReport(ym) {
  var from = ym.replace("-", "") + "01", to = ym.replace("-", "") + "31";
  var src = (watchFrom && from >= watchFrom) ? state.clAtt : (state.clOld[ym] || {});
  var visits = {}, days = 0, total = 0, byCoach = {}, byBatch = {}, voided = 0;
  Object.keys(src || {}).forEach(function (d) {
    if (d < from || d > to) return;
    var n = 0;
    Object.keys(src[d] || {}).forEach(function (cid) {
      var mk = src[d][cid];
      if (mk.void) { voided++; return; }
      visits[cid] = (visits[cid] || 0) + 1; n++; total++;
      var cn = mk.coachName || mk.byName || mk.by; byCoach[cn] = (byCoach[cn] || 0) + 1;
      var bn = mk.batchName || "Before batches"; byBatch[bn] = (byBatch[bn] || 0) + 1;
    });
    if (n) days++;
  });
  var pays = (state.clPays["cl:pay:" + ym.replace("-", "")] || []).slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  var byMode = {}, revenue = 0;
  pays.forEach(function (p) { revenue += p.amount; byMode[p.mode] = (byMode[p.mode] || 0) + p.amount; });
  var sessions = 0, sessByCoach = {};
  Object.keys(state.clSess || {}).forEach(function (d) {
    if (d < from || d > to) return;
    Object.keys(state.clSess[d]).forEach(function (sid) { var x = state.clSess[d][sid], cn = x.coachName || x.byName || x.by; sessions++; sessByCoach[cn] = (sessByCoach[cn] || 0) + 1; });
  });
  return { visits: visits, totalVisits: total, daysWithVisits: days, byCoach: byCoach, byBatch: byBatch, voided: voided,
           sessions: sessions, sessByCoach: sessByCoach, payments: pays, revenue: revenue, byMode: byMode };
}

/** Excel: clients, the month's visits (one row per tick) and payments. */
export function exportClientsExcel(ym) {
  if (typeof XLSX === "undefined") throw new Error("Excel library didn't load. Check the connection and reload.");
  var r = monthReport(ym), wb = XLSX.utils.book_new();
  var name = function (id) { var c = state.clients.filter(function (x) { return x.id === id; })[0]; return c ? c.name : "(removed)"; };
  var coach = function (id) { var p = state.roster.filter(function (x) { return x.id === id; })[0]; return p ? p.name : ""; };
  var clients = [["Client", "Phone", "Plan", "Type", "Start", "End", "Sessions", "Used", "Status", "Visits in " + ym]];
  state.clients.forEach(function (c) {
    var st = clientStatus(c), p = c.plan || {};
    clients.push([c.name, clientPhone(c.id), p.name || "", p.type === "pack" ? "Session pack" : p.type ? "Time" : "",
      p.start || "", p.end || "", p.sessions || "", p.type === "pack" ? usedSessions(c) : "", st.label, r.visits[c.id] || 0]);
  });
  var visits = [["Date", "Client", "Batch", "Coach", "Submitted by", "Time", "Voided", "Void reason"]];
  var src = (watchFrom && (ym.replace("-", "") + "01") >= watchFrom) ? state.clAtt : (state.clOld[ym] || {});
  Object.keys(src).sort().forEach(function (d) {
    if (d.slice(0, 6) !== ym.replace("-", "")) return;
    Object.keys(src[d]).forEach(function (cid) {
      var t = src[d][cid];
      visits.push([d.slice(0, 4) + "-" + d.slice(4, 6) + "-" + d.slice(6), name(cid), t.batchName || "", t.coachName || t.byName || coach(t.by), t.byName || coach(t.by),
        new Date(t.at).toLocaleTimeString(), t.void ? "Voided by " + (t.void.byName || "") : "", t.void ? t.void.reason : ""]);
    });
  });
  var pays = [["Date", "Client", "Plan", "From", "To", "Amount", "Mode", "Recorded by"]];
  r.payments.forEach(function (p) { pays.push([p.date, p.name, p.plan, p.start, p.end || "", p.amount, p.mode, p.by]); });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(clients), "Clients");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(visits), "Visits");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(pays), "Payments");
  XLSX.writeFile(wb, "clients-" + ym + ".xlsx");
  return "Workbook downloaded.";
}

export function defaultMonth() { return ymKey(Date.now()); }

/* ---------------------------------------------------------------
   Excel import (Admin → Clients → Add → Import from Excel).
   The file is read in the browser (SheetJS); it isn't uploaded anywhere.
   Only the resulting client records are saved, in one all-or-nothing write.
----------------------------------------------------------------*/

export var IMPORT_HEADERS = ["Name", "Phone", "Plan type", "Months", "Sessions", "Sessions already used",
                             "Start date", "Amount paid", "Paid by", "Paid on", "Notes"];
var MAX_IMPORT = 1000;

/** Download an empty template with two example rows. */
export function downloadTemplate() {
  if (typeof XLSX === "undefined") throw new Error("Excel library didn't load. Check the connection and reload.");
  var rows = [IMPORT_HEADERS,
    ["Ravi Kumar", "9876543210", "Months", 3, "", "", today(), 6000, "UPI", today(), "Prefers 6 AM"],
    ["Priya S", "9123456780", "Sessions", 2, 12, 5, today(), 4000, "Cash", today(), "12-session pack, 5 already used"]];
  var ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = IMPORT_HEADERS.map(function (h) { return { wch: Math.max(12, h.length + 2) }; });
  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Clients");
  var help = XLSX.utils.aoa_to_sheet([
    ["How to fill this in"],
    ["Plan type: Months (ends on a date) or Sessions (a pack of visits)."],
    ["Months: plan length for Months plans; for Sessions, how long the pack is valid (leave blank = no limit)."],
    ["Sessions: pack size (Sessions plans only). Sessions already used: visits already used before today."],
    ["Dates: 2026-10-09, 09-10-2026 or 09/10/2026 (day first)."],
    ["Paid by: Cash, UPI, Card, Bank transfer or Other. Paid on: payment date (blank = start date)."],
    ["Phone: 10-digit mobile (or with country code). Optional."]]);
  XLSX.utils.book_append_sheet(wb, help, "Help");
  XLSX.writeFile(wb, "clients-template.xlsx");
  return "Template downloaded.";
}

function cell(row, names) {
  for (var k in row) {
    var key = String(k).trim().toLowerCase().replace(/[^a-z]/g, "");
    if (names.indexOf(key) >= 0) return row[k];
  }
  return "";
}
/* Excel date cell, or "2026-10-09" / "09-10-2026" / "09/10/2026" (day first) -> "yyyy-mm-dd" */
function toDateKey(v) {
  if (v instanceof Date && !isNaN(v)) return dayKey(v.getTime() + 12 * 3600000);
  var s = String(v == null ? "" : v).trim(), m;
  if (!s) return "";
  if ((m = /^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})$/.exec(s))) return m[1] + "-" + pad2(m[2]) + "-" + pad2(m[3]);
  if ((m = /^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})$/.exec(s))) return (m[3].length === 2 ? "20" + m[3] : m[3]) + "-" + pad2(m[2]) + "-" + pad2(m[1]);
  return "bad";
}
function pad2(x) { x = String(+x); return x.length < 2 ? "0" + x : x; }
function validDate(k) { var d = new Date(k + "T00:00:00"); return !isNaN(d) && dayKey(d.getTime()) === k; }

/** Read an uploaded File -> Promise<{ fileName, items: [{ row, name, ok, error, client, priv, pay }] }> */
export function readImportFile(file) {
  if (typeof XLSX === "undefined") return Promise.reject(new Error("Excel library didn't load. Check the connection and reload."));
  if (file.size > 5 * 1024 * 1024) return Promise.reject(new Error("That file is too big (over 5 MB)."));
  return file.arrayBuffer().then(function (buf) {
    var wb = XLSX.read(buf, { type: "array", cellDates: true });
    if (isAccountsBook(wb)) {
      return loadAllPayments().then(function () {
        var items = parseAccountsBook(wb);
        return { fileName: file.name, kind: "accounts", items: items, lastRecorded: items.lastRecorded, includeEarlier: false };
      });
    }
    var ws = wb.Sheets[wb.SheetNames[0]];
    var rows = XLSX.utils.sheet_to_json(ws, { defval: "", raw: true });
    if (!rows.length) throw new Error("No rows found. Use the template's first sheet, with the headings in row 1.");
    if (rows.length > MAX_IMPORT) throw new Error("That's " + rows.length + " rows — import at most " + MAX_IMPORT + " at a time.");
    if (isRegister(rows)) return { fileName: file.name, kind: "register", items: parseRegister(rows) };
    var seen = {};
    state.clients.forEach(function (c) { if (c.active !== false) seen[c.name.toLowerCase()] = "already a client"; });
    var items = rows.map(function (r, i) {
      var it = { row: i + 2, name: String(cell(r, ["name", "clientname", "fullname"]) || "").trim() };
      try {
        if (!it.name) throw new Error("No name");
        if (it.name.length > 80) throw new Error("Name too long");
        var dupe = seen[it.name.toLowerCase()];
        if (dupe) throw new Error("Duplicate — " + dupe);
        var rawType = String(cell(r, ["plantype", "type", "plan"]) || "").trim().toLowerCase();
        var sessions = cell(r, ["sessions", "sessionpack", "packsize", "totalsessions"]);
        var type = /sess|pack|visit/.test(rawType) ? "pack" : /month|time|period/.test(rawType) ? "time" : (String(sessions).trim() ? "pack" : "time");
        var start = toDateKey(cell(r, ["startdate", "start", "from", "joiningdate", "joined"]));
        if (!start) throw new Error("No start date");
        if (start === "bad" || !validDate(start)) throw new Error("Start date not understood");
        var plan = makePlan({ type: type, months: cell(r, ["months", "duration", "validity", "validitymonths"]), sessions: sessions,
                              usedBefore: cell(r, ["sessionsalreadyused", "alreadyused", "usedsessions", "used"]), start: start });
        var phone = cleanPhone(String(cell(r, ["phone", "mobile", "whatsapp", "phonenumber", "contact"]) || "").replace(/\.0$/, ""));
        var paidOn = toDateKey(cell(r, ["paidon", "paymentdate", "paiddate"]));
        if (paidOn === "bad" || (paidOn && !validDate(paidOn))) throw new Error("Paid-on date not understood");
        var mode = String(cell(r, ["paidby", "mode", "paymentmode", "paymenttype"]) || "").trim();
        var modeOk = PAY_MODES.filter(function (m) { return m.toLowerCase() === mode.toLowerCase(); })[0] || (mode ? "Other" : "Cash");
        var c = { id: uid(), name: it.name, active: true, joined: start < today() ? start : today(), plan: plan };
        it.client = c;
        it.priv = { phone: phone, notes: String(cell(r, ["notes", "note", "remarks", "comments"]) || "").trim().slice(0, 500), history: [] };
        it.pay = payRecord(c, plan, { amount: cell(r, ["amountpaid", "amount", "paid", "fee", "fees"]), mode: modeOk, payDate: paidOn || start });
        it.ok = true;
        seen[it.name.toLowerCase()] = "repeated in this file (row " + it.row + ")";
      } catch (e) { it.ok = false; it.error = e.message; }
      return it;
    });
    return { fileName: file.name, items: items };
  });
}

/** Save every OK row of a previewed import in one write. */
export function importClients(preview) {
  var ok = importable(preview);
  if (!ok.length) return Promise.reject(new Error("Nothing to import — fix the rows marked with a problem first."));
  var roster = state.clients.concat(ok.map(function (it) { return it.client; }));
  var priv = Object.assign({}, state.clientPriv);
  ok.forEach(function (it) { priv[it.client.id] = it.priv; });
  var pays = [];
  ok.forEach(function (it) { (it.pays || [it.pay]).forEach(function (x) { if (x) pays.push(x); }); });
  return save(roster, priv, pays).then(function () {
    state.clients = roster; state.clientPriv = priv; watchTicks(); emitChange();
    return ok.length + " client" + (ok.length === 1 ? "" : "s") + " imported" + (pays.length ? " · " + pays.length + " payment" + (pays.length === 1 ? "" : "s") + " recorded." : ".");
  });
}

/** Rows that will be imported (register imports can leave out lapsed clients). */
export function importable(preview) {
  return preview.items.filter(function (it) { return it.ok && (!it.ended || preview.includeEnded !== false); });
}

/* ---------------------------------------------------------------
   Sales-register exports from other gym software: one row per invoice
   (Customer ID, Customer Name, Customer Phone No., Plan Name, Start Date,
   End Date, Plan Status, Paid Amount, Payment Type, Invoice Date, …).
   Grouped per customer:
   - plan = the one running today, else the next one paid in advance,
     else the most recent; with the file's own start/end dates
   - earlier/later plans -> history; cancelled (CN) invoices ignored
   - every paid invoice -> a payment on its invoice date
   - an unpaid balance on the chosen plan -> noted on the client
----------------------------------------------------------------*/
function isRegister(rows) {
  var r = rows[0];
  return !!(cell(r, ["customername"]) !== "" && "End Date" in r || Object.keys(r).some(function (k) { return /customer\s*id/i.test(k); }) &&
            Object.keys(r).some(function (k) { return /end\s*date/i.test(k); }));
}
function dateOnly(v) {
  if (v instanceof Date && !isNaN(v)) return dayKey(v.getTime() + 12 * 3600000);
  var s = String(v == null ? "" : v).trim(), m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return m[1] + "-" + m[2] + "-" + m[3];
  var k = toDateKey(s);
  return k && k !== "bad" && validDate(k) ? k : "";
}
function payMode(s) {
  s = String(s || "").trim().toLowerCase();
  if (!s) return "Cash";
  if (s === "upi" || /gpay|google|phonepe|paytm/.test(s)) return "UPI";
  var m = PAY_MODES.filter(function (x) { return x.toLowerCase() === s; })[0];
  return m || "Other";
}
function money2(n) { n = +n || 0; return Math.round(n * 100) / 100; }

function parseRegister(rows) {
  var t = today(), groups = {}, order = [];
  rows.forEach(function (r, i) {
    var name = String(cell(r, ["customername", "name", "clientname", "membername"]) || "").trim();
    var phone = String(cell(r, ["customerphoneno", "customerphone", "phone", "mobile", "phoneno"]) || "").replace(/\.0$/, "").trim();
    var key = String(cell(r, ["customerid", "memberid", "clientid"]) || "").trim() || (name.toLowerCase() + "|" + phone);
    if (!groups[key]) { groups[key] = { key: key, rows: [] }; order.push(key); }
    groups[key].rows.push({ row: i + 2, r: r, name: name, phone: phone });
  });

  var nameCount = {};
  order.forEach(function (k) { var n = (groups[k].rows[0].name || "").toLowerCase(); if (n) nameCount[n] = (nameCount[n] || 0) + 1; });

  var existing = {};
  state.clients.forEach(function (c) {
    if (c.active === false) return;
    existing["n:" + c.name.toLowerCase()] = true;
    var ph = ((state.clientPriv || {})[c.id] || {}).phone;
    if (ph) existing["p:" + ph.replace(/\D/g, "").slice(-10)] = true;
  });

  return order.map(function (key) {
    var g = groups[key], first = g.rows[0];
    var it = { row: first.row, name: first.name || g.rows.map(function (x) { return x.name; }).filter(Boolean)[0] || "", invoices: g.rows.length };
    try {
      if (!it.name) throw new Error("No customer name");
      var inv = g.rows.map(function (x) {
        var r = x.r;
        return {
          plan: String(cell(r, ["planname", "plan", "membership"]) || "").trim() || "Membership",
          start: dateOnly(cell(r, ["startdate", "start"])), end: dateOnly(cell(r, ["enddate", "end", "expirydate"])),
          status: String(cell(r, ["planstatus", "status"]) || "").trim().toUpperCase(),
          paid: money2(cell(r, ["paidamount", "amountpaid", "paid"])), total: money2(cell(r, ["totalsaleamount", "total", "netsaleamount", "amount"])),
          mode: payMode(cell(r, ["paymenttype", "paymentmode", "mode", "paidby"])),
          date: dateOnly(cell(r, ["invoicedate", "date", "billdate"])), invoice: String(cell(r, ["invoiceno", "invoice", "billno"]) || "").trim()
        };
      });
      var valid = inv.filter(function (x) { return x.status !== "CN" && x.start && x.end && x.end >= x.start; });
      if (!valid.length) throw new Error(inv.some(function (x) { return x.status === "CN"; }) ? "Only cancelled plans" : "No valid start/end dates");
      valid.sort(function (a, b) { return a.start < b.start ? -1 : a.start > b.start ? 1 : 0; });
      var running = valid.filter(function (x) { return x.start <= t && x.end >= t; });
      var ahead = valid.filter(function (x) { return x.start > t; });
      var cur = running.length ? running[running.length - 1] : ahead.length ? ahead[0] : valid.slice().sort(function (a, b) { return a.end < b.end ? 1 : -1; })[0];

      var plan = toPlan(cur);
      var phone = "";
      try { phone = cleanPhone(first.phone || g.rows.map(function (x) { return x.phone; }).filter(Boolean)[0]); } catch (e) { it.warn = "phone not understood — left blank"; }
      /* Same phone = same person (already a client). Same name but a different
         phone = a different person: add the phone's last 4 digits to tell them apart. */
      var last10 = phone ? phone.replace(/\D/g, "").slice(-10) : "";
      if (last10 && existing["p:" + last10]) throw new Error("Duplicate — already a client (same phone)");
      var nm = it.name.toLowerCase();
      if (nameCount[nm] > 1 || existing["n:" + nm]) {
        if (!last10) throw new Error("Duplicate — a client with this name exists and there's no phone to tell them apart");
        it.name = it.name + " (·" + last10.slice(-4) + ")";
        if (existing["n:" + it.name.toLowerCase()]) throw new Error("Duplicate — already a client");
      }

      var c = { id: uid(), name: it.name.slice(0, 80), active: true, joined: valid[0].start < t ? valid[0].start : t, plan: plan };
      var notes = [];
      var bal = money2(cur.total - cur.paid);
      if (bal > 0) notes.push("Balance due on " + cur.plan + ": " + bal);
      if (plan.type === "pack") notes.push("Sessions used before import unknown — set them by renewing if needed.");
      it.client = c;
      it.priv = { phone: phone, notes: notes.join(" · "), history: valid.filter(function (x) { return x !== cur; }).map(toPlan) };
      it.pays = inv.filter(function (x) { return x.status !== "CN" && x.paid > 0; }).map(function (x) {
        return { id: uid(), clientId: c.id, name: c.name, plan: x.plan, start: x.start || null, end: x.end || null, amount: x.paid,
                 mode: x.mode, date: x.date || x.start || t, by: "Import" + (x.invoice ? " · " + x.invoice : ""), at: Date.now() };
      });
      it.ended = cur.end < t;
      it.upcoming = cur.start > t;
      it.summary = cur.plan + " · " + shortDate(cur.start) + " – " + shortDate(cur.end) + (cur.end.slice(0, 4) !== t.slice(0, 4) ? " " + cur.end.slice(0, 4) : "") +
        " · " + it.invoices + " invoice" + (it.invoices === 1 ? "" : "s") +
        (it.pays.length ? " · paid " + it.pays.reduce(function (s, p) { return s + p.amount; }, 0) : "") + (bal > 0 ? " · balance " + bal : "");
      it.ok = true;
      existing["n:" + it.name.toLowerCase()] = true;
      if (last10) existing["p:" + last10] = true;
    } catch (e) { it.ok = false; it.error = e.message; }
    return it;
  });
}

function toPlan(x) {
  var m = /(\d+)\s*sessions?/i.exec(x.plan);
  if (m) return { type: "pack", name: x.plan, start: x.start, end: x.end, sessions: Math.min(500, Math.max(1, +m[1])) };
  return { type: "time", name: x.plan, start: x.start, end: x.end };
}

/* ---------------------------------------------------------------
   Full membership record (client page + "Full client history" Excel).
   Payments are stored per month (cl:pay:yyyymm); this loads every month
   from the earliest plan/joining date up to now.
----------------------------------------------------------------*/
var allPaysFrom = null;

export function loadAllPayments() {
  var first = today();
  state.clients.forEach(function (c) {
    if (c.joined && c.joined < first) first = c.joined;
    if (c.plan && c.plan.start && c.plan.start < first) first = c.plan.start;
    (((state.clientPriv || {})[c.id] || {}).history || []).forEach(function (h) { if (h.start && h.start < first) first = h.start; });
  });
  if (first < "2015-01-01") first = "2015-01-01";
  var keys = [], y = +first.slice(0, 4), m = +first.slice(5, 7), endY = +today().slice(0, 4), endM = +today().slice(5, 7);
  while (y < endY || (y === endY && m <= endM)) {
    keys.push("cl:pay:" + y + (m < 10 ? "0" : "") + m);
    m++; if (m > 12) { m = 1; y++; }
  }
  return Promise.all(keys.map(function (k) {
    return sget(k, true).then(function (v) { state.clPays[k] = Array.isArray(v) ? v : []; });
  })).then(function () { allPaysFrom = first; state.clPaysAll = true; emitChange(); });
}

function allPayments() {
  var out = [];
  Object.keys(state.clPays || {}).forEach(function (k) { (state.clPays[k] || []).forEach(function (p) { out.push(p); }); });
  return out;
}

/** Everything about one client: plans (newest first) with their payments, and totals. */
export function clientLedger(c) {
  var t = today();
  var priv = (state.clientPriv || {})[c.id] || {};
  var plans = (priv.history || []).map(function (h) { return Object.assign({ past: true }, h); });
  if (c.plan) plans.push(Object.assign({ current: true }, c.plan));
  plans.sort(function (a, b) { return a.start < b.start ? 1 : a.start > b.start ? -1 : 0; });
  var pays = allPayments().filter(function (p) { return p.clientId === c.id; })
    .sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
  var used = {};
  plans.forEach(function (pl) {
    pl.payments = pays.filter(function (p) { return !used[p.id] && p.start === pl.start && (!p.plan || p.plan === pl.name); });
    pl.payments.forEach(function (p) { used[p.id] = true; });
    pl.paid = pl.payments.reduce(function (s, p) { return s + p.amount; }, 0);
    pl.state = pl.start > t ? "upcoming" : (pl.end && pl.end < t) ? "ended" : pl.current ? "current" : "ended";
    if (pl.current && pl.type === "pack") { var st = clientStatus(c); pl.state = st.kind === "expired" ? "ended" : pl.state; pl.usedNow = usedSessions(c); }
  });
  var other = pays.filter(function (p) { return !used[p.id]; });
  var total = pays.reduce(function (s, p) { return s + p.amount; }, 0);
  var since = plans.length ? plans[plans.length - 1].start : c.joined;
  if (c.joined && c.joined < since) since = c.joined;
  return { plans: plans, other: other, payments: pays, total: total, since: since, lastPaid: pays.length ? pays[0] : null,
           complete: !!state.clPaysAll };
}

/** Excel with every client, every membership and every payment ever recorded. */
export function exportFullHistory() {
  if (typeof XLSX === "undefined") throw new Error("Excel library didn't load. Check the connection and reload.");
  if (!state.clPaysAll) throw new Error("Still loading payment history — try again in a moment.");
  var wb = XLSX.utils.book_new();
  var clients = [["Client", "Phone", "Status", "Current plan", "Start", "End", "Sessions", "Used", "Member since",
                  "Memberships", "Total paid", "Last payment", "Last amount", "Notes"]];
  var plans = [["Client", "Plan", "Type", "Start", "End", "Sessions", "Status", "Paid for this plan"]];
  var pays = [["Date", "Client", "Plan", "Plan start", "Plan end", "Amount", "Mode", "Recorded by"]];
  state.clients.slice().sort(function (a, b) { return a.name.localeCompare(b.name); }).forEach(function (c) {
    var L = clientLedger(c), st = clientStatus(c), p = c.plan || {}, priv = (state.clientPriv || {})[c.id] || {};
    clients.push([c.name, priv.phone || "", st.label, p.name || "", p.start || "", p.end || "", p.sessions || "",
      p.type === "pack" ? usedSessions(c) : "", L.since || "", L.plans.length, L.total,
      L.lastPaid ? L.lastPaid.date : "", L.lastPaid ? L.lastPaid.amount : "", priv.notes || ""]);
    L.plans.slice().reverse().forEach(function (pl) {
      plans.push([c.name, pl.name, pl.type === "pack" ? "Session pack" : "Time", pl.start, pl.end || "", pl.sessions || "", pl.state, pl.paid]);
    });
    L.payments.slice().reverse().forEach(function (x) {
      pays.push([x.date, c.name, x.plan || "", x.start || "", x.end || "", x.amount, x.mode, x.by || ""]);
    });
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(clients), "Clients");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(plans), "Memberships");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(pays), "Payments");
  XLSX.writeFile(wb, "clients-full-history-" + today() + ".xlsx");
  return "Full history downloaded.";
}

/* ---------------------------------------------------------------
   Hand-kept accounts book: one sheet per month (April, May, …), rows of
   Name / Number / Plan / Amount / Date / Remarks / New-Renewal (headings
   may be missing, misspelt — "Numbner" — or start a few rows down).
   Used to ADD what the main records lack, never to double-count:
   - a payment is "already recorded" if the same client (by phone, else by
     name) has a payment of the same amount within ±15 days (or in the same
     month when the book has no date);
   - a new payment for an existing client is added; if it's after their
     current plan started and its package is clear, it renews them;
   - an unknown client is added with the package their plan code + amount
     point to.
----------------------------------------------------------------*/
var MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

function isAccountsBook(wb) {
  var monthSheets = wb.SheetNames.filter(function (n) { return MONTHS.indexOf(String(n).trim().toLowerCase()) >= 0; });
  return monthSheets.length >= 2;
}

/* Plan code + amount -> a package, e.g. "1M 6D", "3M - 3D", "1Y", "M", "Y", "6M". */
function packageFor(code, amount) {
  var c = String(code || "").toUpperCase().replace(/\s+/g, "");
  var months = /^(\d+)M/.test(c) ? +/^(\d+)M/.exec(c)[1] : /^(\d+)Y/.test(c) ? 12 * +/^(\d+)Y/.exec(c)[1] : c === "M" ? 1 : c === "Y" ? 12 : 0;
  var days = /6D/.test(c) ? 6 : /3D/.test(c) ? 3 : 0;
  var list = packages().filter(function (k) { return k.type === "time"; });
  var label = function (k) { var m = /^(\d+)M/.exec(k.name); return m ? +m[1] : 0; };
  var dpw = function (k) { return /6 days/.test(k.name) ? 6 : /3 days/.test(k.name) ? 3 : 0; };
  var cands = list.filter(function (k) { return (!months || label(k) === months) && (!days || dpw(k) === days); });
  var exact = cands.filter(function (k) { return Math.abs(k.fee - amount) < 1; });
  if (exact.length === 1) return exact[0];
  if (cands.length === 1 && (months || days)) return cands[0];
  var byFee = list.filter(function (k) { return Math.abs(k.fee - amount) < 1 && (!months || label(k) === months); });
  return byFee.length === 1 ? byFee[0] : null;
}

function bookDate(v, sheetMonth, year) {
  var y, mo, d, m;
  if (v instanceof Date && !isNaN(v)) { var x = new Date(v.getTime() + 12 * 3600000); y = x.getFullYear(); mo = x.getMonth() + 1; d = x.getDate(); }
  else {
    var s = String(v == null ? "" : v).trim();
    if ((m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,5})$/.exec(s))) { d = +m[1]; mo = +m[2]; y = m[3].length === 2 ? 2000 + +m[3] : +m[3]; }
    else if ((m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s))) { y = +m[1]; mo = +m[2]; d = +m[3]; }
  }
  var want = sheetMonth + 1, near = function (a) { var diff = Math.abs(a - want); return Math.min(diff, 12 - diff) <= 1; };
  if (mo) {
    if (!/^20\d\d$/.test(String(y))) y = year;                       // typos like "20206"
    if (mo !== want && d <= 12 && d === want) { var t = d; d = mo; mo = t; }   // written month-first
    var k = y + "-" + pad2(mo) + "-" + pad2(d);
    if (validDate(k) && near(mo)) return { k: k };
  }
  return { k: year + "-" + pad2(want) + "-01", guessed: true };
}

function parseAccountsBook(wb) {
  // year: the most common year among real dates in the book
  var yc = {};
  wb.SheetNames.forEach(function (n) {
    XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: "", raw: true }).forEach(function (r) {
      r.forEach(function (c) { if (c instanceof Date && !isNaN(c)) { var y = c.getFullYear(); yc[y] = (yc[y] || 0) + 1; } });
    });
  });
  var year = +(Object.keys(yc).sort(function (a, b) { return yc[b] - yc[a]; })[0] || today().slice(0, 4));

  // who we already know (by phone, then name) and their payments
  var byPhone = {}, byName = {};
  state.clients.forEach(function (c) {
    var ph = ((state.clientPriv || {})[c.id] || {}).phone;
    if (ph) byPhone[ph.replace(/\D/g, "").slice(-10)] = c;
    byName[c.name.toLowerCase().replace(/\s*\(·\d{4}\)$/, "").trim()] = byName[c.name.toLowerCase().replace(/\s*\(·\d{4}\)$/, "").trim()] || c;
  });
  var paysOf = {};
  Object.keys(state.clPays || {}).forEach(function (k) { (state.clPays[k] || []).forEach(function (p) { (paysOf[p.clientId] = paysOf[p.clientId] || []).push({ amount: p.amount, date: p.date }); }); });
  var lastRecorded = "";
  Object.keys(state.clPays || {}).forEach(function (k) { (state.clPays[k] || []).forEach(function (p) { if (p.date > lastRecorded) lastRecorded = p.date; }); });
  var newByKey = {};          // new clients created from this book (later rows join them)
  var items = [];

  wb.SheetNames.forEach(function (sheet) {
    var mi = MONTHS.indexOf(String(sheet).trim().toLowerCase());
    if (mi < 0) return;
    var rows = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, defval: "", raw: true });
    var h = rows.findIndex(function (r) { return r.some(function (c) { return /^name$/i.test(String(c).trim()); }); });
    var col = {};
    if (h >= 0) rows[h].forEach(function (c, i) {
      var k = String(c).trim().toLowerCase().replace(/[^a-z]/g, "");
      if (k === "name" && col.name === undefined) col.name = i;
      else if (/^(number|numbner|phone|mobile|contact)$/.test(k)) col.phone = i;
      else if (k === "plan") col.plan = i;
      else if (k === "amount") col.amount = i;
      else if (k === "date") col.date = i;
      else if (k === "remarks") col.remarks = i;
    });
    rows.slice(h + 1).forEach(function (r, i) {
      var rowNo = h + 2 + i;
      var name, phone = "", plan = "", amount, dv, remarks = "";
      if (h >= 0) {
        name = String(r[col.name] || "").trim(); phone = String(col.phone !== undefined ? r[col.phone] : "").replace(/\.0$/, "").trim();
        plan = String(col.plan !== undefined ? r[col.plan] : "").trim(); amount = +r[col.amount] || 0; dv = r[col.date];
        remarks = String(col.remarks !== undefined ? r[col.remarks] : "").trim();
      } else {                                             // no heading row: first text = name, first number = amount, first date = date
        var cells = r.filter(function (c) { return String(c).trim() !== ""; });
        name = String(cells.filter(function (c) { return typeof c === "string" && /[a-z]/i.test(c); })[0] || "").trim();
        amount = +(cells.filter(function (c) { return typeof c === "number"; })[0] || 0);
        dv = cells.filter(function (c) { return c instanceof Date; })[0] || "";
      }
      if (!name && !amount) return;
      var it = { sheet: sheet, row: rowNo, name: name, amount: amount, plan: plan };
      if (!name) { it.action = "problem"; it.error = "No name (a total row?)"; items.push(it); return; }
      if (!/[a-z]/i.test(name) || /^plan$/i.test(plan) && !amount) { it.action = "problem"; it.error = "Not a payment row"; items.push(it); return; }
      if (!(amount > 0)) { it.action = "problem"; it.error = "No amount"; items.push(it); return; }
      var d = bookDate(dv, mi, year);
      it.date = d.k; it.guessed = !!d.guessed;
      var ph10 = ""; try { ph10 = cleanPhone(phone).replace(/\D/g, "").slice(-10); } catch (e) { ph10 = ""; }
      var nm = name.toLowerCase().trim();
      var client = (ph10 && byPhone[ph10]) || byName[nm] || null;
      var fresh = !client && (newByKey[ph10 ? "p" + ph10 : "n" + nm] || null);
      var pkg = packageFor(plan, amount);
      it.pkgName = pkg ? pkg.name : (plan || "");
      if (client) {
        /* One-to-one: the nearest not-yet-matched recorded payment of the same
           amount within 45 days (the book's date and the invoice date often
           differ by weeks). Each recorded payment can match only one row, so
           a monthly payer's consecutive months don't collapse into one. */
        var best = null, bestGap = Infinity;
        (paysOf[client.id] || []).forEach(function (p) {
          if (p._used || Math.abs(p.amount - amount) >= 1) return;
          var gap = Math.abs(new Date(p.date + "T00:00:00") - new Date(it.date + "T00:00:00")) / DAY;
          if (it.guessed) gap = Math.max(0, gap - 30);           // date only known to the month
          /* after the last recorded payment, only allow small date slips: a
             same-amount payment a month later is a new month's payment */
          var limit = lastRecorded && it.date > lastRecorded ? 7 : 45;
          if (gap <= limit && gap < bestGap) { best = p; bestGap = gap; }
        });
        if (best) { best._used = true; it.action = "skip"; it.client = client; items.push(it); return; }
        it.action = "pay"; it.client = client;
        it.renew = !!(pkg && client.plan && !it.guessed && it.date > client.plan.start && (!client.plan.end || it.date >= addDays(client.plan.end, -15)));
        it.pkg = pkg; it.ph = ph10; it.remarks = remarks;
        (paysOf[client.id] = paysOf[client.id] || []).push({ amount: amount, date: it.date, _used: true });
        items.push(it); return;
      }
      if (fresh) {                                         // a later payment by someone this book already adds
        it.action = "pay"; it.fresh = fresh; it.pkg = pkg; it.remarks = remarks;
        it.renew = !!(pkg && !it.guessed && it.date > fresh.client.plan.start);
        items.push(it); return;
      }
      it.action = "new"; it.pkg = pkg; it.ph = ph10; it.phoneRaw = phone; it.remarks = remarks;
      it.client = { id: uid(), name: name.slice(0, 80), active: true, joined: it.date < today() ? it.date : today(), plan: null };
      newByKey[ph10 ? "p" + ph10 : "n" + nm] = it;
      items.push(it);
    });
  });
  /* Before the last recorded payment, an unmatched row may still be a payment
     already recorded differently (other date, instalments, other spelling):
     flag it so the preview leaves it out unless the owner opts in. */
  items.forEach(function (it) { if ((it.action === "pay" || it.action === "new") && lastRecorded && it.date <= lastRecorded) it.uncertain = true; });
  items.lastRecorded = lastRecorded;
  return items;
}

/** Rows an accounts-book import will add, given the preview's choices. */
export function accountsToAdd(preview) {
  var inc = preview.includeMonths || {};
  return preview.items.filter(function (it) { return (it.action === "pay" || it.action === "new") && (!it.uncertain || preview.includeEarlier || inc[it.sheet]); });
}

/** Per sheet: book total, recorded total for that month, and the unmatched (uncertain) part. */
export function accountsMonths(preview) {
  var out = [], seen = {};
  preview.items.forEach(function (it) {
    if (it.action === "problem" || !it.date) return;
    var o = seen[it.sheet];
    if (!o) { o = seen[it.sheet] = { sheet: it.sheet, ym: it.date.slice(0, 7), book: 0, unsureN: 0, unsureT: 0 }; out.push(o); }
    o.book += it.amount;
    if (it.uncertain) { o.unsureN++; o.unsureT += it.amount; }
  });
  out.forEach(function (o) {
    o.recorded = ((state.clPays || {})["cl:pay:" + o.ym.replace("-", "")] || []).reduce(function (s, p) { return s + p.amount; }, 0);
  });
  return out;
}

function planFromPkg(pkg, start, fallbackName) {
  if (pkg) return makePlan({ pkg: pkg.id, start: start });
  return { type: "time", name: fallbackName ? "From accounts: " + fallbackName : "From accounts book", start: start, end: planEnd(start, 1) };
}

/** Save an accounts-book import in one write. */
export function importAccounts(preview) {
  var roster = state.clients.map(function (c) { return Object.assign({}, c); });
  var priv = JSON.parse(JSON.stringify(state.clientPriv || {}));
  var pays = [], added = 0, renewed = 0;
  var find = function (id) { return roster.filter(function (c) { return c.id === id; })[0]; };
  var take = accountsToAdd(preview);
  /* a later row may pay for a client added by an earlier row — only if that row is being added too */
  take = take.filter(function (it) { return !it.fresh || take.indexOf(it.fresh) >= 0; });
  take.forEach(function (it) {
    if (it.action === "new") {
      var c = Object.assign({}, it.client, { plan: planFromPkg(it.pkg, it.date, it.plan) });
      var phone = ""; try { phone = cleanPhone(it.phoneRaw); } catch (e) {}
      roster.push(c); added++;
      priv[c.id] = { phone: phone, notes: ["Added from accounts book (" + it.sheet + ")" + (it.guessed ? " — start date guessed from the sheet's month" : ""), it.remarks].filter(Boolean).join(" · "), history: [] };
      pays.push(payFor(c, c.plan, it));
    } else if (it.action === "pay") {
      var tgt = it.client ? find(it.client.id) : find(it.fresh.client.id);
      if (!tgt) return;
      if (it.renew) {
        var np = planFromPkg(it.pkg, it.date, it.plan);
        var pv = priv[tgt.id] = priv[tgt.id] || { phone: "", notes: "", history: [] };
        if (tgt.plan) pv.history = (pv.history || []).concat([Object.assign({ used: usedSessions(tgt) }, tgt.plan)]).slice(-50);
        tgt.plan = np; tgt.active = true; renewed++;
        pays.push(payFor(tgt, np, it));
      } else {
        pays.push(payFor(tgt, tgt.plan || { name: it.pkgName || "Payment", start: it.date }, it));
      }
    }
  });
  if (!pays.length && !added) return Promise.reject(new Error("Nothing new to add — everything in this file is already recorded."));
  return save(roster, priv, pays).then(function () {
    state.clients = roster; state.clientPriv = priv; watchTicks(); emitChange();
    return pays.length + " payment" + (pays.length === 1 ? "" : "s") + " added" + (added ? " · " + added + " new client" + (added === 1 ? "" : "s") : "") + (renewed ? " · " + renewed + " renewal" + (renewed === 1 ? "" : "s") : "") + ".";
  });
}

function payFor(c, plan, it) {
  return { id: uid(), clientId: c.id, name: c.name, plan: plan.name, start: plan.start || null, end: plan.end || null,
           amount: Math.round(it.amount * 100) / 100, mode: "Cash", date: it.date, by: "Accounts book · " + it.sheet + (it.guessed ? " (date from sheet)" : ""), at: Date.now() };
}
