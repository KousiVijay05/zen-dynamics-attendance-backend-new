/* "Settings" tab: site/geofence + behavior. Ported verbatim from tabSite() in the original app.js. */
import { state } from "../../../core/store.js";
import { esc } from "../../../utils/format.js";
import { noBackend } from "../../../storage/storage-api.js";

export function tabSite() {
  var s = state.cfg.site;
  return '<div class="field"><label for="s_org">Workplace name</label><input id="s_org" type="text" value="' + esc(state.cfg.org) + '" /></div>' +
    '<div class="field"><label>Site coordinates</label><div class="pair">' +
    '<input id="s_lat" class="num" type="text" inputmode="decimal" value="' + s.lat + '" />' +
    '<input id="s_lng" class="num" type="text" inputmode="decimal" value="' + s.lng + '" /></div></div>' +
    '<div class="btnrow"><button class="btn" data-act="usehere2">Use my location</button></div>' +
    '<div class="field"><label for="s_rad">Allowed distance (metres)</label><input id="s_rad" class="num" type="number" min="10" max="2000" step="10" value="' + s.radius + '" /></div>' +
    '<label class="check"><input type="checkbox" id="s_lock"' + (state.cfg.lockOutside ? " checked" : "") + " />" +
    "<div>Lock the app outside the zone<span>Beyond the allowed distance the app closes any open shift and disables clocking.</span></div></label>" +
    '<div class="field"><label for="s_grace">Delay before auto clock-out (minutes)</label>' +
    '<input id="s_grace" class="num" type="number" min="0" max="60" value="' + state.cfg.graceMin + '" />' +
    '<span class="note">0 ends the shift the moment they cross the boundary.</span></div>' +
    '<label class="check"><input type="checkbox" id="s_anywhere"' + (state.cfg.adminAnywhere ? " checked" : "") + " />" +
    "<div>Administrators can sign in from anywhere<span>Lets you check records and payroll off site.</span></div></label>" +
    '<label class="check"><input type="checkbox" id="s_demo"' + (state.cfg.demo ? " checked" : "") + " />" +
    "<div>Demo mode<span>Treats everyone as standing at the site. Testing only.</span></div></label>" +
    '<div class="btnrow"><button class="btn go wide" data-act="savecfg">Save settings</button></div>' +
    '<p class="msg' + (state.msgOk ? " ok" : "") + '">' + esc(state.msg) + "</p>" +
    (noBackend() ? '<p class="note">Saved storage is unavailable here, so records last only for this session.</p>'
                : '<p class="note">Records are shared by everyone using this app.</p>');
}
