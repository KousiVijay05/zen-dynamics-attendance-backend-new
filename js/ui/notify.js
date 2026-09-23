/* ---------------------------------------------------------------
   User-facing status messages.

   Ported from say()/sayAndPaint() in the original app.js. say()
   patches only the .msg node in place (when one exists on screen)
   so a validation error doesn't wipe out whatever else the person
   was mid-typing in the same form; sayAndPaint() is for the rarer
   case where the message needs a full re-render regardless.
----------------------------------------------------------------*/

import { state, emitChange } from "../core/store.js";

export function say(m, ok) {
  state.msg = m; state.msgOk = !!ok;
  var root = document.getElementById("root");
  var n = root && root.querySelector(".msg");
  if (n) { n.textContent = m; n.className = "msg" + (ok ? " ok" : ""); }
  else emitChange();
}

export function sayAndPaint(m, ok) {
  state.msg = m; state.msgOk = !!ok;
  emitChange();
}
