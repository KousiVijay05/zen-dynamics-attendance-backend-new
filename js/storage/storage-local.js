/* ---------------------------------------------------------------
   Storage adapter — localStorage fallback.

   Ported verbatim from the original storage.js. Kept as a plain,
   non-module script (not an ES import) on purpose: the deployment
   model this app documents is "swap one <script src> line for
   another to switch backends" (see index.html and
   google-apps-script/README-google-sheets.md), and changing that
   contract would break that documented swap. app.js reads the
   result through js/storage/storage-api.js.

   The app talks to window.storage with four async methods:
     get(key, shared)    -> { key, value, shared }   (rejects if absent)
     set(key, value, shared) -> { key, value, shared }
     delete(key, shared) -> { key, deleted, shared }
     list(prefix, shared) -> { keys, prefix, shared }

   Values are strings (the app JSON-encodes them itself).

   IMPORTANT: localStorage is per-browser. Each phone keeps its own
   copy, so an administrator will NOT see punches made on someone
   else's device unless storage-gsheets.js is wired up instead — see
   google-apps-script/README-google-sheets.md.
----------------------------------------------------------------*/
(function () {
  "use strict";

  if (window.storage) { window.STORAGE_MODE = "host"; return; }

  var NS = "attendance.v1.";
  function k(key, shared) { return NS + (shared ? "shared." : "private.") + key; }

  function ok(v) { return Promise.resolve(v); }

  window.storage = {
    get: function (key, shared) {
      var v;
      try { v = window.localStorage.getItem(k(key, shared)); }
      catch (e) { return Promise.reject(e); }
      if (v === null) return Promise.reject(new Error("Key not found: " + key));
      return ok({ key: key, value: v, shared: !!shared });
    },

    set: function (key, value, shared) {
      try { window.localStorage.setItem(k(key, shared), String(value)); }
      catch (e) { return Promise.reject(e); }
      return ok({ key: key, value: value, shared: !!shared });
    },

    delete: function (key, shared) {
      try { window.localStorage.removeItem(k(key, shared)); }
      catch (e) { return Promise.reject(e); }
      return ok({ key: key, deleted: true, shared: !!shared });
    },

    list: function (prefix, shared) {
      var want = k(prefix || "", shared), out = [];
      try {
        for (var i = 0; i < window.localStorage.length; i++) {
          var full = window.localStorage.key(i);
          if (full && full.indexOf(want) === 0) out.push(full.slice(NS.length + (shared ? 7 : 8)));
        }
      } catch (e) { return Promise.reject(e); }
      return ok({ keys: out, prefix: prefix, shared: !!shared });
    }
  };

  window.STORAGE_MODE = "localStorage";
})();
