/* Admin: Leave requests — approve/reject pending, browse history. */

import { state } from "../../../core/store.js";
import { esc } from "../../../utils/format.js";

function nameFor(id) {
  var p = state.roster.filter(function (x) { return x.id === id; })[0];
  return p ? p.name : "Former staff";
}

function statusTag(status) {
  if (status === "approved") return '<span class="tag on">approved</span>';
  if (status === "rejected") return '<span class="tag">rejected</span>';
  return '<span class="tag pending">pending</span>';
}

function row(l, showActions) {
  return '<div class="row">' +
    '<span>' +
      '<span class="who">' + esc(nameFor(l.staffId)) + '</span>' +
      statusTag(l.status) +
      '<br><span class="meta">' +
        esc(l.from) + (l.to !== l.from ? ' – ' + esc(l.to) : '') +
        ' · ' + l.days + ' day' + (l.days === 1 ? '' : 's') +
        (l.reason ? ' · ' + esc(l.reason) : '') +
      '</span>' +
    '</span>' +
    (showActions
      ? '<span>' +
          '<button class="btn quiet small" data-act="leaveapprove" data-id="' + l.id + '">Approve</button> ' +
          '<button class="btn quiet small" data-act="leavereject" data-id="' + l.id + '">Reject</button>' +
        '</span>'
      : '') +
  '</div>';
}

export function tabLeaveAdmin() {
  var leaves = (state.cfg.leaves || []).slice().sort(function (a, b) { return b.requestedAt - a.requestedAt; });
  var pending = leaves.filter(function (l) { return l.status === "pending"; });
  var history = leaves.filter(function (l) { return l.status !== "pending"; });

  var html = '<h2>Leave requests</h2>';

  html += '<h3>Pending (' + pending.length + ')</h3>' +
    '<div class="rows">' +
      (pending.length
        ? pending.map(function (l) { return row(l, true); }).join('')
        : '<div class="empty">Nothing pending.</div>') +
    '</div>';

  html += '<h3>History</h3>' +
    '<div class="rows">' +
      (history.length
        ? history.map(function (l) { return row(l, false); }).join('')
        : '<div class="empty">No decided requests yet.</div>') +
    '</div>';

  html += '<p class="msg' + (state.msgOk ? " ok" : "") + '">' + esc(state.msg) + '</p>';
  return html;
}
