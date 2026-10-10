/* ---------------------------------------------------------------
   Excel export (Admin -> Payroll / Records -> Download Excel).
   Ported verbatim from the "excel" section of the original app.js.
   Requires the SheetJS `XLSX` global, loaded via <script> in
   index.html exactly as before.
----------------------------------------------------------------*/

import { state } from "../core/store.js";
import { dayKey, tClock, monthLabel, DAYS } from "../utils/format.js";
import { payrollFor } from "./payroll.js";
import { allLeaves } from "./leave.js";
import { periodStats } from "./reports.js";

function buildWorkbook() {
  var P = state.cfg.pay, ym = state.month, wb = XLSX.utils.book_new();
  var active = state.roster.filter(function (p) { return p.active !== false; });

  var sum = [["Staff", "Month", P.basis === "monthly" ? "Monthly salary" : "Hourly rate", "Per-day value",
    "Working days", "Full days", "Half days", "Days credited", "Paid leave", "Unpaid days",
    "Late marks", "Late cut (days)", "Hours worked", "OT hours", "OT pay", "Deductions", "Net pay"]];
  var daily = [["Staff", "Date", "Weekday", "First in", "Last out", "Hours", "Status", "Late"]];
  var shifts = [["Staff", "Date", "Clock in", "Clock out", "Hours", "Ended"]];

  active.forEach(function (p) {
    var r = payrollFor(p, ym);
    sum.push([p.name, monthLabel(ym), r.salary, +r.perDay.toFixed(2), r.workingDays, r.full, r.half,
      +r.credited.toFixed(1), +r.paidLeave.toFixed(1), +r.unpaid.toFixed(1), r.lates, r.lateDeductDays,
      +r.hours.toFixed(2), +r.ot.toFixed(2), +r.otPay.toFixed(2), +r.deduction.toFixed(2), +r.net.toFixed(2)]);
    r.rows.forEach(function (d) {
      daily.push([p.name, d.date, DAYS[new Date(d.date + "T00:00:00").getDay()], d.first, d.last,
        +d.hours.toFixed(2), d.status, d.late ? "Yes" : ""]);
    });
    (state.logs["log:" + p.id + ":" + ym.replace("-", "")] || []).slice().sort(function (a, b) { return a.start - b.start; })
      .forEach(function (e) {
        if (!e.end) return;
        shifts.push([p.name, dayKey(e.start), tClock(e.start), tClock(e.end),
          +((e.end - e.start) / 3600000).toFixed(2), e.auto ? "auto (left site)" : "manual"]);
      });
  });

  /* No password column: passwords live only in Firebase Authentication (hashed). */
  var staff = [["Name", "User ID", P.basis === "monthly" ? "Monthly salary" : "Hourly rate", "Administrator", "Active"]];
  state.roster.forEach(function (p) {
    staff.push([p.name, p.username || "", p.salary || 0, p.admin ? "Yes" : "", p.active === false ? "" : "Yes"]);
  });

  var names = {};
  state.roster.forEach(function (p) { names[p.id] = p.name; });
  var leave = [["Staff", "From", "To", "Days", "Status", "Reason", "Requested"]];
  allLeaves().forEach(function (l) {
    leave.push([names[l.staffId] || l.staffId, l.from, l.to, l.days, l.status, l.reason || "",
      new Date(l.requestedAt).toLocaleString()]);
  });

  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sum), "Payroll");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(daily), "Daily attendance");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(shifts), "Shifts");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(staff), "Staff");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(leave), "Leave");
  return wb;
}

/** Workbook for any date range: per-staff summary + every punch. `only` = one staff id or "all". */
export function exportRange(from, to, only) {
  if (typeof XLSX === "undefined") throw new Error("Excel library didn't load. Check the connection and reload.");
  var people = state.roster.filter(function (p) { return only && only !== "all" ? p.id === only : p.active !== false; });
  var sum = [["Staff", "From", "To", "Days present", "Hours worked", "Late marks", "Leave days", "Absent days"]];
  var punches = [["Staff", "Date", "Weekday", "Clock in", "Clock out", "Hours", "Shift", "Ended"]];
  people.forEach(function (p) {
    var s = periodStats(p, from, to);
    sum.push([p.name, from, to, s.days, +(s.ms / 3600000).toFixed(2), s.late, s.leave, s.absent]);
    var list = [];
    Object.keys(state.logs).forEach(function (k) { if (k.indexOf("log:" + p.id + ":") === 0) list = list.concat(state.logs[k] || []); });
    list.sort(function (a, b) { return a.start - b.start; }).forEach(function (e) {
      var d = dayKey(e.start);
      if (d < from || d > to) return;
      punches.push([p.name, d, DAYS[new Date(d + "T00:00:00").getDay()], tClock(e.start), e.end ? tClock(e.end) : "still in",
        e.end ? +((e.end - e.start) / 3600000).toFixed(2) : "", e.shiftName || "", !e.end ? "" : e.auto ? "auto (left site)" : "manual"]);
    });
  });
  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sum), "Summary");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(punches), "Punches");
  XLSX.writeFile(wb, "attendance-" + from + (to !== from ? "-to-" + to : "") + ".xlsx");
  return "Workbook downloaded.";
}

/** Builds and downloads the workbook. Throws on failure (caller shows the message). */
export function exportExcel() {
  if (typeof XLSX === "undefined") throw new Error("Excel library didn't load. Check the connection and reload.");
  try {
    XLSX.writeFile(buildWorkbook(), "attendance-" + state.month + ".xlsx");
    return "Workbook downloaded.";
  } catch (e) {
    throw new Error("Couldn't build the workbook: " + e.message);
  }
}
