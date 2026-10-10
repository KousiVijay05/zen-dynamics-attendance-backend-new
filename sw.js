/* Bump CACHE whenever you change any app file, otherwise phones keep
   serving the old version. v31: packages, batch timetable, coach on sessions. v30: batch sessions + client filters. v29: client membership history. v28: import sales-register exports. v27: client Excel import. v26: clients module. v25: cleaner black (no brown tint). v24: sign staff out when they leave the site. v23: attendance image + shift-end reminder. v22: moved to zenanddynamics.web.app. v21: fixes from full testing. v20: redesigned look. v19: old Google Sheets code removed. v18: WhatsApp share buttons. v17: Firebase Authentication + per-user database
   rules. v16: per-shift lateness + live admin screens. v15: backend moved from
   Google Apps Script to Firebase Realtime Database (see CHANGES.md). */
const CACHE = "attendance-v37";
const ASSETS = [
  "./", "./index.html", "./manifest.json",
  "./icons/icon-192.png", "./icons/icon-512.png", "./icons/mark.png", "./icons/logo-lockup.png",

  "./styles/tokens.css?v=27", "./styles/base.css?v=27",
  "./styles/components.css?v=27", "./styles/views.css?v=27",

  "./js/app.js",
  "./js/core/config.js", "./js/core/store.js",
  "./js/domain/attendance.js", "./js/domain/auth.js", "./js/domain/clients.js", "./js/domain/excel.js",
  "./js/domain/geofence.js", "./js/domain/leave.js", "./js/domain/org.js",
  "./js/domain/payroll.js", "./js/domain/reports.js", "./js/domain/roster.js",
  "./js/events/handlers.js",
  "./js/storage/storage-api.js", "./js/storage/storage-firebase.js",
  "./js/ui/dom.js", "./js/ui/notify.js", "./js/ui/render.js", "./js/ui/reportImage.js",
  "./js/ui/components/brand.js", "./js/ui/components/icons.js", "./js/ui/components/monthOptions.js",
  "./js/ui/components/proximity.js", "./js/ui/components/syncStatus.js",
  "./js/ui/views/admin/index.js", "./js/ui/views/admin/leave.js", "./js/ui/views/admin/onsite.js",
  "./js/ui/views/admin/payroll.js", "./js/ui/views/admin/people.js", "./js/ui/views/admin/records.js",
  "./js/ui/views/admin/settings.js", "./js/ui/views/admin/shifts.js",
  "./js/ui/views/changepw.js", "./js/ui/views/clientTick.js", "./js/ui/views/admin/clients.js", "./js/ui/views/setup.js",
  "./js/ui/views/signin.js", "./js/ui/views/staff.js",
  "./js/utils/format.js", "./js/utils/geomath.js", "./js/utils/whatsapp.js"
];

/* Firebase SDK, loaded cross-origin by js/storage/storage-firebase.js.
   Version-pinned URLs never change content, so cache-first is safe — and
   without this an offline reopen can't load the SDK at all. Keep the
   version here in sync with the imports in storage-firebase.js. */
const FIREBASE_SDK = [
  "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js",
  "https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js",
  "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js"
];

self.addEventListener("install", e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS.concat(FIREBASE_SDK))).catch(() => {}));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ).then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.origin === "https://www.gstatic.com" && url.pathname.indexOf("/firebasejs/") === 0) {
    e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(r => {
      const copy = r.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
      return r;
    })));
    return;
  }
  /* The app's typeface (Google Fonts): cache-first so it survives offline. */
  if (url.origin === "https://fonts.googleapis.com" || url.origin === "https://fonts.gstatic.com") {
    e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(r => {
      const copy = r.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
      return r;
    })));
    return;
  }
  if (url.origin !== location.origin) return;           // let other CDNs handle their own
  e.respondWith(
    /* cache: "no-store" bypasses the browser's own HTTP cache (GitHub Pages
       sends Cache-Control: max-age=600 on every file), so "network first"
       actually means fresh-from-network, not "whatever the browser's disk
       cache already had for the next 10 minutes." Without this, a deploy
       could take up to 10 minutes to visibly reach an already-open tab even
       though this fetch handler looks like it's always hitting the network. */
    fetch(e.request, { cache: "no-store" })
      .then(r => {
        const copy = r.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
        return r;
      })
      .catch(() => caches.match(e.request).then(r => r || caches.match("./index.html")))
  );
});
