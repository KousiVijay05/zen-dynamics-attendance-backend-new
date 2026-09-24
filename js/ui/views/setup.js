/* First-run workplace setup. Ported verbatim from vSetup() in the original app.js. */
import { state } from "../../core/store.js";
import { esc } from "../../utils/format.js";
import { brandHero } from "../components/brand.js";

export function vSetup() {
  return brandHero() +
    '<h1>Set up attendance</h1><p class="lede">One-time setup. You\'ll be the first administrator.</p>' +
    '<div class="field"><label for="f_org">Workplace name</label><input id="f_org" type="text" placeholder="e.g. Riverside Clinic" /></div>' +
    '<div class="field"><label for="f_nm">Your name</label><input id="f_nm" type="text" placeholder="Full name" /></div>' +
    '<div class="field"><label for="f_user">Choose a user ID</label><input id="f_user" type="text" autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="e.g. admin" /></div>' +
    '<div class="field"><label for="f_pass">Choose a password</label><input id="f_pass" type="password" autocomplete="new-password" placeholder="At least 4 characters" /></div>' +
    '<h2>Where staff clock in</h2>' +
    '<div class="field"><label>Site coordinates</label><div class="pair">' +
    '<input id="f_lat" class="num" type="text" inputmode="decimal" placeholder="latitude" />' +
    '<input id="f_lng" class="num" type="text" inputmode="decimal" placeholder="longitude" /></div></div>' +
    '<div class="btnrow"><button class="btn" data-act="usehere">Use my location</button></div>' +
    '<div class="field"><label for="f_rad">Allowed distance (metres)</label><input id="f_rad" class="num" type="number" value="100" min="10" max="2000" step="10" /></div>' +
    '<div class="btnrow"><button class="btn go wide" data-act="createorg">Create workplace</button></div>' +
    '<p class="msg' + (state.msgOk ? " ok" : "") + '">' + esc(state.msg) + "</p>" +
    '<p class="note">Payroll rules, leave allowance and late cut-offs are set afterwards in Admin → Payroll.</p>';
}
