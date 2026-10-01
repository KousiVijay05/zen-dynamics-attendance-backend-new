/* ---------------------------------------------------------------
   Firebase Realtime Database storage adapter.

   Drop-in replacement for storage-gsheets.js: same window.storage
   get/set/delete/list contract, same window.storageSync() and
   window.storageStatus(), same private-key localStorage prefix (so
   "which staff member this phone signed in as" carries over). Loaded
   from index.html as <script type="module"> placed BEFORE js/app.js —
   deferred module scripts execute in document order, so window.storage
   exists by the time app.js boots.

   Why Firebase instead of Apps Script: an Apps Script web app took
   3-70+ seconds per request (measured); Firebase answers in well under
   a second, and pushes other devices' changes here in real time instead
   of a 60-second poll.

   Data layout: everything lives under /kv/<key> as the same JSON
   strings the Sheets backend stored, so the rest of the app is
   untouched. Validation (key allowlist, 200,000-char cap) is enforced
   server-side by firebase/database.rules.json — the equivalent of what
   Code.gs used to check.

   Offline: writes go into a localStorage queue first and are removed
   only once the server acknowledges them, so a punch made with no
   signal survives even a page reload and is replayed on next open.

   SECURITY NOTE: same model as before. The config below is public by
   design (Firebase documents this), and the database rules allow any
   visitor to read/write the allowed keys — exactly the exposure the
   shared SECRET had. See README's Security section.
----------------------------------------------------------------*/

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getDatabase, ref, onValue, set as fbSet, remove as fbRemove, get as fbGet, connectDatabaseEmulator
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js";

var FIREBASE_CONFIG = {
  apiKey: "AIzaSyDcS47OJdJ4YRxfSdTs12RYsMPVb73sAfM",
  authDomain: "zen-dynamics-attendance-a2f73.firebaseapp.com",
  databaseURL: "https://zen-dynamics-attendance-a2f73-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "zen-dynamics-attendance-a2f73",
  appId: "1:765108913974:web:217fa16a423667d876d597"
};

/* How long to wait for the server before falling back to this device's
   last known copy. With no local copy at all we keep waiting instead —
   a slow first load is far better than an empty cache, which the app
   would read as "no workplace exists" and offer the setup screen. */
var OFFLINE_FALLBACK_MS = 6000;

var LOCAL_PREFIX = "attendance.v1.";
var QUEUE_KEY = LOCAL_PREFIX + "fbqueue";
var SNAPSHOT_KEY = "fbsnapshot";

var db = getDatabase(initializeApp(FIREBASE_CONFIG));

/* Testing only: on localhost with ?emulator=1, use the Firebase Local
   Emulator Suite instead of the live database. Can't trigger on the
   deployed site (hostname check). */
var USE_EMULATOR = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && /[?&]emulator=1\b/.test(location.search);
if (USE_EMULATOR) connectDatabaseEmulator(db, "127.0.0.1", 9000);

var kvRef = ref(db, "kv");

var cache = {};
var queue = [];
var online = true, everConnected = false, lastError = null;

function lsGet(k) { try { return window.localStorage.getItem(LOCAL_PREFIX + k); } catch (e) { return null; } }
function lsSet(k, v) { try { window.localStorage.setItem(LOCAL_PREFIX + k, v); } catch (e) {} }
function lsDel(k) { try { window.localStorage.removeItem(LOCAL_PREFIX + k); } catch (e) {} }

function loadQueue() {
  try { queue = JSON.parse(window.localStorage.getItem(QUEUE_KEY) || "[]") || []; } catch (e) { queue = []; }
}
function saveQueue() {
  try { window.localStorage.setItem(QUEUE_KEY, JSON.stringify(queue)); } catch (e) {}
}
function saveSnapshot() { lsSet(SNAPSHOT_KEY, JSON.stringify(cache)); }

/* Queued writes are newer than anything the server has, so they win. */
function overlayQueue() { queue.forEach(function (it) { cache[it.key] = it.value; }); }

var loadedOnce = false;
function applyServerValue(val) {
  var before = cache;
  cache = {};
  if (val) Object.keys(val).forEach(function (k) { cache[k] = String(val[k]); });
  overlayQueue();
  saveSnapshot();

  /* Tell the app which keys changed (another device's save, typically), so
     open screens can refresh without waiting for a poll or a reload. */
  var changed = Object.keys(cache).concat(Object.keys(before)).filter(function (k, i, all) {
    return all.indexOf(k) === i && cache[k] !== before[k];
  });
  if (loadedOnce && changed.length) {
    window.dispatchEvent(new CustomEvent("storage-remote-change", { detail: { keys: changed } }));
  }
  loadedOnce = true;
}

/* ---------- writes ---------- */

function send(item) {
  var p = item.value === null ? fbRemove(ref(db, "kv/" + item.key)) : fbSet(ref(db, "kv/" + item.key), item.value);
  return p.then(function () {
    /* Only drop it if nothing newer for the same key was queued meanwhile. */
    queue = queue.filter(function (q) { return !(q.key === item.key && q.seq === item.seq); });
    saveQueue();
    lastError = null;
  }).catch(function (err) {
    /* Rejected by the server (rules), not just offline — retrying won't help. */
    lastError = err.message;
    queue = queue.filter(function (q) { return !(q.key === item.key && q.seq === item.seq); });
    saveQueue();
    console.error("Firebase write rejected for " + item.key + ":", err);
  });
}

var seq = Date.now();
function enqueue(key, value) {
  queue = queue.filter(function (q) { return q.key !== key; });
  var item = { key: key, value: value, seq: ++seq };
  queue.push(item);
  saveQueue();
  send(item);
}

/* ---------- boot ---------- */

loadQueue();

var resolveReady;
var ready = new Promise(function (r) { resolveReady = r; });

onValue(kvRef, function (snap) {
  applyServerValue(snap.val());
  resolveReady();
}, function (err) {
  lastError = err.message;
});

setTimeout(function () {
  var snap = lsGet(SNAPSHOT_KEY);
  if (snap && !Object.keys(cache).length) {
    try { cache = JSON.parse(snap) || {}; overlayQueue(); resolveReady(); } catch (e) {}
  }
}, OFFLINE_FALLBACK_MS);

/* Anything left queued from a previous session (closed before the server
   acknowledged) goes out now; the SDK holds it until the connection is up. */
queue.slice().forEach(send);

onValue(ref(db, ".info/connected"), function (snap) {
  if (snap.val() === true) { online = true; everConnected = true; }
  else if (everConnected) online = false;
});
setTimeout(function () { if (!everConnected) online = false; }, OFFLINE_FALLBACK_MS);

/* ---------- the storage API the app expects ---------- */

window.storage = {
  get: function (key, shared) {
    if (!shared) {
      var v = lsGet("private." + key);
      return v === null ? Promise.reject(new Error("Key not found: " + key))
                        : Promise.resolve({ key: key, value: v, shared: false });
    }
    return ready.then(function () {
      if (!(key in cache)) throw new Error("Key not found: " + key);
      return { key: key, value: cache[key], shared: true };
    });
  },

  set: function (key, value, shared) {
    if (!shared) { lsSet("private." + key, String(value)); return Promise.resolve({ key: key, value: value, shared: false }); }
    cache[key] = String(value);
    saveSnapshot();
    enqueue(key, String(value));
    return Promise.resolve({ key: key, value: value, shared: true });
  },

  delete: function (key, shared) {
    if (!shared) { lsDel("private." + key); return Promise.resolve({ key: key, deleted: true, shared: false }); }
    delete cache[key];
    saveSnapshot();
    enqueue(key, null);
    return Promise.resolve({ key: key, deleted: true, shared: true });
  },

  list: function (prefix, shared) {
    var p = prefix || "";
    if (!shared) return Promise.resolve({ keys: [], prefix: p, shared: false });
    return ready.then(function () {
      return { keys: Object.keys(cache).filter(function (k) { return k.indexOf(p) === 0; }), prefix: p, shared: true };
    });
  }
};

window.STORAGE_MODE = "firebase";

/* Forces a fresh read from the server (used by Refresh, and by the
   create-workplace / recover-admin overwrite guards in js/domain/auth.js). */
window.storageSync = function () {
  return fbGet(kvRef).then(function (snap) { applyServerValue(snap.val()); resolveReady(); })
    .catch(function (err) { lastError = err.message; });
};

window.storageStatus = function () {
  return { online: online, pending: queue.length, error: lastError, keys: Object.keys(cache).length };
};
