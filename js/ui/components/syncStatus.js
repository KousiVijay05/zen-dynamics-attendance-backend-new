/* ---------------------------------------------------------------
   A small offline/pending-sync banner. New in this build — the
   original had the offline queue (storage-gsheets.js) but never
   surfaced its state to the user, so a clock-in made offline looked
   identical to one that had actually reached the Sheet. This reads
   window.storageStatus(), which storage-gsheets.js already exposes
   (storage-local.js has no such thing, so this quietly does nothing
   in that mode).
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
