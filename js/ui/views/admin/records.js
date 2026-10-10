/* Records tab: day-by-day punches for a month, optionally filtered to one person. */

import { state } from "../../../core/store.js";
import { esc, hm, tClock, dayKey, dayLabel, monthLabel, minsOfDay, parseHM } from "../../../utils/format.js";
import { monthOptions } from "../../components/monthOptions.js";
import { icons } from "../../components/icons.js";
import { recRange, rangeText, periodStats, PERIODS } from "../../../domain/reports.js";

export function tabRecords() {
  var ym = state.month, only = state.recPerson, per = state.recPeriod || "month", R = recRange();

  var html =
    '<div class="pills scroll" role="tablist" aria-label="Period">' +
      PERIODS.map(function (x) { return '<button class="pill' + (per === x[0] ? " on" : "") + '" data-act="rec-period" data-v="' + x[0] + '">' + x[1] + "</button>"; }).join("") +
    "</div>" +
    '<div class="field pair">' +
      (per === "custom"
        ? '<div><label for="r_from">From</label><input id="r_from" type="date" value="' + esc(state.recFrom || "") + '" /></div>' +
          '<div><label for="r_to">To</label><input id="r_to" type="date" value="' + esc(state.recTo || "") + '" /></div></div><div class="field">'
        : per === "month" ? '<div><label for="r_month">Month</label><select id="r_month">' + monthOptions() + '</select></div>' : "") +

      '<div><label for="r_person">Who</label><select id="r_person">' +
        '<option value="all" ' + (only === "all" ? "selected" : "") + '>Everyone</option>' +
        state.roster.map(function (p) {
          return '<option value="' + p.id + '" ' +
            (only === p.id ? "selected" : "") + '>' +
            esc(p.name) +
          '</option>';
        }).join("") +
      '</select></div>' +
    '</div>';

  if (R.error) return html + '<div class="rows"><div class="empty">' + esc(R.error) + "</div></div>";
  var rangeName = per === "month" ? monthLabel(ym) : (R.title === "Attendance report" ? "" : R.title + " · ") + rangeText(R.from, R.to);

  html += '<div class="btnrow">' + (per === "month"
      ? '<button class="btn wa" data-act="wa-weekly">' + icons.whatsapp + 'Weekly</button>' +
        '<button class="btn wa" data-act="wa-monthly">' + icons.whatsapp + esc(monthLabel(ym).split(" ")[0]) + ' report</button>'
      : '<button class="btn wa wide" data-act="wa-period">' + icons.whatsapp + "Share this report</button>") +
    '</div><p class="note">Opens WhatsApp with the report ready — pick your group and send.</p>';

  /* Per-person totals for the period (same counting as the WhatsApp reports). */
  var people = state.roster.filter(function (p) { return only === "all" ? p.active !== false : p.id === only; })
    .sort(function (a, b) { return a.name.localeCompare(b.name); });
  if (state.adminLoaded && people.length) {
    html += '<div class="list-head"><h2>' + esc(rangeName) + '</h2></div><div class="rows rec-sum">' + people.map(function (p) {
      var s = periodStats(p, R.from, R.to);
      return '<div class="row"><span><span class="who">' + esc(p.name) + '</span><br><span class="meta">' +
        s.days + " day" + (s.days === 1 ? "" : "s") + " present · late " + s.late + " · leave " + s.leave + " · absent " + s.absent +
        '</span></span><span class="dur">' + hm(s.ms) + "</span></div>";
    }).join("") + "</div>";
  }

  var byDay = {}, days = [];

  state.roster.forEach(function (p) {
    if (only !== "all" && p.id !== only) return;

    Object.keys(state.logs).forEach(function (lk) {
      if (lk.indexOf("log:" + p.id + ":") !== 0) return;
      var lm = lk.slice(-6);
      if (lm < R.from.slice(0, 7).replace("-", "") || lm > R.to.slice(0, 7).replace("-", "")) return;
      (state.logs[lk] || []).forEach(function (e) {
        var k = dayKey(e.start);
        if (k < R.from || k > R.to) return;

        if (!byDay[k]) {
          byDay[k] = [];
          days.push(k);
        }

        byDay[k].push({
          person: p,
          entry: e
        });
      });
    });
  });

  days.sort().reverse();

  if (!days.length) {
    return html +
      '<div class="rows">' +
        '<div class="empty">No punches recorded ' + (per === "month" ? "in " + monthLabel(ym) : "for " + esc(rangeText(R.from, R.to))) +
        '.</div>' +
      '</div>' +
      '<p class="msg">' + (state.msg ? esc(state.msg) : "") + '</p>';
  }

  var shiftStart = parseHM(state.cfg.pay.shiftStart);
  var grace = state.cfg.pay.lateGrace;
  var totalMs = 0;
  var totalPunches = 0;
  var body = "";

  days.forEach(function (k) {
    var items = byDay[k].sort(function (a, b) {
      return a.entry.start - b.entry.start;
    });

    var dayMs = 0;
    var dayHtml =
      '<div class="day">' +
        '<span>' + dayLabel(k) + '</span>' +
        '<b class="day-total"></b>' +
      '</div>';

    items.forEach(function (item) {
      var e = item.entry;
      var p = item.person;

      if (e.end) {
        dayMs += e.end - e.start;
        totalMs += e.end - e.start;
      }

      totalPunches++;

      var late = false;

      if (e.start && shiftStart !== null) {
        /* Same rule as payroll.js: the punch's own shift start if it had one. */
        late = minsOfDay(e.start) > (e.shiftStart ? parseHM(e.shiftStart) : shiftStart) + grace;
      }

      var when = tClock(e.start) +
        " – " +
        (e.end ? tClock(e.end) : "still in");

      var taskHtml = "";

      if (Array.isArray(e.mandatoryTasks) && e.mandatoryTasks.length) {
        var completed = Array.isArray(e.mandatoryTasksCompleted)
          ? e.mandatoryTasksCompleted
          : (e.mandatoryTasksDone ? e.mandatoryTasks.slice() : []);

        taskHtml =
          '<div class="record-tasks">' +
            '<span class="task-title">Mandatory tasks</span>' +
            e.mandatoryTasks.map(function (task) {
              var done = completed.indexOf(task) !== -1;
              return '<span class="' + (done ? "task-done" : "task-not-done") + '">' +
                (done ? "✓ " : "○ ") +
                esc(task) +
              '</span>';
            }).join("") +
          '</div>' +

          '<div class="record-task-status ' +
            (e.mandatoryTasksDone ? "done" : "not-done") +
          '">' +
            (e.mandatoryTasksDone
              ? "✓ All mandatory tasks completed"
              : "⚠ Mandatory tasks incomplete") +
          '</div>';
      }

      var tags =
        (late ? '<span class="tag">late in</span>' : "") +
        (e.auto ? '<span class="tag">auto</span>' : "") +
        (!e.end ? '<span class="tag on">on shift</span>' : "");

      dayHtml +=
        '<div class="row record-row">' +
          '<div class="record-main">' +
            (only === "all"
              ? '<span class="who">' + esc(p.name) + '</span><br>'
              : "") +
            '<span class="span">' + when + tags + '</span>' +
            (e.shiftName ? '<br><span class="meta">' + esc(e.shiftName) + ' (' + esc(e.shiftStart) + '–' + esc(e.shiftEnd) + ')</span>' : "") +
            taskHtml +
          '</div>' +
          '<span class="dur">' +
            hm(e.end ? e.end - e.start : Date.now() - e.start) +
          '</span>' +
        '</div>';
    });

    dayHtml = dayHtml.replace(
      '<b class="day-total"></b>',
      '<b>' + hm(dayMs) + '</b>'
    );

    body += dayHtml;
  });

  html +=
    '<div class="stat">' +
      '<span class="k">' +
        totalPunches +
        ' punch' +
        (totalPunches === 1 ? "" : "es") +
        ' over ' +
        days.length +
        ' day' +
        (days.length === 1 ? "" : "s") +
      '</span>' +
      '<span class="v">' +
        (totalMs / 3600000).toFixed(1) +
        ' h' +
      '</span>' +
    '</div>' +

    '<h2>Clock-ins and clock-outs</h2>' +
    '<div class="rows">' +
      body +
    '</div>' +

    '<div class="btnrow">' +
      '<button class="btn go" data-act="xlsx">' + icons.download + 'Excel</button>' +
      '<button class="btn quiet" data-act="refresh">' + icons.refresh + 'Refresh</button>' +
    '</div>' +

    '<p class="msg">' +
      (state.msg ? esc(state.msg) : "") +
    '</p>';

  return html;
}
