/* Admin shell: header + tab bar + dispatch to the selected tab. Ported verbatim from vAdmin() in the original app.js. */
import { state } from "../../../core/store.js";
import { esc } from "../../../utils/format.js";
import { tabOnsite } from "./onsite.js";
import { tabPeople } from "./people.js";
import { tabRecords } from "./records.js";
import { tabPayroll } from "./payroll.js";
import { tabSite } from "./settings.js";
import { tabShifts } from "./shifts.js";
import { tabLeaveAdmin } from "./leave.js";
import { brandMark } from "../../components/brand.js";

var TABS = ["onsite:On site", "people:People", "shifts:Shifts", "leave:Leave", "records:Records", "payroll:Payroll", "site:Settings"];

export function vAdmin() {
  var head = '<div class="bar"><div class="idn">' + brandMark() + '<div><div class="nm">' + esc(state.cfg.org) + "</div>" +
    '<div class="sub">Administration · ' + esc(state.me.name) + "</div></div></div>" +
    '<div class="acts"><button class="btn quiet small" data-act="gostaff">My clock</button></div></div>' +
    '<div class="tabs">' + TABS.map(function (t) {
      var p = t.split(":");
      return '<button class="tab' + (state.tab === p[0] ? " sel" : "") + '" data-act="tab" data-v="' + p[0] + '">' + p[1] + "</button>";
    }).join("") + "</div>";
  if (!state.adminLoaded) return head + '<div class="loading">Loading records…</div>';
  if (state.tab === "onsite") return head + tabOnsite();
  if (state.tab === "people") return head + tabPeople();
  if (state.tab === "shifts") return head + tabShifts();
  if (state.tab === "leave") return head + tabLeaveAdmin();
  if (state.tab === "records") return head + tabRecords();
  if (state.tab === "payroll") return head + tabPayroll();
  return head + tabSite();
}
