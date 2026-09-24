/* ---------------------------------------------------------------
   Render dispatcher. Ported from paint() in the original app.js,
   with one addition: a try/catch error boundary. The original had
   no protection against an exception inside a view function — that
   left <div id="root"> blank with no way back in. Here, any render
   failure falls back to a small recovery screen instead (see
   errorScreen() below) so the app never goes fully blank.
----------------------------------------------------------------*/

import { state } from "../core/store.js";
import { vSetup } from "./views/setup.js";
import { vRecover } from "./views/recover.js";
import { vSignin } from "./views/signin.js";
import { vChangePw } from "./views/changepw.js";
import { vStaff } from "./views/staff.js";
import { vAdmin } from "./views/admin/index.js";
import { syncBanner } from "./components/syncStatus.js";
import { brandMark } from "./components/brand.js";

export function render() {
  var root = document.getElementById("root");
  if (!root) return;
  var html;
  try {
    if (state.fatal) { html = errorScreen(state.fatal); root.innerHTML = html; return; }
    html = view();
    if (state.view === "staff" || state.view === "admin" || state.view === "signin" || state.view === "changepw") html = syncBanner() + html;
  } catch (err) {
    console.error("Render failed:", err);
    state.fatal = err;
    html = errorScreen(err);
  }
  root.innerHTML = html;
}

function view() {
  if (state.view === "setup") return vSetup();
  if (state.view === "recover") return vRecover();
  if (state.view === "signin") return vSignin();
  if (state.view === "changepw") return vChangePw();
  if (state.view === "staff") return vStaff();
  if (state.view === "admin") return vAdmin();
  return '<div class="splash"><img src="icons/mark.png" width="72" height="72" alt="Zen & Dynamics" /><span>Loading…</span></div>';
}

function errorScreen(err) {
  return '<div class="bar"><div class="idn">' + brandMark() + '<div><div class="nm">Something went wrong</div>' +
    '<div class="sub">The screen couldn\'t be drawn</div></div></div></div>' +
    '<div class="clock locked"><div class="read">Error</div><div class="cap">' +
    (err && err.message ? String(err.message).replace(/[&<>"]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]; }) : "Unknown error") +
    "</div></div>" +
    '<div class="btnrow"><button class="btn wide" data-act="recoverreload">Reload</button></div>' +
    '<p class="note">Your data is safe — this only affects what\'s drawn on screen right now. Reloading almost always fixes it; if it keeps happening, tell whoever manages this app what you were doing when it appeared.</p>';
}
