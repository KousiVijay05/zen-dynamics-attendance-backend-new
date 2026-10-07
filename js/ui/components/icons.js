/* Small inline SVG icons (stroke = currentColor), plus the initials avatar. */

function svg(body, fill) {
  return '<svg viewBox="0 0 24 24" aria-hidden="true" fill="' + (fill ? "currentColor" : "none") +
    '" stroke="' + (fill ? "none" : "currentColor") + '" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' + body + "</svg>";
}

export var icons = {
  whatsapp: svg('<path d="M12.04 2a9.9 9.9 0 0 0-8.5 15l-1.4 5 5.1-1.34A9.9 9.9 0 1 0 12.04 2Zm0 18.1a8.2 8.2 0 0 1-4.2-1.15l-.3-.18-3.03.8.81-2.95-.2-.3a8.2 8.2 0 1 1 6.92 3.78Zm4.5-6.14c-.25-.12-1.46-.72-1.69-.8-.23-.08-.39-.12-.56.12-.16.25-.64.8-.78.97-.14.16-.29.18-.53.06a6.7 6.7 0 0 1-3.34-2.92c-.25-.43.25-.4.72-1.34.08-.16.04-.3-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.41-.56-.42h-.48a.92.92 0 0 0-.67.31 2.8 2.8 0 0 0-.87 2.08 4.9 4.9 0 0 0 1.02 2.58 11.2 11.2 0 0 0 4.27 3.78c1.6.69 2.22.75 3.02.63.49-.07 1.46-.6 1.67-1.18.2-.58.2-1.07.14-1.18-.06-.1-.22-.16-.47-.28Z"/>', true),
  out: svg('<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 17l-5-5 5-5"/><path d="M5 12h11"/>'),
  shield: svg('<path d="M12 3l7 3v6c0 4.4-3 7.8-7 9-4-1.2-7-4.6-7-9V6l7-3Z"/><path d="M9.5 12l1.8 1.8L15 10"/>'),
  clock: svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
  pin: svg('<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z"/><circle cx="12" cy="10" r="2.4"/>'),
  refresh: svg('<path d="M20 11a8 8 0 0 0-14.7-4.3L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.7 4.3L20 16"/><path d="M20 20v-4h-4"/>'),
  download: svg('<path d="M12 4v11"/><path d="M7 10l5 5 5-5"/><path d="M5 20h14"/>'),
  lock: svg('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
  back: svg('<path d="M15 6l-6 6 6 6"/>'),
  login: svg('<path d="M10 17l5-5-5-5"/><path d="M15 12H4"/><path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/>')
};

/** Round initials badge. `cls` adds "in" (green dot) or "dim". */
export function avatar(name, cls) {
  var parts = String(name || "?").trim().split(/\s+/);
  var ini = (parts[0][0] || "?") + (parts.length > 1 ? parts[parts.length - 1][0] : (parts[0][1] || ""));
  return '<span class="avatar' + (cls ? " " + cls : "") + '" aria-hidden="true">' + ini.toUpperCase().replace(/[<>&"]/g, "") + "</span>";
}
