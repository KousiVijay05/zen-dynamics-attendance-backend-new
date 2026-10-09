/* Client attendance (coaches and admins): search, then one tap per client
   to tick them in for today. Shows each client's plan status. No phone
   numbers or payments here — coaches can't read those at all. */
import { state } from "../../core/store.js";
import { esc, tClock } from "../../utils/format.js";
import { clientStatus, tickedToday } from "../../domain/clients.js";
import { brandMark } from "../components/brand.js";
import { icons, avatar } from "../components/icons.js";
import { distanceNow } from "../../domain/geofence.js";
import { enforceBoundary } from "../../domain/attendance.js";
import { proxBlock, lockedBlock } from "../components/proximity.js";

var CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

function coachName(id) {
  if (state.me && id === state.me.id) return "you";
  var p = state.roster.filter(function (x) { return x.id === id; })[0];
  return p ? p.name.split(" ")[0] : "a coach";
}

export function vClientTick() {
  var head = '<div class="bar"><div class="idn">' + brandMark() + '<div><div class="nm">Client attendance</div>' +
    '<div class="sub">' + new Date().toLocaleDateString([], { weekday: "long", day: "numeric", month: "short" }) + "</div></div></div>" +
    '<div class="acts"><button class="btn quiet small" data-act="cl-back">' + icons.back + "Back</button></div></div>";

  enforceBoundary();
  var d = distanceNow(), s = state.cfg.site;
  var locked = state.cfg.lockOutside && !(d !== null && d <= s.radius) && !(state.me.admin && state.cfg.adminAnywhere);
  if (locked) return head + proxBlock() + lockedBlock(d, false) + '<p class="why warn">Client attendance can only be marked at the gym.</p>';
  if (!state.clLoaded) return head + '<div class="loading">Loading clients…</div>';

  var q = (state.clSearch || "").trim().toLowerCase();
  var list = state.clients.filter(function (c) { return c.active !== false; })
    .sort(function (a, b) { return a.name.localeCompare(b.name); });
  var ticked = list.filter(function (c) { return tickedToday(c.id); }).length;
  var shown = q ? list.filter(function (c) { return c.name.toLowerCase().indexOf(q) >= 0; }) : list;

  var html = head +
    '<div class="hero-stat"><span class="k">Checked in today</span>' +
      '<span class="v">' + ticked + "<small> / " + list.length + " clients</small></span>" +
      '<div class="meter"><i style="width:' + (list.length ? Math.round(ticked / list.length * 100) : 0) + '%"></i></div></div>' +
    '<div class="field"><input id="cl_search" type="search" autocomplete="off" placeholder="Search clients…" value="' + esc(state.clSearch || "") + '" /></div>';

  if (!list.length) return html + '<div class="rows" style="margin-top:12px"><div class="empty">No clients yet. An admin adds them in Admin → Clients.</div></div>';
  if (!shown.length) return html + '<div class="rows" style="margin-top:12px"><div class="empty">No client matches “' + esc(q) + "”.</div></div>";

  html += '<div class="rows" style="margin-top:12px">' + shown.map(function (c) {
    var st = clientStatus(c), t = tickedToday(c.id);
    var pill = '<span class="tag ' + (st.kind === "expired" ? "" : st.kind === "soon" ? "pending" : "on") + '">' + esc(st.short) + "</span>";
    return '<div class="row cl-row' + (t ? " is-in" : "") + '">' +
      '<span class="person-cell">' + avatar(c.name, t ? "in" : "") +
        '<span><span class="who">' + esc(c.name) + "</span>" + pill +
        '<br><span class="meta">' + (t ? "In at " + tClock(t.at) + " · by " + esc(coachName(t.by)) : esc(st.label)) + "</span></span></span>" +
      '<button class="tick' + (t ? " on" : "") + '" data-act="cl-tick" data-id="' + esc(c.id) + '" aria-pressed="' + (t ? "true" : "false") +
        '" aria-label="' + (t ? "Untick " : "Tick ") + esc(c.name) + '">' + CHECK + "</button>" +
    "</div>";
  }).join("") + "</div>";
  html += '<p class="msg' + (state.msgOk ? " ok" : "") + '">' + esc(state.msg) + "</p>";
  html += '<p class="note">Tap ✓ when a client arrives. Tap again to undo a mistake (only your own ticks). Expired or nearly-expired clients are flagged — tell the admin.</p>';
  return html;
}
