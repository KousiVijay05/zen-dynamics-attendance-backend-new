/* Admin → Clients: renewals due, all clients, add a client, reports, and a
   client's own page (edit, renew + payment, history). */
import { state } from "../../../core/store.js";
import { esc, shortDate } from "../../../utils/format.js";
import { money } from "../../../domain/payroll.js";
import { clientStatus, clientPhone, usedSessions, suggestedStart, today, monthReport, PAY_MODES, importable, clientLedger,
         filterClients, planNames, lastVisits, DEFAULT_FILTER, packages, packageById, packageValidity, accountsToAdd, accountsMonths } from "../../../domain/clients.js";

function opt(v, label, cur) { return '<option value="' + esc(v) + '"' + (v === cur ? " selected" : "") + ">" + esc(label) + "</option>"; }

/* The filter panel for the Clients list. Every change re-filters at once. */
function filterBar(f) {
  var plans = planNames();
  var active = Object.keys(DEFAULT_FILTER).filter(function (k) { return k !== "sort" && f[k] !== DEFAULT_FILTER[k]; }).length;
  return '<div class="filters">' +
    '<div class="field"><input id="cl_search" type="search" autocomplete="off" placeholder="Search name or phone…" value="' + esc(state.clSearch || "") + '" /></div>' +
    '<div class="filter-grid">' +
      '<label>Status<select id="clf_status">' + opt("all", "All (not turned off)", f.status) + opt("active", "Active", f.status) + opt("soon", "Ending soon", f.status) +
        opt("expired", "Expired", f.status) + opt("future", "Starts later", f.status) + opt("none", "No plan", f.status) + opt("off", "Turned off", f.status) + "</select></label>" +
      '<label>Plan dates<select id="clf_window">' + opt("", "Any", f.window) + opt("ends:7", "Ends within 7 days", f.window) + opt("ends:15", "Ends within 15 days", f.window) +
        opt("ends:30", "Ends within 30 days", f.window) + opt("expired:30", "Expired in last 30 days", f.window) + opt("expired:90", "Expired in last 90 days", f.window) +
        opt("expiredbefore:90", "Expired over 90 days ago", f.window) + "</select></label>" +
      '<label>Last visit<select id="clf_seen">' + opt("", "Any", f.seen) + opt("7", "Not seen in 7 days", f.seen) + opt("14", "Not seen in 14 days", f.seen) +
        opt("30", "Not seen in 30 days", f.seen) + opt("never", "Never marked", f.seen) + "</select></label>" +
      '<label>Plan<select id="clf_plan">' + opt("", "Any plan", f.plan) + plans.map(function (n) { return opt(n, n, f.plan); }).join("") + "</select></label>" +
      '<label>Balance<select id="clf_balance">' + opt("", "Any", f.balance) + opt("due", "Has balance due", f.balance) + "</select></label>" +
      '<label>Sort by<select id="clf_sort">' + opt("name", "Name", f.sort) + opt("end", "Ending soonest", f.sort) + opt("endlast", "Ended most recently", f.sort) +
        opt("seen", "Longest since last visit", f.sort) + opt("since", "Member since (oldest)", f.sort) + "</select></label>" +
    "</div>" +
    (active ? '<div style="text-align:right"><button class="linkish" data-act="clf-clear">Clear ' + active + " filter" + (active === 1 ? "" : "s") + "</button></div>" : "") +
  "</div>";
}

function fullDate(k) { return k ? shortDate(k) + " " + k.slice(0, 4) : "—"; }

/* Summary + membership history (every plan with its payments). */
function ledger(c) {
  var L = clientLedger(c);
  var html = '<div class="tiles" style="margin-top:12px">' +
    '<div class="tile gold"><span class="k">Total paid</span><span class="v">' + money(L.total) + "</span></div>" +
    '<div class="tile"><span class="k">Member since</span><span class="v" style="font-size:19px">' + esc(fullDate(L.since)) + "</span></div>" +
    '<div class="tile"><span class="k">Memberships</span><span class="v">' + L.plans.length + "</span></div>" +
    '<div class="tile"><span class="k">Last payment</span><span class="v" style="font-size:19px">' + esc(L.lastPaid ? fullDate(L.lastPaid.date) : "—") + "</span></div></div>";
  if (!L.complete) html += '<div class="loading" style="margin-top:10px">Loading payment history…</div>';
  html += "<h2>Membership history</h2>" + '<div class="rows">' + (L.plans.length ? L.plans.map(function (pl) {
    var tag = pl.state === "current" ? '<span class="tag on">current</span>' : pl.state === "upcoming" ? '<span class="tag pending">upcoming</span>' : '<span class="tag">ended</span>';
    var dates = fullDate(pl.start) + " → " + (pl.end ? fullDate(pl.end) : "no end date");
    var sess = pl.type === "pack" ? " · " + (pl.current ? (pl.usedNow || 0) : (pl.used || 0)) + " of " + pl.sessions + " sessions used" : "";
    return '<div class="row ledger-row"><span><span class="who">' + esc(pl.name) + "</span>" + tag +
      '<br><span class="meta">' + esc(dates + sess) + "</span>" +
      (pl.payments.length ? pl.payments.map(function (p) {
        return '<br><span class="pay-line">' + esc(fullDate(p.date)) + " · " + esc(p.mode) + "</span>";
      }).join("") : '<br><span class="pay-line none">No payment recorded</span>') +
      '</span><span class="dur">' + (pl.paid ? money(pl.paid) : "—") + "</span></div>";
  }).join("") : '<div class="empty">No plans yet.</div>') + "</div>";
  if (L.other.length) {
    html += "<h2>Other payments</h2>" + '<div class="rows">' + L.other.map(function (p) {
      return '<div class="row"><span><span class="who">' + esc(p.plan || "Payment") + '</span><br><span class="meta">' + esc(fullDate(p.date) + " · " + p.mode) + '</span></span><span class="dur">' + money(p.amount) + "</span></div>";
    }).join("") + "</div>";
  }
  return html;
}

/* Preview for a sales-register export (one row per invoice, grouped per client). */
function registerPreview(pv) {
  var good = pv.items.filter(function (it) { return it.ok; }), bad = pv.items.filter(function (it) { return !it.ok; });
  var ended = good.filter(function (it) { return it.ended; }), ahead = good.filter(function (it) { return it.upcoming; });
  var take = importable(pv);
  var pays = take.reduce(function (n, it) { return n + it.pays.length; }, 0);
  var amt = take.reduce(function (n, it) { return n + it.pays.reduce(function (s, p) { return s + p.amount; }, 0); }, 0);
  var invoices = pv.items.reduce(function (n, it) { return n + it.invoices; }, 0);
  var list = good.filter(function (it) { return !it.ended || pv.includeEnded !== false; }).concat(bad);
  return '<div class="import-sum"><b>' + esc(pv.fileName) + '</b><br>Sales register: ' + invoices + " invoices for " + pv.items.length + " clients<br>" +
      '<span class="tag on">' + (good.length - ended.length - ahead.length) + " current</span>" +
      (ahead.length ? '<span class="tag pending">' + ahead.length + " starting later</span>" : "") +
      (ended.length ? '<span class="tag pending">' + ended.length + " plan ended</span>" : "") +
      (bad.length ? '<span class="tag">' + bad.length + " with a problem</span>" : "") + "</div>" +
    (ended.length ? '<label class="check" style="margin-top:6px"><input type="checkbox" id="cl_incl_ended"' + (pv.includeEnded !== false ? " checked" : "") + " />" +
      "<div>Also import the " + ended.length + " clients whose plan has ended<span>Useful for win-back reminders. They appear as expired.</span></div></label>" : "") +
    '<div class="rows import-rows" style="margin-top:10px">' + list.slice(0, 250).map(function (it) {
      return '<div class="row"><span><span class="who">' + esc(it.name || "(no name)") + "</span>" +
        (it.ok ? (it.ended ? '<span class="tag pending">ended</span>' : it.upcoming ? '<span class="tag pending">later</span>' : '<span class="tag on">current</span>') : '<span class="tag">Row ' + it.row + "</span>") +
        '<br><span class="meta">' + esc(it.ok ? it.summary + (it.warn ? " · " + it.warn : "") : it.error) + "</span></span></div>";
    }).join("") + (list.length > 250 ? '<div class="empty">…and ' + (list.length - 250) + " more</div>" : "") + "</div>" +
    '<p class="note">Each client gets their current plan (or the next one if paid in advance, otherwise their last one) with the exact dates from the file; earlier plans are kept as history. ' +
      pays + " payments (" + money(amt) + ") are recorded on their invoice dates, so past months' reports are right. Cancelled invoices are skipped.</p>" +
    '<div class="btnrow"><button class="btn go" data-act="cl-import"' + (take.length ? "" : " disabled") + ">Import " + take.length + " client" + (take.length === 1 ? "" : "s") + "</button>" +
    '<button class="btn quiet" data-act="cl-import-cancel">Cancel</button></div>';
}

/* Preview for a hand-kept accounts book (one sheet per month). */
function accountsPreview(pv) {
  var by = function (a) { return pv.items.filter(function (it) { return it.action === a; }); };
  var skip = by("skip"), bad = by("problem");
  var cand = pv.items.filter(function (it) { return it.action === "pay" || it.action === "new"; });
  var sure = cand.filter(function (it) { return !it.uncertain; }), unsure = cand.filter(function (it) { return it.uncertain; });
  var take = accountsToAdd(pv);
  var sum = function (l) { return l.reduce(function (s, it) { return s + it.amount; }, 0); };
  var last = pv.lastRecorded ? shortDate(pv.lastRecorded) + " " + pv.lastRecorded.slice(0, 4) : "";
  var row = function (it) {
    var tag = it.action === "problem" ? '<span class="tag">not a payment</span>' : it.action === "skip" ? '<span class="tag">already recorded</span>'
      : it.uncertain && !pv.includeEarlier ? '<span class="tag">left out</span>' : it.action === "new" ? '<span class="tag pending">new client</span>' : '<span class="tag on">new payment</span>';
    var what = it.action === "problem" ? it.error
      : it.action === "skip" ? "Matches a recorded payment of " + (it.client ? it.client.name : "")
      : it.action === "new" ? "New client · " + (it.pkg ? it.pkg.name : (it.plan ? "plan “" + it.plan + "” — 1 month assumed" : "no plan — 1 month assumed"))
      : (it.renew ? "Renews " : "Payment for ") + (it.client ? it.client.name : it.fresh.client.name) + (it.renew && it.pkg ? " · " + it.pkg.name : "");
    return '<div class="row"><span><span class="who">' + esc(it.name || "(no name)") + "</span>" + tag +
      '<br><span class="meta">' + esc(it.sheet + " · " + (it.date ? shortDate(it.date) + (it.guessed ? " (date from sheet)" : "") + " · " : "") + (it.amount ? money(it.amount) + " · " : "") + what) + "</span></span></div>";
  };
  return '<div class="import-sum"><b>' + esc(pv.fileName) + "</b><br>Accounts book: " + pv.items.length + " rows<br>" +
      '<span class="tag on">' + sure.length + " new after " + esc(last) + " · " + money(sum(sure)) + "</span>" +
      '<span class="tag">' + skip.length + " already recorded</span>" +
      (unsure.length ? '<span class="tag pending">' + unsure.length + " uncertain · " + money(sum(unsure)) + "</span>" : "") +
      (bad.length ? '<span class="tag">' + bad.length + " not payments</span>" : "") + "</div>" +
    '<p class="note" style="margin-top:0">Your main records already run to <b>' + esc(last) + "</b>. Payments after that are added. " +
      "Earlier payments that don't match a recorded one exactly are usually the same money recorded differently (another date, instalments, a different spelling), so they're left out unless you tick below.</p>" +
    (unsure.length ? '<h3 style="margin-top:14px">Earlier months — book vs your records</h3>' +
      '<p class="note" style="margin-top:2px">Tick a month only if your records are missing payments for it (for example, the book has clearly more). Otherwise they\'d be counted twice.</p>' +
      accountsMonths(pv).filter(function (o) { return o.unsureN; }).map(function (o) {
        var gap = o.book - o.recorded;
        return '<label class="check month-pick"><input type="checkbox" class="cl_incl_month" data-sheet="' + esc(o.sheet) + '"' + ((pv.includeMonths || {})[o.sheet] ? " checked" : "") + " />" +
          "<div>" + esc(o.sheet) + ": add " + o.unsureN + " unmatched (" + money(o.unsureT) + ")" +
          "<span>Book " + money(o.book) + " · your records " + money(o.recorded) + (gap > 0 ? " · book has " + money(gap) + " more" : " · records already have as much or more") + "</span></div></label>";
      }).join("") : "") +
    '<div class="rows import-rows" style="margin-top:10px">' + sure.concat(unsure, bad, skip).slice(0, 300).map(row).join("") + "</div>" +
    '<div class="btnrow"><button class="btn go" data-act="cl-import"' + (take.length ? "" : " disabled") + ">Add " + take.length + " item" + (take.length === 1 ? "" : "s") + " · " + money(sum(take)) + "</button>" +
    '<button class="btn quiet" data-act="cl-import-cancel">Cancel</button></div>';
}

function importCard() {
  var pv = state.clImport;
  var html = '<div class="card"><h3>Import from Excel</h3>' +
    '<p class="note" style="margin-top:4px">Download the template, fill one client per row, then choose the file. You\'ll see a preview before anything is saved. The file is read on this device — it isn\'t uploaded.</p>' +
    '<div class="btnrow"><button class="btn quiet" data-act="cl-template">' + icons.download + 'Template</button>' +
    '<label class="btn go file-btn">' + icons.login + 'Choose file<input id="cl_file" type="file" accept=".xlsx,.xls,.csv" /></label></div>';
  if (state.clImportBusy) html += '<div class="loading" style="margin-top:12px">Reading the file…</div>';
  if (pv && pv.kind === "register") return html + registerPreview(pv) + "</div>";
  if (pv && pv.kind === "accounts") return html + accountsPreview(pv) + "</div>";
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

function clientRow(c, actions, extra) {
  var st = clientStatus(c);
  return '<div class="row people-row"><span class="person-cell">' + avatar(c.name, st.kind === "off" ? "dim" : "") +
    '<span><span class="who">' + esc(c.name) + "</span>" + pill(st) +
    '<br><span class="meta">' + esc(c.plan ? c.plan.name + " · " : "") + esc(st.label) + (extra ? " · " + esc(extra) : "") + "</span></span></span>" +
    "<span>" + actions + "</span></div>";
}

function waBtn(c) {
  return clientPhone(c.id)
    ? '<button class="btn wa small icon" data-act="cl-wa" data-id="' + esc(c.id) + '" title="Renewal reminder on WhatsApp" aria-label="Renewal reminder on WhatsApp">' + icons.whatsapp + "</button>"
    : "";
}

/* Package picker + plan fields, shared by "Add client" and "Renew". `p` = id prefix. */
function packageSelect(p, cur) {
  var groups = {}, order = [];
  packages().forEach(function (k) { var g = k.group || "Packages"; if (!groups[g]) { groups[g] = []; order.push(g); } groups[g].push(k); });
  return '<div class="field"><label for="' + p + '_pkg">Package</label><select id="' + p + '_pkg">' +
    order.map(function (g) {
      return '<optgroup label="' + esc(g) + '">' + groups[g].map(function (k) {
        return '<option value="' + esc(k.id) + '"' + (k.id === cur ? " selected" : "") + ">" + esc(k.name) + " · " + money(k.fee) + "</option>";
      }).join("") + "</optgroup>";
    }).join("") + '<option value="custom"' + (cur === "custom" ? " selected" : "") + ">Custom plan…</option></select></div>";
}

function planFields(p, type, start, pkgId) {
  var k = pkgId && pkgId !== "custom" ? packageById(pkgId) : null;
  if (k) {
    return packageSelect(p, k.id) +
      '<p class="pkg-info">' + esc(k.type === "pack" ? k.sessions + " session" + (k.sessions === 1 ? "" : "s") + " · " : "") + esc(packageValidity(k)) + " · fee " + money(k.fee) + "</p>" +
      (k.type === "pack" ? '<div class="field"><label for="' + p + '_used">Sessions already used</label><input id="' + p + '_used" class="num" type="number" min="0" max="499" placeholder="0 for a new pack" /></div>' : "") +
      '<div class="field"><label for="' + p + '_start">Starts on</label><input id="' + p + '_start" type="date" value="' + esc(start) + '" /></div>' +
      '<div class="field pair">' +
        '<div><label for="' + p + '_amount">Amount paid</label><input id="' + p + '_amount" class="num" type="number" min="0" step="0.01" value="' + k.fee + '" /></div>' +
        '<div><label for="' + p + '_mode">Paid by</label><select id="' + p + '_mode">' +
          PAY_MODES.map(function (m) { return "<option>" + esc(m) + "</option>"; }).join("") + "</select></div>" +
      "</div>" + '<p class="note" style="margin-top:6px">Change the amount for a discount, or 0 if not paid yet.</p>';
  }
  return packageSelect(p, "custom") + planFieldsCustom(p, type, start);
}

function planFieldsCustom(p, type, start) {
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
  var html = '<div class="btnrow" style="margin-top:4px"><button class="btn quiet small" data-act="cl-closeedit">' + icons.back + "All clients</button></div>" +
    '<div class="card"><div class="person-cell" style="margin-bottom:6px">' + avatar(c.name) +
      '<span><span class="who" style="font-size:18px">' + esc(c.name) + "</span> " + pill(st) +
      '<br><span class="meta">' + esc(c.plan ? c.plan.name + " · from " + shortDate(c.plan.start) : "No plan") + " · " + esc(st.label) +
      (c.plan && c.plan.type === "pack" ? " · used " + usedSessions(c) + " of " + c.plan.sessions : "") + "</span></span></div>" +
      (clientPhone(c.id) ? '<div class="btnrow"><button class="btn wa wide" data-act="cl-wa" data-id="' + esc(c.id) + '">' + icons.whatsapp + "Send renewal reminder</button></div>" : "") +
      (priv.notes ? '<p class="note" style="margin-top:10px">' + esc(priv.notes) + "</p>" : "") +
    "</div>" + ledger(c);

  var curPkg = state.clRenewPkg || (c.plan && c.plan.pkg && packageById(c.plan.pkg) ? c.plan.pkg : (packages()[0] || {}).id || "custom");
  html += "<h2>Renew / new plan</h2>" + '<div class="card">' + planFields("cr", type, suggestedStart(c), curPkg) +
    '<div class="btnrow"><button class="btn go wide" data-act="cl-renew" data-id="' + esc(c.id) + '">Save renewal</button></div></div>';

  html += "<h2>Details</h2>" + '<div class="card">' +
    '<div class="field"><label for="ce_name">Name</label><input id="ce_name" type="text" value="' + esc(c.name) + '" /></div>' +
    '<div class="field"><label for="ce_phone">Phone (WhatsApp)</label><input id="ce_phone" type="tel" inputmode="tel" value="' + esc(priv.phone || "") + '" placeholder="10-digit mobile" /></div>' +
    '<div class="field"><label for="ce_notes">Notes</label><textarea id="ce_notes" rows="3" placeholder="Goals, injuries, preferred batch…">' + esc(priv.notes || "") + "</textarea></div>" +
    '<div class="btnrow"><button class="btn go" data-act="cl-save" data-id="' + esc(c.id) + '">Save details</button>' +
    '<button class="btn quiet" data-act="cl-toggle" data-id="' + esc(c.id) + '">' + (c.active === false ? "Restore client" : "Turn off") + "</button></div></div>";

  return html;
}

export function tabClients() {
  if (!state.clLoaded) return '<div class="loading">Loading clients…</div>';
  var sub = state.clSub || "renew";
  var html = '<div class="btnrow" style="margin-top:0"><button class="btn solid wide" data-act="cl-open">' + icons.clock + "Client sessions (take attendance)</button></div>";
  html += '<div class="tabs seg" style="margin-top:12px">' + SUBS.map(function (t) {
    var p = t.split(":");
    return '<button class="tab' + (sub === p[0] && !state.clEdit ? " sel" : "") + '" data-act="cl-sub" data-v="' + p[0] + '">' + p[1] + "</button>";
  }).join("") + "</div>";

  var c = state.clEdit ? state.clients.filter(function (x) { return x.id === state.clEdit; })[0] : null;
  if (c) return html + detail(c) + msg();

  var all = state.clients.slice().sort(function (a, b) { return a.name.localeCompare(b.name); });
  var on = all.filter(function (x) { return x.active !== false; });

  if (sub === "renew") {
    var soon = [], expired = [], none = [], older = 0;
    var recentCut = new Date(Date.now() - 60 * 864e5); recentCut = recentCut.getFullYear() + "-" + ("0" + (recentCut.getMonth() + 1)).slice(-2) + "-" + ("0" + recentCut.getDate()).slice(-2);
    on.forEach(function (x) {
      var st = clientStatus(x);
      if (st.kind === "soon") soon.push(x);
      else if (st.kind === "expired") { if (!x.plan || !x.plan.end || x.plan.end >= recentCut) expired.push(x); else older++; }
      else if (st.kind === "none") none.push(x);
    });
    soon.sort(function (a, b) { var s = clientStatus(a), t = clientStatus(b); return (s.daysLeft != null ? s.daysLeft : s.left) - (t.daysLeft != null ? t.daysLeft : t.left); });
    html += '<div class="tiles" style="margin-top:12px">' +
      '<div class="tile"><span class="k">Active clients</span><span class="v">' + (on.length - expired.length - older - none.length) + "</span></div>" +
      '<div class="tile"><span class="k">Ending soon</span><span class="v" style="color:var(--gold-strong)">' + soon.length + "</span></div>" +
      '<div class="tile"><span class="k">Expired</span><span class="v" style="color:var(--status-bad)">' + expired.length + "</span></div>" +
      '<div class="tile gold"><span class="k">Collected ' + esc(new Date().toLocaleDateString([], { month: "short" })) + '</span><span class="v">' +
        money(monthReport(today().slice(0, 7)).revenue) + "</span></div></div>";
    var act = function (x) { return waBtn(x) + '<button class="btn go small" data-act="cl-edit" data-id="' + esc(x.id) + '">Renew</button>'; };
    html += "<h2>Ending soon (" + soon.length + ")</h2>" + '<div class="rows">' + (soon.length ? soon.map(function (x) { return clientRow(x, act(x)); }).join("") : '<div class="empty">Nobody ends in the next 7 days.</div>') + "</div>";
    html += "<h2>Expired in the last 60 days (" + expired.length + ")</h2>" + '<div class="rows">' + (expired.length ? expired.map(function (x) { return clientRow(x, act(x)); }).join("") : '<div class="empty">Nobody expired recently.</div>') + "</div>";
    if (older) html += '<p class="note">' + older + " more expired earlier than that — find them in Clients.</p>";
    if (none.length) html += "<h2>No plan yet (" + none.length + ")</h2>" + '<div class="rows">' + none.map(function (x) { return clientRow(x, act(x)); }).join("") + "</div>";
    html += '<p class="note">"Ending soon" = within 7 days, or 2 or fewer sessions left. The WhatsApp button opens a reminder to that client — you press send.</p>';
    return html + msg();
  }

  if (sub === "all") {
    var f = state.clFilter, shown = filterClients(f, state.clSearch), lv = lastVisits();
    html += filterBar(f);
    html += '<div class="list-head"><h2>' + shown.length + " of " + all.length + " client" + (all.length === 1 ? "" : "s") + "</h2>" +
      (shown.length ? '<button class="btn quiet small" data-act="clf-export">' + icons.download + "Excel</button>" : "") + "</div>" +
      '<div class="rows">' +
      (shown.slice(0, 300).map(function (x) {
        return clientRow(x, waBtn(x) + '<button class="btn quiet small" data-act="cl-edit" data-id="' + esc(x.id) + '">Open</button>',
          lv[x.id] ? "Last visit " + shortDate(lv[x.id]) : "No visits marked");
      }).join("") || '<div class="empty">' + (all.length ? "No client matches these filters." : "No clients yet — add one in “Add”.") + "</div>") +
      (shown.length > 300 ? '<div class="empty">Showing the first 300 — narrow the filters or download the Excel.</div>' : "") + "</div>";
    return html + msg();
  }

  if (sub === "add") {
    var type = state.clAddType || "time";
    html += '<div class="card"><h3>New client</h3>' +
      '<div class="field"><label for="ca_name">Name</label><input id="ca_name" type="text" placeholder="Full name" /></div>' +
      '<div class="field"><label for="ca_phone">Phone (WhatsApp)</label><input id="ca_phone" type="tel" inputmode="tel" placeholder="10-digit mobile" /></div>' +
      planFields("ca", type, today(), state.clAddPkg || (packages()[0] || {}).id || "custom") +
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
  var bk = Object.keys(r.byBatch).sort(function (a, b) { return r.byBatch[b] - r.byBatch[a]; });
  if (bk.length) html += "<h2>Visits per batch</h2>" + '<div class="rows">' + bk.map(function (k) {
    return '<div class="row"><span>' + esc(k) + '</span><span class="dur">' + r.byBatch[k] + "</span></div>"; }).join("") + "</div>";
  var ck = Object.keys(r.sessByCoach);
  if (ck.length) html += "<h2>Sessions taken per coach</h2>" + '<div class="rows">' + ck.map(function (k) {
    return '<div class="row"><span>' + esc(k) + '</span><span class="dur">' + r.sessByCoach[k] + " session" + (r.sessByCoach[k] === 1 ? "" : "s") + " · " + (r.byCoach[k] || 0) + " marks</span></div>"; }).join("") + "</div>";
  if (r.voided) html += '<p class="note">' + r.voided + " voided mark" + (r.voided === 1 ? "" : "s") + " this month (not counted; listed in the Excel).</p>";
  html += "<h2>Visits per client</h2>" + '<div class="rows">' + (on.length ? on.slice().sort(function (a, b) { return (r.visits[b.id] || 0) - (r.visits[a.id] || 0); }).map(function (x) {
    return '<div class="row"><span class="person-cell">' + avatar(x.name) + '<span class="who">' + esc(x.name) + '</span></span><span class="dur">' + (r.visits[x.id] || 0) + "</span></div>";
  }).join("") : '<div class="empty">No clients.</div>') + "</div>";
  html += "<h2>Payments</h2>" + '<div class="rows">' + (r.payments.length ? r.payments.map(function (p) {
    return '<div class="row"><span><span class="who">' + esc(p.name) + '</span><br><span class="meta">' + shortDate(p.date) + " · " + esc(p.plan) + " · " + esc(p.mode) + '</span></span><span class="dur">' + money(p.amount) + "</span></div>";
  }).join("") : '<div class="empty">No payments recorded this month.</div>') + "</div>";
  html += '<div class="btnrow"><button class="btn go" data-act="cl-xlsx">' + icons.download + "This month</button>" +
    '<button class="btn solid" data-act="cl-xlsx-all">' + icons.download + "Full client history</button></div>" +
    '<p class="note">"Full client history": every client, every membership and every payment ever recorded, in one Excel file.</p>';
  return html + msg();
}

function msg() { return '<p class="msg' + (state.msgOk ? " ok" : "") + '">' + esc(state.msg) + "</p>"; }
