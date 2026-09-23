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
  createWorkplace, createAdminRecovery, resetOrg, goToRecover, showAdminOnly,
  pickForPin, backToSignin, pinBackspace, pinDigit, signOut
} from "../domain/auth.js";
import { clockIn, clockOut, loadAdminData, openEntryFor } from "../domain/attendance.js";
import { addStaff, updateStaff, toggleActive, startEdit, cancelEdit } from "../domain/roster.js";
import {
  toggleWeeklyOff, savePayRules, saveSiteSettings,
  addShift, updateShift, deleteShift, startEditShift, cancelEditShift
} from "../domain/org.js";
import { exportExcel } from "../domain/excel.js";
import { requestLeave, cancelLeave, decideLeave } from "../domain/leave.js";

export function initEvents() {
  var root = $("root");

  root.addEventListener("change", function (ev) {
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
          org: $("f_org").value, name: $("f_nm").value, pin: $("f_pin").value,
          lat: parseFloat($("f_lat").value), lng: parseFloat($("f_lng").value),
          radius: parseInt($("f_rad").value, 10)
        }).catch(function (err) { say(err.message); });
      } catch (err) { say(err.message); }
      return;
    }

    if (act === "recover") { goToRecover(); return; }

    if (act === "makeadmin") {
      try {
        createAdminRecovery({ name: $("r_nm").value, pin: $("r_pin").value }).catch(function (err) { say(err.message); });
      } catch (err) { say(err.message); }
      return;
    }

    if (act === "resetorg") {
      if (!wConfirm("Delete this workplace, its staff list and all records?")) return;
      resetOrg();
      return;
    }

    if (act === "adminonly") { showAdminOnly(true); return; }
    if (act === "alluser") { showAdminOnly(false); return; }
    if (act === "pick") { pickForPin(id); return; }
    if (act === "back") { backToSignin(); return; }
    if (act === "del") { pinBackspace(); return; }
    if (act === "dig") { pinDigit(v); return; }
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
      pin: $("e_pin").value,
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
        }).then(function (msg) { sayAndPaint(msg, true); }).catch(function (err) { say(err.message); });
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
      deleteShift(id).then(function (msg) { sayAndPaint(msg, true); });
      return;
    }
    if (act === "addperson") {
      try {
        addStaff({
          name: $("n_name").value, pin: $("n_pin").value, salary: $("n_sal").value, admin: $("n_admin").checked
        }).then(function (msg) { sayAndPaint(msg, true); }).catch(function (err) { say(err.message); });
      } catch (err) { say(err.message); }
      return;
    }
    if (act === "toggleactive") { toggleActive(id); return; }

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
          lockOutside: $("s_lock").checked, adminAnywhere: $("s_anywhere").checked, demo: $("s_demo").checked
        }).then(function (msg) { say(msg, true); }).catch(function (err) { say(err.message); });
      } catch (err) { say(err.message); }
      return;
    }

    if (act === "leaverequest") {
      try {
        requestLeave(state.me.id, {
          from: $("lv_from").value, to: $("lv_to").value, reason: $("lv_reason").value
        }).then(function (msg) { sayAndPaint(msg, true); }).catch(function (err) { say(err.message); });
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
