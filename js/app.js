/* ---------------------------------------------------------------
   App bootstrap. Ported from the "boot" section at the bottom of
   the original app.js, wired to the modularized pieces:
   - subscribes render() to state changes
   - registers the click/change delegation
   - runs the original boot sequence: load config/roster/device,
     decide which screen to land on, prime location if needed

   Loaded from index.html as <script type="module" src="js/app.js">.
   A top-level try/catch keeps a genuinely unexpected boot failure
   (e.g. a storage backend that throws synchronously) from leaving
   a blank page — see also js/ui/render.js's per-render error
   boundary, which covers failures after boot.
----------------------------------------------------------------*/

import { state, onChange, emitChange } from "./core/store.js";
import { withConfigDefaults } from "./core/config.js";
import { sget } from "./storage/storage-api.js";
import { render } from "./ui/render.js";
import { initEvents } from "./events/handlers.js";
import { startWatch, startTick } from "./domain/geofence.js";
import { signIn, signOut } from "./domain/auth.js";
import { loadLog } from "./domain/attendance.js";
import { userIsTyping } from "./ui/dom.js";

onChange(render);
initEvents();
render(); // show the loading skeleton immediately

function boot() {
  /* No storage backend loaded at all (e.g. the Firebase SDK couldn't be
     fetched on a first open with no signal). storage-api.js would quietly
     fall back to an empty in-memory store, which reads as "no workplace
     exists" and lands on the setup screen — the exact path behind a past
     overwrite incident. Stop with a clear error instead. */
  if (!window.storage) {
    return Promise.reject(new Error("Couldn't reach the attendance server. Check your internet connection and reload."));
  }
  return Promise.all([sget("org:config", true), sget("org:roster", true), sget("device:last", false)])
    .then(function (r) {
      state.cfg = withConfigDefaults(r[0]);
      state.roster = r[1] || [];

      if (!state.cfg) {
        state.view = "setup"; emitChange(); startWatch();
        return;
      }

      var hasAdmin = state.roster.some(function (p) { return p.admin && p.active !== false; });
      if (!hasAdmin) {
        state.view = "recover"; emitChange(); startWatch();
        return;
      }

      var last = r[2] && r[2].id ? state.roster.filter(function (p) { return p.id === r[2].id && p.active !== false; })[0] : null;
      if (last) return signIn(last);

      state.view = "signin"; emitChange(); startWatch(); startTick();
      return Promise.all(state.roster.map(function (p) { return loadLog(p.id, Date.now()); })).then(emitChange);
    });
}

boot().catch(function (err) {
  console.error("Boot failed:", err);
  state.fatal = err;
  emitChange();
});

/* ---------- live updates from other devices ----------
   storage-firebase.js fires this when another device's save lands. Pull the
   changed keys into app state so open screens (admin On site / Records /
   People, a staff dashboard) show it within a second instead of after a
   Refresh tap or reload. Never re-render under someone mid-typing — that
   would wipe the field (see userIsTyping in ui/dom.js); catch up on blur. */
var redrawPending = false;

window.addEventListener("storage-remote-change", function (ev) {
  if (!state.cfg) return;   // still on setup/boot — nothing loaded to refresh
  var keys = ev.detail.keys;
  var jobs = keys.map(function (k) {
    return sget(k, true).then(function (v) {
      if (k === "org:config") { if (v) state.cfg = withConfigDefaults(v); }
      else if (k === "org:roster") { if (Array.isArray(v)) applyRoster(v); }
      else if (k in state.logs) state.logs[k] = v || [];
    });
  });
  Promise.all(jobs).then(redraw);
});

function applyRoster(roster) {
  state.roster = roster;
  if (!state.me) return;
  var me = roster.filter(function (p) { return p.id === state.me.id; })[0];
  if (!me || me.active === false) { signOut(); return; }   // deactivated or removed elsewhere
  state.me = me;
}

function redraw() {
  if (userIsTyping()) { redrawPending = true; return; }
  redrawPending = false;
  emitChange();
}

document.addEventListener("focusout", function () {
  if (redrawPending) setTimeout(redraw, 0);   // after focus has actually moved
});
