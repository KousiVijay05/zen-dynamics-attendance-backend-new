/* ---------------------------------------------------------------
   WhatsApp-ready text reports: daily attendance, weekly / monthly
   summaries, leave notices. Plain text with WhatsApp's own formatting
   (*bold*), built from data already loaded in state — the admin taps
   a Share button, picks the group, and sends (js/utils/whatsapp.js).

   Lateness uses the same rule as payroll.js / Records: the first punch
   of the day against its own shift start (or the global Payroll Rules
   start when it had none), plus the grace minutes. Absence uses
   payroll's weekly-off days and the person's joining date.
----------------------------------------------------------------*/

import { state } from "../core/store.js";
import { dayKey, hm, minsOfDay, parseHM, monthLabel, hm12 } from "../utils/format.js";
import { monthDays } from "./payroll.js";
import { isOnApprovedLeave } from "./leave.js";

var DAY_MS = 864e5;

function org() { return (state.cfg && state.cfg.org) || "Attendance"; }
/* Admins with no shift (owners/managers) aren't expected to clock in:
   don't list them as absent. They still appear if they did clock in. */
function expected(p) { return !(p.admin && !(Array.isArray(p.shifts) && p.shifts.length)); }
function active() {
  return state.roster.filter(function (p) { return p.active !== false; })
    .sort(function (a, b) { return a.name.localeCompare(b.name); });
}

/** ts -> "9:05 AM" */
export function t12(ts) {
  var d = new Date(ts), h = d.getHours(), m = d.getMinutes();
  return ((h % 12) || 12) + ":" + (m < 10 ? "0" : "") + m + " " + (h < 12 ? "AM" : "PM");
}
/* Dates spelled out by hand: browser locales disagree ("Sept", stray commas). */
var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
var WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function dm(k) { var d = new Date(k + "T00:00:00"); return d.getDate() + " " + MON[d.getMonth()]; }
/** "yyyy-mm-dd" -> "Mon 5 Oct 2026" */
function dLabel(k) { return WD[new Date(k + "T00:00:00").getDay()] + " " + dm(k) + " " + k.slice(0, 4); }
/** -> "29 Sep – 5 Oct 2026" */
function rangeLabel(from, to) {
  if (from === to) return dm(from) + " " + from.slice(0, 4);
  return dm(from) + (from.slice(0, 4) !== to.slice(0, 4) ? " " + from.slice(0, 4) : "") + " – " + dm(to) + " " + to.slice(0, 4);
}
function keyPlus(k, days) { return dayKey(new Date(k + "T12:00:00").getTime() + days * DAY_MS); }
function isWeeklyOff(k) { return state.cfg.pay.weeklyOff.indexOf(new Date(k + "T00:00:00").getDay()) >= 0; }

/** A punch belongs to `shift` if it was tagged with that shift at clock-in. */
function inShift(e, shift) {
  return !shift || e.shiftName === shift.name || (e.shiftStart === shift.start && e.shiftEnd === shift.end);
}

/** One person's punches on one day (optionally only one shift's) -> { first, last, open, ms, late } or null. */
export function dayInfo(p, k, shift) {
  var list = (state.logs["log:" + p.id + ":" + k.slice(0, 4) + k.slice(5, 7)] || [])
    .filter(function (e) { return dayKey(e.start) === k && inShift(e, shift); })
    .sort(function (a, b) { return a.start - b.start; });
  if (!list.length) return null;
  var r = { first: list[0].start, last: null, open: false, ms: 0 };
  list.forEach(function (e) {
    if (e.end) { r.ms += e.end - e.start; if (!r.last || e.end > r.last) r.last = e.end; }
    else { r.open = true; r.ms += Math.max(0, Date.now() - e.start); }
  });
  var P = state.cfg.pay;
  var start = list[0].shiftStart ? parseHM(list[0].shiftStart) : parseHM(P.shiftStart);
  r.late = minsOfDay(r.first) > start + P.lateGrace;
  return r;
}

/** Daily attendance for day `k` ("yyyy-mm-dd"). */
export function dailyReport(k) {
  var present = [], leave = [], notIn = [];
  active().forEach(function (p) {
    var d = dayInfo(p, k);
    if (d) present.push({ p: p, d: d });
    else if (isOnApprovedLeave(p.id, k)) leave.push(p);
    else if (!(p.joined && k < p.joined) && expected(p)) notIn.push(p);
  });
  present.sort(function (a, b) { return a.d.first - b.d.first; });

  var out = ["📋 *" + org() + " — Daily attendance*", dLabel(k) + (isWeeklyOff(k) ? " (weekly off)" : ""), ""];
  out.push("✅ *Present (" + present.length + ")*");
  if (!present.length) out.push("—");
  present.forEach(function (x) {
    out.push("• *" + x.p.name + "* — In " + t12(x.d.first) + (x.d.late ? " ⏰ late" : "") +
      (x.d.open ? " · still in" : " · Out " + t12(x.d.last)) + " · " + hm(x.d.ms));
  });
  if (leave.length) {
    out.push("", "🌴 *On leave (" + leave.length + ")*");
    leave.forEach(function (p) { out.push("• " + p.name); });
  }
  if (notIn.length) {
    out.push("", (isWeeklyOff(k) ? "🏖 *Off today (" : "❌ *Not in (") + notIn.length + ")*");
    notIn.forEach(function (p) { out.push("• " + p.name); });
  }
  return out.join("\n");
}

/** Per-person totals over [from, to] (inclusive, "yyyy-mm-dd"). Days after today are ignored. */
export function periodStats(p, from, to) {
  var today = dayKey(Date.now());
  var s = { days: 0, ms: 0, late: 0, leave: 0, absent: 0 };
  for (var k = from; k <= to && k <= today; k = keyPlus(k, 1)) {
    if (p.joined && k < p.joined) continue;
    var d = dayInfo(p, k);
    if (d) { s.days++; s.ms += d.ms; if (d.late && !isWeeklyOff(k)) s.late++; continue; }
    if (isWeeklyOff(k)) continue;
    if (isOnApprovedLeave(p.id, k)) s.leave++;
    else if (k < today) s.absent++;              // today isn't over yet
  }
  return s;
}

function periodReport(title, from, to) {
  var out = ["📊 *" + org() + " — " + title + "*", rangeLabel(from, to), ""];
  var team = { days: 0, ms: 0 };
  active().forEach(function (p) {
    var s = periodStats(p, from, to);
    team.days += s.days; team.ms += s.ms;
    out.push("👤 *" + p.name + "*");
    out.push("   ✅ " + s.days + " day" + (s.days === 1 ? "" : "s") + " · ⏱ " + hm(s.ms) +
      " · ⏰ late " + s.late + " · 🌴 leave " + s.leave + " · ❌ absent " + s.absent);
  });
  out.push("", "Team total: " + team.days + " days worked · " + hm(team.ms));
  return out.join("\n");
}

export var PERIODS = [["today", "Today"], ["yesterday", "Yesterday"], ["week", "This week"], ["lastweek", "Last week"], ["last7", "Last 7 days"],
  ["month", "By month"], ["custom", "Custom dates"]];
export var MAX_RANGE_DAYS = 92;

/** The Records tab's chosen period as { from, to, title } ("yyyy-mm-dd", inclusive) or { error }. */
export function recRange() {
  var per = state.recPeriod || "month", t = dayKey(Date.now());
  var mon = keyPlus(t, -((new Date(t + "T12:00:00").getDay() + 6) % 7));
  if (per === "today") return { from: t, to: t, title: "Today" };
  if (per === "yesterday") return { from: keyPlus(t, -1), to: keyPlus(t, -1), title: "Yesterday" };
  if (per === "week") return { from: mon, to: t, title: "This week" };
  if (per === "lastweek") return { from: keyPlus(mon, -7), to: keyPlus(mon, -1), title: "Last week" };
  if (per === "last7") return { from: keyPlus(t, -6), to: t, title: "Last 7 days" };
  if (per === "custom") {
    var a = state.recFrom || "", b = state.recTo || "", ok = /^\d{4}-\d{2}-\d{2}$/;
    if (!ok.test(a) || !ok.test(b)) return { error: "Pick both dates." };
    if (a > b) return { error: "The first date must be on or before the second." };
    if (Math.round((new Date(b + "T12:00:00") - new Date(a + "T12:00:00")) / DAY_MS) + 1 > MAX_RANGE_DAYS) return { error: "Pick at most " + MAX_RANGE_DAYS + " days — for longer, use By month." };
    return { from: a, to: b, title: "Attendance report" };
  }
  var ym = state.month;
  return { from: ym + "-01", to: ym + "-" + monthDays(ym), title: monthLabel(ym), month: ym };
}

export function rangeText(from, to) { return rangeLabel(from, to); }

/** WhatsApp text for the Records tab's chosen period. */
export function rangeReport() {
  var r = recRange();
  if (r.error) throw new Error(r.error);
  if (r.from === r.to) return dailyReport(r.from);
  if (r.month) return monthlyReport(r.month);
  return periodReport(r.title === "Attendance report" ? r.title : r.title + " report", r.from, r.to);
}

/** The last 7 days, ending today. */
export function weeklyReport() {
  var to = dayKey(Date.now());
  return periodReport("Weekly report", keyPlus(to, -6), to);
}

/** Calendar month `ym` ("yyyy-mm"), up to today if it's the current month. */
export function monthlyReport(ym) {
  var from = ym + "-01", end = ym + "-" + monthDays(ym), today = dayKey(Date.now());
  var to = end < today ? end : today;
  return periodReport("Monthly report, " + monthLabel(ym) + (end > today ? " (so far)" : ""), from, to < from ? from : to);
}

/** A leave request or decision, as a notice. `l` comes from leave.js allLeaves(). */
export function leaveMessage(l) {
  var p = state.roster.filter(function (x) { return x.id === l.staffId; })[0] || state.me || {};
  var when = rangeLabel(l.from, l.to) + " (" + l.days + " day" + (l.days === 1 ? "" : "s") + ")";
  var head = l.status === "approved" ? "✅ *Leave approved*"
    : l.status === "rejected" ? "❌ *Leave not approved*"
    : "🗓️ *Leave request*";
  var out = [head, "*" + (p.name || "Staff") + "* — " + when];
  if (l.reason) out.push("Reason: " + l.reason);
  if (l.status === "pending") out.push("Status: ⏳ waiting for approval");
  else if (l.decidedBy) out.push((l.status === "approved" ? "Approved" : "Decided") + " by " + l.decidedBy);
  return out.join("\n");
}

/* ---------------------------------------------------------------
   Structured data for the attendance IMAGE (js/ui/reportImage.js).
   `shiftId` limits it to one shift: the people assigned to that shift
   and only the punches tagged with it. Without it: the whole day.
----------------------------------------------------------------*/
export function attendanceSheet(k, shiftId) {
  var shift = shiftId ? (state.cfg.shifts || []).filter(function (s) { return s.id === shiftId; })[0] : null;
  var people = active().filter(function (p) { return !shift || (Array.isArray(p.shifts) && p.shifts.indexOf(shift.id) >= 0); });
  var present = [], leave = [], absent = [];
  people.forEach(function (p) {
    if (p.joined && k < p.joined) return;
    var d = dayInfo(p, k, shift);
    if (d) {
      var first = (state.logs["log:" + p.id + ":" + k.slice(0, 4) + k.slice(5, 7)] || [])
        .filter(function (e) { return dayKey(e.start) === k && inShift(e, shift); })
        .sort(function (a, b) { return a.start - b.start; })[0];
      present.push({ name: p.name, shift: first && first.shiftName || "", inT: t12(d.first), outT: d.open ? null : t12(d.last),
                     hours: hm(d.ms), late: d.late, first: d.first });
    } else if (isOnApprovedLeave(p.id, k)) leave.push(p.name);
    else if (expected(p)) absent.push(p.name);
  });
  present.sort(function (a, b) { return a.first - b.first; });
  return {
    org: org(),
    title: shift ? shift.name : "Daily attendance",
    subtitle: dLabel(k) + (shift ? " · " + hm12(shift.start) + " – " + hm12(shift.end) : (isWeeklyOff(k) ? " · weekly off" : "")),
    present: present, leave: leave, absent: absent,
    total: present.length + leave.length + absent.length,
    lateCount: present.filter(function (x) { return x.late; }).length,
    generated: dLabel(dayKey(Date.now())) + ", " + t12(Date.now()),
    fileName: (shift ? shift.name.replace(/[^A-Za-z0-9]+/g, "-") : "attendance") + "-" + k + ".png",
    caption: "📋 " + org() + " — " + (shift ? shift.name : "Daily attendance") + ", " + dLabel(k)
  };
}

/** Shifts that ended in the last two hours today (for the "share it" reminder). */
export function endedShifts() {
  var now = new Date(), mins = now.getHours() * 60 + now.getMinutes();
  return (state.cfg.shifts || []).filter(function (s) {
    var end = parseHM(s.end);
    return mins >= end && mins - end <= 120;
  });
}
