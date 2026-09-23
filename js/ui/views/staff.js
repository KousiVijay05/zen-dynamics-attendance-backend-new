/* ---------------------------------------------------------------
   Staff dashboard: today's clock, this month's summary, shift
   history. Ported verbatim from vStaff()/myMonth()/myHistory() in
   the original app.js.
----------------------------------------------------------------*/

import { state, geo } from "../../core/store.js";

import {
  esc,
  hms,
  hm,
  tClock,
  dayKey,
  dayLabel,
  monthLabel,
  ymKey
} from "../../utils/format.js";

import { distanceNow } from "../../domain/geofence.js";
import {
  openEntryFor,
  enforceBoundary,
  logKey
} from "../../domain/attendance.js";

import { payrollFor, money } from "../../domain/payroll.js";
import { leaveBalance, leavesFor } from "../../domain/leave.js";
import { proxBlock, lockedBlock } from "../components/proximity.js";
import { brandMark } from "../components/brand.js";

export function vStaff() {
  enforceBoundary();

  var d = distanceNow();
  var s = state.cfg.site;
  var open = openEntryFor(state.me.id);

  var taskEntryKey = open
    ? "zen-dynamics-task-done:" + state.me.id + ":" + open.entry.id
    : "";

  var assignedTasks = open && Array.isArray(open.entry.mandatoryTasks)
    ? open.entry.mandatoryTasks
    : (Array.isArray(state.me.tasks) ? state.me.tasks : []);

  var completedTasks = [];

  try {
    var savedTasks = localStorage.getItem(taskEntryKey);
    completedTasks = savedTasks
      ? JSON.parse(savedTasks) || []
      : [];
  } catch (e) {
    completedTasks = [];
  }

  var allTasksDone =
    assignedTasks.length === 0 ||
    assignedTasks.every(function (task, index) {
      return completedTasks.indexOf(index) !== -1;
    });

  var inside = d !== null && d <= s.radius;

  var locked =
    state.cfg.lockOutside &&
    !inside &&
    !(state.me.admin && state.cfg.adminAnywhere);

  var head =
    '<div class="bar">' +
      '<div class="idn">' +
        brandMark() +
        '<div>' +
          '<div class="nm">' +
            esc(state.me.name) +
          '</div>' +
          '<div class="sub">' +
            new Date().toLocaleDateString([], {
              weekday: "long",
              day: "numeric",
              month: "long"
            }) +
          '</div>' +
        '</div>' +
      '</div>' +

      '<div class="acts">' +
        (
          state.me.admin
            ? '<button class="btn quiet small" data-act="goadmin">Admin</button>'
            : ""
        ) +
        '<button class="btn quiet small" data-act="signout">Sign out</button>' +
      '</div>' +
    '</div>';

  if (locked) {
    return (
      head +
      proxBlock() +
      lockedBlock(d, !!open) +
      (
        d === null
          ? ""
          : '<p class="why warn">Clock-in and clock-out only work inside the zone.</p>'
      ) +
      myLeave()
    );
  }

  var tot = 0;
  var todayK = dayKey(Date.now());

  (
    state.logs[logKey(state.me.id, Date.now())] || []
  ).forEach(function (e) {
    if (
      e.end &&
      dayKey(e.start) === todayK
    ) {
      tot += e.end - e.start;
    }
  });

  var read = open
    ? hms(Date.now() - open.entry.start)
    : hms(tot);

  var cap = open
    ? "On shift since " + tClock(open.entry.start)
    : (
        tot
          ? "Logged today"
          : "Not clocked in"
      );

  var btn = open
    ? '<button class="punch out" data-act="out" ' +
        (allTasksDone ? "" : "disabled") +
        '>Clock out</button>'
    : '<button class="punch" data-act="in" ' +
        (inside ? "" : "disabled") +
        '>Clock in</button>';

  var taskHtml = "";

  if (open && assignedTasks.length) {
    taskHtml =
      '<div class="mandatory-tasks">' +
        '<h3>Mandatory Tasks</h3>' +

        assignedTasks
          .map(function (task, index) {
            var checked =
              completedTasks.indexOf(index) !== -1;

            return (
              '<label class="task-item">' +
                '<input type="checkbox" ' +
                  'data-act="tasktoggle" ' +
                  'data-task-index="' + index + '"' +
                  (checked ? " checked" : "") +
                ' />' +
                '<span>' + esc(task) + '</span>' +
              '</label>'
            );
          })
          .join("") +

        (
          !allTasksDone
            ? '<p class="task-warning">Complete all mandatory tasks before clocking out.</p>'
            : ""
        ) +

      '</div>';
  }

  var why = open
    ? '<p class="why"></p>'
    : inside
      ? '<p class="why"></p>'
      : '<p class="why warn">' +
          esc(
            d === null
              ? (geo.err || "Waiting for a location fix.")
              : "You're " +
                Math.round(d - s.radius) +
                " m outside the zone."
          ) +
        "</p>";

  return (
    head +
    proxBlock() +

    '<div class="clock">' +
      (open ? '<div class="live">live</div>' : "") +

      '<div class="read">' +
        read +
      '</div>' +

      '<div class="cap">' +
        esc(cap) +
      '</div>' +

      taskHtml +

      btn +
      why +

      myMonth() +
      myHistory() +
      myLeave() +

    '</div>'
  );

  function myMonth() {
    var r = payrollFor(
      state.me,
      ymKey(Date.now())
    );

    return (
      "<h2>" +
        monthLabel(ymKey(Date.now())) +
      "</h2>" +

      '<div class="rows">' +

        '<div class="row">' +
          '<span>Days present</span>' +
          '<span class="dur">' +
            r.credited.toFixed(1) +
            " / " +
            r.workingDays +
          '</span>' +
        '</div>' +

        '<div class="row">' +
          '<span>Hours worked</span>' +
          '<span class="dur">' +
            r.hours.toFixed(1) +
          '</span>' +
        '</div>' +

        '<div class="row">' +
          '<span>Late arrivals</span>' +
          '<span class="dur">' +
            r.lates +
          '</span>' +
        '</div>' +

        (
          r.salary
            ? '<div class="row">' +
                '<span>Estimated pay</span>' +
                '<span class="dur">' +
                  money(r.net) +
                '</span>' +
              '</div>'
            : ""
        ) +

      '</div>'
    );
  }

  function myHistory() {
    var now = Date.now();

    var all =
      (
        state.logs[logKey(state.me.id, now)] || []
      ).concat(
        state.logs[
          logKey(state.me.id, now - 40 * 864e5)
        ] || []
      );

    var done = all
      .filter(function (e) {
        return e.end;
      })
      .sort(function (a, b) {
        return b.start - a.start;
      })
      .slice(0, 20);

    if (!done.length) {
      return (
        '<h2>Your shifts</h2>' +
        '<div class="rows">' +
          '<div class="empty">No completed shifts yet.</div>' +
        '</div>'
      );
    }

    var groups = [];
    var ix = {};

    done.forEach(function (e) {
      var k = dayKey(e.start);

      if (!(k in ix)) {
        ix[k] = groups.length;

        groups.push({
          k: k,
          items: [],
          total: 0
        });
      }

      groups[ix[k]].items.push(e);
      groups[ix[k]].total += e.end - e.start;
    });

    var html =
      '<h2>Your shifts</h2>' +
      '<div class="rows">';

    groups.forEach(function (g) {
      html +=
        '<div class="day">' +
          '<span>' +
            dayLabel(g.k) +
          '</span>' +

          '<b>' +
            hm(g.total) +
          '</b>' +

        '</div>';

      g.items.forEach(function (e) {
        html +=
          '<div class="row">' +

            '<span class="span">' +
              tClock(e.start) +
              " – " +
              tClock(e.end) +

              (
                e.auto
                  ? '<span class="tag">auto</span>'
                  : ""
              ) +

            '</span>' +

            '<span class="dur">' +
              hm(e.end - e.start) +
            '</span>' +

          '</div>';
      });
    });

    html += "</div>";

    return html;
  }

  function myLeave() {
    var bal = leaveBalance(state.me.id, new Date().getFullYear());
    var mine = leavesFor(state.me.id).slice().sort(function (a, b) { return b.requestedAt - a.requestedAt; });

    var html =
      '<h2>Leave</h2>' +
      '<div class="stat"><span class="k">Remaining this year</span><span class="v">' +
        bal.remaining + ' / ' + bal.total +
      '</span></div>' +

      '<div class="field pair">' +
        '<div><label for="lv_from">From</label><input id="lv_from" type="date"></div>' +
        '<div><label for="lv_to">To</label><input id="lv_to" type="date"></div>' +
      '</div>' +
      '<div class="field"><label for="lv_reason">Reason (optional)</label>' +
        '<input id="lv_reason" type="text" placeholder="e.g. Family event"></div>' +
      '<div class="btnrow"><button class="btn go wide" data-act="leaverequest">Request leave</button></div>' +
      '<p class="msg' + (state.msgOk ? " ok" : "") + '">' + esc(state.msg) + '</p>';

    if (mine.length) {
      html += '<div class="rows">' +
        mine.map(function (l) {
          return '<div class="row">' +
            '<span>' +
              '<span class="span">' +
                esc(l.from) + (l.to !== l.from ? ' – ' + esc(l.to) : '') +
                (l.status === "approved" ? '<span class="tag on">approved</span>'
                  : l.status === "rejected" ? '<span class="tag">rejected</span>'
                  : '<span class="tag pending">pending</span>') +
              '</span>' +
              (l.reason ? '<br><span class="meta">' + esc(l.reason) + '</span>' : '') +
            '</span>' +
            (l.status === "pending"
              ? '<button class="btn quiet small" data-act="leavecancel" data-id="' + l.id + '">Cancel</button>'
              : '<span class="dur">' + l.days + 'd</span>') +
          '</div>';
        }).join('') +
      '</div>';
    }

    return html;
  }
}