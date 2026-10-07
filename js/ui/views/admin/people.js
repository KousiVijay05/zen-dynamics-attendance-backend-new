/* "People" tab: staff list, edit form, add-staff form. Ported verbatim from tabPeople() in the original app.js. */
import { state } from "../../../core/store.js";
import { esc, hm12 } from "../../../utils/format.js";
import { money } from "../../../domain/payroll.js";
import { avatar } from "../../components/icons.js";

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
    esc(s.name) + ' (' + esc(hm12(s.start)) + '–' + esc(hm12(s.end)) + ')' +
    '</option>';

  shiftOptions2 += '<option value="' + esc(s.id) + '"' +
    (assignedShifts[1] === s.id ? ' selected' : '') + '>' +
    esc(s.name) + ' (' + esc(hm12(s.start)) + '–' + esc(hm12(s.end)) + ')' +
    '</option>';
});
      var days7 = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
      html += "<h2>Edit " + esc(p.name) + "</h2>" +
        '<div class="card"><h3>Details</h3>' +
        '<div class="field"><label for="e_name">Name</label><input id="e_name" type="text" value="' + esc(p.name) + '" /></div>' +
        '<div class="field"><label for="e_user">User ID</label><input id="e_user" type="text" autocapitalize="none" autocorrect="off" spellcheck="false" value="' + esc(p.username || "") + '" /></div>' +
        '<div class="field"><label for="e_sal">' + (state.cfg.pay.basis === "monthly" ? "Monthly salary" : "Hourly rate") + '</label>' +
        '<input id="e_sal" class="num" type="number" value="' + (p.salary || 0) + '" /></div>' +
        '<label class="check"><input type="checkbox" id="e_admin"' + (p.admin ? " checked" : "") + " /><div>Can administer<span>Sees everyone's records, payroll and settings.</span></div></label>" +
        '</div>' +
        '<div class="card"><h3>Schedule</h3>' +
        '<div class="field"><label for="e_shift1">Shift 1</label><select id="e_shift1">' + shiftOptions1 + '</select></div>' +
        '<div class="field"><label for="e_shift2">Shift 2 (optional)</label><select id="e_shift2">' + shiftOptions2 + '</select></div>' +
        '<div class="field"><label>Working days</label><div class="checks">' +
          days7.map(function (d) {
            return '<label><input type="checkbox" class="e_workday" value="' + d + '"' + (workDays.indexOf(d) >= 0 ? " checked" : "") + "> " + d + "</label>";
          }).join("") +
        '</div></div>' +
        '<div class="field"><label for="e_tasks">Mandatory tasks (one per line)</label>' +
        '<textarea id="e_tasks" rows="4" placeholder="Example: Check equipment&#10;Update attendance&#10;Clean training area">' + esc(taskText) + '</textarea>' +
        '<span class="note">They must tick these off before they can clock out.</span></div>' +
        '</div>' +
        '<div class="card"><h3>Password</h3>' +
        '<div class="field"><label for="e_pass">New temporary password</label><input id="e_pass" type="text" autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="Leave blank to keep their current one" />' +
        '<span class="note">Nobody can see passwords, admins included. If they\'ve forgotten theirs, type a new one (6+ characters) and send it to them privately — they\'ll choose their own at next sign-in.</span></div>' +
        '</div>' +
        '<div class="btnrow"><button class="btn go" data-act="saveperson">Save changes</button>' +
        '<button class="btn quiet" data-act="canceledit">Cancel</button></div>' +
        '<p class="msg' + (state.msgOk ? " ok" : "") + '">' + esc(state.msg) + "</p>";
      return html;
    }
  }
  html += "<h2>Staff</h2><div class=\"rows\">";
  if (!state.roster.length) html += '<div class="empty">No staff added yet.</div>';
  state.roster.forEach(function (p) {
    html += '<div class="row people-row"><span class="person-cell">' + avatar(p.name, p.active === false ? "dim" : "") + '<span><span class="who">' + esc(p.name) + "</span>" +
      (p.admin ? '<span class="tag admin">admin</span>' : "") +
      (p.active === false ? '<span class="tag">inactive</span>' : "") +
      '<br><span class="meta">' + esc(p.username || "no user ID") +
      (p.mustChangePassword ? '<span class="tag pending">must change password</span>' : "") + " · " +
      (p.salary ? money(p.salary) + (state.cfg.pay.basis === "monthly" ? "/month" : "/hour") : "no pay set") +
      "</span></span></span><span>" +
      '<button class="btn quiet small" data-act="edit" data-id="' + p.id + '">Edit</button> ' +
      '<button class="btn quiet small" data-act="toggleactive" data-id="' + p.id + '">' + (p.active === false ? "Restore" : "Off") + "</button></span></div>";
  });
  html += "</div><h2>Add someone</h2>" + '<div class="card">' +
    '<div class="field"><label for="n_name">Name</label><input id="n_name" type="text" placeholder="Full name" /></div>' +
    '<div class="field"><label for="n_user">User ID</label><input id="n_user" type="text" autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="e.g. jsmith" /></div>' +
    '<div class="field"><label for="n_pass">Temporary password</label><input id="n_pass" type="text" autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="At least 6 characters" />' +
    '<span class="note">Give this to them along with their user ID — they\'ll be asked to pick their own password the first time they sign in.</span></div>' +
    '<div class="field"><label for="n_sal">' + (state.cfg.pay.basis === "monthly" ? "Monthly salary" : "Hourly rate") + '</label>' +
    '<input id="n_sal" class="num" type="number" placeholder="0" /></div>' +
    '<label class="check"><input type="checkbox" id="n_admin" /><div>Can administer<span>Sees everyone\'s records, payroll and settings.</span></div></label>' +
    '<div class="btnrow"><button class="btn go wide" data-act="addperson">Add to staff</button></div>' +
    '<p class="msg' + (state.msgOk ? " ok" : "") + '">' + esc(state.msg) + "</p></div>";
  return html;
}
