/* ---------------------------------------------------------------
   Firebase storage + sign-in adapter. Runs entirely on Firebase's free
   (Spark) plan — no server functions.

   window.storage      get/set/delete/list — same contract the rest of
                       the app has always used (values are JSON strings
                       under /kv/<key>).
   window.storageAuth  sign-in via Firebase Authentication, membership
                       lookup, account creation, password change.
   window.storageSync / window.storageStatus — as before.

   Loaded from index.html as <script type="module"> placed BEFORE
   js/app.js (module scripts run in document order).

   Who may do what is decided by firebase/database.rules.json, using
   three small admin-managed records outside /kv:
     /uidmap/<sign-in uid>  = staff id   — "this account is an ACTIVE member"
     /admins/<staff id>     = true       — "this member is an administrator"
     /mustchange/<staff id> = true       — "must pick a new password"
   plus /logins/<user ID>  = account email, when it isn't the default
   <user ID>@<EMAIL_DOMAIN> (after a password reset or user ID change).

   A sign-in account with no /uidmap entry (deactivated, replaced by a
   password reset, or created by a stranger — Firebase lets anyone create
   an account) can read nothing except the workplace name.

   Offline: writes go into a localStorage queue tagged with the signed-in
   account, leave it only on server acknowledgement, and replay only for
   that same account (a shared phone never sends A's queued punch under
   B's sign-in). The last-seen copy of each key is cached per account, so
   the app still opens offline.
----------------------------------------------------------------*/

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getDatabase, ref, onValue, set as fbSet, remove as fbRemove, get as fbGet, update as fbUpdate, connectDatabaseEmulator
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js";
import {
  getAuth, initializeAuth, inMemoryPersistence, onAuthStateChanged, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, updatePassword, deleteUser, signOut as fbSignOut, connectAuthEmulator
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

var FIREBASE_CONFIG = {
  apiKey: "AIzaSyDcS47OJdJ4YRxfSdTs12RYsMPVb73sAfM",
  authDomain: "zen-dynamics-attendance-a2f73.firebaseapp.com",
  databaseURL: "https://zen-dynamics-attendance-a2f73-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "zen-dynamics-attendance-a2f73",
  appId: "1:765108913974:web:217fa16a423667d876d597"
};
/* Sign-in accounts use <user ID>@<this domain> as their "email". Nothing is
   ever emailed to it. Must match firebase/migrate-security.js. */
var EMAIL_DOMAIN = "zen-dynamics-attendance-a2f73.firebaseapp.com";

var OFFLINE_FALLBACK_MS = 6000;
var LOCAL_PREFIX = "attendance.v1.";
var QUEUE_KEY = LOCAL_PREFIX + "fbqueue2";

var app = initializeApp(FIREBASE_CONFIG);
var db = getDatabase(app);
var auth = getAuth(app);
/* A second, memory-only Firebase app for creating OTHER people's accounts:
   creating an account signs that new account in, and doing it here keeps
   the admin signed in on the main one. */
var makerApp = initializeApp(FIREBASE_CONFIG, "account-maker");
var makerAuth = initializeAuth(makerApp, { persistence: inMemoryPersistence });

/* Testing only: on localhost with ?emulator=1, use the Firebase Local
   Emulator Suite instead of the live project. Can't trigger on the
   deployed site (hostname check). */
var USE_EMULATOR = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && /[?&]emulator=1\b/.test(location.search);
if (USE_EMULATOR) {
  connectDatabaseEmulator(db, "127.0.0.1", 9000);
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectAuthEmulator(makerAuth, "http://127.0.0.1:9099", { disableWarnings: true });
}

/* Earlier versions cached the WHOLE database on every device — including
   everyone's plaintext passwords. Remove those. */
["fbsnapshot", "snapshot", "fbqueue"].forEach(function (k) {
  try { window.localStorage.removeItem(LOCAL_PREFIX + k); } catch (e) {}
});

function lsGet(k) { try { return window.localStorage.getItem(LOCAL_PREFIX + k); } catch (e) { return null; } }
function lsSet(k, v) { try { window.localStorage.setItem(LOCAL_PREFIX + k, v); } catch (e) {} }
function lsDel(k) { try { window.localStorage.removeItem(LOCAL_PREFIX + k); } catch (e) {} }

/* ---------- per-key cache + subscriptions ---------- */

var uid = null;                 // signed-in account's uid, or null
var subs = {};                  // key -> { unsub, ready: Promise, resolve, loaded }
var cache = {};                 // key -> string
var online = true, everConnected = false, lastError = null;

function snapKey() { return "fbcache:" + (uid || "public"); }
function loadSnapshot() {
  try { return JSON.parse(lsGet(snapKey()) || "{}") || {}; } catch (e) { return {}; }
}
function saveSnapshot() { lsSet(snapKey(), JSON.stringify(cache)); }

function remoteChange(key) {
  window.dispatchEvent(new CustomEvent("storage-remote-change", { detail: { keys: [key] } }));
}

function subscribe(key) {
  if (subs[key]) return subs[key].ready;
  var s = { loaded: false };
  s.ready = new Promise(function (r) { s.resolve = r; });
  subs[key] = s;
  /* Offline: fall back to this account's last-seen copy after a while. */
  var fallback = setTimeout(function () { if (!s.loaded) s.resolve(); }, OFFLINE_FALLBACK_MS);
  s.unsub = onValue(ref(db, "kv/" + key), function (snap) {
    var before = cache[key];
    var v = snap.val();
    if (v == null) delete cache[key]; else cache[key] = String(v);
    overlayQueue(key);
    saveSnapshot();
    var wasLoaded = s.loaded;
    s.loaded = true; clearTimeout(fallback); s.resolve();
    if (wasLoaded && before !== cache[key]) remoteChange(key);
  }, function (err) {
    /* Permission denied. On first load: not this account's record — treat
       as absent. Later: access was just withdrawn (deactivated elsewhere) —
       drop the cached copy and tell the app, which signs the person out. */
    lastError = err.message;
    var wasLoaded = s.loaded;
    s.loaded = true; clearTimeout(fallback); s.resolve();
    if (wasLoaded) { delete cache[key]; saveSnapshot(); remoteChange(key); }
  });
  return s.ready;
}

function unsubscribeAll(keepPublic) {
  Object.keys(subs).forEach(function (k) {
    if (keepPublic && k === "org:public") return;
    try { subs[k].unsub(); } catch (e) {}
    delete subs[k];
    delete cache[k];
  });
}

/* ---------- writes (queued, per account) ---------- */

var queue = [];
function loadQueue() { try { queue = JSON.parse(window.localStorage.getItem(QUEUE_KEY) || "[]") || []; } catch (e) { queue = []; } }
function saveQueue() { try { window.localStorage.setItem(QUEUE_KEY, JSON.stringify(queue)); } catch (e) {} }
function myQueue() { return queue.filter(function (q) { return q.uid === uid; }); }
function overlayQueue(key) {
  myQueue().forEach(function (it) {
    if (key && it.key !== key) return;
    if (it.value === null) delete cache[it.key]; else cache[it.key] = it.value;
  });
}

function send(item) {
  var p = item.value === null ? fbRemove(ref(db, "kv/" + item.key)) : fbSet(ref(db, "kv/" + item.key), item.value);
  return p.then(function () {
    queue = queue.filter(function (q) { return q.seq !== item.seq; });
    saveQueue();
    lastError = null;
  }).catch(function (err) {
    lastError = err.message;
    queue = queue.filter(function (q) { return q.seq !== item.seq; });
    saveQueue();
    console.error("Write rejected for " + item.key + ":", err);
  });
}

var seq = Date.now();
function enqueue(key, value) {
  queue = queue.filter(function (q) { return !(q.key === key && q.uid === uid); });
  var item = { key: key, value: value, seq: ++seq, uid: uid };
  queue.push(item);
  saveQueue();
  send(item);
}

/* ---------- membership ---------- */

/* who = { uid, staffId, admin, mustChange } — staffId null means "signed in
   but not an active member". Cached per account so the app opens offline. */
var who = null;
var resolveAuthReady;
var authReady = new Promise(function (r) { resolveAuthReady = r; });

function whoKey(u) { return "fbwho:" + u; }
function readNode(path) { return fbGet(ref(db, path)).then(function (s) { return s.val(); }); }

function loadWho(u) {
  return readNode("uidmap/" + u).then(function (staffId) {
    if (!staffId) return { uid: u, staffId: null, admin: false, mustChange: false };
    return Promise.all([readNode("admins/" + staffId), readNode("mustchange/" + staffId)]).then(function (r) {
      return { uid: u, staffId: staffId, admin: r[0] === true, mustChange: r[1] === true };
    });
  }).then(function (w) {
    lsSet(whoKey(u), JSON.stringify(w));
    return w;
  }, function (err) {
    /* Offline: use what this phone last knew about this account. */
    try { var c = JSON.parse(lsGet(whoKey(u)) || "null"); if (c) return c; } catch (e) {}
    throw err;
  });
}

/* Called from both onAuthStateChanged and signIn/signOut directly, since
   the observer isn't guaranteed to have run by the time signIn resolves. */
function switchUser(newUid) {
  if (newUid === uid) return;
  unsubscribeAll(true);
  uid = newUid;
  who = null;
  cache = Object.assign(loadSnapshot(), cache);     // this account's last-seen copy, for offline
  if (uid) myQueue().forEach(send);                 // this account's unsent writes from a previous session
}

loadQueue();
subscribe("org:public");

/* The database connection picks up a new sign-in asynchronously, so a
   read/write fired the instant signIn resolves can go out unauthenticated
   and be refused. Wait for the auth observer (which the database's own
   token listener rides alongside), then one more tick. */
var authWaiters = [];
function untilAuthIs(u) {
  return new Promise(function (resolve) {
    var done = function () { setTimeout(resolve, 50); };
    if (auth.currentUser && auth.currentUser.uid === u && seenUid === u) return done();
    authWaiters.push({ uid: u, resolve: done });
  });
}
var seenUid;

onAuthStateChanged(auth, function (user) {
  seenUid = user ? user.uid : null;
  authWaiters = authWaiters.filter(function (w) { if (w.uid === seenUid) { w.resolve(); return false; } return true; });
  switchUser(user ? user.uid : null);
  if (!user) { resolveAuthReady(); return; }
  if (who && who.uid === user.uid) { resolveAuthReady(); return; }
  loadWho(user.uid).then(function (w) { if (uid === w.uid) who = w; })
    .catch(function () { who = null; })
    .then(resolveAuthReady);
});

function friendlyAuthError(err) {
  var c = err && err.code || "";
  if (/invalid-credential|wrong-password|user-not-found|invalid-email|user-disabled/.test(c)) return "User ID or password is incorrect.";
  if (/too-many-requests/.test(c)) return "Too many attempts. Wait a few minutes and try again.";
  if (/network-request-failed/.test(c)) return "No connection. Check your internet and try again.";
  if (/weak-password/.test(c)) return "The password must be at least 6 characters.";
  if (/requires-recent-login/.test(c)) return "For security, sign out and sign in again, then change your password.";
  return (err && err.message) || "Something went wrong.";
}
function friendlyDbError(err) {
  if (/permission/i.test(err && (err.code || err.message) || "")) return "Not allowed. (If you're an administrator, sign out and back in, then try again.)";
  return "Couldn't save — check your connection and try again.";
}

/* "a.b" -> "a,b": "." isn't allowed in a database key. */
function loginKey(username) { return String(username || "").trim().toLowerCase().replace(/\./g, ","); }
function defaultEmail(username) { return String(username || "").trim().toLowerCase() + "@" + EMAIL_DOMAIN; }
function altEmail(username) { return String(username || "").trim().toLowerCase() + "+" + Date.now().toString(36) + "@" + EMAIL_DOMAIN; }

/* Create an account under `auth`, falling back to a "+suffix" address if
   the plain one is held by an old (replaced/abandoned) account. */
function createAccountOn(a, username, password) {
  var email = defaultEmail(username);
  return createUserWithEmailAndPassword(a, email, password).catch(function (err) {
    if (!/email-already-in-use/.test(err && err.code || "")) throw err;
    email = altEmail(username);
    return createUserWithEmailAndPassword(a, email, password);
  }).then(function (cred) {
    return { uid: cred.user.uid, email: email, isDefault: email === defaultEmail(username) };
  }, function (err) { throw new Error(friendlyAuthError(err)); });
}

window.storageAuth = {
  ready: function () { return authReady; },
  /** { uid, staffId, admin, mustChange } of the signed-in account, or null. */
  current: function () { return uid && who && who.uid === uid ? Object.assign({}, who) : null; },

  signIn: function (username, password) {
    return readNode("logins/" + loginKey(username)).catch(function () { return null; }).then(function (email) {
      return signInWithEmailAndPassword(auth, typeof email === "string" ? email : defaultEmail(username), password);
    }).then(function (cred) {
      switchUser(cred.user.uid);
      return untilAuthIs(cred.user.uid).then(function () { return loadWho(cred.user.uid); });
    }, function (err) { throw new Error(friendlyAuthError(err)); }).then(function (w) {
      who = w;
      if (!w.staffId) {
        return fbSignOut(auth).then(function () {
          switchUser(null);
          throw new Error("That account is no longer active. Ask your administrator.");
        });
      }
      return Object.assign({}, w);
    });
  },

  signOut: function () {
    lsDel(snapKey());   // shared phone: don't leave this person's records behind
    if (uid) lsDel(whoKey(uid));
    return fbSignOut(auth).then(function () { switchUser(null); });
  },

  /** Admin: create someone else's sign-in account. -> { uid, email, isDefault } */
  createAccount: function (username, password) {
    return createAccountOn(makerAuth, username, password).then(function (acc) {
      return fbSignOut(makerAuth).then(function () { return acc; });
    });
  },

  /** First-run setup: create the setup person's own account and sign in with it. */
  createOwnAccount: function (username, password) {
    return createAccountOn(auth, username, password).then(function (acc) {
      switchUser(acc.uid);
      return untilAuthIs(acc.uid).then(function () { return acc; });
    });
  },

  /** Undo createOwnAccount if setup then failed (e.g. a workplace already exists). */
  discardOwnAccount: function () {
    var u = auth.currentUser;
    return (u ? deleteUser(u).catch(function () { return fbSignOut(auth); }) : Promise.resolve())
      .then(function () { switchUser(null); });
  },

  /** Several database paths changed in ONE all-or-nothing write. Online only. */
  update: function (paths) {
    return fbUpdate(ref(db), paths).then(function () {
      Object.keys(paths).forEach(function (p) {
        if (p.indexOf("kv/") !== 0) return;
        var k = p.slice(3);
        if (paths[p] == null) delete cache[k]; else cache[k] = String(paths[p]);
      });
      saveSnapshot();
    }, function (err) { throw new Error(friendlyDbError(err)); });
  },

  /** Admin-readable records outside /kv: "mustchange", "admins", ... */
  read: function (path) { return readNode(path); },

  /** Re-reads this account's membership (after an admin changed it). */
  refresh: function () {
    if (!uid) return Promise.resolve(null);
    return loadWho(uid).then(function (w) { who = w; return Object.assign({}, w); });
  },

  /** The signed-in person sets their own password (clears the forced-change flag). */
  changeOwnPassword: function (password) {
    var u = auth.currentUser;
    if (!u || !who || !who.staffId) return Promise.reject(new Error("Sign in first."));
    return updatePassword(u, password).catch(function (err) { throw new Error(friendlyAuthError(err)); })
      .then(function () { return fbRemove(ref(db, "mustchange/" + who.staffId)); })
      .then(function () { who.mustChange = false; lsSet(whoKey(uid), JSON.stringify(who)); });
  },

  loginKey: loginKey,
  defaultEmail: defaultEmail
};

/* ---------- connection state ---------- */

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
    var wait = key === "org:public" ? subscribe(key) : authReady.then(function () { return subscribe(key); });
    return wait.then(function () {
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
    return Promise.resolve({ keys: shared ? Object.keys(cache).filter(function (k) { return k.indexOf(p) === 0; }) : [], prefix: p, shared: !!shared });
  }
};

window.STORAGE_MODE = "firebase";

/* Fresh read of every key this device is following (Refresh button, and
   before admin edits to the staff list). */
window.storageSync = function () {
  return Promise.all(Object.keys(subs).map(function (k) {
    return fbGet(ref(db, "kv/" + k)).then(function (snap) {
      var v = snap.val();
      if (v == null) delete cache[k]; else cache[k] = String(v);
      overlayQueue(k);
    }).catch(function () {});
  })).then(saveSnapshot);
};

window.storageStatus = function () {
  return { online: online, pending: myQueue().length, error: lastError, keys: Object.keys(cache).length };
};
