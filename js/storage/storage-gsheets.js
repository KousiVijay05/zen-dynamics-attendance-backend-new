/* ---------------------------------------------------------------
   Google Sheets storage adapter.

   Use this INSTEAD of storage-local.js. In index.html change:
       <script src="js/storage/storage-local.js"></script>
   to:
       <script src="js/storage/storage-gsheets.js"></script>

   Fill in the two settings below, then see
   google-apps-script/README-google-sheets.md.

   How it behaves (unchanged from the original storage-gsheets.js):
   - Shared data (roster, config, punch logs) lives in your Sheet.
   - Everything is pulled into memory once at startup, so the app
     stays fast; reads never hit the network.
   - Writes update memory immediately and are sent in the background.
     If the network drops, they queue in localStorage and go out when
     it comes back, so a punch is never lost.
   - Other devices' changes arrive on a poll every few seconds and
     whenever the app regains focus.
   - device:last (which staff member this phone signed in as) stays
     local and is never sent.

   SECURITY NOTE (read this before you deploy):
   WEB_APP_URL and SECRET below ship inside this file's source, which
   is downloaded to every visitor's browser. Anyone who views page
   source gets both and can call the Apps Script endpoint directly —
   bypassing the app's sign-in screen entirely, since usernames and
   passwords only gate the UI, not this data layer. That is a property
   of any purely static front end talking to a shared-secret backend; no amount of
   minifying or hiding this file changes it. Two things you *can* do:
     1. Treat SECRET as a rotate-if-leaked credential, not a real
        password — change it in both this file and Code.gs if you
        ever suspect it's been shared.
     2. Don't publish the deployed app's source publicly (private
        repo / unlisted hosting) if that matters for your workplace;
        it raises the bar without being a real access control.
   See CHANGES.md / the security section of README.md for the fuller
   writeup and what Code.gs now does to reduce blast radius.
----------------------------------------------------------------*/
(function () {
  "use strict";

  /* ============ SETTINGS — edit these two ============ */

  var WEB_APP_URL = "https://script.google.com/macros/s/AKfycbw2KaetubZ5a4k2fA-H6kCdmHAZugDCMzkdVaj4ftZDPo_Tt-sg4C_62S-d2eH_cJFXww/exec";
  var SECRET = "scFJnv_q9aCIHR6uBCjRWfvke8HlAQ20";          // must match SECRET in Code.gs

  /* How often each device checks the Sheet for other devices' changes.
     Google gives a free account roughly 90 minutes of Apps Script runtime
     a day across all users, so don't set this low. 60 is a sane default;
     0 turns background polling off entirely and the app then refreshes
     when you open it, when it regains focus, and when you tap Refresh. */
  var POLL_SECONDS = 60;

  /* =================================================== */

  var LOCAL_PREFIX = "attendance.v1.";
  var QUEUE_KEY = LOCAL_PREFIX + "queue";

  var cache = {};          // shared key -> string value
  var queue = [];          // [{ key, value }] waiting to reach the Sheet
  var online = true;
  var lastError = null;

  /* ---------- local helpers ---------- */

  function lsGet(k) { try { return window.localStorage.getItem(LOCAL_PREFIX + k); } catch (e) { return null; } }
  function lsSet(k, v) { try { window.localStorage.setItem(LOCAL_PREFIX + k, v); } catch (e) {} }
  function lsDel(k) { try { window.localStorage.removeItem(LOCAL_PREFIX + k); } catch (e) {} }

  function loadQueue() {
    try { queue = JSON.parse(window.localStorage.getItem(QUEUE_KEY) || "[]") || []; }
    catch (e) { queue = []; }
  }
  function saveQueue() {
    try { window.localStorage.setItem(QUEUE_KEY, JSON.stringify(queue)); } catch (e) {}
  }

  /* ---------- transport ---------- */

  function call(payload) {
    if (!WEB_APP_URL || WEB_APP_URL.indexOf("PASTE_") === 0) {
      return Promise.reject(new Error("WEB_APP_URL is not set in js/storage/storage-gsheets.js"));
    }
    payload.token = SECRET;
    return fetch(WEB_APP_URL, {
      method: "POST",
      /* text/plain keeps this a "simple" request, which avoids a CORS
         preflight that Apps Script cannot answer. */
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
      redirect: "follow"
    }).then(function (r) {
      return r.text();
    }).then(function (t) {
      var d;
      try { d = JSON.parse(t); }
      catch (e) { throw new Error("Unexpected reply from the Sheet. Is the web app deployed to Anyone?"); }
      if (!d.ok) throw new Error(d.error || "Request refused");
      return d;
    });
  }

  /* ---------- sync ---------- */

  function pull() {
    return call({ action: "all" }).then(function (d) {
      cache = d.kv || {};
      /* anything still queued is newer than what the Sheet returned */
      queue.forEach(function (it) { cache[it.key] = it.value; });
      online = true; lastError = null;
      return cache;
    }).catch(function (err) {
      online = false; lastError = err.message;
      /* fall back to the last copy we saw, so the app still opens */
      var snap = lsGet("snapshot");
      if (snap && !Object.keys(cache).length) {
        try { cache = JSON.parse(snap) || {}; } catch (e) {}
      }
      return cache;
    });
  }

  var flushing = false, retryIn = 0, retryTimer = null;
  function scheduleRetry() {
    if (retryTimer) return;
    retryIn = retryIn ? Math.min(retryIn * 2, 30000) : 3000;
    retryTimer = setTimeout(function () { retryTimer = null; flush(); }, retryIn);
  }
  function flush() {
    if (flushing || !queue.length) return Promise.resolve();
    flushing = true;
    var batch = queue.slice(0, 25);
    return call({ action: "setMany", items: batch }).then(function () {
      queue = queue.slice(batch.length);
      saveQueue();
      online = true; lastError = null; retryIn = 0;
      lsSet("snapshot", JSON.stringify(cache));
    }).catch(function (err) {
      online = false; lastError = err.message;
      scheduleRetry();
    }).then(function () {
      flushing = false;
      if (queue.length && online) return flush();
    });
  }

  function enqueue(key, value) {
    for (var i = queue.length - 1; i >= 0; i--) {
      if (queue[i].key === key) { queue.splice(i, 1); }   // keep only the newest write per key
    }
    queue.push({ key: key, value: value });
    saveQueue();
    flush();
  }

  /* ---------- boot ---------- */

  loadQueue();
  var ready = pull().then(function () {
    lsSet("snapshot", JSON.stringify(cache));
    return flush();
  });

  if (POLL_SECONDS > 0) {
    setInterval(function () {
      if (document.hidden) return;
      pull().then(flush);
    }, Math.max(20, POLL_SECONDS) * 1000);
  }

  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) pull().then(flush);
  });
  window.addEventListener("online", function () { pull().then(flush); });

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
      lsSet("snapshot", JSON.stringify(cache));
      enqueue(key, String(value));
      return Promise.resolve({ key: key, value: value, shared: true });
    },

    delete: function (key, shared) {
      if (!shared) { lsDel("private." + key); return Promise.resolve({ key: key, deleted: true, shared: false }); }
      delete cache[key];
      enqueue(key, "null");
      return Promise.resolve({ key: key, deleted: true, shared: true });
    },

    list: function (prefix, shared) {
      var p = prefix || "";
      if (!shared) return Promise.resolve({ keys: [], prefix: p, shared: false });
      return ready.then(function () {
        return {
          keys: Object.keys(cache).filter(function (k) { return k.indexOf(p) === 0; }),
          prefix: p, shared: true
        };
      });
    }
  };

  window.STORAGE_MODE = "googleSheets";
  /* The app's Refresh button calls this to pull straight from the Sheet. */
  window.storageSync = function () { return pull().then(flush); };
  window.storageStatus = function () {
    return { online: online, pending: queue.length, error: lastError, keys: Object.keys(cache).length };
  };
})();
