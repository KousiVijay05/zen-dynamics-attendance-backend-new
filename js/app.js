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
import { signIn } from "./domain/auth.js";
import { loadLog } from "./domain/attendance.js";

onChange(render);
initEvents();
render(); // show the loading skeleton immediately

function boot() {
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
