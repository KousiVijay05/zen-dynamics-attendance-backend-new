/* "People" tab: staff list, edit form, add-staff form. Ported verbatim from tabPeople() in the original app.js. */
import { state } from "../../../core/store.js";
import { esc } from "../../../utils/format.js";
import { money } from "../../../domain/payroll.js";

export function tabPeople() {
  var html = "";
  if (state.editId) {
    var p = state.roster.filter(function (x) { return x.id === state.editId; })[0];
    if (p) {
      var availableShifts = Array.isArray(state.cfg.shifts) ? state.cfg.shifts : [];

var assignedShifts = Array.isArray(p.shifts) ? p.shifts : [];
var workDays = Array.isArray(p.workDays) ? p.workDays : ["Mon", "Tue", "Wed", "Thu", "Fri"];
var assignedTasks = Array.isArray(p.tasks) ? p.tasks : [];
var taskText = assignedTasks.join("\n");

var shiftOptions1 = '<option value="">No shift</option>';
var shiftOptions2 = '<option value="">No shift</option>';

availableShifts.forEach(function (s) {
  shiftOptions1 += '<option value="' + esc(s.id) + '"' +
    (assignedShifts[0] === s.id ? ' selected' : '') + '>' +
    esc(s.name) + ' (' + esc(s.start) + '–' + esc(s.end) + ')' +
    '</option>';

  shiftOptions2 += '<option value="' + esc(s.id) + '"' +
    (assignedShifts[1] === s.id ? ' selected' : '') + '>' +
    esc(s.name) + ' (' + esc(s.start) + '–' + esc(s.end) + ')' +
    '</option>';
});
      html += "<h2>Edit " + esc(p.name) + "</h2>" +
     '<div class="field"><label>Shift 1</label><select id="e_shift1">' + shiftOptions1 + '</select></div>' +
'<div class="field"><label>Shift 2</label><select id="e_shift2">' + shiftOptions2 + '</select></div>' +
'<div class="field">' +
'<label for="e_tasks">Mandatory tasks (one task per line)</label>' +
'<textarea id="e_tasks" rows="5" placeholder="Example: Check equipment&#10;Update attendance&#10;Clean training area">' + esc(taskText) + '</textarea>' +
'</div>' +
'<div class="field"><label>Working days</label>' +
'<div class="checks">' +
'<label><input type="checkbox" class="e_workday" value="Mon" ' + (workDays.indexOf("Mon") >= 0 ? "checked" : "") + '> Mon</label>' +
'<label><input type="checkbox" class="e_workday" value="Tue" ' + (workDays.indexOf("Tue") >= 0 ? "checked" : "") + '> Tue</label>' +
'<label><input type="checkbox" class="e_workday" value="Wed" ' + (workDays.indexOf("Wed") >= 0 ? "checked" : "") + '> Wed</label>' +
'<label><input type="checkbox" class="e_workday" value="Thu" ' + (workDays.indexOf("Thu") >= 0 ? "checked" : "") + '> Thu</label>' +
'<label><input type="checkbox" class="e_workday" value="Fri" ' + (workDays.indexOf("Fri") >= 0 ? "checked" : "") + '> Fri</label>' +
'<label><input type="checkbox" class="e_workday" value="Sat" ' + (workDays.indexOf("Sat") >= 0 ? "checked" : "") + '> Sat</label>' +
'<label><input type="checkbox" class="e_workday" value="Sun" ' + (workDays.indexOf("Sun") >= 0 ? "checked" : "") + '> Sun</label>' +
'</div></div>' +
        '<div class="field"><label for="e_name">Name</label><input id="e_name" type="text" value="' + esc(p.name) + '" /></div>' +
        '<div class="field"><label for="e_pin">PIN</label><input id="e_pin" class="num" type="number" value="' + esc(p.pin) + '" /></div>' +
        '<div class="field"><label for="e_sal">' + (state.cfg.pay.basis === "monthly" ? "Monthly salary" : "Hourly rate") + '</label>' +
        '<input id="e_sal" class="num" type="number" value="' + (p.salary || 0) + '" /></div>' +
        '<label class="check"><input type="checkbox" id="e_admin"' + (p.admin ? " checked" : "") + " /><div>Can administer</div></label>" +
        '<div class="btnrow"><button class="btn go" data-act="saveperson">Save</button>' +
        '<button class="btn quiet" data-act="canceledit">Cancel</button></div>' +
        '<p class="msg' + (state.msgOk ? " ok" : "") + '">' + esc(state.msg) + "</p>";
      return html;
    }
  }
  html += "<h2>Staff</h2><div class=\"rows\">";
  if (!state.roster.length) html += '<div class="empty">No staff added yet.</div>';
  state.roster.forEach(function (p) {
    html += '<div class="row"><span><span class="who">' + esc(p.name) + "</span>" +
      (p.admin ? '<span class="tag admin">admin</span>' : "") +
      (p.active === false ? '<span class="tag">inactive</span>' : "") +
      '<br><span class="meta">PIN ' + esc(p.pin) + " · " + (p.salary ? money(p.salary) + (state.cfg.pay.basis === "monthly" ? "/month" : "/hour") : "no pay set") +
      "</span></span><span>" +
      '<button class="btn quiet small" data-act="edit" data-id="' + p.id + '">Edit</button> ' +
      '<button class="btn quiet small" data-act="toggleactive" data-id="' + p.id + '">' + (p.active === false ? "Restore" : "Off") + "</button></span></div>";
  });
  html += "</div><h2>Add someone</h2>" +
    '<div class="field"><label for="n_name">Name</label><input id="n_name" type="text" placeholder="Full name" /></div>' +
    '<div class="field"><label for="n_pin">4-digit PIN</label><input id="n_pin" class="num" type="number" inputmode="numeric" placeholder="0000" /></div>' +
    '<div class="field"><label for="n_sal">' + (state.cfg.pay.basis === "monthly" ? "Monthly salary" : "Hourly rate") + '</label>' +
    '<input id="n_sal" class="num" type="number" placeholder="0" /></div>' +
    '<label class="check"><input type="checkbox" id="n_admin" /><div>Can administer<span>Sees everyone\'s records, payroll and settings.</span></div></label>' +
    '<div class="btnrow"><button class="btn go wide" data-act="addperson">Add to staff</button></div>' +
    '<p class="msg' + (state.msgOk ? " ok" : "") + '">' + esc(state.msg) + "</p>";
  return html;
}
