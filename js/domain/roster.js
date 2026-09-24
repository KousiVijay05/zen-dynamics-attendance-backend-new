/* ---------------------------------------------------------------
   Staff roster CRUD (People tab). Ported from the "addperson",
   "saveperson" and "toggleactive" branches of the original app.js
   event handler. Validation messages are unchanged.
----------------------------------------------------------------*/

import { state, emitChange } from "../core/store.js";
import { sset } from "../storage/storage-api.js";
import { uid, dayKey, num } from "../utils/format.js";

var PASSWORD_MIN = 4;

function saveRoster() { return sset("org:roster", state.roster, true); }
function normUsername(u) { return (u || "").trim().toLowerCase(); }

/** Adds a new staff member. `fields` = { name, username, password, salary, admin }. */
export function addStaff(fields) {
  var name = (fields.name || "").trim();
  var username = normUsername(fields.username);
  var password = (fields.password || "").trim();
  var salary = num(fields.salary, 0);
  var admin = !!fields.admin;

  if (!name) throw new Error("Enter a name.");
  if (!username) throw new Error("Enter a user ID.");
  if (password.length < PASSWORD_MIN) throw new Error("The password must be at least " + PASSWORD_MIN + " characters.");
  if (state.roster.some(function (x) { return normUsername(x.username) === username; })) throw new Error("Someone already uses that user ID — pick another.");

  state.roster.push({
    id: uid(),
    name: name,
    username: username,
    password: password,
    /* New accounts always start with a temporary password — the person
       is forced to pick their own the first time they sign in. */
    mustChangePassword: true,
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

/** Saves edits to an existing staff member. `fields` = { name, username, password, salary, admin }. */
export function updateStaff(id, fields) {
  var pe = state.roster.filter(function (x) { return x.id === id; })[0];
  if (!pe) throw new Error("That person no longer exists.");

  var en = (fields.name || "").trim();
  var eu = normUsername(fields.username);
  var ep = (fields.password || "").trim();
  var es = num(fields.salary, 0);

  if (!en) throw new Error("Enter a name.");
  if (!eu) throw new Error("Enter a user ID.");
  if (ep.length < PASSWORD_MIN) throw new Error("The password must be at least " + PASSWORD_MIN + " characters.");
  if (state.roster.some(function (x) { return x.id !== pe.id && normUsername(x.username) === eu; })) throw new Error("Someone already uses that user ID.");

  /* The password field is pre-filled with the current value so the admin
     can see it. If they save with a DIFFERENT value, that's a deliberate
     reset — the person is forced to pick their own password next time
     they sign in, same as a brand-new account. Saving unchanged doesn't
     touch that flag either way. */
  if (ep !== pe.password) pe.mustChangePassword = true;

  pe.name = en;
  pe.username = eu;
  pe.password = ep;
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
