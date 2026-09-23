/*  Attendance backend — Google Apps Script
 *  ----------------------------------------
 *  Turns a Google Sheet into the database for the attendance app.
 *
 *  Setup is in README-google-sheets.md. In short:
 *    1. Create a Google Sheet.
 *    2. Extensions -> Apps Script, paste this file over Code.gs.
 *    3. Change SECRET below to something only you know.
 *    4. Deploy -> New deployment -> Web app
 *         Execute as:      Me
 *         Who has access:  Anyone
 *    5. Copy the /exec URL into js/storage/storage-gsheets.js.
 *
 *  The sheet ends up with:
 *    _data   raw key/value rows the app reads and writes
 *    Shifts  every punch, one row each, human readable
 *    Staff   the roster
 *  Shifts and Staff are rebuilt automatically. Don't type into them;
 *  edit people in the app instead.
 *
 *  SECURITY, READ THIS: the app is a static front end with SECRET
 *  shipped in its client JS. Anyone who has SECRET and this
 *  deployment's URL can call every action below directly, bypassing
 *  the app's PIN screen (which only gates the UI, not this API).
 *  That's inherent to "static site + shared secret", not something
 *  this file can fully close. What's added below reduces the blast
 *  radius of a leaked secret and of accidental/malformed requests:
 *    - every key written through this API is checked against an
 *      allowlist shape (org:config, org:roster, or log:<id>:<yyyymm>)
 *    - value size and batch size are capped, so one request can't
 *      blow up the sheet or exhaust the daily quota
 *    - a lightweight per-minute request counter throttles abuse from
 *      a single caller without needing a database
 *  None of this replaces real per-user authentication. If that
 *  matters for your workplace, the only real fix is putting a proper
 *  auth layer in front of this endpoint (e.g. requiring a Google
 *  Identity token from a Sites/Workspace-restricted deployment) —
 *  a bigger change than this rebuild was asked to make. See
 *  README.md's Security section for the full writeup.
 */

var SECRET = "scFJnv_q9aCIHR6uBCjRWfvke8HlAQ20";

var KV_SHEET = "_data";
var SHIFTS_SHEET = "Shifts";
var STAFF_SHEET = "Staff";

/* ---------- hardening limits ---------- */

var MAX_VALUE_CHARS = 200000;   // a month of one person's punches is nowhere near this
var MAX_BATCH_ITEMS = 200;
var MAX_REQUESTS_PER_MINUTE = 120; // per Apps Script instance; generous for real usage, blunt against a runaway client

var KEY_PATTERN = /^(org:config|org:roster|log:[A-Za-z0-9_-]{1,64}:\d{6})$/;

/* ---------- entry points ---------- */

function doGet() {
  return json({ ok: true, message: "Attendance backend is running." });
}

function doPost(e) {
  var req;
  try { req = JSON.parse(e.postData.contents); }
  catch (err) { return json({ ok: false, error: "Bad request body" }); }

  if (req.token !== SECRET) return json({ ok: false, error: "Wrong token" });
  if (!rateLimitOk()) return json({ ok: false, error: "Too many requests, slow down." });

  var lock = LockService.getScriptLock();
  try { lock.waitLock(25000); }
  catch (err) { return json({ ok: false, error: "Busy, try again" }); }

  try { return json(handle(req)); }
  catch (err) { return json({ ok: false, error: String(err) }); }
  finally { lock.releaseLock(); }
}

function handle(req) {
  var sh = kvSheet();

  if (req.action === "all") {
    return { ok: true, kv: readAll(sh) };
  }

  if (req.action === "set") {
    var badKey = invalidKeyError(req.key);
    if (badKey) return { ok: false, error: badKey };
    var badVal = invalidValueError(req.value);
    if (badVal) return { ok: false, error: badVal };
    writeKey(sh, req.key, req.value);
    maybeRebuild([req.key]);
    return { ok: true, kv: null };
  }

  if (req.action === "setMany") {
    var items = req.items || [];
    if (!Array.isArray(items)) return { ok: false, error: "items must be a list" };
    if (items.length > MAX_BATCH_ITEMS) return { ok: false, error: "Too many items in one request (max " + MAX_BATCH_ITEMS + ")" };
    for (var i = 0; i < items.length; i++) {
      var bk = invalidKeyError(items[i] && items[i].key);
      if (bk) return { ok: false, error: bk };
      var bv = invalidValueError(items[i] && items[i].value);
      if (bv) return { ok: false, error: bv };
    }
    var keys = [];
    for (var j = 0; j < items.length; j++) {
      writeKey(sh, items[j].key, items[j].value);
      keys.push(items[j].key);
    }
    maybeRebuild(keys);
    return { ok: true, saved: keys.length };
  }

  if (req.action === "delete") {
    var bdk = invalidKeyError(req.key);
    if (bdk) return { ok: false, error: bdk };
    deleteKey(sh, req.key);
    maybeRebuild([req.key]);
    return { ok: true };
  }

  return { ok: false, error: "Unknown action: " + req.action };
}

/* ---------- request validation ---------- */

function invalidKeyError(key) {
  if (typeof key !== "string" || !KEY_PATTERN.test(key)) return "Rejected: not a recognized key shape.";
  return null;
}

function invalidValueError(value) {
  if (value === null || value === undefined) return null;   // "null" clears a key, same as before
  var s = String(value);
  if (s.length > MAX_VALUE_CHARS) return "Rejected: value too large.";
  return null;
}

/* Simple fixed-window counter using Script Properties. Good enough to blunt a
   runaway/misbehaving client; not a substitute for real rate limiting infra. */
function rateLimitOk() {
  try {
    var props = PropertiesService.getScriptProperties();
    var windowKey = "rl:" + Math.floor(Date.now() / 60000);
    var n = Number(props.getProperty(windowKey) || "0") + 1;
    props.setProperty(windowKey, String(n));
    return n <= MAX_REQUESTS_PER_MINUTE;
  } catch (e) {
    return true; // never block real traffic because the throttle itself failed
  }
}

/* ---------- key/value store ---------- */

function kvSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(KV_SHEET);
  if (!sh) {
    sh = ss.insertSheet(KV_SHEET);
    sh.getRange(1, 1, 1, 3).setValues([["key", "value", "updated"]]).setFontWeight("bold");
    sh.setFrozenRows(1);
    sh.hideSheet();
  }
  return sh;
}

function readAll(sh) {
  var last = sh.getLastRow();
  if (last < 2) return {};
  var rows = sh.getRange(2, 1, last - 1, 2).getValues();
  var out = {};
  for (var i = 0; i < rows.length; i++) {
    if (rows[i][0]) out[String(rows[i][0])] = String(rows[i][1]);
  }
  return out;
}

function rowFor(sh, key) {
  var last = sh.getLastRow();
  if (last < 2) return 0;
  var keys = sh.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < keys.length; i++) {
    if (String(keys[i][0]) === key) return i + 2;
  }
  return 0;
}

function writeKey(sh, key, value) {
  var row = rowFor(sh, key);
  var stamp = new Date();
  if (row) sh.getRange(row, 2, 1, 2).setValues([[value, stamp]]);
  else sh.appendRow([key, value, stamp]);
}

function deleteKey(sh, key) {
  var row = rowFor(sh, key);
  if (row) sh.deleteRow(row);
}

/* ---------- readable sheets ---------- */

function maybeRebuild(keys) {
  for (var i = 0; i < keys.length; i++) {
    var k = String(keys[i]);
    if (k.indexOf("log:") === 0 || k === "org:roster") { rebuild(); return; }
  }
}

function rebuild() {
  var sh = kvSheet();
  var kv = readAll(sh);

  var roster = [];
  try { roster = JSON.parse(kv["org:roster"] || "[]") || []; } catch (e) { roster = []; }

  var names = {};
  for (var i = 0; i < roster.length; i++) names[roster[i].id] = roster[i].name;

  /* Shifts */
  var rows = [["Staff", "Date", "Day", "Clock in", "Clock out", "Hours", "Ended"]];
  var tz = Session.getScriptTimeZone();

  Object.keys(kv).forEach(function (key) {
    if (key.indexOf("log:") !== 0) return;
    var staffId = key.split(":")[1];
    var entries;
    try { entries = JSON.parse(kv[key] || "[]") || []; } catch (e) { return; }
    entries.forEach(function (en) {
      if (!en || !en.start) return;
      var start = new Date(en.start);
      var end = en.end ? new Date(en.end) : null;
      rows.push([
        names[staffId] || staffId,
        Utilities.formatDate(start, tz, "yyyy-MM-dd"),
        Utilities.formatDate(start, tz, "EEE"),
        Utilities.formatDate(start, tz, "HH:mm"),
        end ? Utilities.formatDate(end, tz, "HH:mm") : "still in",
        end ? Math.round((en.end - en.start) / 36000) / 100 : "",
        en.auto ? "auto (left site)" : (end ? "manual" : "")
      ]);
    });
  });

  rows.sort(function (a, b) {
    if (a[0] === "Staff") return -1;
    if (b[0] === "Staff") return 1;
    return (a[1] + a[3]) < (b[1] + b[3]) ? 1 : -1;   // newest first
  });

  writeSheet(SHIFTS_SHEET, rows);

  /* Staff — PIN is deliberately left out of this sheet; it's already visible
     to anyone who can open this spreadsheet, and there's no reason to also
     put it in the one sheet meant to be glanced at/printed. */
  var staffRows = [["Name", "Monthly salary / rate", "Administrator", "Active", "Joined"]];
  roster.forEach(function (p) {
    staffRows.push([p.name, p.salary || 0, p.admin ? "Yes" : "", p.active === false ? "" : "Yes", p.joined || ""]);
  });
  writeSheet(STAFF_SHEET, staffRows);
}

function writeSheet(name, rows) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  sh.clear();
  if (!rows.length) return;
  sh.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
  sh.getRange(1, 1, 1, rows[0].length).setFontWeight("bold");
  sh.setFrozenRows(1);
  sh.autoResizeColumns(1, rows[0].length);
}

/* ---------- helpers ---------- */

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* Run this once from the editor to grant permissions and see the sheets appear. */
function setup() {
  kvSheet();
  rebuild();
  SpreadsheetApp.getActiveSpreadsheet().toast("Attendance backend ready.");
}
