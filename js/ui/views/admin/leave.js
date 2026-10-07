/* Admin: Leave requests — approve/reject pending, browse history. */

import { state } from "../../../core/store.js";
import { esc, shortDate } from "../../../utils/format.js";
import { allLeaves } from "../../../domain/leave.js";
import { icons, avatar } from "../../components/icons.js";

function nameFor(id) {
  var p = state.roster.filter(function (x) { return x.id === id; })[0];
  return p ? p.name : "Former staff";
}

function waBtn(l) {
  return '<button class="btn wa small icon" data-act="wa-leave" data-id="' + l.id + '" title="Share on WhatsApp" aria-label="Share on WhatsApp">' + icons.whatsapp + '</button>';
}

function statusTag(status) {
  if (status === "approved") return '<span class="tag on">approved</span>';
  if (status === "rejected") return '<span class="tag">rejected</span>';
  return '<span class="tag pending">pending</span>';
}

var fmt = shortDate;

function row(l, showActions) {
  return '<div class="row' + (showActions ? ' stack' : '') + '">' +
    '<span class="person-cell">' + avatar(nameFor(l.staffId)) +
      '<span>' +
        '<span class="who">' + esc(nameFor(l.staffId)) + '</span>' +
        statusTag(l.status) +
        '<br><span class="meta">' +
          esc(fmt(l.from)) + (l.to !== l.from ? ' – ' + esc(fmt(l.to)) : '') +
          ' · ' + l.days + ' day' + (l.days === 1 ? '' : 's') +
          (l.reason ? ' · ' + esc(l.reason) : '') +
        '</span>' +
      '</span>' +
    '</span>' +
    (showActions
      ? '<span class="acts-line">' +
          '<button class="btn go small" data-act="leaveapprove" data-id="' + l.id + '">Approve</button>' +
          '<button class="btn quiet small" data-act="leavereject" data-id="' + l.id + '">Reject</button>' +
          waBtn(l) +
        '</span>'
      : '<span>' + waBtn(l) + '</span>') +
  '</div>';
}

export function tabLeaveAdmin() {
  var leaves = allLeaves().sort(function (a, b) { return b.requestedAt - a.requestedAt; });
  var pending = leaves.filter(function (l) { return l.status === "pending"; });
  var history = leaves.filter(function (l) { return l.status !== "pending"; });

  var html = '';

  html += '<h2>Pending (' + pending.length + ')</h2>' +
    '<div class="rows">' +
      (pending.length
        ? pending.map(function (l) { return row(l, true); }).join('')
        : '<div class="empty">Nothing pending.</div>') +
    '</div>';

  html += '<h2>History</h2>' +
    '<div class="rows">' +
      (history.length
        ? history.map(function (l) { return row(l, false); }).join('')
        : '<div class="empty">No decided requests yet.</div>') +
    '</div>';

  html += '<p class="msg' + (state.msgOk ? " ok" : "") + '">' + esc(state.msg) + '</p>';
  return html;
}
