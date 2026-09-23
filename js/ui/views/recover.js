/* "No administrator found" recovery screen. Ported verbatim from vRecover() in the original app.js. */
import { state } from "../../core/store.js";
import { esc } from "../../utils/format.js";
import { brandHero } from "../components/brand.js";

export function vRecover() {
  var n = state.roster.length;
  return brandHero() +
    '<h1>No administrator found</h1>' +
    '<p class="lede">' + esc(state.cfg.org) + " exists, but " +
    (n ? "nobody on the staff list can administer it." : "the staff list is empty.") +
    " Create an administrator account to get back in. Existing records are kept.</p>" +
    '<div class="field"><label for="r_nm">Your name</label><input id="r_nm" type="text" placeholder="Full name" /></div>' +
    '<div class="field"><label for="r_pin">Choose a 4-digit PIN</label><input id="r_pin" class="num" type="number" inputmode="numeric" placeholder="0000" /></div>' +
    '<div class="btnrow"><button class="btn go wide" data-act="makeadmin">Create administrator</button></div>' +
    '<p class="msg' + (state.msgOk ? " ok" : "") + '">' + esc(state.msg) + "</p>" +
    '<div style="text-align:center"><button class="linkish" data-act="resetorg">Delete this workplace and start over</button></div>';
}
