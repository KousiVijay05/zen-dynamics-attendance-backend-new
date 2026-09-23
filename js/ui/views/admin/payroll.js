/* "Payroll" tab: rules editor + the pay run, one card per staff member.
   Ported verbatim from tabPayroll() in the original app.js. */
import { state } from "../../../core/store.js";
import { esc, DAYS } from "../../../utils/format.js";
import { payrollFor, money } from "../../../domain/payroll.js";
import { monthOptions } from "../../components/monthOptions.js";

export function tabPayroll() {
  var P = state.cfg.pay;
  var html = '<div class="tabs" style="margin-top:12px">' +
    ["sheet:Pay run", "rules:Rules"].map(function (t) {
      var p = t.split(":");
      return '<button class="tab' + (state.paySub === p[0] ? " sel" : "") + '" data-act="paysub" data-v="' + p[0] + '">' + p[1] + "</button>";
    }).join("") + "</div>";

  if (state.paySub === "rules") {
    html += '<div class="field"><label for="p_cur">Currency symbol</label><input id="p_cur" type="text" value="' + esc(P.currency) + '" /></div>' +
      '<div class="field"><label for="p_basis">Pay basis</label><select id="p_basis">' +
      '<option value="monthly"' + (P.basis === "monthly" ? " selected" : "") + ">Monthly salary</option>" +
      '<option value="hourly"' + (P.basis === "hourly" ? " selected" : "") + ">Hourly rate</option></select></div>" +
      '<div class="field"><label>Weekly off days</label><div class="days">' +
      DAYS.map(function (d, i) {
        return '<button class="dayb' + (P.weeklyOff.indexOf(i) >= 0 ? " on" : "") + '" data-act="offday" data-v="' + i + '">' + d + "</button>";
      }).join("") + "</div></div>" +
      '<div class="field pair"><div><label for="p_days">Payable days / month</label><input id="p_days" class="num" type="number" value="' + P.fixedDays + '" /></div>' +
      '<div><label for="p_std">Standard hours / day</label><input id="p_std" class="num" type="number" step="0.5" value="' + P.stdHours + '" /></div></div>' +
      "<h3>What counts as a day</h3>" +
      '<div class="field pair"><div><label for="p_full">Full day from (hours)</label><input id="p_full" class="num" type="number" step="0.5" value="' + P.fullDayHours + '" /></div>' +
      '<div><label for="p_half">Half day from (hours)</label><input id="p_half" class="num" type="number" step="0.5" value="' + P.halfDayHours + '" /></div></div>' +
      "<h3>Late arrival</h3>" +
      '<div class="field pair"><div><label for="p_start">Shift starts</label><input id="p_start" class="num" type="text" placeholder="09:00" value="' + esc(P.shiftStart) + '" /></div>' +
      '<div><label for="p_grace">Grace (minutes)</label><input id="p_grace" class="num" type="number" value="' + P.lateGrace + '" /></div></div>' +
      '<div class="field pair"><div><label for="p_lpd">Grace late occurrences</label><input id="p_lpd" class="num" type="number" value="' + P.lateMarksPerDeduct + '" /></div>' +
      '<div><label for="p_ldd">Days deducted each cut</label><input id="p_ldd" class="num" type="number" step="0.5" value="' + P.lateDeductDays + '" /></div></div>' +
      "<h3>Leave and overtime</h3>" +
      '<div class="field"><label for="p_leave">Paid leave allowed per month (days)</label><input id="p_leave" class="num" type="number" step="0.5" value="' + P.paidLeave + '" /></div>' +
      '<div class="field"><label for="p_leaveyr">Requestable leave allowed per year (days)</label><input id="p_leaveyr" class="num" type="number" step="1" value="' + P.leavePerYear + '" /></div>' +
      '<label class="check"><input type="checkbox" id="p_ot"' + (P.otEnabled ? " checked" : "") + " /><div>Pay overtime<span>Hours beyond the standard day, at the multiplier below.</span></div></label>" +
      '<div class="field"><label for="p_otr">Overtime multiplier</label><input id="p_otr" class="num" type="number" step="0.25" value="' + P.otRate + '" /></div>' +
      '<div class="btnrow"><button class="btn go wide" data-act="savepay">Save rules</button></div>' +
      '<p class="msg' + (state.msgOk ? " ok" : "") + '">' + esc(state.msg) + "</p>";
    return html;
  }

  html += '<div class="field"><label for="p_month">Month</label><select id="p_month" data-act="month">' + monthOptions() + "</select></div>";
  var totalNet = 0, any = false;
  var body = "";
  state.roster.filter(function (p) { return p.active !== false; }).forEach(function (p) {
    var r = payrollFor(p, state.month);
    totalNet += r.net; any = true;
    body += '<details class="pay"><summary><span><span class="who">' + esc(p.name) + "</span>" +
      '<br><span class="meta">' + r.credited.toFixed(1) + " of " + r.workingDays + " days · " + r.hours.toFixed(1) + " h" +
      (r.lates ? " · " + r.lates + " late" : "") + "</span></span>" +
      '<span class="net">' + money(r.net) + "</span></summary><div class=\"payfoot\">" +
      '<div class="kv"><span>' + (state.cfg.pay.basis === "monthly" ? "Monthly salary" : "Hourly rate") + "</span><b>" + money(r.salary) + "</b></div>" +
      '<div class="kv"><span>Per-day value</span><b>' + money(r.perDay) + "</b></div>" +
      '<div class="kv"><span>Present (full / half)</span><b>' + r.full + " / " + r.half + "</b></div>" +
      (r.leave ? '<div class="kv"><span>Approved leave (paid)</span><b>' + r.leave + "</b></div>" : "") +
      '<div class="kv"><span>Paid leave used</span><b>' + r.paidLeave.toFixed(1) + "</b></div>" +
      '<div class="kv"><span>Unpaid absence</span><b>' + r.unpaid.toFixed(1) + " days</b></div>" +
      '<div class="kv"><span>Late cut</span><b>' + r.lateDeductDays.toFixed(1) + " days</b></div>" +
      (state.cfg.pay.otEnabled ? '<div class="kv"><span>Overtime</span><b>' + r.ot.toFixed(1) + " h · " + money(r.otPay) + "</b></div>" : "") +
      '<div class="kv"><span>Deductions</span><b>−' + money(r.deduction) + "</b></div>" +
      '<div class="kv sum"><span>Net pay</span><b>' + money(r.net) + "</b></div>" +
      "</div></details>";
  });
  html += '<div class="stat"><span class="k">Total payable</span><span class="v">' + money(totalNet) + "</span></div>";
  html += '<div class="rows">' + (any ? body : '<div class="empty">No active staff.</div>') + "</div>";
  html += '<div class="btnrow"><button class="btn go" data-act="xlsx">Download Excel</button>' +
    '<button class="btn quiet" data-act="refresh">Refresh</button></div>' +
    '<p class="msg' + (state.msgOk ? " ok" : "") + '">' + esc(state.msg) + "</p>" +
    '<p class="note">The workbook has four sheets: payroll summary, day-by-day attendance, every shift, and the staff list.</p>';
  return html;
}
