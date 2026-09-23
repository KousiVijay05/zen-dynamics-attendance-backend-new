/* ---------------------------------------------------------------
   Staff roster CRUD (People tab). Ported from the "addperson",
   "saveperson" and "toggleactive" branches of the original app.js
   event handler. Validation messages are unchanged.
----------------------------------------------------------------*/

import { state, emitChange } from "../core/store.js";
import { sset } from "../storage/storage-api.js";
import { uid, dayKey, num } from "../utils/format.js";

var PIN_RE = /^\d{4}$/;

function saveRoster() { return sset("org:roster", state.roster, true); }

/** Adds a new staff member. `fields` = { name, pin, salary, admin }. */
export function addStaff(fields) {
  var name = (fields.name || "").trim();
  var pin = (fields.pin || "").trim();
  var salary = num(fields.salary, 0);
  var admin = !!fields.admin;

  if (!name) throw new Error("Enter a name.");
  if (!PIN_RE.test(pin)) throw new Error("The PIN must be exactly 4 digits.");
  if (state.roster.some(function (x) { return x.pin === pin; })) throw new Error("Someone already uses that PIN — pick another.");

 state.roster.push({
  id: uid(),
  name: name,
  pin: pin,
  admin: admin,
  active: true,
  salary: salary,
  shifts: [],
  workDays: ["Mon", "Tue", "Wed", "Thu", "Fri"],
  tasks: [],
  joined: dayKey(Date.now())
});
  return saveRoster().then(function () { return name + " added."; });
}

/** Saves edits to an existing staff member. `fields` = { name, pin, salary, admin }. */
export function updateStaff(id, fields) {
  var pe = state.roster.filter(function (x) { return x.id === id; })[0];
  if (!pe) throw new Error("That person no longer exists.");

  var en = (fields.name || "").trim();
  var ep = (fields.pin || "").trim();
  var es = num(fields.salary, 0);

  if (!en) throw new Error("Enter a name.");
  if (!PIN_RE.test(ep)) throw new Error("The PIN must be exactly 4 digits.");
  if (state.roster.some(function (x) { return x.id !== pe.id && x.pin === ep; })) throw new Error("Someone already uses that PIN.");

 pe.name = en;
pe.pin = ep;
pe.salary = es;
pe.admin = !!fields.admin;
pe.shifts = Array.isArray(fields.shifts) ? fields.shifts : (pe.shifts || []);
pe.tasks = Array.isArray(fields.tasks) ? fields.tasks : (pe.tasks || []);
state.editId = null;
  return saveRoster().then(function () { return "Saved."; });
}

/** Flips a staff member between active and inactive (soft delete / restore). */
export function toggleActive(id) {
  state.roster.forEach(function (x) { if (x.id === id) x.active = x.active === false; });
  return saveRoster().then(function () { emitChange(); });
}

export function startEdit(id) { state.editId = id; state.msg = ""; emitChange(); }
export function cancelEdit() { state.editId = null; state.msg = ""; emitChange(); }
