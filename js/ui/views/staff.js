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
  ymKey,
  shortDate
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
import { icons } from "../components/icons.js";
import { tickedToday } from "../../domain/clients.js";

function clientCount() {
  var on = state.clients.filter(function (c) { return c.active !== false; });
  return on.filter(function (c) { return tickedToday(c.id); }).length + " of " + on.length + " in";
}

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
              month: "short"
            }) +
          '</div>' +
        '</div>' +
      '</div>' +

      '<div class="acts">' +
        (
          state.me.admin
            ? '<button class="btn quiet small" data-act="goadmin">' + icons.shield + 'Admin</button>'
            : ""
        ) +
        '<button class="btn quiet small" data-act="signout" aria-label="Sign out" title="Sign out">' + icons.out + (state.me.admin ? "" : "Sign out") + '</button>' +
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
    ? "Since " + tClock(open.entry.start) + (open.entry.shiftName ? " · " + open.entry.shiftName : "")
    : (
        tot
          ? "Worked today"
          : "Tap below when you arrive"
      );

  var chip = open
    ? '<div class="chip on"><i></i>On shift</div>'
    : '<div class="chip"><i></i>' + (tot ? "Off the clock" : "Not clocked in") + '</div>';

  var btn = open
    ? '<button class="punch out" data-act="out" ' +
        (allTasksDone ? "" : "disabled") +
        '>' + icons.out + 'Clock out</button>'
    : '<button class="punch" data-act="in" ' +
        (inside ? "" : "disabled") +
        '>' + icons.login + 'Clock in</button>';

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

    '<div class="clock' + (open ? " live" : "") + '">' +
      chip +

      '<div class="read">' +
        read +
      '</div>' +

      '<div class="cap">' +
        esc(cap) +
      '</div>' +

      taskHtml +

      btn +
      why +
    '</div>' +

    '<button class="cl-launch" data-act="cl-open">' +
      '<span class="cl-ico">' + icons.clock + '</span>' +
      '<span><b>Client attendance</b><br><span>Tick the clients who came today' + (state.clLoaded ? ' · ' + clientCount() : '') + '</span></span>' +
      '<span class="cl-go">›</span>' +
    '</button>' +

    myMonth() +
    myHistory() +
    myLeave()
  );

  function myMonth() {
    var r = payrollFor(
      state.me,
      ymKey(Date.now())
    );

    return (
      "<h2>" + monthLabel(ymKey(Date.now())) + "</h2>" +
      '<div class="tiles">' +
        '<div class="tile"><span class="k">Days present</span><span class="v">' +
          (r.credited % 1 ? r.credited.toFixed(1) : r.credited) +
          /* "of N" counts finished working days only, so leave it off on day one */
          (r.workingDays ? '<small>of ' + r.workingDays + '</small>' : '') + '</span></div>' +
        '<div class="tile"><span class="k">Hours worked</span><span class="v">' +
          r.hours.toFixed(1) + '<small>h</small></span></div>' +
        '<div class="tile"><span class="k">Late arrivals</span><span class="v">' + r.lates + '</span></div>' +
        (r.salary
          ? '<div class="tile gold"><span class="k">Estimated pay</span><span class="v">' + money(r.net) + '</span></div>'
          : '<div class="tile"><span class="k">Approved leave</span><span class="v">' + r.leave + '<small>days</small></span></div>') +
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
        '<h2>Recent shifts</h2>' +
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
      '<h2>Recent shifts</h2>' +
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
    var usedPct = bal.total ? Math.min(100, Math.round((bal.total - bal.remaining) / bal.total * 100)) : 0;

    var html =
      '<h2>Leave</h2>' +
      '<div class="card">' +
        '<div class="balance">' +
          '<div><span class="k">Left this year</span><span class="v">' + bal.remaining + ' <small>of ' + bal.total + ' days</small></span></div>' +
          '<div class="side">' + bal.used + ' used' + (bal.pending ? '<br>' + bal.pending + ' pending' : '') + '</div>' +
        '</div>' +
        '<div class="meter"><i style="width:' + usedPct + '%"></i></div>' +

        '<div class="field pair">' +
          '<div><label for="lv_from">From</label><input id="lv_from" type="date"></div>' +
          '<div><label for="lv_to">To</label><input id="lv_to" type="date"></div>' +
        '</div>' +
        '<div class="field"><label for="lv_reason">Reason (optional)</label>' +
          '<input id="lv_reason" type="text" placeholder="e.g. Family function"></div>' +
        '<div class="btnrow"><button class="btn go wide" data-act="leaverequest">Request leave</button></div>' +
        '<p class="msg' + (state.msgOk ? " ok" : "") + '">' + esc(state.msg) + '</p>' +
      '</div>';

    if (mine.length) {
      html += '<div class="rows">' +
        mine.map(function (l) {
          return '<div class="row">' +
            '<span>' +
              '<span class="span">' +
                esc(fmtRange(l.from, l.to)) +
                (l.status === "approved" ? '<span class="tag on">approved</span>'
                  : l.status === "rejected" ? '<span class="tag">rejected</span>'
                  : '<span class="tag pending">pending</span>') +
              '</span>' +
              '<br><span class="meta">' + l.days + ' day' + (l.days === 1 ? '' : 's') + (l.reason ? ' · ' + esc(l.reason) : '') + '</span>' +
            '</span>' +
            '<span>' +
              '<button class="btn wa small icon" data-act="wa-leave" data-id="' + l.id + '" title="Share on WhatsApp" aria-label="Share on WhatsApp">' + icons.whatsapp + '</button>' +
              (l.status === "pending"
                ? '<button class="btn quiet small" data-act="leavecancel" data-id="' + l.id + '">Cancel</button>'
                : '') +
            '</span>' +
          '</div>';
        }).join('') +
      '</div>';
    }

    return html;
  }
}

/* "2026-10-08" .. "2026-10-09" -> "8 Oct – 9 Oct" */
function fmtRange(from, to) {
  var f = shortDate;
  return from === to ? f(from) : f(from) + " – " + f(to);
}
