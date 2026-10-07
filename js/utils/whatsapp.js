/* Opens WhatsApp with `text` ready to send. On a phone this opens the
   WhatsApp app's chat picker (groups included); on a computer, WhatsApp
   Web / Desktop. Must be called straight from a tap, or the browser may
   block the new window. Nothing is sent until the person presses send. */
export function shareWhatsApp(text) {
  var url = "https://wa.me/?text=" + encodeURIComponent(text);
  /* No "noopener" feature string: with it, window.open always returns null
     and we couldn't tell success from a blocked popup. */
  var w = window.open(url, "_blank");
  if (w) { try { w.opener = null; } catch (e) {} }
  else window.location.href = url;      // popup blocked (some installed-app modes): open in place
}

/* ---------------------------------------------------------------
   Share an IMAGE through the phone's own Share menu (Web Share API).
   Privacy: the app only HANDS the file to the system share sheet. It
   never sees WhatsApp, contacts or chats, gets nothing back, and needs
   no extra permission. You choose the app and the group, and send.
   Must be called straight from a tap.
   Where the device can't share files (some desktop browsers), the
   image is downloaded instead so it can be attached by hand.
   -> Promise<"shared" | "cancelled" | "downloaded">
----------------------------------------------------------------*/
export function shareImage(file, caption) {
  var data = { files: [file], text: caption };
  if (navigator.canShare && navigator.share && navigator.canShare({ files: [file] })) {
    return navigator.share(data).then(function () { return "shared"; }, function (err) {
      if (err && err.name === "AbortError") return "cancelled";
      return download(file);
    });
  }
  return Promise.resolve(download(file));
}

function download(file) {
  var url = URL.createObjectURL(file);
  var a = document.createElement("a");
  a.href = url; a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
  return "downloaded";
}
