/* Records tab: day-by-day punches for a month, optionally filtered to one person. */

import { state } from "../../../core/store.js";
import { esc, hm, tClock, dayKey, dayLabel, monthLabel, minsOfDay, parseHM } from "../../../utils/format.js";
import { monthOptions } from "../../components/monthOptions.js";

export function tabRecords() {
  var ym = state.month, only = state.recPerson;

  var html =
    '<div class="field pair">' +
      '<div><label for="r_month">Month</label><select id="r_month">' +
        monthOptions() +
      '</select></div>' +

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

  var byDay = {}, days = [];

  state.roster.forEach(function (p) {
    if (only !== "all" && p.id !== only) return;

    (state.logs["log:" + p.id + ":" + ym.replace("-", "")] || []).forEach(function (e) {
      var k = dayKey(e.start);

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

  days.sort().reverse();

  if (!days.length) {
    return html +
      '<div class="rows">' +
        '<div class="empty">No punches recorded in ' +
        monthLabel(ym) +
        '.</div>' +
      '</div>';
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
        late = minsOfDay(e.start) > shiftStart + grace;
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

    '<div class="rows">' +
      body +
    '</div>' +

    '<div class="btnrow">' +
      '<button class="btn go" data-act="xlsx">Download Excel</button>' +
      '<button class="btn quiet" data-act="refresh">Refresh</button>' +
    '</div>' +

    '<p class="msg">' +
      (state.msg ? esc(state.msg) : "") +
    '</p>';

  return html;
}
