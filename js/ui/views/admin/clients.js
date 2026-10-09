/* Admin → Clients: renewals due, all clients, add a client, reports, and a
   client's own page (edit, renew + payment, history). */
import { state } from "../../../core/store.js";
import { esc, shortDate } from "../../../utils/format.js";
import { money } from "../../../domain/payroll.js";
import { clientStatus, clientPhone, usedSessions, suggestedStart, today, monthReport, PAY_MODES } from "../../../domain/clients.js";

function importCard() {
  var pv = state.clImport;
  var html = '<div class="card"><h3>Import from Excel</h3>' +
    '<p class="note" style="margin-top:4px">Download the template, fill one client per row, then choose the file. You\'ll see a preview before anything is saved. The file is read on this device — it isn\'t uploaded.</p>' +
    '<div class="btnrow"><button class="btn quiet" data-act="cl-template">' + icons.download + 'Template</button>' +
    '<label class="btn go file-btn">' + icons.login + 'Choose file<input id="cl_file" type="file" accept=".xlsx,.xls,.csv" /></label></div>';
  if (state.clImportBusy) html += '<div class="loading" style="margin-top:12px">Reading the file…</div>';
  if (pv) {
    var ok = pv.items.filter(function (it) { return it.ok; }), bad = pv.items.filter(function (it) { return !it.ok; });
    html += '<div class="import-sum"><b>' + esc(pv.fileName) + '</b><br>' +
      '<span class="tag on">' + ok.length + ' ready</span>' + (bad.length ? '<span class="tag">' + bad.length + ' with a problem</span>' : "") + "</div>" +
      '<div class="rows import-rows">' + pv.items.slice(0, 200).map(function (it) {
        return '<div class="row"><span><span class="who">' + esc(it.name || "(no name)") + '</span>' +
          (it.ok ? '<span class="tag on">OK</span>' : '<span class="tag">Row ' + it.row + "</span>") +
          '<br><span class="meta">' + (it.ok ? esc(it.client.plan.name + " from " + shortDate(it.client.plan.start) + (it.pay ? " · paid " + it.pay.amount + " " + it.pay.mode : ""))
                                               : esc(it.error)) + "</span></span></div>";
      }).join("") + (pv.items.length > 200 ? '<div class="empty">…and ' + (pv.items.length - 200) + " more rows</div>" : "") + "</div>" +
      '<div class="btnrow"><button class="btn go" data-act="cl-import"' + (ok.length ? "" : " disabled") + ">Import " + ok.length + " client" + (ok.length === 1 ? "" : "s") + "</button>" +
      '<button class="btn quiet" data-act="cl-import-cancel">Cancel</button></div>' +
      (bad.length ? '<p class="note">Rows with a problem are skipped. Fix them in the file and import it again — clients already imported are recognised as duplicates.</p>' : "");
  }
  return html + "</div>";
}
import { monthOptions } from "../../components/monthOptions.js";
import { icons, avatar } from "../../components/icons.js";

var SUBS = ["renew:Renewals", "all:Clients", "add:Add", "report:Reports"];

function pill(st) {
  var cls = st.kind === "expired" || st.kind === "off" ? "" : st.kind === "soon" || st.kind === "future" || st.kind === "none" ? "pending" : "on";
  return '<span class="tag ' + cls + '">' + esc(st.short) + "</span>";
}

function clientRow(c, actions) {
  var st = clientStatus(c);
  return '<div class="row people-row"><span class="person-cell">' + avatar(c.name, st.kind === "off" ? "dim" : "") +
    '<span><span class="who">' + esc(c.name) + "</span>" + pill(st) +
    '<br><span class="meta">' + esc(c.plan ? c.plan.name + " · " : "") + esc(st.label) + "</span></span></span>" +
    "<span>" + actions + "</span></div>";
}

function waBtn(c) {
  return clientPhone(c.id)
    ? '<button class="btn wa small icon" data-act="cl-wa" data-id="' + esc(c.id) + '" title="Renewal reminder on WhatsApp" aria-label="Renewal reminder on WhatsApp">' + icons.whatsapp + "</button>"
    : "";
}

/* Plan fields shared by "Add client" and "Renew". `p` = id prefix. */
function planFields(p, type, start) {
  return '<div class="field"><label for="' + p + '_type">Plan type</label><select id="' + p + '_type" data-act="cl-ptype">' +
      '<option value="time"' + (type === "time" ? " selected" : "") + ">Months (ends on a date)</option>" +
      '<option value="pack"' + (type === "pack" ? " selected" : "") + ">Session pack (number of visits)</option></select></div>" +
    '<div class="field pair">' +
      (type === "pack"
        ? '<div><label for="' + p + '_sessions">Sessions</label><input id="' + p + '_sessions" class="num" type="number" min="1" max="500" placeholder="e.g. 12" /></div>' +
          '<div><label for="' + p + '_months">Valid for (months)</label><input id="' + p + '_months" class="num" type="number" min="0" max="36" placeholder="0 = no limit" /></div>' +
          '</div><div class="field"><label for="' + p + '_used">Sessions already used</label><input id="' + p + '_used" class="num" type="number" min="0" max="499" placeholder="0 for a new pack" />'
        : '<div><label for="' + p + '_months">Months</label><input id="' + p + '_months" class="num" type="number" min="1" max="36" placeholder="e.g. 3" /></div>' +
          '<div><label for="' + p + '_start">Starts on</label><input id="' + p + '_start" type="date" value="' + esc(start) + '" /></div>') +
    "</div>" +
    (type === "pack" ? '<div class="field"><label for="' + p + '_start">Starts on</label><input id="' + p + '_start" type="date" value="' + esc(start) + '" /></div>' : "") +
    '<div class="field pair">' +
      '<div><label for="' + p + '_amount">Amount paid</label><input id="' + p + '_amount" class="num" type="number" min="0" step="0.01" placeholder="0 if unpaid" /></div>' +
      '<div><label for="' + p + '_mode">Paid by</label><select id="' + p + '_mode">' +
        PAY_MODES.map(function (m) { return "<option>" + esc(m) + "</option>"; }).join("") + "</select></div>" +
    "</div>";
}

function detail(c) {
  var st = clientStatus(c), priv = (state.clientPriv || {})[c.id] || {};
  var type = state.clRenewType || (c.plan && c.plan.type) || "time";
  var hist = (priv.history || []).slice().reverse();
  var html = '<div class="btnrow" style="margin-top:4px"><button class="btn quiet small" data-act="cl-closeedit">' + icons.back + "All clients</button></div>" +
    '<div class="card"><div class="person-cell" style="margin-bottom:6px">' + avatar(c.name) +
      '<span><span class="who" style="font-size:18px">' + esc(c.name) + "</span> " + pill(st) +
      '<br><span class="meta">' + esc(c.plan ? c.plan.name + " · from " + shortDate(c.plan.start) : "No plan") + " · " + esc(st.label) +
      (c.plan && c.plan.type === "pack" ? " · used " + usedSessions(c) + " of " + c.plan.sessions : "") + "</span></span></div>" +
      (clientPhone(c.id) ? '<div class="btnrow"><button class="btn wa wide" data-act="cl-wa" data-id="' + esc(c.id) + '">' + icons.whatsapp + "Send renewal reminder</button></div>" : "") +
    "</div>";

  html += "<h2>Renew / new plan</h2>" + '<div class="card">' + planFields("cr", type, suggestedStart(c)) +
    '<div class="btnrow"><button class="btn go wide" data-act="cl-renew" data-id="' + esc(c.id) + '">Save renewal</button></div></div>';

  html += "<h2>Details</h2>" + '<div class="card">' +
    '<div class="field"><label for="ce_name">Name</label><input id="ce_name" type="text" value="' + esc(c.name) + '" /></div>' +
    '<div class="field"><label for="ce_phone">Phone (WhatsApp)</label><input id="ce_phone" type="tel" inputmode="tel" value="' + esc(priv.phone || "") + '" placeholder="10-digit mobile" /></div>' +
    '<div class="field"><label for="ce_notes">Notes</label><textarea id="ce_notes" rows="3" placeholder="Goals, injuries, preferred batch…">' + esc(priv.notes || "") + "</textarea></div>" +
    '<div class="btnrow"><button class="btn go" data-act="cl-save" data-id="' + esc(c.id) + '">Save details</button>' +
    '<button class="btn quiet" data-act="cl-toggle" data-id="' + esc(c.id) + '">' + (c.active === false ? "Restore client" : "Turn off") + "</button></div></div>";

  if (hist.length) {
    html += "<h2>Previous plans</h2>" + '<div class="rows">' + hist.map(function (h) {
      return '<div class="row"><span><span class="who">' + esc(h.name) + '</span><br><span class="meta">' + shortDate(h.start) +
        (h.end ? " – " + shortDate(h.end) : "") + (h.type === "pack" ? " · used " + (h.used || 0) + " of " + h.sessions : "") + "</span></span></div>";
    }).join("") + "</div>";
  }
  return html;
}

export function tabClients() {
  if (!state.clLoaded) return '<div class="loading">Loading clients…</div>';
  var sub = state.clSub || "renew";
  var html = '<div class="btnrow" style="margin-top:0"><button class="btn solid wide" data-act="cl-open">' + icons.clock + "Open attendance list (tick clients)</button></div>";
  html += '<div class="tabs seg" style="margin-top:12px">' + SUBS.map(function (t) {
    var p = t.split(":");
    return '<button class="tab' + (sub === p[0] && !state.clEdit ? " sel" : "") + '" data-act="cl-sub" data-v="' + p[0] + '">' + p[1] + "</button>";
  }).join("") + "</div>";

  var c = state.clEdit ? state.clients.filter(function (x) { return x.id === state.clEdit; })[0] : null;
  if (c) return html + detail(c) + msg();

  var all = state.clients.slice().sort(function (a, b) { return a.name.localeCompare(b.name); });
  var on = all.filter(function (x) { return x.active !== false; });

  if (sub === "renew") {
    var soon = [], expired = [], none = [];
    on.forEach(function (x) {
      var st = clientStatus(x);
      if (st.kind === "soon") soon.push(x); else if (st.kind === "expired") expired.push(x); else if (st.kind === "none") none.push(x);
    });
    soon.sort(function (a, b) { var s = clientStatus(a), t = clientStatus(b); return (s.daysLeft != null ? s.daysLeft : s.left) - (t.daysLeft != null ? t.daysLeft : t.left); });
    html += '<div class="tiles" style="margin-top:12px">' +
      '<div class="tile"><span class="k">Active clients</span><span class="v">' + (on.length - expired.length - none.length) + "</span></div>" +
      '<div class="tile"><span class="k">Ending soon</span><span class="v" style="color:var(--gold-strong)">' + soon.length + "</span></div>" +
      '<div class="tile"><span class="k">Expired</span><span class="v" style="color:var(--status-bad)">' + expired.length + "</span></div>" +
      '<div class="tile gold"><span class="k">Collected ' + esc(new Date().toLocaleDateString([], { month: "short" })) + '</span><span class="v">' +
        money(monthReport(today().slice(0, 7)).revenue) + "</span></div></div>";
    var act = function (x) { return waBtn(x) + '<button class="btn go small" data-act="cl-edit" data-id="' + esc(x.id) + '">Renew</button>'; };
    html += "<h2>Ending soon (" + soon.length + ")</h2>" + '<div class="rows">' + (soon.length ? soon.map(function (x) { return clientRow(x, act(x)); }).join("") : '<div class="empty">Nobody ends in the next 7 days.</div>') + "</div>";
    html += "<h2>Expired (" + expired.length + ")</h2>" + '<div class="rows">' + (expired.length ? expired.map(function (x) { return clientRow(x, act(x)); }).join("") : '<div class="empty">No expired clients.</div>') + "</div>";
    if (none.length) html += "<h2>No plan yet (" + none.length + ")</h2>" + '<div class="rows">' + none.map(function (x) { return clientRow(x, act(x)); }).join("") + "</div>";
    html += '<p class="note">"Ending soon" = within 7 days, or 2 or fewer sessions left. The WhatsApp button opens a reminder to that client — you press send.</p>';
    return html + msg();
  }

  if (sub === "all") {
    var q = (state.clSearch || "").trim().toLowerCase();
    var shown = q ? all.filter(function (x) { return x.name.toLowerCase().indexOf(q) >= 0 || clientPhone(x.id).indexOf(q) >= 0; }) : all;
    html += '<div class="field"><input id="cl_search" type="search" autocomplete="off" placeholder="Search by name or phone…" value="' + esc(state.clSearch || "") + '" /></div>';
    html += '<h2>' + all.length + " client" + (all.length === 1 ? "" : "s") + "</h2>" + '<div class="rows">' +
      (shown.length ? shown.map(function (x) { return clientRow(x, waBtn(x) + '<button class="btn quiet small" data-act="cl-edit" data-id="' + esc(x.id) + '">Open</button>'); }).join("")
                    : '<div class="empty">' + (all.length ? "No client matches." : "No clients yet — add one in “Add client”.") + "</div>") + "</div>";
    return html + msg();
  }

  if (sub === "add") {
    var type = state.clAddType || "time";
    html += '<div class="card"><h3>New client</h3>' +
      '<div class="field"><label for="ca_name">Name</label><input id="ca_name" type="text" placeholder="Full name" /></div>' +
      '<div class="field"><label for="ca_phone">Phone (WhatsApp)</label><input id="ca_phone" type="tel" inputmode="tel" placeholder="10-digit mobile" /></div>' +
      planFields("ca", type, today()) +
      '<div class="field"><label for="ca_notes">Notes (optional)</label><textarea id="ca_notes" rows="2" placeholder="Goals, injuries, preferred batch…"></textarea></div>' +
      '<div class="btnrow"><button class="btn go wide" data-act="cl-add">Add client</button></div></div>';
    html += importCard();
    return html + msg();
  }

  /* reports */
  var ym = state.clMonth || today().slice(0, 7);
  var r = monthReport(ym);
  html += '<div class="field"><label for="cl_month">Month</label><select id="cl_month">' + monthOptions(ym) + "</select></div>";
  html += '<div class="tiles" style="margin-top:12px">' +
    '<div class="tile"><span class="k">Client visits</span><span class="v">' + r.totalVisits + "</span></div>" +
    '<div class="tile"><span class="k">Renewals / payments</span><span class="v">' + r.payments.length + "</span></div>" +
    '<div class="tile gold" style="grid-column:1 / -1"><span class="k">Collected</span><span class="v">' + money(r.revenue) + "</span></div></div>";
  var modes = Object.keys(r.byMode);
  if (modes.length) html += '<div class="rows" style="margin-top:10px">' + modes.map(function (m) {
    return '<div class="row"><span>' + esc(m) + '</span><span class="dur">' + money(r.byMode[m]) + "</span></div>"; }).join("") + "</div>";
  html += "<h2>Visits per client</h2>" + '<div class="rows">' + (on.length ? on.slice().sort(function (a, b) { return (r.visits[b.id] || 0) - (r.visits[a.id] || 0); }).map(function (x) {
    return '<div class="row"><span class="person-cell">' + avatar(x.name) + '<span class="who">' + esc(x.name) + '</span></span><span class="dur">' + (r.visits[x.id] || 0) + "</span></div>";
  }).join("") : '<div class="empty">No clients.</div>') + "</div>";
  html += "<h2>Payments</h2>" + '<div class="rows">' + (r.payments.length ? r.payments.map(function (p) {
    return '<div class="row"><span><span class="who">' + esc(p.name) + '</span><br><span class="meta">' + shortDate(p.date) + " · " + esc(p.plan) + " · " + esc(p.mode) + '</span></span><span class="dur">' + money(p.amount) + "</span></div>";
  }).join("") : '<div class="empty">No payments recorded this month.</div>') + "</div>";
  html += '<div class="btnrow"><button class="btn go wide" data-act="cl-xlsx">' + icons.download + "Download Excel</button></div>";
  return html + msg();
}

function msg() { return '<p class="msg' + (state.msgOk ? " ok" : "") + '">' + esc(state.msg) + "</p>"; }
