/* ---------------------------------------------------------------
   Attendance: punch log storage keys, clock in/out, the auto
   clock-out boundary rule, and small aggregates used by the UI.

   Ported verbatim from the "punches" and adjacent sections of the
   original app.js. Log shape is unchanged:
     log:<staffId>:<yyyymm> -> [{ id, start, end, auto, lat, lng }, ...]
   auto:true marks a shift the geofence closed automatically because
   the person left the zone and stayed out past the grace period.
----------------------------------------------------------------*/

import { state, geo, fenceState, emitChange } from "../core/store.js";
import { sget, sset } from "../storage/storage-api.js";
import { uid, dayKey, monKey, minsOfDay, parseHM } from "../utils/format.js";
import { distanceNow } from "./geofence.js";
import { loadLeaves } from "./leave.js";
import { signOut } from "./auth.js";

export function logKey(id, ts) { return "log:" + id + ":" + monKey(ts); }

/** Loads (and caches in state.logs) one staff member's log for the month containing `ts`. */
export function loadLog(id, ts) {
  var k = logKey(id, ts);
  if (state.logs[k]) return Promise.resolve(state.logs[k]);
  return sget(k, true).then(function (v) { state.logs[k] = v || []; return state.logs[k]; });
}

/**
 * Finds an unclosed shift for `id`, checking this month and the
 * previous ~40 days so a shift that started before midnight on the
 * 1st (or just before a month boundary) isn't stranded. Returns
 * { entry, key } or null.
 */
export function openEntryFor(id) {
  var now = Date.now(), keys = [logKey(id, now), logKey(id, now - 40 * 864e5)];
  for (var i = 0; i < keys.length; i++) {
    var arr = state.logs[keys[i]] || [];
    for (var j = 0; j < arr.length; j++) if (!arr[j].end) return { entry: arr[j], key: keys[i] };
  }
  return null;
}

/** Sum of completed shift time today, for staff id. */
export function todayTotalFor(id) {
  var k = dayKey(Date.now()), t = 0;
  (state.logs[logKey(id, Date.now())] || []).forEach(function (e) {
    if (e.end && dayKey(e.start) === k) t += e.end - e.start;
  });
  return t;
}
function getAssignedShiftsForToday(id) {
  var person = state.roster.find(function (p) {
    return p.id === id;
  });

  if (!person) return [];

  var days = Array.isArray(person.workDays) ? person.workDays : [];
  var dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var today = dayNames[new Date().getDay()];

  if (days.indexOf(today) === -1) return [];

  var assigned = Array.isArray(person.shifts) ? person.shifts : [];
  if (!assigned.length) return [];

  var allShifts = Array.isArray(state.cfg.shifts) ? state.cfg.shifts : [];

  return assigned.map(function (shiftId) {
    return allShifts.find(function (s) {
      return s.id === shiftId;
    });
  }).filter(Boolean);
}

/**
 * Which of today's assigned shifts a clock-in at `nowMins` belongs to:
 * the one whose start is closest, among shifts that haven't ended yet
 * (so arriving early for the evening shift isn't read as very late for
 * the morning one); if all have ended, the closest start overall.
 */
export function pickShift(shifts, nowMins) {
  if (!shifts.length) return null;
  var open = shifts.filter(function (s) { return nowMins <= parseHM(s.end); });
  var pool = open.length ? open : shifts;
  return pool.slice().sort(function (a, b) {
    return Math.abs(nowMins - parseHM(a.start)) - Math.abs(nowMins - parseHM(b.start));
  })[0];
}

/** Clock in the signed-in staff member. No-op if outside the geofence. */
export function clockIn() {
  if (!inZoneForClockIn()) return;
  var now = Date.now(), k = logKey(state.me.id, now);
  var currentShift = pickShift(getAssignedShiftsForToday(state.me.id), minsOfDay(now));
  state.logs[k] = state.logs[k] || [];
  var person = state.roster.find(function (p) {
    return p.id === state.me.id;
  });

  var assignedTasks = person && Array.isArray(person.tasks)
    ? person.tasks.slice()
    : [];

  state.logs[k].unshift({
    id: uid(),
    start: now,
    end: null,
    auto: false,
    shiftId: currentShift ? currentShift.id : null,
    shiftName: currentShift ? currentShift.name : null,
    shiftStart: currentShift ? currentShift.start : null,
    shiftEnd: currentShift ? currentShift.end : null,
    mandatoryTasks: assignedTasks,
    mandatoryTasksCompleted: [],
    mandatoryTasksDone: assignedTasks.length === 0,
    lat: state.cfg.demo ? state.cfg.site.lat : geo.lat,
    lng: state.cfg.demo ? state.cfg.site.lng : geo.lng
  });
  fenceState.leftAt = null;
  sset(k, state.logs[k], true);
  emitChange();
}

function inZoneForClockIn() {
  var d = distanceNow();
  return d !== null && state.cfg && state.cfg.site && d <= state.cfg.site.radius;
}

/**
 * Clock out the signed-in staff member. `auto` marks a geofence
 * auto-close; `at` is when the boundary was actually crossed (so an
 * auto clock-out is timestamped at the moment they left, not the
 * moment the grace period expired).
 */
export function clockOut(at, auto) {
  var o = openEntryFor(state.me.id);
  if (!o) return;

  var person = state.roster.find(function (p) {
    return p.id === state.me.id;
  });

  /* Use the task list captured at clock-in so an admin changing tasks later
     cannot alter the requirements for an already-open shift. */
  var assignedTasks = Array.isArray(o.entry.mandatoryTasks)
    ? o.entry.mandatoryTasks.slice()
    : (person && Array.isArray(person.tasks) ? person.tasks.slice() : []);

  var taskKey = "zen-dynamics-task-done:" + state.me.id + ":" + o.entry.id;
  var completedIndexes = [];

  try {
    var rawTasks = localStorage.getItem(taskKey);
    completedIndexes = rawTasks ? JSON.parse(rawTasks) || [] : [];
  } catch (e) {
    completedIndexes = [];
  }

  var allDone = assignedTasks.length === 0 ||
    assignedTasks.every(function (task, index) {
      return completedIndexes.indexOf(index) !== -1;
    });

  /* Manual clock-out is blocked until every mandatory task is checked. */
  if (!auto && !allDone) return;

  o.entry.end = Math.max(at || Date.now(), o.entry.start);
  o.entry.auto = !!auto;
  o.entry.mandatoryTasks = assignedTasks;
  o.entry.mandatoryTasksCompleted = assignedTasks.filter(function (task, index) {
    return completedIndexes.indexOf(index) !== -1;
  });
  o.entry.mandatoryTasksDone = allDone;

  fenceState.leftAt = null;

  /* IMPORTANT: save through the storage API so the completed task data
     reaches Google Sheets as part of the attendance record. */
  sset(o.key, state.logs[o.key], true);
  emitChange();
}
/**
 * Warms state.logs with every staff member's current month, the
 * admin-selected month, and the trailing ~40 days (so open shifts
 * spanning a month boundary resolve correctly), then marks
 * state.adminLoaded so the admin views stop showing the loading
 * skeleton. Ported verbatim from loadAdminData() in the original app.js.
 */
export function loadAdminData() {
  state.adminLoaded = false;
  var jobs = [], monthTs = new Date(state.month + "-01T00:00:00").getTime();
  state.roster.forEach(function (p) {
    jobs.push(loadLog(p.id, Date.now()));
    jobs.push(loadLog(p.id, monthTs));
    jobs.push(loadLog(p.id, Date.now() - 40 * 864e5));
    jobs.push(loadLeaves(p.id));
  });
  return Promise.all(jobs).then(function () { state.adminLoaded = true; emitChange(); });
}

/**
 * Run on every staff-view render: if the signed-in person has an
 * open shift and is outside the radius, starts (or continues) a
 * grace-period timer; once the grace period elapses, auto clock-out.
 */
/* Minimum time continuously outside before signing someone out, so one
   jumpy GPS reading can't do it. */
var SIGN_OUT_AFTER_MS = 60000;

/**
 * Called on every staff-screen redraw (about once a second).
 * Outside the zone (counting GPS accuracy in the person's favour, capped
 * at 100 m) and still outside after the grace period:
 *   1. an open shift is closed, tagged "auto" (unchanged behaviour);
 *   2. if Settings → "Sign staff out when they leave the site" is on
 *      (the default), they're signed out after at least a minute outside.
 *      Admins are exempt when admins may use the app from anywhere.
 */
export function enforceBoundary() {
  if (!state.me || fenceState.signingOut) return;
  var d = distanceNow();
  var slack = Math.min(geo.acc || 0, 100);
  if (d === null || d - slack <= state.cfg.site.radius) { fenceState.leftAt = null; return; }
  if (!fenceState.leftAt) fenceState.leftAt = Date.now();
  var away = Date.now() - fenceState.leftAt;
  var o = openEntryFor(state.me.id);
  if (o && away >= state.cfg.graceMin * 60000) clockOut(fenceState.leftAt, true);
  var exempt = state.me.admin && state.cfg.adminAnywhere;
  if (state.cfg.signOutOutside && !exempt && !openEntryFor(state.me.id) &&
      away >= Math.max(SIGN_OUT_AFTER_MS, state.cfg.graceMin * 60000)) {
    fenceState.signingOut = true;
    fenceState.leftAt = null;
    signOut("You left the gym, so you've been signed out. Sign in again when you're back.")
      .then(function () { fenceState.signingOut = false; }, function () { fenceState.signingOut = false; });
  }
}
