/* <select> options for the last 6 months, shared by Records and Payroll tabs. Ported verbatim from monthOptions() in the original app.js. */
import { state } from "../../core/store.js";
import { ymKey, monthLabel } from "../../utils/format.js";

export function monthOptions() {
  var out = [], d = new Date();
  for (var i = 0; i < 6; i++) {
    var ym = ymKey(new Date(d.getFullYear(), d.getMonth() - i, 1).getTime());
    out.push('<option value="' + ym + '"' + (ym === state.month ? " selected" : "") + ">" + monthLabel(ym) + "</option>");
  }
  return out.join("");
}
