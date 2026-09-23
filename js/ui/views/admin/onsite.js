/* "On site" tab: who's currently clocked in, who isn't. Ported verbatim from tabOnsite() in the original app.js. */
import { state } from "../../../core/store.js";
import { esc, hm, tClock } from "../../../utils/format.js";
import { openEntryFor, todayTotalFor } from "../../../domain/attendance.js";

export function tabOnsite() {
  var inNow = [], off = [];
  state.roster.filter(function (p) { return p.active !== false; }).forEach(function (p) {
    var o = openEntryFor(p.id);
    if (o) inNow.push({ p: p, e: o.entry }); else off.push(p);
  });
  var html = '<div class="stat"><span class="k">On site right now</span><span class="v">' + inNow.length + " / " + (inNow.length + off.length) + "</span></div>";
  html += "<h2>Clocked in</h2>";
  if (!inNow.length) html += '<div class="rows"><div class="empty">Nobody is clocked in.</div></div>';
  else {
    html += '<div class="rows">';
    inNow.sort(function (a, b) { return a.e.start - b.e.start; }).forEach(function (r) {
      html += '<div class="row"><span><span class="who">' + esc(r.p.name) + '</span><br><span class="meta">Since ' + tClock(r.e.start) +
        "</span></span><span class=\"dur\">" + hm(Date.now() - r.e.start) + "</span></div>";
    });
    html += "</div>";
  }
  html += "<h2>Not clocked in</h2>" + (off.length
    ? '<div class="rows">' + off.map(function (p) {
        var t = todayTotalFor(p.id);
        return '<div class="row"><span class="who">' + esc(p.name) + '</span><span class="meta">' + (t ? hm(t) + " today" : "—") + "</span></div>";
      }).join("") + "</div>"
    : '<div class="rows"><div class="empty">Everyone is on site.</div></div>');
  html += '<div class="btnrow"><button class="btn quiet" data-act="refresh">Refresh</button></div>';
  return html;
}
