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
import { tabClients } from "./clients.js";
import { brandMark } from "../../components/brand.js";
import { icons } from "../../components/icons.js";
import { endedShifts } from "../../../domain/reports.js";
import { dayKey, hm12 } from "../../../utils/format.js";

/* Shift-end reminder: a shift that ended in the last 2 hours and hasn't
   been shared or dismissed on this device today. */
export function sharedKey(day, shiftId) { return "zd-shift-shared:" + day + ":" + shiftId; }
function reminder() {
  var day = dayKey(Date.now()), html = "";
  endedShifts().forEach(function (s) {
    var done = false;
    try { done = !!localStorage.getItem(sharedKey(day, s.id)); } catch (e) {}
    if (done) return;
    html += '<div class="remind"><span class="remind-ico">' + icons.clock + '</span>' +
      '<span class="remind-txt"><b>' + esc(s.name) + ' ended</b><br><span>at ' + esc(hm12(s.end)) + ' — share the attendance?</span></span>' +
      '<button class="btn wa small" data-act="wa-image" data-id="' + esc(s.id) + '">' + icons.whatsapp + 'Share</button>' +
      '<button class="btn quiet small icon" data-act="wa-dismiss" data-id="' + esc(s.id) + '" aria-label="Dismiss" title="Dismiss">×</button></div>';
  });
  return html;
}

function previewSheet() {
  var w = state.waPreview;
  if (!w && !state.waBusy) return "";
  return '<div class="sheet-backdrop">' +
    '<div class="sheet" role="dialog" aria-label="Attendance image preview">' +
      '<div class="sheet-head"><b>Preview</b><button class="btn quiet small icon" data-act="wa-close" aria-label="Close">×</button></div>' +
      (w ? '<img class="sheet-img" src="' + w.url + '" alt="Attendance image" />' : '<div class="loading">Making the image…</div>') +
      (w ? '<div class="btnrow"><button class="btn wa wide" data-act="wa-send">' + icons.whatsapp + 'Share to WhatsApp</button></div>' +
           '<p class="note">Opens your phone\'s Share menu — choose WhatsApp, then the group. The app never sees your WhatsApp, contacts or chats.</p>' : '') +
    '</div></div>';
}

var TABS = ["onsite:On site", "clients:Clients", "people:People", "shifts:Shifts", "leave:Leave", "records:Records", "payroll:Payroll", "site:Settings"];

export function vAdmin() {
  var head = '<div class="bar"><div class="idn">' + brandMark() + '<div><div class="nm">' + esc(state.cfg.org) + "</div>" +
    '<div class="sub">Admin · ' + esc(state.me.name) + "</div></div></div>" +
    '<div class="acts"><button class="btn quiet small" data-act="gostaff">' + icons.clock + 'My clock</button></div></div>' +
    '<div class="tabs" role="tablist">' + TABS.map(function (t) {
      var p = t.split(":");
      return '<button class="tab' + (state.tab === p[0] ? " sel" : "") + '" data-act="tab" data-v="' + p[0] + '">' + p[1] + "</button>";
    }).join("") + "</div>";
  if (!state.adminLoaded) return head + '<div class="loading">Loading records…</div>';
  head += reminder();
  var tail = previewSheet();
  if (state.tab === "onsite") return head + tabOnsite() + tail;
  if (state.tab === "clients") return head + tabClients() + tail;
  if (state.tab === "people") return head + tabPeople() + tail;
  if (state.tab === "shifts") return head + tabShifts() + tail;
  if (state.tab === "leave") return head + tabLeaveAdmin() + tail;
  if (state.tab === "records") return head + tabRecords() + tail;
  if (state.tab === "payroll") return head + tabPayroll() + tail;
  return head + tabSite() + tail;
}
