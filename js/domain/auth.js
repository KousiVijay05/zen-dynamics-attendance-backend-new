/* ---------------------------------------------------------------
   Authentication: username/password sign-in, forced password change
   on first login, and the two recovery flows (first-run workplace
   setup, "no administrator left").

   Replaces the original tap-your-name-then-PIN flow: the sign-in
   screen no longer lists staff names at all (anyone with the link
   could see the whole roster before), and each person now has their
   own admin-assigned username + password instead of a shared-visible
   4-digit PIN.

   SECURITY NOTE, same honesty as the rest of this app: passwords are
   stored in plaintext in org:roster, same as PINs always were — see
   README's Security section. This is a deliberate choice (the admin
   is meant to be able to see/reset anyone's password, e.g. if they
   forget it), not an oversight. It does not add real per-user backend
   authentication; SECRET is still the only actual gate on the data
   layer, and it still ships in this deployed page's client JS.

   Design note: these functions read already-parsed arguments, never
   the DOM — js/events/handlers.js is the only place that reads
   input values, so this file stays testable and UI-agnostic. On a
   validation problem they throw a plain Error whose .message is the
   text to show the user; js/ui/notify.js is what actually renders it.
----------------------------------------------------------------*/

import { state, emitChange } from "../core/store.js";
import { sset, sget } from "../storage/storage-api.js";
import { uid, dayKey } from "../utils/format.js";
import { defaultPay } from "../core/config.js";
import { startWatch, startTick } from "./geofence.js";
import { loadLog } from "./attendance.js";

var PASSWORD_MIN = 4;

function saveCfg() { return sset("org:config", state.cfg, true); }
function saveRoster() { return sset("org:roster", state.roster, true); }

function normUsername(u) { return (u || "").trim().toLowerCase(); }

function findByUsername(username) {
  var u = normUsername(username);
  if (!u) return null;
  return state.roster.filter(function (x) { return normUsername(x.username) === u; })[0] || null;
}

/** First-run: create the workplace, its site geofence, and the first administrator. */
export function createWorkplace(fields) {
  var org = (fields.org || "").trim();
  var nm = (fields.name || "").trim();
  var username = normUsername(fields.username);
  var password = (fields.password || "").trim();
  var la = fields.lat, ln = fields.lng, rad = fields.radius;

  if (!org || !nm) throw new Error("Enter a workplace name and your name.");
  if (!username) throw new Error("Choose a user ID.");
  if (password.length < PASSWORD_MIN) throw new Error("The password must be at least " + PASSWORD_MIN + " characters.");
  if (!isFinite(la) || !isFinite(ln) || Math.abs(la) > 90 || Math.abs(ln) > 180) {
    throw new Error("Set the site coordinates first.");
  }

  /* This screen appears whenever state.cfg is falsy — which is also what
     happens after a failed or stale fetch of org:config (see
     js/storage/storage-gsheets.js's local-snapshot fallback), not only
     when a workplace genuinely doesn't exist yet. Since this flow
     unconditionally overwrites org:config and org:roster, that ambiguity
     is dangerous: anyone who lands here on a bad connection would wipe
     out a real, already-set-up workplace with no warning.

     sget() alone isn't enough here — it reads from an in-memory cache
     populated once at boot, so if THAT boot-time fetch was the one that
     failed, re-reading it just returns the same stale/empty answer.
     window.storageSync() (when the Google Sheets backend is active)
     forces an actual fresh network pull first, so this check reflects
     what's really on the server right now, not a cached guess. */
  return (window.storageSync ? window.storageSync() : Promise.resolve()).then(function () {
    return sget("org:config", true);
  }).then(function (existing) {
    if (existing) {
      throw new Error("A workplace already exists on this link — reload the page and sign in instead of setting up a new one. If you manage this app and believe that's wrong, check with whoever administers it before proceeding.");
    }

    state.cfg = {
      org: org,
      site: { lat: la, lng: ln, radius: isFinite(rad) && rad >= 10 ? rad : 100 },
      lockOutside: true, graceMin: 0, adminAnywhere: true, demo: false, pay: defaultPay(), shifts: [], leaves: []
    };
    /* The first admin sets their own password right now, so unlike staff
       added later there's nothing to force-change on next login. */
    state.roster = [{
      id: uid(), name: nm, username: username, password: password, mustChangePassword: false,
      admin: true, active: true, salary: 0, joined: dayKey(Date.now())
    }];
    state.msg = "";

    return Promise.all([saveCfg(), saveRoster()]).then(function () { return signIn(state.roster[0]); });
  });
}

/** "No administrator found" recovery screen: adds a fresh admin without touching existing records. */
export function createAdminRecovery(fields) {
  var rn = (fields.name || "").trim();
  var ru = normUsername(fields.username);
  var rp = (fields.password || "").trim();

  if (!rn) throw new Error("Enter a name.");
  if (!ru) throw new Error("Choose a user ID.");
  if (rp.length < PASSWORD_MIN) throw new Error("The password must be at least " + PASSWORD_MIN + " characters.");

  /* Same reasoning as createWorkplace()'s guard: this screen can appear (or
     get lingered on) with a stale in-memory state.roster — a fetch failure
     at boot, a snapshot from before other devices' changes synced in, or
     simply an open tab that's been sitting on this screen for a while.
     Pushing onto and saving THAT roster would silently discard whatever
     really exists server-side. Force a fresh pull and rebuild the push on
     top of it, not on top of whatever's in memory. This is also where the
     real fix for a real incident landed: a stale roster here once
     overwrote real staff's usernames/passwords with an outdated copy. */
  return (window.storageSync ? window.storageSync() : Promise.resolve()).then(function () {
    return sget("org:roster", true);
  }).then(function (freshRoster) {
    var roster = Array.isArray(freshRoster) ? freshRoster : (state.roster || []);
    if (roster.some(function (x) { return normUsername(x.username) === ru; })) {
      throw new Error("Someone already uses that user ID — pick another.");
    }

    var fresh = {
      id: uid(), name: rn, username: ru, password: rp, mustChangePassword: false,
      admin: true, active: true, salary: 0, joined: dayKey(Date.now())
    };
    roster.push(fresh);
    state.roster = roster;

    return saveRoster()
      .then(function () { return sget("org:roster", true); })
      .then(function (back) {
        if (!back || !back.length) {
          state.msg = "The staff list didn't save. Try once more."; state.msgOk = false;
          emitChange();
          return;
        }
        state.roster = back;
        return signIn(state.roster.filter(function (x) { return x.id === fresh.id; })[0] || fresh);
      });
  });
}

/** Deletes the workplace, its roster and every record. Caller is responsible for confirming with the user first. */
export function resetOrg() {
  return Promise.all([sset("org:config", null, true), sset("org:roster", null, true), sset("device:last", null, false)])
    .then(function () {
      state.cfg = null; state.roster = []; state.me = null; state.logs = {}; state.msg = "";
      state.view = "setup";
      emitChange();
    });
}

export function goToRecover() { state.view = "recover"; state.msg = ""; emitChange(); }

/** Reveals the login form despite a geofence lock (only an admin's credentials will actually get them in). */
export function showAdminOnly(on) { state.adminOnly = !!on; state.msg = ""; emitChange(); }

/**
 * Checks a username/password against the roster. On success: routes to
 * the forced password-change screen if this account still has a
 * temporary password, otherwise signs straight in. On failure, one
 * generic message regardless of whether the username or the password
 * was wrong — doesn't confirm which usernames exist.
 */
export function attemptLogin(fields) {
  var username = fields.username, password = (fields.password || "").trim();
  var p = findByUsername(username);
  var ok = p && p.active !== false && p.password === password;

  if (!ok) {
    state.msg = "User ID or password is incorrect."; state.msgOk = false;
    emitChange();
    return Promise.resolve();
  }

  /* The geofence lock only ever let admins bypass it (adminAnywhere) —
     a non-admin whose credentials happen to be correct while the app is
     showing the locked screen still isn't allowed through here. */
  if (state.adminOnly && !p.admin) {
    state.msg = "Only administrators can sign in while outside the site.";
    state.msgOk = false;
    emitChange();
    return Promise.resolve();
  }

  if (p.mustChangePassword) {
    state.changePwFor = p.id; state.view = "changepw"; state.msg = "";
    emitChange();
    return Promise.resolve();
  }

  return signIn(p);
}

/**
 * Forced (or admin-reset-triggered) password change. `fields` =
 * { password, confirm }. Applies to state.changePwFor, then signs in.
 */
export function changePassword(fields) {
  var pw = (fields.password || "").trim();
  var confirm = (fields.confirm || "").trim();
  var p = state.roster.filter(function (x) { return x.id === state.changePwFor; })[0];
  if (!p) { state.view = "signin"; state.msg = ""; emitChange(); return Promise.resolve(); }

  if (pw.length < PASSWORD_MIN) throw new Error("The password must be at least " + PASSWORD_MIN + " characters.");
  if (pw !== confirm) throw new Error("Passwords don't match.");

  p.password = pw;
  p.mustChangePassword = false;
  state.changePwFor = null;

  return saveRoster().then(function () { return signIn(p); });
}

export function backToSignin() {
  state.view = "signin"; state.msg = ""; state.adminOnly = false;
  emitChange();
}

/** Signs a person in: sets state.me, remembers the device, and warms up their logs. */
export function signIn(p) {
  state.me = p; state.view = "staff"; state.msg = ""; state.adminOnly = false;
  sset("device:last", { id: p.id }, false);
  return Promise.all([loadLog(p.id, Date.now()), loadLog(p.id, Date.now() - 40 * 864e5)]).then(function () {
    emitChange();
    startWatch(); startTick();
  });
}

export function signOut() {
  state.me = null; state.view = "signin"; state.msg = "";
  sset("device:last", null, false);
  emitChange();
}
