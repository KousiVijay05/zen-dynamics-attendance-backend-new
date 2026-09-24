/* Sign-in screen: username + password. No staff names are listed here —
   anyone with the link could otherwise see who works here before
   signing in at all. */
import { state } from "../../core/store.js";
import { esc } from "../../utils/format.js";
import { inZone, distanceNow } from "../../domain/geofence.js";
import { proxBlock, lockedBlock } from "../components/proximity.js";
import { brandMark } from "../components/brand.js";

export function vSignin() {
  var head = '<div class="bar"><div class="idn">' + brandMark() + '<div><div class="nm">' + esc(state.cfg.org) + "</div>" +
    '<div class="sub">' + new Date().toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" }) + "</div></div></div></div>";

  var locked = state.cfg.lockOutside && !inZone();
  if (locked && !state.adminOnly) {
    var d = distanceNow();
    return head + proxBlock() + lockedBlock(d, false) +
      (state.cfg.adminAnywhere ? '<div style="text-align:center"><button class="linkish" data-act="adminonly">Administrator sign-in</button></div>' : "");
  }

  return head + (locked ? proxBlock() : "") +
    "<h2>Sign in</h2>" +
    '<div class="field"><label for="li_user">User ID</label><input id="li_user" type="text" autocapitalize="none" autocorrect="off" spellcheck="false" autocomplete="username" /></div>' +
    '<div class="field"><label for="li_pass">Password</label><input id="li_pass" type="password" autocomplete="current-password" /></div>' +
    '<div class="btnrow"><button class="btn go wide" data-act="credlogin">Sign in</button></div>' +
    (state.adminOnly ? '<div style="text-align:center"><button class="linkish" data-act="alluser">Back</button></div>' : "") +
    '<div style="text-align:center"><button class="linkish" data-act="recover">Recover administrator access</button></div>' +
    '<p class="msg">' + esc(state.msg) + "</p>";
}
