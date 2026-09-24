/* Forced password change: shown after a successful login when the
   account still has a temporary password (first login, or an admin
   just reset it). Can't be skipped — there's no way back to the app
   without setting a new password here. */
import { state } from "../../core/store.js";
import { esc } from "../../utils/format.js";
import { brandMark } from "../components/brand.js";

export function vChangePw() {
  var p = state.roster.filter(function (x) { return x.id === state.changePwFor; })[0];

  if (!p) {
    return '<div class="clock locked"><div class="read">Something went wrong</div>' +
      '<div class="cap">That account could not be found.</div></div>' +
      '<div class="btnrow"><button class="btn wide" data-act="back">Back to sign in</button></div>';
  }

  return '<div class="bar"><div class="idn">' + brandMark() + '<div><div class="nm">' + esc(p.name) + '</div>' +
    '<div class="sub">Choose a new password</div></div></div></div>' +
    '<p class="lede">This is your first sign-in, or your password was just reset. Pick a new password only you know — your administrator can still see it if you ever need it looked up.</p>' +
    '<div class="field"><label for="cp_pass">New password</label><input id="cp_pass" type="password" autocomplete="new-password" /></div>' +
    '<div class="field"><label for="cp_confirm">Confirm password</label><input id="cp_confirm" type="password" autocomplete="new-password" /></div>' +
    '<div class="btnrow"><button class="btn go wide" data-act="changepw">Set password</button></div>' +
    '<p class="msg' + (state.msgOk ? " ok" : "") + '">' + esc(state.msg) + "</p>";
}
