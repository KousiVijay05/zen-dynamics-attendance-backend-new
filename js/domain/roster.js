/* ---------------------------------------------------------------
   Staff roster CRUD (People tab). Ported from the "addperson",
   "saveperson" and "toggleactive" branches of the original app.js
   event handler.

   Every write here is read-modify-write on the WHOLE org:roster blob,
   so it must start from the latest copy, not whatever state.roster was
   loaded into this tab earlier: otherwise an admin tab left open would
   save its old copy over changes other devices made since (e.g. a staff
   member's own password change). refreshRoster() pulls the current
   copy from storage first — instant with the Firebase backend, which
   keeps that cache live.
----------------------------------------------------------------*/

import { state, emitChange } from "../core/store.js";
import { sset, sget } from "../storage/storage-api.js";
import { uid, dayKey, num } from "../utils/format.js";

var PASSWORD_MIN = 4;

function saveRoster() { return sset("org:roster", state.roster, true); }
function normUsername(u) { return (u || "").trim().toLowerCase(); }

/** Replaces state.roster with the latest stored copy (no-op if storage has none). */
export function refreshRoster() {
  return sget("org:roster", true).then(function (r) {
    if (Array.isArray(r)) state.roster = r;
    return state.roster;
  });
}

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

  return refreshRoster().then(function () {
    if (state.roster.some(function (x) { return normUsername(x.username) === username; })) {
      throw new Error("Someone already uses that user ID — pick another.");
    }
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
  });
}

/** Saves edits to an existing staff member. `fields` = { name, username, password, salary, admin, shifts, workDays, tasks }. */
export function updateStaff(id, fields) {
  var en = (fields.name || "").trim();
  var eu = normUsername(fields.username);
  var ep = (fields.password || "").trim();
  var es = num(fields.salary, 0);

  if (!en) throw new Error("Enter a name.");
  if (!eu) throw new Error("Enter a user ID.");
  if (ep.length < PASSWORD_MIN) throw new Error("The password must be at least " + PASSWORD_MIN + " characters.");

  /* The password shown when this edit form opened. Comparing against THAT
     (not the stored value) tells us whether the admin actually typed a new
     one — if the person changed their own password on their phone while
     this form was open, an untouched field mustn't revert it. */
  var shownPw = state.editPwShown;

  return refreshRoster().then(function () {
    var pe = state.roster.filter(function (x) { return x.id === id; })[0];
    if (!pe) throw new Error("That person no longer exists.");
    if (state.roster.some(function (x) { return x.id !== pe.id && normUsername(x.username) === eu; })) {
      throw new Error("Someone already uses that user ID.");
    }

    /* Field changed by the admin = deliberate reset: they'll be asked to
       pick their own password next sign-in, same as a new account. */
    if (ep !== shownPw) {
      pe.password = ep;
      pe.mustChangePassword = true;
    }

    pe.name = en;
    pe.username = eu;
    pe.salary = es;
    pe.admin = !!fields.admin;
    pe.shifts = Array.isArray(fields.shifts) ? fields.shifts : (pe.shifts || []);
    pe.workDays = Array.isArray(fields.workDays) ? fields.workDays : (pe.workDays || []);
    pe.tasks = Array.isArray(fields.tasks) ? fields.tasks : (pe.tasks || []);
    state.editId = null;
    state.editPwShown = null;
    return saveRoster().then(function () { return "Saved."; });
  });
}

/** Flips a staff member between active and inactive (soft delete / restore). */
export function toggleActive(id) {
  return refreshRoster().then(function () {
    state.roster.forEach(function (x) { if (x.id === id) x.active = x.active === false; });
    return saveRoster();
  }).then(function () { emitChange(); });
}

/* Refresh first so the form shows the person's CURRENT password, not the
   one this tab loaded at boot. */
export function startEdit(id) {
  return refreshRoster().then(function () {
    var p = state.roster.filter(function (x) { return x.id === id; })[0];
    state.editId = id; state.editPwShown = p ? (p.password || "") : ""; state.msg = "";
    emitChange();
  });
}
export function cancelEdit() { state.editId = null; state.editPwShown = null; state.msg = ""; emitChange(); }
