/* ---------------------------------------------------------------
   A small offline/pending-sync banner: shows when this device is
   offline or has punches waiting to upload, so a clock-in made offline
   doesn't look identical to one that reached the server. Reads
   window.storageStatus() from storage-firebase.js.
----------------------------------------------------------------*/

export function syncBanner() {
  if (typeof window.storageStatus !== "function") return "";
  var s;
  try { s = window.storageStatus(); } catch (e) { return ""; }
  if (!s) return "";
  if (s.online && !s.pending) return "";
  var text = !s.online
    ? "Offline — changes are saved on this device and will sync automatically."
    : s.pending + " change" + (s.pending === 1 ? "" : "s") + " syncing…";
  return '<div class="syncbar' + (!s.online ? " off" : "") + '">' + text + "</div>";
}
