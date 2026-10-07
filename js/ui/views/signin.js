/* Sign-in screen: username + password. No staff names are listed here —
   anyone with the link could otherwise see who works here before
   signing in at all. */
import { state } from "../../core/store.js";
import { esc } from "../../utils/format.js";
import { inZone, distanceNow } from "../../domain/geofence.js";
import { proxBlock, lockedBlock } from "../components/proximity.js";
import { icons } from "../components/icons.js";

function hero() {
  return '<div class="sign-hero">' +
    '<img src="icons/mark.png" alt="Zen & Dynamics" width="76" height="76" />' +
    '<div class="org">' + esc(state.cfg.org) + "</div>" +
    '<div class="date">' + new Date().toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" }) + "</div>" +
  "</div>";
}

var FOOT = '<p class="sign-foot">' + icons.lock + "Your password is private — nobody else can see it.</p>";

export function vSignin() {
  var locked = state.cfg.lockOutside && !inZone();
  if (locked && !state.adminOnly) {
    var d = distanceNow();
    return hero() +
      '<div class="sign-card">' + proxBlock() + lockedBlock(d, false) + "</div>" +
      (state.cfg.adminAnywhere ? '<div style="text-align:center" class="sign-below"><button class="linkish" data-act="adminonly">Administrator sign-in</button></div>' : "");
  }

  return hero() +
    '<div class="sign-card">' +
      (locked ? proxBlock() : "") +
      "<h1>" + (state.adminOnly ? "Administrator sign-in" : "Welcome back") + "</h1>" +
      '<p class="lede">Sign in with your user ID and password.</p>' +
      '<div class="field"><label for="li_user">User ID</label><input id="li_user" type="text" autocapitalize="none" autocorrect="off" spellcheck="false" autocomplete="username" placeholder="e.g. madhan" /></div>' +
      '<div class="field"><label for="li_pass">Password</label><input id="li_pass" type="password" autocomplete="current-password" placeholder="••••••••" /></div>' +
      '<div class="btnrow"><button class="btn go wide" data-act="credlogin">Sign in</button></div>' +
      '<p class="msg">' + esc(state.msg) + "</p>" +
    "</div>" +
    (state.adminOnly ? '<div style="text-align:center" class="sign-below"><button class="linkish" data-act="alluser">Back</button></div>' : "") +
    FOOT;
}
