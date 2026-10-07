/* First-run workplace setup. */
import { state } from "../../core/store.js";
import { esc } from "../../utils/format.js";

export function vSetup() {
  return '<div class="sign-hero">' +
      '<img src="icons/mark.png" alt="Zen & Dynamics" width="76" height="76" />' +
      '<div class="org">Set up attendance</div>' +
      '<div class="date">One-time setup · you\'ll be the first administrator</div>' +
    "</div>" +
    '<div class="sign-card">' +
      "<h3>Your workplace</h3>" +
      '<div class="field"><label for="f_org">Workplace name</label><input id="f_org" type="text" placeholder="e.g. Riverside Clinic" /></div>' +
      '<div class="field"><label for="f_nm">Your name</label><input id="f_nm" type="text" placeholder="Full name" /></div>' +
      '<div class="field"><label for="f_user">Choose a user ID</label><input id="f_user" type="text" autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="e.g. admin" /></div>' +
      '<div class="field"><label for="f_pass">Choose a password</label><input id="f_pass" type="password" autocomplete="new-password" placeholder="At least 6 characters" /></div>' +
    "</div>" +
    '<div class="card">' +
      "<h3>Where staff clock in</h3>" +
      '<div class="field"><label>Site coordinates</label><div class="pair">' +
      '<input id="f_lat" class="num" type="text" inputmode="decimal" placeholder="Latitude" />' +
      '<input id="f_lng" class="num" type="text" inputmode="decimal" placeholder="Longitude" /></div></div>' +
      '<div class="btnrow"><button class="btn" data-act="usehere">Use my current location</button></div>' +
      '<div class="field"><label for="f_rad">Allowed distance (metres)</label><input id="f_rad" class="num" type="number" value="100" min="10" max="2000" step="10" /></div>' +
    "</div>" +
    '<div class="btnrow"><button class="btn go wide" data-act="createorg">Create workplace</button></div>' +
    '<p class="msg' + (state.msgOk ? " ok" : "") + '">' + esc(state.msg) + "</p>" +
    '<p class="note">Payroll rules, leave allowance and late cut-offs are set afterwards in Admin → Payroll.</p>';
}
