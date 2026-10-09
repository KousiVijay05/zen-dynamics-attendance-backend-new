/* ---------------------------------------------------------------
   Render dispatcher. Ported from paint() in the original app.js,
   with one addition: a try/catch error boundary. The original had
   no protection against an exception inside a view function — that
   left <div id="root"> blank with no way back in. Here, any render
   failure falls back to a small recovery screen instead (see
   errorScreen() below) so the app never goes fully blank.
----------------------------------------------------------------*/

import { state } from "../core/store.js";
import { vSetup } from "./views/setup.js";
import { vSignin } from "./views/signin.js";
import { vChangePw } from "./views/changepw.js";
import { vStaff } from "./views/staff.js";
import { vAdmin } from "./views/admin/index.js";
import { vClientTick } from "./views/clientTick.js";
import { syncBanner } from "./components/syncStatus.js";
import { brandMark } from "./components/brand.js";

export function render() {
  var root = document.getElementById("root");
  if (!root) return;
  var html;
  try {
    if (state.fatal) { html = errorScreen(state.fatal); root.innerHTML = html; return; }
    html = view();
    if (state.view === "staff" || state.view === "admin" || state.view === "signin" || state.view === "changepw" || state.view === "clients") html = syncBanner() + html;
  } catch (err) {
    console.error("Render failed:", err);
    state.fatal = err;
    html = errorScreen(err);
  }
  var tpl = document.createElement("template");
  tpl.innerHTML = html;
  morphChildren(root, tpl.content);
  /* When the selected admin tab changes, scroll the pill row so it's in view. */
  var sel = root.querySelector(".tabs:not(.seg) .tab.sel");
  var v = sel && sel.getAttribute("data-v");
  if (sel && v !== lastTab && sel.parentNode.scrollWidth > sel.parentNode.clientWidth) {
    sel.parentNode.scrollLeft = Math.max(0, sel.offsetLeft - sel.parentNode.clientWidth / 2 + sel.offsetWidth / 2);
  }
  lastTab = v;
}
var lastTab = null;

/* ---------------------------------------------------------------
   Update the page in place instead of replacing it (the staff and
   sign-in screens redraw every second for the timer and location).
   Replacing everything each second swallowed taps that landed mid-
   redraw and replayed the cards' entrance animation. Here, nodes that
   are the same kind stay put and only changed text/attributes are
   touched, so a button under your finger is the same button.
   Form fields keep what the person typed unless the new markup sets a
   different value; handlers clear forms explicitly after a submit.
----------------------------------------------------------------*/
function morphChildren(from, to) {
  var f = from.firstChild, t = to.firstChild;
  while (t) {
    var nextT = t.nextSibling;
    if (!f) { from.appendChild(t); t = nextT; continue; }
    var nextF = f.nextSibling;
    if (sameNode(f, t)) patch(f, t);
    else from.replaceChild(t, f);
    f = nextF; t = nextT;
  }
  while (f) { var n = f.nextSibling; from.removeChild(f); f = n; }
}

/* Same kind of node? Form fields must also be the SAME field (id, type,
   class) — otherwise text typed into one field (say, a temporary password
   on one person's edit form) would be carried into whatever field later
   takes its place on screen. Those get a fresh element instead. */
var FIELD = { INPUT: 1, TEXTAREA: 1, SELECT: 1 };
function sameNode(a, b) {
  if (a.nodeType !== b.nodeType) return false;
  if (a.nodeType !== 1) return true;
  if (a.tagName !== b.tagName) return false;
  if (!FIELD[a.tagName]) return true;
  return ["id", "type", "class", "name"].every(function (n) {
    return (a.getAttribute(n) || "") === (b.getAttribute(n) || "");
  });
}

function patch(a, b) {
  if (a.nodeType !== 1) {
    if (a.nodeValue !== b.nodeValue) a.nodeValue = b.nodeValue;
    return;
  }
  var i, name, val;
  for (i = 0; i < b.attributes.length; i++) {
    name = b.attributes[i].name; val = b.attributes[i].value;
    if (a.getAttribute(name) !== val) {
      a.setAttribute(name, val);
      if (name === "value" && "value" in a) a.value = val;
      if (name === "checked") a.checked = true;
      if (name === "selected") a.selected = true;
    }
  }
  for (i = a.attributes.length - 1; i >= 0; i--) {
    name = a.attributes[i].name;
    if (b.hasAttribute(name)) continue;
    if (name === "open" && a.tagName === "DETAILS") continue;   // the person opened it
    a.removeAttribute(name);
    if (name === "value" && "value" in a) a.value = "";
    if (name === "checked") a.checked = false;
    if (name === "selected") a.selected = false;
  }
  if (a.tagName === "TEXTAREA") {
    if (a.defaultValue !== b.defaultValue) { a.defaultValue = b.defaultValue; a.value = b.defaultValue; }
    return;
  }
  morphChildren(a, b);
}

function view() {
  if (state.view === "setup") return vSetup();
  if (state.view === "signin") return vSignin();
  if (state.view === "changepw") return vChangePw();
  if (state.view === "staff") return vStaff();
  if (state.view === "admin") return vAdmin();
  if (state.view === "clients") return vClientTick();
  return '<div class="splash"><img src="icons/mark.png" width="72" height="72" alt="Zen & Dynamics" /><span>Loading…</span></div>';
}

function errorScreen(err) {
  return '<div class="bar"><div class="idn">' + brandMark() + '<div><div class="nm">Something went wrong</div>' +
    '<div class="sub">The screen couldn\'t be drawn</div></div></div></div>' +
    '<div class="clock locked"><div class="read">Error</div><div class="cap">' +
    (err && err.message ? String(err.message).replace(/[&<>"]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]; }) : "Unknown error") +
    "</div></div>" +
    '<div class="btnrow"><button class="btn wide" data-act="recoverreload">Reload</button></div>' +
    '<p class="note">Your data is safe — this only affects what\'s drawn on screen right now. Reloading almost always fixes it; if it keeps happening, tell whoever manages this app what you were doing when it appeared.</p>';
}
