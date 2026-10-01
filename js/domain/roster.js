/* ---------------------------------------------------------------
   Staff roster (People tab).

   Each roster entry is linked to a Firebase sign-in account:
     authUid / authEmail  the account (email is never emailed — it's just
                          <user ID>@<project domain>, or with a "+suffix"
                          after a password reset)
   and every change is written in ONE all-or-nothing database update
   that keeps these in step (see storage-firebase.js header):
     kv/org:roster, kv/profile:<id>   the entry itself (staff read their own profile)
     uidmap/<authUid>                 present only while the person is active
     admins/<id>                      present only for administrators
     mustchange/<id>                  set when a temporary password is issued
     logins/<user ID>                 account email, when it isn't the default

   Password reset without a server: an admin can't change someone else's
   password on the free plan, so "reset" creates a FRESH account with the
   temporary password and points the person's roster entry at it. The old
   account is unlinked and can no longer read anything. Records are keyed
   by staff id, so nothing is lost.
----------------------------------------------------------------*/

import { state, emitChange } from "../core/store.js";
import { sget } from "../storage/storage-api.js";
import { num } from "../utils/format.js";
import { checkUsername } from "./auth.js";

var PASSWORD_MIN = 6;   // Firebase Authentication's minimum

function A() { return window.storageAuth; }
function normUsername(u) { return (u || "").trim().toLowerCase(); }
/* Display-only fields never get stored. */
function clean(p) { var c = Object.assign({}, p); delete c.mustChangePassword; delete c.password; delete c.pin; return c; }

/** Replaces state.roster with the latest server copy (admins only can read it). */
export function refreshRoster() {
  var sync = window.storageSync ? window.storageSync() : Promise.resolve();
  return sync.then(function () {
    return Promise.all([sget("org:roster", true), A().read("mustchange").catch(function () { return null; })]);
  }).then(function (r) {
    if (Array.isArray(r[0])) {
      var must = r[1] || {};
      state.roster = r[0].map(function (p) { var c = clean(p); if (must[p.id]) c.mustChangePassword = true; return c; });
    }
    return state.roster;
  });
}

function usernameTaken(username, exceptId) {
  return state.roster.some(function (p) { return p.id !== exceptId && normUsername(p.username) === username; });
}

/* The roster with `entry` replaced/added, plus its profile, as update paths. */
function rosterPaths(entry) {
  var list = state.roster.map(clean);
  var i = list.findIndex(function (p) { return p.id === entry.id; });
  if (i >= 0) list[i] = clean(entry); else list.push(clean(entry));
  var paths = {};
  paths["kv/org:roster"] = JSON.stringify(list);
  paths["kv/profile:" + entry.id] = JSON.stringify(clean(entry));
  return paths;
}

function loginPath(username, email, paths) {
  paths["logins/" + A().loginKey(username)] = email === A().defaultEmail(username) ? null : email;
}

/** Adds a new staff member. `fields` = { name, username, password (temporary), salary, admin }. */
export function addStaff(fields) {
  var name = (fields.name || "").trim();
  var username = normUsername(fields.username);
  var password = (fields.password || "").trim();

  if (!name) throw new Error("Enter a name.");
  checkUsername(username);
  if (password.length < PASSWORD_MIN) throw new Error("The temporary password must be at least " + PASSWORD_MIN + " characters.");

  return refreshRoster().then(function () {
    if (usernameTaken(username, null)) throw new Error("Someone already uses that user ID — pick another.");
    return A().createAccount(username, password);
  }).then(function (acc) {
    var entry = {
      id: acc.uid, name: name, username: username, authUid: acc.uid, authEmail: acc.email,
      admin: !!fields.admin, active: true, salary: num(fields.salary, 0),
      shifts: [], workDays: ["Mon", "Tue", "Wed", "Thu", "Fri"], tasks: [], joined: new Date().toISOString().slice(0, 10)
    };
    var paths = rosterPaths(entry);
    paths["uidmap/" + acc.uid] = entry.id;
    paths["mustchange/" + entry.id] = true;
    paths["admins/" + entry.id] = entry.admin ? true : null;
    loginPath(username, acc.email, paths);
    return A().update(paths);
  }).then(refreshRoster).then(function () { return name + " added. Give them their user ID and temporary password."; });
}

/* Shared by updateStaff and toggleActive. `changes` = the new field values;
   `tempPassword` = a new temporary password, or "" to keep theirs. */
function saveExisting(id, changes, tempPassword) {
  return refreshRoster().then(function () {
    var prev = state.roster.filter(function (x) { return x.id === id; })[0];
    if (!prev) throw new Error("That person no longer exists.");
    var entry = Object.assign(clean(prev), changes);
    if (!entry.authUid) entry.authUid = prev.id;                         // migrated accounts: uid = id
    if (!entry.authEmail) entry.authEmail = A().defaultEmail(prev.username);
    var active = entry.active !== false, isAdmin = !!entry.admin;

    if (id === state.me.id && (!isAdmin || !active)) throw new Error("You can't remove your own admin access or deactivate yourself.");
    if (prev.admin && prev.active !== false && (!isAdmin || !active) &&
        !state.roster.some(function (p) { return p.id !== id && p.admin && p.active !== false; })) {
      throw new Error("That would leave no active administrator.");
    }
    if (usernameTaken(normUsername(entry.username), id)) throw new Error("Someone already uses that user ID — pick another.");

    var newAcc = tempPassword ? A().createAccount(entry.username, tempPassword) : Promise.resolve(null);
    return newAcc.then(function (acc) {
      var paths = {};
      if (acc) {
        paths["uidmap/" + entry.authUid] = null;                         // old account: no access any more
        entry.authUid = acc.uid; entry.authEmail = acc.email;
        paths["mustchange/" + id] = true;
      }
      Object.assign(paths, rosterPaths(entry));
      paths["uidmap/" + entry.authUid] = active ? id : null;
      paths["admins/" + id] = isAdmin ? true : null;
      if (normUsername(prev.username) !== normUsername(entry.username)) paths["logins/" + A().loginKey(prev.username)] = null;
      loginPath(entry.username, entry.authEmail, paths);
      return A().update(paths);
    });
  }).then(refreshRoster);
}

/**
 * Saves edits to an existing staff member. `fields` = { name, username,
 * password, salary, admin, shifts, workDays, tasks }. `password` is a NEW
 * temporary password, or empty to leave theirs unchanged.
 */
export function updateStaff(id, fields) {
  var en = (fields.name || "").trim();
  var eu = normUsername(fields.username);
  var ep = (fields.password || "").trim();

  if (!en) throw new Error("Enter a name.");
  checkUsername(eu);
  if (ep && ep.length < PASSWORD_MIN) throw new Error("The temporary password must be at least " + PASSWORD_MIN + " characters.");

  var changes = { name: en, username: eu, salary: num(fields.salary, 0), admin: !!fields.admin };
  if (Array.isArray(fields.shifts)) changes.shifts = fields.shifts;
  if (Array.isArray(fields.workDays)) changes.workDays = fields.workDays;
  if (Array.isArray(fields.tasks)) changes.tasks = fields.tasks;
  return saveExisting(id, changes, ep).then(function () {
    state.editId = null;
    return ep ? "Saved. They'll be asked to choose a new password next time they sign in." : "Saved.";
  });
}

/** Flips a staff member between active and inactive (an inactive person loses all access at once). */
export function toggleActive(id) {
  var p = state.roster.filter(function (x) { return x.id === id; })[0];
  if (!p) return Promise.reject(new Error("That person no longer exists."));
  return saveExisting(id, { active: p.active === false }, "").then(function () { emitChange(); });
}

export function startEdit(id) { state.editId = id; state.msg = ""; emitChange(); }
export function cancelEdit() { state.editId = null; state.msg = ""; emitChange(); }
