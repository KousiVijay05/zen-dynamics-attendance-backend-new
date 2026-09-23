/* Who's-clocking-in staff picker. Ported verbatim from vSignin() in the original app.js. */
import { state } from "../../core/store.js";
import { esc } from "../../utils/format.js";
import { inZone, distanceNow } from "../../domain/geofence.js";
import { openEntryFor } from "../../domain/attendance.js";
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

  var list = state.roster.filter(function (p) {
    return p.active !== false && (!state.adminOnly || p.admin);
  });
  var cells = list.map(function (p) {
    var on = !!openEntryFor(p.id);
    return '<button class="person' + (on ? "" : " off") + '" data-act="pick" data-id="' + p.id + '">' +
      esc(p.name) + "<small>" + (on ? "On shift" : "Off") + "</small></button>";
  }).join("");

  return head + (locked ? proxBlock() : "") +
    "<h2>" + (state.adminOnly ? "Administrators" : "Who's clocking in?") + "</h2>" +
    (cells ? '<div class="people">' + cells + "</div>"
           : '<div class="empty">No one to show.</div>' +
             '<div style="text-align:center"><button class="linkish" data-act="recover">Recover administrator access</button></div>') +
    (state.adminOnly ? '<div style="text-align:center"><button class="linkish" data-act="alluser">Back</button></div>' : "") +
    '<p class="msg">' + esc(state.msg) + "</p>";
}
