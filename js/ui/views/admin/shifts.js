/* Admin: Shift Master */

import { state } from "../../../core/store.js";
import { esc, hm12 } from "../../../utils/format.js";
import { batches, packages, packageValidity } from "../../../domain/clients.js";
import { money } from "../../../domain/payroll.js";

export function tabShifts() {
  var html = "";
  var shifts = Array.isArray(state.cfg.shifts) ? state.cfg.shifts : [];
  var editing = state.editShiftId ? shifts.filter(function (s) { return s.id === state.editShiftId; })[0] : null;

  html += '<p class="note" style="margin-top:4px">Create your staff shifts here, then assign them in People. Lateness is measured from each shift\'s start time.</p>';

  html +=
    '<div class="card">' +
      "<h3>" + (editing ? "Edit shift" : "Add shift") + "</h3>" +

      '<div class="field">' +
        '<label for="shift_name">Shift name</label>' +
        '<input id="shift_name" type="text" placeholder="Morning Shift" value="' + (editing ? esc(editing.name) : "") + '">' +
      "</div>" +

      '<div class="field">' +
        '<label for="shift_start">Start time</label>' +
        '<input id="shift_start" type="time" value="' + (editing ? esc(editing.start) : "") + '">' +
      "</div>" +

      '<div class="field">' +
        '<label for="shift_end">End time</label>' +
        '<input id="shift_end" type="time" value="' + (editing ? esc(editing.end) : "") + '">' +
      "</div>" +

      '<div class="btnrow">' +
        (editing
          ? '<button class="btn go" data-act="updateshift" data-id="' + esc(editing.id) + '">Save shift</button> ' +
            '<button class="btn quiet" data-act="canceleditshift">Cancel</button>'
          : '<button class="btn go" data-act="addshift">Add shift</button>') +
      "</div>" +

      '<p class="msg' + (state.msgOk ? " ok" : "") + '">' + esc(state.msg) + "</p>" +
    "</div>";

  html +=
    "<h2>Shifts</h2>" +
    '<div class="rows">';

  if (!shifts.length) {
    html += '<div class="empty">No shifts created yet.</div>';
  } else {
    shifts.forEach(function (s) {
      html +=
        '<div class="row">' +
          '<span>' +
            '<span class="who">' + esc(s.name) + "</span>" +
            "<br>" +
            '<span class="meta">' +
              esc(hm12(s.start)) + " – " + esc(hm12(s.end)) +
            "</span>" +
          "</span>" +

          '<span>' +
            '<button class="btn quiet small" data-act="editshift" data-id="' +
              esc(s.id) +
            '">Edit</button> ' +

            '<button class="btn quiet small" data-act="deleteshift" data-id="' +
              esc(s.id) +
            '">Delete</button>' +
          "</span>" +
        "</div>";
    });
  }

  html += "</div>";

  var bs = batches().slice().sort(function (a, b) { return a.start < b.start ? -1 : 1; });
  html += "<h2>Client batches</h2>" +
    '<p class="note" style="margin-top:0">Time slots coaches pick when they take a client session (e.g. 6 AM, 7 AM, 6 PM).</p>' +
    '<div class="rows">' + (bs.length ? bs.map(function (b) {
      return '<div class="row"><span><span class="who">' + esc(b.name) + '</span><br><span class="meta">' + esc(hm12(b.start)) + (b.end ? " – " + esc(hm12(b.end)) : "") + "</span></span>" +
        '<span><button class="btn quiet small" data-act="delbatch" data-id="' + esc(b.id) + '">Remove</button></span></div>';
    }).join("") : '<div class="empty">No batches yet.</div>') + "</div>" +
    '<div class="card"><h3>Add a batch</h3>' +
      '<div class="field"><label for="b_name">Batch name</label><input id="b_name" type="text" placeholder="e.g. 6 AM batch" /></div>' +
      '<div class="field pair"><div><label for="b_start">Starts</label><input id="b_start" type="time" /></div>' +
      '<div><label for="b_end">Ends</label><input id="b_end" type="time" /></div></div>' +
      '<div class="btnrow"><button class="btn go wide" data-act="addbatch">Add batch</button></div></div>';

  html += "<h2>Membership packages</h2>" +
    '<p class="note" style="margin-top:0">Shown when adding or renewing a client; the fee fills in automatically (it can still be changed).</p>' +
    '<div class="rows">' + packages().map(function (k) {
      return '<div class="row"><span><span class="who">' + esc(k.name) + '</span><br><span class="meta">' + esc((k.group ? k.group + " · " : "") + (k.type === "pack" ? k.sessions + " sessions · " : "") + packageValidity(k)) + "</span></span>" +
        '<span><span class="dur" style="margin-right:6px">' + money(k.fee) + '</span><button class="btn quiet small" data-act="delpkg" data-id="' + esc(k.id) + '">Remove</button></span></div>';
    }).join("") + "</div>" +
    '<div class="card"><h3>Add a package</h3>' +
      '<div class="field"><label for="k_name">Name</label><input id="k_name" type="text" placeholder="e.g. 2M · 6 days/week" /></div>' +
      '<div class="field pair"><div><label for="k_type">Type</label><select id="k_type"><option value="time">Months / days</option><option value="pack">Session pack</option></select></div>' +
      '<div><label for="k_group">Group</label><input id="k_group" type="text" placeholder="e.g. 6 days/week" /></div></div>' +
      '<div class="field pair"><div><label for="k_months">Valid (months)</label><input id="k_months" class="num" type="number" min="0" /></div>' +
      '<div><label for="k_days">or (days)</label><input id="k_days" class="num" type="number" min="0" /></div></div>' +
      '<div class="field pair"><div><label for="k_sessions">Sessions (packs)</label><input id="k_sessions" class="num" type="number" min="0" /></div>' +
      '<div><label for="k_fee">Fee</label><input id="k_fee" class="num" type="number" min="0" /></div></div>' +
      '<div class="btnrow"><button class="btn go wide" data-act="addpkg">Add package</button></div></div>';

  return html;
}