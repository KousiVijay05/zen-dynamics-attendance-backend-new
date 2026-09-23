/* ---------------------------------------------------------------
   Thin wrapper around window.storage (set by storage-local.js or
   storage-gsheets.js — see index.html). Ported verbatim from the
   top of the original app.js.

   Adds:
   - an in-memory fallback (`mem`) so the app still works for the
     current tab even if no storage backend loaded at all
   - one retry with a short delay before giving up on a write, so a
     transient hiccup doesn't need to bubble all the way to the UI
----------------------------------------------------------------*/

var mem = {};
var storeFailed = false;

function store() { return storeFailed ? null : (window.storage || null); }

/** Read key `k` (shared = org-wide vs device-private), JSON-decoded. */
export function sget(k, shared) {
  var st = store();
  if (!st) return Promise.resolve(mem[k] === undefined ? null : mem[k]);
  return st.get(k, !!shared).then(function (r) {
    return r && r.value !== undefined ? JSON.parse(r.value) : null;
  }).catch(function () { return null; });
}

/** Write key `k` = JSON-encoded `v`. Always updates the local mirror first. */
export function sset(k, v, shared) {
  var st = store();
  mem[k] = v;
  if (!st) return Promise.resolve();
  var body = JSON.stringify(v);
  return st.set(k, body, !!shared).catch(function () {
    return new Promise(function (r) { setTimeout(r, 400); })
      .then(function () { return st.set(k, body, !!shared); })
      .catch(function () { storeFailed = true; });
  });
}

/** True once no backend could be reached even after the retry above. */
export function storageIsDown() { return storeFailed; }

/** True when there's no storage backend at all (yet, or it's given up) — used only for the Settings-tab footnote. */
export function noBackend() { return !store(); }
