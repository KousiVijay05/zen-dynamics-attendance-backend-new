/* Bump CACHE whenever you change any app file, otherwise phones keep
   serving the old version. Bumped to v7: added leave requests (staff
   request, admin approve/reject, 15/year default, paid in payroll) and
   caught up the precache list with shifts.js/leave.js, missed in v6. */
const CACHE = "attendance-v7";
const ASSETS = [
  "./", "./index.html", "./manifest.json",
  "./icons/icon-192.png", "./icons/icon-512.png", "./icons/mark.png", "./icons/logo-lockup.png",

  "./styles/tokens.css", "./styles/base.css", "./styles/components.css", "./styles/views.css",

  "./js/app.js",
  "./js/core/config.js", "./js/core/store.js",
  "./js/domain/attendance.js", "./js/domain/auth.js", "./js/domain/excel.js",
  "./js/domain/geofence.js", "./js/domain/leave.js", "./js/domain/org.js",
  "./js/domain/payroll.js", "./js/domain/roster.js",
  "./js/events/handlers.js",
  "./js/storage/storage-api.js", "./js/storage/storage-gsheets.js", "./js/storage/storage-local.js",
  "./js/ui/dom.js", "./js/ui/notify.js", "./js/ui/render.js",
  "./js/ui/components/brand.js", "./js/ui/components/monthOptions.js",
  "./js/ui/components/proximity.js", "./js/ui/components/syncStatus.js",
  "./js/ui/views/admin/index.js", "./js/ui/views/admin/leave.js", "./js/ui/views/admin/onsite.js",
  "./js/ui/views/admin/payroll.js", "./js/ui/views/admin/people.js", "./js/ui/views/admin/records.js",
  "./js/ui/views/admin/settings.js", "./js/ui/views/admin/shifts.js",
  "./js/ui/views/pin.js", "./js/ui/views/recover.js", "./js/ui/views/setup.js",
  "./js/ui/views/signin.js", "./js/ui/views/staff.js",
  "./js/utils/format.js", "./js/utils/geomath.js"
];

self.addEventListener("install", e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).catch(() => {}));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ).then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;           // let the CDN handle its own
  e.respondWith(
    fetch(e.request)                                     // network first, so updates land
      .then(r => {
        const copy = r.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
        return r;
      })
      .catch(() => caches.match(e.request).then(r => r || caches.match("./index.html")))
  );
});
