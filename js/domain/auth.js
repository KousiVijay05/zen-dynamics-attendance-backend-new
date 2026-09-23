/* ---------------------------------------------------------------
   Authentication: PIN entry/sign-in/sign-out, and the two recovery
   flows (first-run workplace setup, "no administrator left").

   Ported from the corresponding event-handler branches of the
   original app.js ("createorg", "recover", "makeadmin", "resetorg",
   "adminonly", "alluser", "pick", "back", "del", "dig", "signout",
   plus the signIn() helper). Validation messages are copied
   word-for-word so existing users see exactly the same prompts.

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

var PIN_RE = /^\d{4}$/;

function saveCfg() { return sset("org:config", state.cfg, true); }
function saveRoster() { return sset("org:roster", state.roster, true); }

/** First-run: create the workplace, its site geofence, and the first administrator. */
export function createWorkplace(fields) {
  var org = (fields.org || "").trim();
  var nm = (fields.name || "").trim();
  var pin = (fields.pin || "").trim();
  var la = fields.lat, ln = fields.lng, rad = fields.radius;

  if (!org || !nm) throw new Error("Enter a workplace name and your name.");
  if (!PIN_RE.test(pin)) throw new Error("The PIN must be exactly 4 digits.");
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
    state.roster = [{ id: uid(), name: nm, pin: pin, admin: true, active: true, salary: 0, joined: dayKey(Date.now()) }];
    state.msg = "";

    return Promise.all([saveCfg(), saveRoster()]).then(function () { return signIn(state.roster[0]); });
  });
}

/** "No administrator found" recovery screen: adds a fresh admin without touching existing records. */
export function createAdminRecovery(fields) {
  var rn = (fields.name || "").trim();
  var rp = (fields.pin || "").trim();

  if (!rn) throw new Error("Enter a name.");
  if (!PIN_RE.test(rp)) throw new Error("The PIN must be exactly 4 digits.");
  if (state.roster.some(function (x) { return x.pin === rp; })) throw new Error("Someone already uses that PIN — pick another.");

  var fresh = { id: uid(), name: rn, pin: rp, admin: true, active: true, salary: 0, joined: dayKey(Date.now()) };
  state.roster.push(fresh);

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

export function showAdminOnly(on) { state.adminOnly = !!on; emitChange(); }

export function pickForPin(id) {
  state.pinFor = id; state.pinBuf = ""; state.msg = ""; state.view = "pin";
  emitChange();
}

export function backToSignin() {
  state.view = "signin"; state.msg = "";
  emitChange();
}

export function pinBackspace() {
  state.pinBuf = state.pinBuf.slice(0, -1);
  emitChange();
}

/**
 * Appends a PIN digit. Once 4 digits are entered, checks it against
 * the selected person and either signs in or shows "doesn't match".
 */
export function pinDigit(v) {
  if (state.pinBuf.length >= 4) return;
  state.pinBuf += v;
  emitChange();
  if (state.pinBuf.length === 4) {
    var pp = state.roster.filter(function (x) { return x.id === state.pinFor; })[0];
    if (pp && pp.pin === state.pinBuf) {
      signIn(pp);
    } else {
      state.pinBuf = "";
      state.msg = "That PIN doesn't match. Try again."; state.msgOk = false;
      emitChange();
    }
  }
}

/** Signs a person in: sets state.me, remembers the device, and warms up their logs. */
export function signIn(p) {
  state.me = p; state.view = "staff"; state.pinBuf = ""; state.pinFor = null; state.msg = ""; state.adminOnly = false;
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
