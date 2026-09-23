/* Admin: Shift Master */

import { state } from "../../../core/store.js";
import { esc } from "../../../utils/format.js";

export function tabShifts() {
  var html = "";
  var shifts = Array.isArray(state.cfg.shifts) ? state.cfg.shifts : [];
  var editing = state.editShiftId ? shifts.filter(function (s) { return s.id === state.editShiftId; })[0] : null;

  html += "<h2>Shift Master</h2>" +
    '<p class="muted">Create your common staff shifts here. You can change them later when needed.</p>';

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
    "<h3>Existing shifts</h3>" +
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
              esc(s.start) + " – " + esc(s.end) +
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

  return html;
}