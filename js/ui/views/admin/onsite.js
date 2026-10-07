/* "On site" tab: who's clocked in right now, who isn't. */
import { state } from "../../../core/store.js";
import { esc, hm, tClock } from "../../../utils/format.js";
import { openEntryFor, todayTotalFor } from "../../../domain/attendance.js";
import { icons, avatar } from "../../components/icons.js";

export function tabOnsite() {
  var inNow = [], off = [];
  state.roster.filter(function (p) { return p.active !== false; }).forEach(function (p) {
    var o = openEntryFor(p.id);
    if (o) inNow.push({ p: p, e: o.entry }); else off.push(p);
  });
  var total = inNow.length + off.length;
  var pct = total ? Math.round(inNow.length / total * 100) : 0;

  var html = '<div class="hero-stat"><span class="k">On site right now</span>' +
    '<span class="v">' + inNow.length + "<small> / " + total + " staff</small></span>" +
    '<div class="meter"><i style="width:' + pct + '%"></i></div></div>';

  html += "<h2>Clocked in</h2>";
  if (!inNow.length) html += '<div class="rows"><div class="empty">Nobody is clocked in.</div></div>';
  else {
    html += '<div class="rows">';
    inNow.sort(function (a, b) { return a.e.start - b.e.start; }).forEach(function (r) {
      html += '<div class="row"><span class="person-cell">' + avatar(r.p.name, "in") +
        '<span><span class="who">' + esc(r.p.name) + '</span><br><span class="meta">Since ' + tClock(r.e.start) +
        (r.e.shiftName ? " · " + esc(r.e.shiftName) : "") + "</span></span></span>" +
        '<span class="dur">' + hm(Date.now() - r.e.start) + "</span></div>";
    });
    html += "</div>";
  }
  html += "<h2>Not clocked in</h2>" + (off.length
    ? '<div class="rows">' + off.map(function (p) {
        var t = todayTotalFor(p.id);
        return '<div class="row"><span class="person-cell">' + avatar(p.name, "dim") +
          '<span class="who">' + esc(p.name) + '</span></span><span class="meta">' + (t ? hm(t) + " today" : "—") + "</span></div>";
      }).join("") + "</div>"
    : '<div class="rows"><div class="empty">Everyone is on site.</div></div>');
  html += '<div class="btnrow"><button class="btn wa wide" data-act="wa-image">' + icons.whatsapp + "Share today's attendance</button></div>";
  var shifts = state.cfg.shifts || [];
  if (shifts.length) {
    html += '<div class="shift-share"><span>Or just one shift:</span>' + shifts.map(function (s) {
      return '<button class="chip-btn" data-act="wa-image" data-id="' + esc(s.id) + '">' + esc(s.name) + "</button>";
    }).join("") + "</div>";
  }
  html += '<div style="text-align:center"><button class="linkish" data-act="wa-daily">Send as text instead</button></div>';
  html += '<p class="msg' + (state.msgOk ? " ok" : "") + '">' + esc(state.msg) + "</p>";
  html += '<div class="btnrow"><button class="btn quiet wide" data-act="refresh">' + icons.refresh + "Refresh</button></div>";
  return html;
}
