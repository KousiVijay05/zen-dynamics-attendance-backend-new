/* PIN entry keypad. Ported verbatim from vPin() in the original app.js. */
import { state } from "../../core/store.js";
import { esc } from "../../utils/format.js";
import { vSignin } from "./signin.js";
import { brandMark } from "../components/brand.js";

export function vPin() {
  var p = state.roster.filter(function (x) { return x.id === state.pinFor; })[0];
  if (!p) { state.view = "signin"; return vSignin(); }
  var dots = "";
  for (var i = 0; i < 4; i++) dots += '<div class="dot' + (i < state.pinBuf.length ? " on" : "") + '"></div>';
  var keys = "";
  [1, 2, 3, 4, 5, 6, 7, 8, 9].forEach(function (n) { keys += '<button class="key" data-act="dig" data-v="' + n + '">' + n + "</button>"; });
  keys += '<button class="key blank" disabled></button><button class="key" data-act="dig" data-v="0">0</button><button class="key" data-act="del">⌫</button>';
  return '<div class="bar"><div class="idn">' + brandMark() + '<div><div class="nm">' + esc(p.name) + '</div><div class="sub">Enter your PIN</div></div></div>' +
    '<div class="acts"><button class="btn quiet small" data-act="back">Back</button></div></div>' +
    '<div class="dots">' + dots + '</div><p class="msg" style="text-align:center">' + esc(state.msg) + "</p>" +
    '<div class="pad">' + keys + "</div>";
}
