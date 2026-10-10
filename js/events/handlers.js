/* ---------------------------------------------------------------
   Click/change delegation for the whole app.

   Ported from the single `$("root").addEventListener(...)` block at
   the bottom of the original app.js. Every `data-act` value here is
   unchanged from the original, so nothing about the HTML views
   needed to change to keep working. What moved: reading form values
   and deciding what to do with them is still here (that's
   inherently DOM work), but the actual business rules and storage
   now live in js/domain/*.js — this file just wires the two
   together, plus decides say() vs sayAndPaint() exactly as the
   original did per action (patch-only for a form that stays on
   screen, full repaint when the list/structure changes).
----------------------------------------------------------------*/

import { state, geo, emitChange } from "../core/store.js";
import { dayKey } from "../utils/format.js";

import { $, wConfirm } from "../ui/dom.js";
import { say, sayAndPaint } from "../ui/notify.js";
import { startWatch, retryLocation } from "../domain/geofence.js";
import {
  createWorkplace, showAdminOnly,
  attemptLogin, changePassword, backToSignin, signOut
} from "../domain/auth.js";
import { clockIn, clockOut, loadAdminData, openEntryFor } from "../domain/attendance.js";
import { addStaff, updateStaff, toggleActive, startEdit, cancelEdit } from "../domain/roster.js";
import {
  toggleWeeklyOff, savePayRules, saveSiteSettings, addBatch, deleteBatch, addPackage, deletePackage,
  addShift, updateShift, deleteShift, startEditShift, cancelEditShift
} from "../domain/org.js";
import { exportExcel } from "../domain/excel.js";
import { requestLeave, cancelLeave, decideLeave, allLeaves } from "../domain/leave.js";
import {
  addClient, updateClient, renewClient, setClientActive, reminderText, waLinkTo, clientPhone,
  startSession, discardSession, togglePick, submitSession, voidMark, markToday, canVoid, filterClients, exportFiltered, DEFAULT_FILTER, loadPayMonths, presets,
  loadMonth, exportClientsExcel, today as clToday, downloadTemplate, readImportFile, importClients,
  loadAllPayments, exportFullHistory, importAccounts
} from "../domain/clients.js";
import { dailyReport, weeklyReport, monthlyReport, leaveMessage } from "../domain/reports.js";
import { shareWhatsApp, shareImage } from "../utils/whatsapp.js";
import { attendanceSheet } from "../domain/reports.js";
import { renderReportImage } from "../ui/reportImage.js";
import { sharedKey } from "../ui/views/admin/index.js";

/* After a successful submit, empty the form (the screen updates in place,
   so typed values would otherwise stay put — see ui/render.js). */
function clearFields(ids) {
  ids.forEach(function (id) {
    var el = $(id);
    if (!el) return;
    if (el.type === "checkbox") el.checked = false; else el.value = "";
  });
}

function closePreview() {
  if (state.waPreview) { try { URL.revokeObjectURL(state.waPreview.url); } catch (e) {} }
  state.waPreview = null; state.waBusy = false;
}

export function initEvents() {
  var root = $("root");

  /* client search: filter as you type (the field keeps focus — see ui/render.js) */
  root.addEventListener("input", function (ev) {
    if (ev.target.id === "cl_search") { state.clSearch = ev.target.value; emitChange(); }
  });

  root.addEventListener("change", function (ev) {
    if (ev.target.id === "cl_month") { state.clMonth = ev.target.value; emitChange(); loadMonth(state.clMonth); }
    if (ev.target.id === "ca_type") { state.clAddType = ev.target.value; emitChange(); }
    if (ev.target.id === "ca_pkg") { state.clAddPkg = ev.target.value; emitChange(); }
    if (ev.target.id === "cr_pkg") { state.clRenewPkg = ev.target.value; emitChange(); }
    var fm = /^clf_(status|window|endym|seen|plan|length|tenure|joined|renewed|paid|balance|sort)$/.exec(ev.target.id);
    if (fm) {
      state.clFilter = Object.assign({}, state.clFilter); state.clFilter[fm[1]] = ev.target.value; emitChange();
      if (fm[1] === "paid" && ev.target.value) loadPayMonths().catch(function (e) { state.msg = e.message; state.msgOk = false; emitChange(); });
    }
    if (ev.target.classList && ev.target.classList.contains("cl_incl_month") && state.clImport) {
      state.clImport.includeMonths = Object.assign({}, state.clImport.includeMonths);
      state.clImport.includeMonths[ev.target.getAttribute("data-sheet")] = ev.target.checked; emitChange();
    }
    if (ev.target.id === "cl_incl_ended" && state.clImport) { state.clImport.includeEnded = ev.target.checked; emitChange(); }
    if (ev.target.id === "cl_file" && ev.target.files && ev.target.files[0]) {
      var file = ev.target.files[0];
      ev.target.value = "";                                   // allow choosing the same file again
      state.clImport = null; state.clImportBusy = true; state.msg = ""; emitChange();
      readImportFile(file).then(function (pv) { state.clImport = pv; state.clImportBusy = false; emitChange(); })
        .catch(function (err) { state.clImportBusy = false; say(err.message); emitChange(); });
    }
    if (ev.target.id === "cr_type") { state.clRenewType = ev.target.value; emitChange(); }
    if (ev.target.id === "p_month" || ev.target.id === "r_month") {
      state.month = ev.target.value; emitChange(); loadAdminData();
    }
    if (ev.target.id === "r_person") {
      state.recPerson = ev.target.value; emitChange();
    }
  });

  root.addEventListener("click", function (ev) {
    var t = ev.target.closest("[data-act]");
    if (!t) return;
    var act = t.getAttribute("data-act"), v = t.getAttribute("data-v"), id = t.getAttribute("data-id");

    if (act === "usehere" || act === "usehere2") {
      if (!geo.ok) { startWatch(); say("No location fix yet — wait a few seconds and tap again."); return; }
      if (act === "usehere") { $("f_lat").value = geo.lat.toFixed(6); $("f_lng").value = geo.lng.toFixed(6); }
      else { $("s_lat").value = geo.lat.toFixed(6); $("s_lng").value = geo.lng.toFixed(6); }
      return;
    }

    if (act === "createorg") {
      try {
        createWorkplace({
          org: $("f_org").value, name: $("f_nm").value,
          username: $("f_user").value, password: $("f_pass").value,
          lat: parseFloat($("f_lat").value), lng: parseFloat($("f_lng").value),
          radius: parseInt($("f_rad").value, 10)
        }).catch(function (err) { say(err.message); });
      } catch (err) { say(err.message); }
      return;
    }

    if (act === "adminonly") { showAdminOnly(true); return; }
    if (act === "alluser") { showAdminOnly(false); return; }
    if (act === "back") { backToSignin(); return; }

    if (act === "credlogin") {
      try {
        attemptLogin({ username: $("li_user").value, password: $("li_pass").value });
      } catch (err) { say(err.message); }
      return;
    }

    if (act === "changepw") {
      try {
        changePassword({ password: $("cp_pass").value, confirm: $("cp_confirm").value })
          .catch(function (err) { say(err.message); });
      } catch (err) { say(err.message); }
      return;
    }

if (act === "tasktoggle") {
  var taskIndex = Number(t.getAttribute("data-task-index"));
  var openForTasks = state.me ? openEntryFor(state.me.id) : null;
  if (!openForTasks || !openForTasks.entry) return;
  var taskKey = "zen-dynamics-task-done:" + state.me.id + ":" + openForTasks.entry.id;
  var completed = [];

  try {
    var rawTasks = localStorage.getItem(taskKey);
    completed = rawTasks ? JSON.parse(rawTasks) || [] : [];
  } catch (e) {
    completed = [];
  }

  var pos = completed.indexOf(taskIndex);

  if (ev.target.checked) {
    if (pos === -1) completed.push(taskIndex);
  } else {
    if (pos !== -1) completed.splice(pos, 1);
  }

localStorage.setItem(taskKey, JSON.stringify(completed));
emitChange();
return;
}
    if (act === "in") { clockIn(); return; }
    if (act === "out") { clockOut(); return; }
    if (act === "signout") { signOut(); return; }
    if (act === "goadmin") { state.view = "admin"; state.tab = "onsite"; state.msg = ""; emitChange(); loadAdminData(); return; }
    if (act === "gostaff") { state.view = "staff"; state.msg = ""; emitChange(); return; }
    if (act === "tab") {
      state.tab = v; state.msg = ""; state.editId = null; state.editShiftId = null; emitChange();
      if (v === "payroll" || v === "records") loadAdminData();
      return;
    }
    if (act === "paysub") { state.paySub = v; state.msg = ""; emitChange(); return; }
    if (act === "refresh") {
      state.logs = {}; state.adminLoaded = false; emitChange();
      var pull = window.storageSync ? window.storageSync() : Promise.resolve();
pull.then(function () {
  return loadAdminData();
});
return;
    }

    if (act === "edit") { startEdit(id); return; }
    if (act === "canceledit") { cancelEdit(); return; }
   if (act === "saveperson") {
  try {
    var selectedShifts = [];

    var shift1 = $("e_shift1").value;
    var shift2 = $("e_shift2").value;

    if (shift1) selectedShifts.push(shift1);
    if (shift2) selectedShifts.push(shift2);
    var selectedWorkDays = [];

document.querySelectorAll(".e_workday:checked").forEach(function (el) {
  selectedWorkDays.push(el.value);
});
var selectedTasks = $("e_tasks").value
  .split("\n")
  .map(function (task) {
    return task.trim();
  })
  .filter(function (task) {
    return task.length > 0;
  });
    updateStaff(state.editId, {
      name: $("e_name").value,
      username: $("e_user").value,
      password: $("e_pass").value,
      salary: $("e_sal").value,
      admin: $("e_admin").checked,
   shifts: selectedShifts,
workDays: selectedWorkDays,
tasks: selectedTasks
    }).then(function (msg) {
      say(msg, true);
      emitChange();
    }).catch(function (err) {
      say(err.message);
    });
  } catch (err) {
    say(err.message);
  }
  return;
}

    if (act === "addshift") {
      try {
        addShift({
          name: $("shift_name").value, start: $("shift_start").value, end: $("shift_end").value
        }).then(function (msg) { clearFields(["shift_name", "shift_start", "shift_end"]); sayAndPaint(msg, true); }).catch(function (err) { say(err.message); });
      } catch (err) { say(err.message); }
      return;
    }

    if (act === "editshift") { startEditShift(id); return; }
    if (act === "canceleditshift") { cancelEditShift(); return; }

    if (act === "updateshift") {
      try {
        updateShift(id, {
          name: $("shift_name").value, start: $("shift_start").value, end: $("shift_end").value
        }).then(function (msg) { sayAndPaint(msg, true); }).catch(function (err) { say(err.message); });
      } catch (err) { say(err.message); }
      return;
    }

    if (act === "deleteshift") {
      if (!wConfirm("Delete this shift? Anyone assigned to it will need a new one picked.")) return;
      deleteShift(id).then(function (msg) { sayAndPaint(msg, true); }).catch(function (err) { say(err.message); });
      return;
    }
    if (act === "addperson") {
      try {
        addStaff({
          name: $("n_name").value, username: $("n_user").value, password: $("n_pass").value,
          salary: $("n_sal").value, admin: $("n_admin").checked
        }).then(function (msg) { clearFields(["n_name", "n_user", "n_pass", "n_sal", "n_admin"]); sayAndPaint(msg, true); loadAdminData(); }).catch(function (err) { say(err.message); });
      } catch (err) { say(err.message); }
      return;
    }
    if (act === "toggleactive") { toggleActive(id).catch(function (err) { say(err.message); }); return; }

    if (act === "offday") { toggleWeeklyOff(+v); return; }
    if (act === "savepay") {
      savePayRules({
        currency: $("p_cur").value, basis: $("p_basis").value,
        fixedDays: $("p_days").value, stdHours: $("p_std").value,
        fullDayHours: $("p_full").value, halfDayHours: $("p_half").value,
        shiftStart: $("p_start").value, lateGrace: $("p_grace").value,
        lateMarksPerDeduct: $("p_lpd").value, lateDeductDays: $("p_ldd").value,
        paidLeave: $("p_leave").value, leavePerYear: $("p_leaveyr").value,
        otEnabled: $("p_ot").checked, otRate: $("p_otr").value
      }).then(function (msg) { say(msg, true); });
      return;
    }

    if (act === "savecfg") {
      try {
        saveSiteSettings({
          org: $("s_org").value, lat: parseFloat($("s_lat").value), lng: parseFloat($("s_lng").value),
          radius: parseInt($("s_rad").value, 10), graceMin: $("s_grace").value,
          lockOutside: $("s_lock").checked, adminAnywhere: $("s_anywhere").checked, signOutOutside: $("s_signout").checked, demo: $("s_demo").checked
        }).then(function (msg) { say(msg, true); }).catch(function (err) { say(err.message); });
      } catch (err) { say(err.message); }
      return;
    }

    if (act === "leaverequest") {
      try {
        requestLeave(state.me.id, {
          from: $("lv_from").value, to: $("lv_to").value, reason: $("lv_reason").value
        }).then(function (msg) { clearFields(["lv_from", "lv_to", "lv_reason"]); sayAndPaint(msg, true); }).catch(function (err) { say(err.message); });
      } catch (err) { say(err.message); }
      return;
    }

    if (act === "leavecancel") {
      try {
        cancelLeave(id, state.me.id).then(function (msg) { sayAndPaint(msg, true); }).catch(function (err) { say(err.message); });
      } catch (err) { say(err.message); }
      return;
    }

    if (act === "leaveapprove" || act === "leavereject") {
      decideLeave(id, act === "leaveapprove", state.me.name)
        .then(function (msg) { sayAndPaint(msg, true); })
        .catch(function (err) { say(err.message); });
      return;
    }

    /* WhatsApp shares: build the text and open WhatsApp synchronously,
       inside this tap, so the browser doesn't block the new window. */
    if (act === "wa-daily" || act === "wa-weekly" || act === "wa-monthly") {
      if (!state.adminLoaded) { say("Still loading everyone's records — try again in a moment."); return; }
      shareWhatsApp(act === "wa-daily" ? dailyReport(dayKey(Date.now()))
        : act === "wa-weekly" ? weeklyReport() : monthlyReport(state.month));
      return;
    }
    /* Attendance IMAGE: make it, show a preview; "Share" then hands it to the
       phone's Share menu (a second, separate tap, so the share is always
       allowed by the browser and you see what's sent first). */
    if (act === "wa-image") {
      if (!state.adminLoaded) { say("Still loading everyone's records — try again in a moment."); return; }
      var day = dayKey(Date.now());
      var sheet = attendanceSheet(day, id || null);
      closePreview();
      state.waBusy = true; emitChange();
      renderReportImage(sheet).then(function (blob) {
        var file = new File([blob], sheet.fileName, { type: "image/png" });
        state.waPreview = { url: URL.createObjectURL(file), file: file, caption: sheet.caption, key: id ? sharedKey(day, id) : null };
        state.waBusy = false; emitChange();
      }).catch(function (err) { state.waBusy = false; say(err.message); emitChange(); });
      return;
    }
    if (act === "wa-send") {
      var pv = state.waPreview;
      if (!pv) return;
      shareImage(pv.file, pv.caption).then(function (how) {
        if (how === "cancelled") return;
        if (pv.key) { try { localStorage.setItem(pv.key, "1"); } catch (e) {} }
        closePreview(); emitChange();
        if (how === "downloaded") say("Image saved to your downloads — attach it in WhatsApp.", true);
      });
      return;
    }
    if (act === "wa-close") { closePreview(); emitChange(); return; }
    if (act === "wa-dismiss") {
      try { localStorage.setItem(sharedKey(dayKey(Date.now()), id), "1"); } catch (e) {}
      emitChange();
      return;
    }

    /* ---------- clients ---------- */
    if (act === "cl-open") { state.clBack = state.view; state.view = "clients"; state.msg = ""; emitChange(); return; }
    if (act === "cl-back") { state.view = state.clBack === "admin" ? "admin" : "staff"; state.msg = ""; state.clSearch = ""; emitChange(); return; }
    if (act === "cl-start") { state.msg = ""; state.clSearch = ""; startSession($("cl_batch") ? $("cl_batch").value : "general", $("cl_coach") ? $("cl_coach").value : null); window.scrollTo(0, 0); return; }
    if (act === "cl-pick") { try { togglePick(id); } catch (err) { say(err.message); } return; }
    if (act === "cl-discard") {
      var np = state.session ? Object.keys(state.session.picked).length : 0;
      if (np && !wConfirm("Discard this session? The " + np + " tick" + (np === 1 ? "" : "s") + " haven't been saved.")) return;
      discardSession(); state.msg = ""; return;
    }
    if (act === "cl-submit") {
      var btn = t; btn.disabled = true;
      submitSession().then(function (msg) { state.clSearch = ""; sayAndPaint(msg, true); }).catch(function (err) { btn.disabled = false; say(err.message); });
      return;
    }
    if (act === "cl-void") {
      var mk = markToday(id);
      if (!canVoid(mk)) { say("This mark can't be changed now — ask an admin."); return; }
      var own = mk.by === state.me.id && Date.now() - mk.at < 600000;
      var reason = own && !state.me.admin ? "Undone by coach (marked by mistake)" : window.prompt("Reason for voiding this mark?", "Marked by mistake");
      if (reason === null) return;
      voidMark(clToday(), id, reason || "Marked by mistake")
        .then(function (msg) { sayAndPaint(msg, true); }).catch(function (err) { say(err.message); });
      return;
    }
    if (act === "clf-preset") {
      var ps = presets().filter(function (p) { return p.id === t.getAttribute("data-id"); })[0];
      if (ps) { state.clFilter = Object.assign({}, ps.f); state.clSearch = ""; emitChange(); }
      return;
    }
    if (act === "clf-clear") { state.clFilter = Object.assign({}, DEFAULT_FILTER); state.clSearch = ""; emitChange(); return; }
    if (act === "clf-export") { try { say(exportFiltered(filterClients(state.clFilter, state.clSearch)), true); } catch (err) { say(err.message); } return; }
    if (act === "addpkg") {
      try {
        addPackage({ name: $("k_name").value, type: $("k_type").value, group: $("k_group").value, months: $("k_months").value,
                     days: $("k_days").value, sessions: $("k_sessions").value, fee: $("k_fee").value })
          .then(function (msg) { clearFields(["k_name", "k_group", "k_months", "k_days", "k_sessions", "k_fee"]); sayAndPaint(msg, true); })
          .catch(function (err) { say(err.message); });
      } catch (err) { say(err.message); }
      return;
    }
    if (act === "delpkg") {
      if (!wConfirm("Remove this package? Clients already on it keep their plan.")) return;
      deletePackage(id).then(function (msg) { sayAndPaint(msg, true); }).catch(function (err) { say(err.message); });
      return;
    }
    if (act === "addbatch") {
      try {
        addBatch({ name: $("b_name").value, start: $("b_start").value, end: $("b_end").value })
          .then(function (msg) { clearFields(["b_name", "b_start", "b_end"]); sayAndPaint(msg, true); }).catch(function (err) { say(err.message); });
      } catch (err) { say(err.message); }
      return;
    }
    if (act === "delbatch") {
      if (!wConfirm("Remove this batch? Past sessions keep its name.")) return;
      deleteBatch(id).then(function (msg) { sayAndPaint(msg, true); }).catch(function (err) { say(err.message); });
      return;
    }
    if (act === "cl-sub") {
      state.clSub = v; state.clEdit = null; state.clRenewType = null; state.msg = ""; state.clSearch = "";
      emitChange();
      if (v === "report") loadMonth(state.clMonth || clToday().slice(0, 7));
      return;
    }
    if (act === "cl-edit") {
      state.clEdit = id; state.clRenewType = null; state.clRenewPkg = null; state.msg = ""; emitChange(); window.scrollTo(0, 0);
      if (!state.clPaysAll) loadAllPayments();
      return;
    }
    if (act === "cl-closeedit") { state.clEdit = null; state.clSub = "all"; state.msg = ""; emitChange(); return; }
    if (act === "cl-add") {
      try {
        var nf = Object.assign({ pkg: $("ca_pkg") ? $("ca_pkg").value : "custom", type: ($("ca_type") || {}).value, months: ($("ca_months") || {}).value, sessions: ($("ca_sessions") || {}).value, usedBefore: ($("ca_used") || {}).value, start: $("ca_start").value, amount: $("ca_amount").value, mode: $("ca_mode").value }, { name: $("ca_name").value, phone: $("ca_phone").value, notes: $("ca_notes").value });
        addClient(nf).then(function (msg) {
          clearFields(["ca_name", "ca_phone", "ca_notes", "ca_months", "ca_sessions", "ca_used", "ca_amount"]);
          sayAndPaint(msg, true);
        }).catch(function (err) { say(err.message); });
      } catch (err) { say(err.message); }
      return;
    }
    if (act === "cl-renew") {
      try {
        renewClient(id, { pkg: $("cr_pkg") ? $("cr_pkg").value : "custom", type: ($("cr_type") || {}).value, months: ($("cr_months") || {}).value, sessions: ($("cr_sessions") || {}).value, usedBefore: ($("cr_used") || {}).value, start: $("cr_start").value, amount: $("cr_amount").value, mode: $("cr_mode").value }).then(function (msg) {
          clearFields(["cr_months", "cr_sessions", "cr_amount"]);
          state.clRenewType = null; state.clRenewPkg = null; sayAndPaint(msg, true);
        }).catch(function (err) { say(err.message); });
      } catch (err) { say(err.message); }
      return;
    }
    if (act === "cl-save") {
      try {
        updateClient(id, { name: $("ce_name").value, phone: $("ce_phone").value, notes: $("ce_notes").value })
          .then(function (msg) { sayAndPaint(msg, true); }).catch(function (err) { say(err.message); });
      } catch (err) { say(err.message); }
      return;
    }
    if (act === "cl-toggle") {
      var cc = state.clients.filter(function (x) { return x.id === id; })[0];
      if (!cc) return;
      if (cc.active !== false && !wConfirm("Turn off " + cc.name + "? They'll be hidden from the attendance list (history is kept).")) return;
      setClientActive(id, cc.active === false).then(function (msg) { sayAndPaint(msg, true); }).catch(function (err) { say(err.message); });
      return;
    }
    if (act === "cl-wa") {
      var wc = state.clients.filter(function (x) { return x.id === id; })[0];
      if (!wc || !clientPhone(id)) { say("Add this client's phone number first."); return; }
      var link = waLinkTo(clientPhone(id), reminderText(wc));
      var w = window.open(link, "_blank");
      if (w) { try { w.opener = null; } catch (e) {} } else window.location.href = link;
      return;
    }
    if (act === "cl-template") { try { say(downloadTemplate(), true); } catch (err) { say(err.message); } return; }
    if (act === "cl-import-cancel") { state.clImport = null; state.msg = ""; emitChange(); return; }
    if (act === "cl-import") {
      if (!state.clImport) return;
      (state.clImport.kind === "accounts" ? importAccounts(state.clImport) : importClients(state.clImport)).then(function (msg) { state.clImport = null; sayAndPaint(msg, true); })
        .catch(function (err) { say(err.message); });
      return;
    }
    if (act === "cl-xlsx-all") {
      var go = function () { try { say(exportFullHistory(), true); } catch (err) { say(err.message); } };
      if (state.clPaysAll) go(); else { say("Loading every payment…", true); loadAllPayments().then(go); }
      return;
    }
    if (act === "cl-xlsx") {
      try { say(exportClientsExcel(state.clMonth || clToday().slice(0, 7)), true); } catch (err) { say(err.message); }
      return;
    }

    if (act === "wa-leave") {
      var lv = allLeaves().filter(function (x) { return x.id === id; })[0];
      if (lv) shareWhatsApp(leaveMessage(lv));
      return;
    }

    if (act === "retryloc") { retryLocation().then(function () { emitChange(); }); return; }

    if (act === "xlsx") {
      try { say(exportExcel(), true); } catch (err) { say(err.message); }
      return;
    }

    if (act === "recoverreload") { window.location.reload(); return; }
  });

  /* On-site admin tab: refresh who's clocked in every 45s, same cadence as the original. */
  setInterval(function () {
    if (state.view === "admin" && state.tab === "onsite" && state.adminLoaded) {
      state.logs = {};
      loadAdminData();
    }
  }, 45000);
}
