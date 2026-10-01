/* ---------------------------------------------------------------
   Authentication: sign-in through Firebase Authentication, forced
   password change, sign-out, and first-run workplace setup.

   Passwords never touch the database: Firebase Auth stores them
   hashed, so nobody — including admins — can read one. Admins can SET
   a new temporary password for someone (Admin -> People), which forces
   that person to choose their own at next sign-in (see roster.js).

   There is no in-app "recover administrator" flow: on the free plan
   nothing could check "no admin is left" safely. If every admin is ever
   locked out, the project owner fixes it in the Firebase console
   (README → Security).

   Design note: these functions read already-parsed arguments, never
   the DOM — js/events/handlers.js is the only place that reads input
   values. Validation problems throw a plain Error whose .message is
   shown to the user.
----------------------------------------------------------------*/

import { state, emitChange } from "../core/store.js";
import { sget } from "../storage/storage-api.js";
import { defaultPay, withConfigDefaults } from "../core/config.js";
import { startWatch, startTick } from "./geofence.js";
import { loadLog } from "./attendance.js";
import { loadLeaves } from "./leave.js";

export var PASSWORD_MIN = 6;   // Firebase Authentication's minimum
var USERNAME_RE = /^[a-z0-9._-]{2,32}$/;

function A() { return window.storageAuth; }
function normUsername(u) { return (u || "").trim().toLowerCase(); }
export function checkUsername(u) {
  if (!USERNAME_RE.test(u)) throw new Error("User ID must be 2-32 characters: lowercase letters, numbers, dots, dashes or underscores.");
}
var today = function () { return new Date().toISOString().slice(0, 10); };

/** The pre-sign-in subset of the config the sign-in screen needs. Same as org.js savePublic(). */
export function publicOf(c) { return { org: c.org, site: c.site, lockOutside: c.lockOutside, adminAnywhere: c.adminAnywhere, demo: c.demo }; }

/**
 * After a successful sign-in (or a remembered session at boot): load
 * this person's data and land them on the right screen. Staff only ever
 * load their own profile; admins load the whole roster.
 */
export function enterAs(who) {
  if (!who || !who.staffId) return signOut("That account is no longer active. Ask your administrator.");
  return Promise.all([
    sget("org:config", true),
    sget("profile:" + who.staffId, true),
    who.admin ? sget("org:roster", true) : Promise.resolve(null)
  ]).then(function (r) {
    if (r[0]) state.cfg = withConfigDefaults(r[0]);
    var me = r[1];
    if (!me || me.active === false) {
      return signOut("That account is no longer active. Ask your administrator.");
    }
    me.admin = who.admin;                 // /admins is the authority, not the stored flag
    state.roster = Array.isArray(r[2]) ? r[2] : [me];
    if (who.mustChange) {
      state.me = null; state.changePwFor = me.id; state.view = "changepw"; state.msg = "";
      emitChange();
      return;
    }
    return signIn(me);
  });
}

/** First-run: create the workplace, its site geofence, and the first administrator. */
export function createWorkplace(fields) {
  var org = (fields.org || "").trim();
  var nm = (fields.name || "").trim();
  var username = normUsername(fields.username);
  var password = (fields.password || "").trim();
  var la = fields.lat, ln = fields.lng, rad = fields.radius;

  if (!org || !nm) throw new Error("Enter a workplace name and your name.");
  checkUsername(username);
  if (password.length < PASSWORD_MIN) throw new Error("The password must be at least " + PASSWORD_MIN + " characters.");
  if (!isFinite(la) || !isFinite(ln) || Math.abs(la) > 90 || Math.abs(ln) > 180) {
    throw new Error("Set the site coordinates first.");
  }

  var cfg = {
    org: org,
    site: { lat: la, lng: ln, radius: isFinite(rad) && rad >= 10 ? rad : 100 },
    lockOutside: true, graceMin: 0, adminAnywhere: true, demo: false, pay: defaultPay(), shifts: []
  };
  return A().createOwnAccount(username, password).then(function (acc) {
    var id = acc.uid;    // the first admin's staff id is their account uid (the rules check this)
    var me = { id: id, name: nm, username: username, authUid: acc.uid, authEmail: acc.email, admin: true, active: true,
               salary: 0, shifts: [], workDays: ["Mon", "Tue", "Wed", "Thu", "Fri"], tasks: [], joined: today() };
    var paths = {};
    paths["kv/org:public"] = JSON.stringify(publicOf(cfg));
    paths["kv/org:config"] = JSON.stringify(cfg);
    paths["kv/org:roster"] = JSON.stringify([me]);
    paths["kv/profile:" + id] = JSON.stringify(me);
    paths["uidmap/" + acc.uid] = id;
    paths["admins/" + id] = true;
    if (!acc.isDefault) paths["logins/" + A().loginKey(username)] = acc.email;
    /* One all-or-nothing write. The database rules allow it ONLY while no
       workplace exists, so a device that reached this screen through a
       failed or stale load can't overwrite a real workplace. */
    return A().update(paths).catch(function (err) {
      return A().discardOwnAccount().then(function () {
        throw /^Not allowed/.test(err.message)
          ? new Error("A workplace already exists on this link — reload the page and sign in instead.")
          : err;
      });
    }).then(function () { return A().refresh(); });
  }).then(enterAs);
}

/** Reveals the login form despite a geofence lock (only an admin's credentials will actually get them in). */
export function showAdminOnly(on) { state.adminOnly = !!on; state.msg = ""; emitChange(); }

/** Username + password sign-in. One generic message for any wrong combination. */
export function attemptLogin(fields) {
  var username = normUsername(fields.username), password = fields.password || "";
  return A().signIn(username, password).then(function (who) {
    /* The geofence lock only ever let admins bypass it (adminAnywhere). */
    if (state.adminOnly && !who.admin) {
      return signOut("Only administrators can sign in while outside the site.");
    }
    return enterAs(who);
  }, function (err) {
    state.msg = err.message; state.msgOk = false;
    emitChange();
  });
}

/** Forced (first sign-in / admin reset) password change. `fields` = { password, confirm }. */
export function changePassword(fields) {
  var pw = (fields.password || "").trim();
  var confirm = (fields.confirm || "").trim();
  if (pw.length < PASSWORD_MIN) throw new Error("The password must be at least " + PASSWORD_MIN + " characters.");
  if (pw !== confirm) throw new Error("Passwords don't match.");

  return A().changeOwnPassword(pw).then(function () {
    state.changePwFor = null;
    return enterAs(A().current());
  });
}

export function backToSignin() {
  if (state.view === "changepw") return signOut("");
  state.view = "signin"; state.msg = ""; state.adminOnly = false;
  emitChange();
  return Promise.resolve();
}

/** Signs a person in: sets state.me and warms up their logs and leave. */
export function signIn(p) {
  state.me = p; state.view = "staff"; state.msg = ""; state.adminOnly = false;
  return Promise.all([loadLog(p.id, Date.now()), loadLog(p.id, Date.now() - 40 * 864e5), loadLeaves(p.id)]).then(function () {
    emitChange();
    startWatch(); startTick();
  });
}

/** Ends the session on this device. `msg` (optional) is shown on the sign-in screen. */
export function signOut(msg) {
  return A().signOut().then(function () {
    state.me = null; state.changePwFor = null; state.logs = {}; state.leaveData = {};
    state.adminLoaded = false; state.editId = null;
    state.roster = [];
    state.view = "signin"; state.msg = msg || ""; state.msgOk = false;
    emitChange();
    startWatch(); startTick();
  });
}
