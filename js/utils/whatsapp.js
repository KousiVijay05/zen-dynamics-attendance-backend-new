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
