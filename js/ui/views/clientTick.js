/* Client sessions (coaches and admins).
   Start a session for a batch → tick who's present → Submit. Marks are
   saved only on Submit and can't be deleted: the coach who made a mark
   can undo it (void it) within 10 minutes; after that only an admin can
   void it, with a reason. Voided marks stay visible. No phone numbers or
   payments here — coaches can't read those at all. */
import { state } from "../../core/store.js";
import { esc, tClock, hm12 } from "../../utils/format.js";
import { clientStatus, tickedToday, markToday, batches, suggestedBatch, sessionsOn, canVoid, undoMinutesLeft, today, coachList, alertFor, renewalAlerts } from "../../domain/clients.js";
import { brandMark } from "../components/brand.js";
import { icons, avatar } from "../components/icons.js";
import { distanceNow } from "../../domain/geofence.js";
import { enforceBoundary } from "../../domain/attendance.js";
import { proxBlock, lockedBlock } from "../components/proximity.js";

var CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

function who(id, name) {
  if (state.me && id === state.me.id) return "you";
  if (name) return name.split(" ")[0];
  var p = state.roster.filter(function (x) { return x.id === id; })[0];
  return p ? p.name.split(" ")[0] : "a coach";
}
function pill(st) {
  return '<span class="tag ' + (st.kind === "expired" ? "" : st.kind === "soon" || st.kind === "future" || st.kind === "none" || st.kind === "paused" ? "pending" : "on") + '">' + esc(st.short) + "</span>";
}

/* Who to talk to about renewing: ending within 3 days, or recently expired. Names and dates only. */
function reminders() {
  var r = renewalAlerts(), n = r.soon.length + r.expired.length;
  if (!n) return "";
  var row = function (c, cls) {
    var st = clientStatus(c), in_ = tickedToday(c.id);
    return '<div class="row"><span class="person-cell">' + avatar(c.name, in_ ? "in" : "") + '<span><span class="who">' + esc(c.name) + "</span>" +
      '<span class="tag ' + cls + '">' + esc(st.short) + '</span><br><span class="meta">' + esc((c.plan ? c.plan.name + " · " : "") + st.label) + (in_ ? " · here today" : "") + "</span></span></span></div>";
  };
  return '<details class="sess renewals"' + (n <= 6 ? " open" : "") + '><summary><span><span class="who">Renewal reminders</span><br><span class="meta">' +
      (r.soon.length ? r.soon.length + " ending in 3 days" : "") + (r.soon.length && r.expired.length ? " · " : "") + (r.expired.length ? r.expired.length + " expired" : "") +
      ' — please remind them</span></span><span class="dur">' + n + "</span></summary>" +
    '<div class="rows">' + r.soon.map(function (c) { return row(c, "pending"); }).join("") + r.expired.map(function (c) { return row(c, "warn"); }).join("") + "</div></details>";
}

/* Taking a session: search, tick, submit. */
function taking() {
  var s = state.session;
  var q = (state.clSearch || "").trim().toLowerCase();
  var list = state.clients.filter(function (c) { return c.active !== false; }).sort(function (a, b) { return a.name.localeCompare(b.name); });
  var shown = q ? list.filter(function (c) { return c.name.toLowerCase().indexOf(q) >= 0; }) : list;
  var picked = Object.keys(s.picked).filter(function (id) { return !tickedToday(id); }).length;

  var html = '<div class="hero-stat"><span class="k">' + esc(s.batchName) + " · " + esc(s.coachName || "") + " · started " + tClock(s.start) + '</span>' +
      '<span class="v">' + picked + "<small> ticked</small></span>" +
      '<div class="meter"><i style="width:' + (list.length ? Math.round(picked / list.length * 100) : 0) + '%"></i></div></div>' +
    '<div class="field"><input id="cl_search" type="search" autocomplete="off" placeholder="Search clients…" value="' + esc(state.clSearch || "") + '" /></div>';

  if (!list.length) return html + '<div class="rows" style="margin-top:12px"><div class="empty">No clients yet. An admin adds them in Admin → Clients.</div></div>';
  html += '<div class="rows" style="margin-top:12px">' + (shown.length ? shown.map(function (c) {
    var st = clientStatus(c), done = tickedToday(c.id), on = !!s.picked[c.id] && !done, al = alertFor(c);
    var meta = done ? "Already in · " + esc(done.batchName || "") + " · by " + esc(who(done.by, done.byName)) : esc(st.label);
    return '<div class="row cl-row' + (on ? " is-in" : "") + (done ? " is-done" : "") + (al ? " needs-" + al.level : "") + '">' +
      '<span class="person-cell">' + avatar(c.name, on || done ? "in" : "") +
        '<span><span class="who">' + esc(c.name) + "</span>" + pill(st) + '<br><span class="meta">' + meta + "</span>" +
          (al && !done ? '<br><span class="renew-flag ' + al.level + '">' + (al.level === "expired" ? "Expired — remind to renew" : "Ending soon — remind to renew") + "</span>" : "") + "</span></span>" +
      (done ? '<span class="tick done" aria-hidden="true">' + CHECK + "</span>"
            : '<button class="tick' + (on ? " on" : "") + '" data-act="cl-pick" data-id="' + esc(c.id) + '" aria-pressed="' + on + '" aria-label="' + (on ? "Untick " : "Tick ") + esc(c.name) + '">' + CHECK + "</button>") +
    "</div>";
  }).join("") : '<div class="empty">No client matches “' + esc(q) + "”.</div>") + "</div>";

  var flagged = list.filter(function (c) { return s.picked[c.id] && !tickedToday(c.id) && alertFor(c); });
  if (flagged.length) html += '<div class="remind-note"><b>Remind before they leave:</b> ' + flagged.map(function (c) { return esc(c.name.split(" ")[0]) + " (" + esc(clientStatus(c).short.toLowerCase()) + ")"; }).join(", ") + "</div>";
  html += '<div class="submit-bar"><button class="btn go" data-act="cl-submit"' + (picked ? "" : " disabled") + ">Submit · " + picked + " client" + (picked === 1 ? "" : "s") + "</button>" +
    '<button class="btn quiet" data-act="cl-discard">Discard</button></div>';
  html += '<p class="msg' + (state.msgOk ? " ok" : "") + '">' + esc(state.msg) + "</p>";
  html += '<p class="note">Nothing is saved until you tap Submit. After submitting, you can undo a mark for 10 minutes; after that only an admin can void it.</p>';
  return html;
}

/* Not in a session: start one, and see today's sessions. */
function overview() {
  var bs = batches().slice().sort(function (a, b) { return a.start < b.start ? -1 : 1; });
  var sug = suggestedBatch();
  var html = reminders() + '<div class="card"><h3>Start a session</h3>' +
    '<div class="field"><label for="cl_batch">Batch</label><select id="cl_batch">' +
      bs.map(function (b) { return '<option value="' + esc(b.id) + '"' + (sug && sug.id === b.id ? " selected" : "") + ">" + esc(b.name) + (/\d/.test(b.name) ? "" : " · " + esc(hm12(b.start)) + (b.end ? "–" + esc(hm12(b.end)) : "")) + "</option>"; }).join("") +
      '<option value="general"' + (bs.length ? "" : " selected") + ">General session (no batch)</option></select></div>" +
    '<div class="field"><label for="cl_coach">Coach</label><select id="cl_coach">' +
      coachList().map(function (x) { return '<option value="' + esc(x.id) + '"' + (state.me && x.id === state.me.id ? " selected" : "") + ">" + esc(x.name) + (state.me && x.id === state.me.id ? " (me)" : "") + "</option>"; }).join("") +
      "</select></div>" +
    (bs.length ? "" : '<p class="note">No batches yet — an admin can add them in Admin → Shifts.</p>') +
    '<div class="btnrow"><button class="btn go wide" data-act="cl-start">' + icons.login + "Start session</button></div></div>";

  var sess = sessionsOn(today());
  var marksToday = state.clients.filter(function (c) { return tickedToday(c.id); }).length;
  html += "<h2>Today · " + marksToday + " client" + (marksToday === 1 ? "" : "s") + " in · " + sess.length + " session" + (sess.length === 1 ? "" : "s") + "</h2>";
  if (!sess.length) return html + '<div class="rows"><div class="empty">No sessions submitted today yet.</div></div>' + msg();
  html += sess.map(function (x) {
    var ids = Object.keys(x.clients || {});
    var rows = ids.map(function (cid) {
      var c = state.clients.filter(function (y) { return y.id === cid; })[0];
      var m = markToday(cid), mine = m && m.sid === x.sid;
      var line, act = "";
      if (!mine) line = '<span class="meta">Marked in another session</span>';
      else if (m.void) line = '<span class="meta void-line">Voided by ' + esc(who(m.void.by, m.void.byName)) + " · " + tClock(m.void.at) + " · " + esc(m.void.reason) + "</span>";
      else {
        line = '<span class="meta">In at ' + tClock(m.at) + "</span>";
        if (canVoid(m)) act = '<button class="btn quiet small" data-act="cl-void" data-id="' + esc(cid) + '">' +
          (state.me.admin && !(m.by === state.me.id && undoMinutesLeft(m) > 0) ? "Void" : "Undo · " + undoMinutesLeft(m) + " min") + "</button>";
      }
      return '<div class="row"><span class="person-cell">' + avatar(c ? c.name : "?", m && !m.void && mine ? "in" : "dim") +
        '<span><span class="who' + (m && m.void && mine ? " struck" : "") + '">' + esc(c ? c.name : "(removed client)") + "</span><br>" + line + "</span></span>" +
        (act ? "<span>" + act + "</span>" : "") + "</div>";
    }).join("");
    return '<details class="sess"' + (x.by === (state.me && state.me.id) ? " open" : "") + '><summary><span><span class="who">' + esc(x.batchName || "Session") + "</span>" +
      '<br><span class="meta">' + esc(x.coachName && x.coach !== x.by ? x.coachName + " (submitted by " + who(x.by, x.byName) + ")" : who(x.coach || x.by, x.coachName || x.byName)) + " · " + tClock(x.at) + "</span></span>" +
      '<span class="dur">' + ids.length + "</span></summary>" + '<div class="rows">' + rows + "</div></details>";
  }).join("");
  return html + msg();
}

function msg() { return '<p class="msg' + (state.msgOk ? " ok" : "") + '">' + esc(state.msg) + "</p>"; }

export function vClientTick() {
  var head = '<div class="bar"><div class="idn">' + brandMark() + '<div><div class="nm">Client sessions</div>' +
    '<div class="sub">' + new Date().toLocaleDateString([], { weekday: "long", day: "numeric", month: "short" }) + "</div></div></div>" +
    '<div class="acts"><button class="btn quiet small" data-act="cl-back">' + icons.back + "Back</button></div></div>";

  enforceBoundary();
  var d = distanceNow(), s = state.cfg.site;
  var locked = state.cfg.lockOutside && !(d !== null && d <= s.radius) && !(state.me.admin && state.cfg.adminAnywhere);
  if (locked) return head + proxBlock() + lockedBlock(d, false) + '<p class="why warn">Client attendance can only be marked at the gym.</p>';
  if (!state.clLoaded) return head + '<div class="loading">Loading clients…</div>';
  return head + (state.session && state.session.day === today() ? taking() : overview());
}
