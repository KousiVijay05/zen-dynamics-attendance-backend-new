/* Forced password change: shown after a successful login when the
   account still has a temporary password (first login, or an admin
   just reset it). Can't be skipped — there's no way back to the app
   without setting a new password here. */
import { state } from "../../core/store.js";
import { esc } from "../../utils/format.js";
import { icons } from "../components/icons.js";

export function vChangePw() {
  var p = state.roster.filter(function (x) { return x.id === state.changePwFor; })[0];

  if (!p) {
    return '<div class="clock locked" style="margin-top:24px"><div class="read">Something went wrong</div>' +
      '<div class="cap">That account could not be found.</div></div>' +
      '<div class="btnrow"><button class="btn wide" data-act="back">Back to sign in</button></div>';
  }

  return '<div class="sign-hero">' +
      '<img src="icons/mark.png" alt="Zen & Dynamics" width="76" height="76" />' +
      '<div class="org">Hi, ' + esc(p.name.split(" ")[0]) + "</div>" +
      '<div class="date">One last step</div>' +
    "</div>" +
    '<div class="sign-card">' +
      "<h1>Choose a new password</h1>" +
      '<p class="lede">Pick a password only you know. It\'s stored encrypted, so nobody else — not even your administrator — can see it.</p>' +
      '<div class="field"><label for="cp_pass">New password</label><input id="cp_pass" type="password" autocomplete="new-password" placeholder="At least 6 characters" /></div>' +
      '<div class="field"><label for="cp_confirm">Confirm password</label><input id="cp_confirm" type="password" autocomplete="new-password" placeholder="Type it again" /></div>' +
      '<div class="btnrow"><button class="btn go wide" data-act="changepw">Set password</button></div>' +
      '<p class="msg' + (state.msgOk ? " ok" : "") + '">' + esc(state.msg) + "</p>" +
    "</div>" +
    '<div style="text-align:center" class="sign-below"><button class="linkish" data-act="back">Cancel and sign out</button></div>' +
    '<p class="sign-foot">' + icons.lock + "Forgot it later? Your administrator can give you a temporary one.</p>";
}
