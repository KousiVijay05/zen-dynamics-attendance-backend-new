/* ---------------------------------------------------------------
   Payroll engine.

   monthDays(), dailyMap() and payrollFor() are ported byte-for-byte
   from the "payroll" section of the original app.js. DO NOT change
   the arithmetic here without calling it out explicitly — the brief
   this app was rebuilt from is explicit that payroll formulas must
   never change silently.

   One pre-existing quirk preserved on purpose (see CHANGES.md):
   a day with hours below halfDayHours ("Short") is labeled "Short"
   in the UI but counted as a full absence for pay (r.absent++, not
   r.half). That was true in the original and still is here.
----------------------------------------------------------------*/

import { state } from "../core/store.js";
import { dayKey, tClock, minsOfDay, parseHM, num } from "../utils/format.js";

export function monthDays(ym) {
  var y = +ym.slice(0, 4), m = +ym.slice(5, 7);
  return new Date(y, m, 0).getDate();
}

/** Groups a staff member's completed shifts in month `ym` by calendar day. */
export function dailyMap(id, ym) {
  var k = "log:" + id + ":" + ym.replace("-", "");
  var map = {};
  (state.logs[k] || []).forEach(function (e) {
    if (!e.end) return;
    var d = dayKey(e.start);
    if (!map[d]) map[d] = { ms: 0, first: e.start, last: e.end };
    map[d].ms += e.end - e.start;
    if (e.start < map[d].first) map[d].first = e.start;
    if (e.end > map[d].last) map[d].last = e.end;
  });
  return map;
}

/**
 * Computes one staff member's full payroll breakdown for month `ym`,
 * against the currently configured pay rules (state.cfg.pay).
 * Formulas are unchanged from the original — see file header.
 */
export function payrollFor(p, ym) {
  var P = state.cfg.pay, map = dailyMap(p.id, ym), nDays = monthDays(ym);
  var y = +ym.slice(0, 4), m = +ym.slice(5, 7);
  var todayK = dayKey(Date.now());
  var shiftStart = parseHM(P.shiftStart);

  var r = { rows: [], workingDays: 0, full: 0, half: 0, absent: 0, lates: 0, hours: 0, ot: 0, offWorked: 0 };

  for (var d = 1; d <= nDays; d++) {
    var date = new Date(y, m - 1, d);
    var k = dayKey(date.getTime());
    var isOff = P.weeklyOff.indexOf(date.getDay()) >= 0;
    var rec = map[k];
    var hrs = rec ? rec.ms / 3600000 : 0;
    var future = k > todayK || (p.joined && k < p.joined);
    var status;

    if (isOff) status = rec ? "Worked (off day)" : "Weekly off";
    else if (future) status = (p.joined && k < p.joined) ? "Before joining" : "—";
    else if (hrs >= P.fullDayHours) status = "Present";
    else if (hrs >= P.halfDayHours) status = "Half day";
    else if (hrs > 0) status = "Short";
    else status = k === todayK ? "—" : "Absent";

    var late = false;
    if (rec && !isOff && minsOfDay(rec.first) > shiftStart + P.lateGrace) late = true;

    if (!isOff && !future && k !== todayK) r.workingDays++;
    if (!isOff) {
      if (status === "Present") r.full++;
      else if (status === "Half day") r.half++;
      else if (status === "Short") { r.half += 0; r.absent++; }
      else if (status === "Absent") r.absent++;
    } else if (rec) r.offWorked++;

    if (late) r.lates++;
    r.hours += hrs;
    if (P.otEnabled && hrs > P.stdHours) r.ot += hrs - P.stdHours;

    if (rec || (!isOff && !future)) {
      r.rows.push({
        date: k, first: rec ? tClock(rec.first) : "", last: rec ? tClock(rec.last) : "",
        hours: hrs, status: status, late: late
      });
    }
  }

  var salary = num(p.salary, 0);
  var perDay = P.basis === "monthly"
    ? salary / (P.fixedDays || 26)
    : salary * P.stdHours;                    // hourly basis: salary field holds hourly rate
  var perHour = P.basis === "monthly" ? perDay / (P.stdHours || 8) : salary;

  var creditedDays = r.full + r.half * 0.5;
  var shortfall = Math.max(0, r.workingDays - creditedDays);
  var paidLeave = Math.min(shortfall, num(P.paidLeave, 0));
  var unpaid = Math.max(0, shortfall - paidLeave);
  var lateDeductDays = Math.floor(r.lates / Math.max(1, P.lateMarksPerDeduct)) * num(P.lateDeductDays, 0);
  var otPay = P.otEnabled ? r.ot * perHour * num(P.otRate, 1) : 0;

  var gross, deduction, net;
  if (P.basis === "monthly") {
    gross = salary;
    deduction = (unpaid + lateDeductDays) * perDay;
    net = gross - deduction + otPay;
  } else {
    gross = Math.min(r.hours, r.hours) * perHour;
    deduction = lateDeductDays * perDay;
    net = gross - deduction + (P.otEnabled ? 0 : 0);
    otPay = 0;
  }

  r.perDay = perDay; r.perHour = perHour; r.paidLeave = paidLeave; r.unpaid = unpaid;
  r.lateDeductDays = lateDeductDays; r.otPay = otPay; r.gross = gross;
  r.deduction = deduction; r.net = Math.max(0, net); r.salary = salary;
  r.credited = creditedDays;
  return r;
}

/** Formats a number as currency using the configured symbol, matching the original money() helper. */
export function money(n) {
  var c = (state.cfg && state.cfg.pay && state.cfg.pay.currency) || "";
  return c + Math.round(n).toLocaleString();
}
