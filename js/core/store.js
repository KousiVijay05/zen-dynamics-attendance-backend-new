/* ---------------------------------------------------------------
   Central app state + a tiny change-notification hook.

   This replaces the single closure-local `A` (and module-local
   `geo` / `leftAt` / `watching` / `ticking`) from the original
   app.js with one mutable object other modules import directly.
   The shape and every field name is unchanged from the original,
   so nothing about how views read `A.foo` needed to change.

   Why not a bigger state-management library: the original app is
   a single synchronous re-render on every change (`paint()`), and
   that model works fine at this size. Introducing anything heavier
   would be a rewrite of working behavior, which the brief asked us
   not to do. Modules that mutate state call `emitChange()`; app.js
   is the only thing that subscribes, with `render()`. This keeps
   domain modules free of any dependency on the UI layer.
----------------------------------------------------------------*/

import { ymKey } from "../utils/format.js";

export var state = {
  view: "boot", cfg: null, roster: [], me: null,
  tab: "onsite", paySub: "rules",
  pinFor: null, pinBuf: "", msg: "", msgOk: false,
  logs: {}, adminLoaded: false,
  period: "week", month: ymKey(Date.now()), recPerson: "all",
  editId: null, editShiftId: null, adminOnly: false,
  /* fatal boot/render error, shown by the error-boundary view instead of a blank screen */
  fatal: null
};

/** device geolocation snapshot, updated by domain/geofence.js */
export var geo = { ok: false, lat: 0, lng: 0, acc: 0, err: null };

/** geofence timers/flags — module-level in the original, kept together here */
export var fenceState = { leftAt: null, watching: false, ticking: false };

var listeners = [];

/** app.js subscribes its render() here; nothing else should need to. */
export function onChange(fn) { listeners.push(fn); }

/** Domain modules call this after mutating `state` so the UI re-renders. */
export function emitChange() {
  for (var i = 0; i < listeners.length; i++) {
    try { listeners[i](); } catch (e) { /* one bad listener shouldn't break the others */ console.error(e); }
  }
}
