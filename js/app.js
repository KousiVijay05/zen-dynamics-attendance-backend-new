/* ---------------------------------------------------------------
   App bootstrap:
   - subscribes render() to state changes
   - registers the click/change delegation
   - boot: read the public workplace record (name + site, for the
     sign-in screen), then resume a remembered sign-in or show the
     sign-in screen

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
import { enterAs, signOut } from "./domain/auth.js";
import { loadLeaves } from "./domain/leave.js";
import { watchTicks } from "./domain/clients.js";
import { userIsTyping } from "./ui/dom.js";
import { warmUpReportImage } from "./ui/reportImage.js";

onChange(render);
onChange(function () { if (state.view === "admin") warmUpReportImage(); });
initEvents();
render(); // show the loading skeleton immediately

function boot() {
  /* No storage backend loaded at all (e.g. the Firebase SDK couldn't be
     fetched on a first open with no signal). storage-api.js would quietly
     fall back to an empty in-memory store, which reads as "no workplace
     exists" and lands on the setup screen. Stop with a clear error instead. */
  if (!window.storage || !window.storageAuth) {
    return Promise.reject(new Error("Couldn't reach the attendance server. Check your internet connection and reload."));
  }
  return sget("org:public", true).then(function (pub) {
    if (!pub) {
      /* Safe even if this is a stale/failed read: the server refuses to
         create a workplace when one already exists. */
      state.view = "setup"; emitChange(); startWatch();
      return;
    }
    state.cfg = withConfigDefaults(pub);
    return window.storageAuth.ready().then(function () {
      var who = window.storageAuth.current();
      if (who) return enterAs(who);
      state.view = "signin"; emitChange(); startWatch(); startTick();
    });
  });
}

boot().catch(function (err) {
  console.error("Boot failed:", err);
  state.fatal = err;
  emitChange();
});

/* ---------- live updates from other devices ----------
   storage-firebase.js fires this when another device's save lands on a key
   this device is following. Pull it into app state so open screens (admin
   On site / Records / People / Leave, a staff dashboard) show it within a
   second. Never re-render under someone mid-typing — that would wipe the
   field (see userIsTyping in ui/dom.js); catch up on blur. */
var redrawPending = false;

window.addEventListener("storage-remote-change", function (ev) {
  if (!state.cfg) return;   // still on setup/boot — nothing loaded to refresh
  var keys = ev.detail.keys;
  var jobs = keys.map(function (k) {
    var leave = /^leave(?:dec)?:(.+)$/.exec(k);
    if (leave) return loadLeaves(leave[1]);
    return sget(k, true).then(function (v) {
      if (k === "org:config") { if (v) state.cfg = withConfigDefaults(v); }
      else if (k === "org:public") { if (v && !state.me) state.cfg = withConfigDefaults(Object.assign({}, state.cfg, v)); }
      else if (k === "org:roster") { if (Array.isArray(v)) applyRoster(v); }
      else if (k === "cl:roster") { state.clients = Array.isArray(v) ? v : []; watchTicks(); }
      else if (k === "cl:private") { state.clientPriv = v || {}; }
      else if (k.indexOf("cl:pay:") === 0) { state.clPays[k] = Array.isArray(v) ? v : []; }
      else if (state.me && k === "profile:" + state.me.id) applyProfile(v);
      else if (k in state.logs) state.logs[k] = v || [];
    });
  });
  Promise.all(jobs).then(redraw);
});

function applyRoster(roster) {
  state.roster = roster;
  if (!state.me) return;
  var me = roster.filter(function (p) { return p.id === state.me.id; })[0];
  if (me) applyProfile(me);
}

/* This person's own record changed (shifts, tasks, deactivated...). The
   admin flag comes from the signed sign-in claim, never the record. */
function applyProfile(me) {
  /* Access withdrawn while signed in: either turned off, or a new temporary
     password was issued (which replaces the sign-in). Say so neutrally. */
  if (!me || me.active === false) {
    signOut(me && me.active === false
      ? "That account is no longer active. Ask your administrator."
      : "You've been signed out. Sign in again — if your password was just reset, use the new one your administrator gave you.");
    return;
  }
  me.admin = state.me.admin;
  state.me = me;
  state.roster = state.roster.map(function (p) { return p.id === me.id ? me : p; });
}

function redraw() {
  if (userIsTyping()) { redrawPending = true; return; }
  redrawPending = false;
  emitChange();
}

document.addEventListener("focusout", function () {
  if (redrawPending) setTimeout(redraw, 0);   // after focus has actually moved
});
