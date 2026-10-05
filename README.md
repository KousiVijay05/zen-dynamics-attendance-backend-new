# Staff Attendance & Payroll

A geofenced clock-in/out app with payroll, built as static files (no
build step, no server framework) on Firebase (Realtime Database +
Authentication, free Spark plan). See `CHANGES.md` for every change
since the original single-file version.

## How it's organized

```
index.html              entry point
manifest.json, sw.js     PWA install + offline shell caching
icons/                   Zen & Dynamics logo assets + PWA icons
  logo-source.jpg          the supplied logo, unmodified
  logo-lockup.png          cropped/badged full lockup — Setup/Recover hero
  mark.png                 square mark — header bar + PWA/app icon source
  icon-192.png, icon-512.png  generated from mark.png, for manifest.json
styles/                  tokens.css, base.css, components.css, views.css
js/
  app.js                 bootstrap: wires storage, render, events, boot sequence
  core/                  state store, default config
  storage/                storage-firebase.js (Firebase data + sign-in, sets
                          window.storage / window.storageAuth), storage-api.js
                          (the module the app uses)
  domain/                 business logic: auth, geofence, attendance,
                          payroll, roster, leave, org settings, excel export,
                          WhatsApp report text
  ui/                     render dispatcher, views (one file per screen),
                          small shared components
  events/                 click/change delegation -> domain functions
firebase/
  database.rules.json     who may read/write what (deployed to Firebase)
  migrate-security.js     one-off v17 account migration (already run)
CHANGES.md                every behavior difference from the original, called out explicitly
```

Nothing here needs `npm install` or a bundler. It's plain ES modules
(`<script type="module">`), loaded straight from the files — open it on any
static web host and it works.

## Branding

The app is themed for Zen & Dynamics: black + white + gold throughout,
with the logo on every screen (a prominent lockup on Setup/Recover, a
compact mark in the header bar everywhere else). Green/red only ever
appear as live status color — inside/outside the geofence, an open shift,
a success or error message — never as decoration. See `CHANGES.md`'s
"Zen & Dynamics branding pass" section for exactly what changed and where
each logo file is referenced from. To swap the logo later: replace
`icons/logo-source.jpg` with the new file and re-crop it into
`icons/logo-lockup.png` and `icons/mark.png` (square, for the header bar
and app icon) — any image editor works, there's no build step involved.

## Quick start (local testing)

Browsers block geolocation on `file://` pages, so you need to serve the
folder over http(s), even locally:

```bash
cd attendance-app
python3 -m http.server 8080
# open http://localhost:8080/index.html
```

`index.html` loads the live Firebase backend, so a local copy talks to
the real workplace data. To try things out without touching it, run the
Firebase Local Emulator Suite (`npx firebase-tools emulators:start --only
database,auth`) and open `http://localhost:8080/index.html?emulator=1` —
first run then takes you through workplace setup.

## Backend: Firebase (current)

Project `zen-dynamics-attendance-a2f73` (region `asia-southeast1`), on the
free **Spark** plan.

- **Data**: Realtime Database, at `/kv` (one JSON string per key), plus
  the membership records `/uidmap`, `/admins`, `/mustchange`, `/logins`
  (see the header of `js/storage/storage-firebase.js`).
- **Sign-in**: Firebase Authentication, email/password. A person's account
  email is `<user ID>@zen-dynamics-attendance-a2f73.firebaseapp.com` (or
  with a `+suffix` after a password reset). Nothing is ever emailed to it.
- **Rules**: `firebase/database.rules.json`. Deploy with
  `npx firebase-tools deploy --only database` from this folder.
- Web config: top of `js/storage/storage-firebase.js` (public by design —
  the rules and sign-in are what protect the data).
- History: the data moved off Google Sheets / Apps Script in v15 (the
  migration script and the old Sheets code are in git history, removed in
  v19); `firebase/migrate-security.js` moved accounts to Firebase
  Authentication (v17). Both are one-off.

## Deploying the frontend

Any static host works, as long as it's served over **https** (required for
geolocation on a real device — plain http or a sandboxed preview will
always show "Location unavailable"). A few options:

- **GitHub Pages**: push this folder to a repo, enable Pages on it.
- **Netlify / Vercel / Cloudflare Pages**: drag-and-drop deploy or connect
  the repo; no build command needed (leave the build command blank / "static site").
- **Your own web server**: just copy the files into the web root of any
  server that can serve static files over https (nginx, Apache, etc.).

After the first deploy, if you make changes later, bump the `CACHE`
version string at the top of `sw.js` (currently `attendance-v17`) so
installed phones pick up the update instead of serving a stale cached copy.

## First-time configuration walkthrough

1. **Open the app.** No workplace exists yet, so you land on "Set up
   attendance".
2. **Workplace name + your name + a user ID and password.** You become the
   first administrator, and you choose your own password right away — no
   forced change.
3. **Site coordinates.** Either type latitude/longitude, or stand where
   staff will actually clock in and tap "Use my location" (needs location
   permission granted in the browser).
4. **Allowed distance (metres).** Defaults to 100; this is the geofence
   radius.
5. **Create workplace** — you're signed in immediately as admin.
6. **Admin → Payroll → Rules**: set currency, pay basis (monthly salary vs.
   hourly), payable days/month, standard/full/half-day hour thresholds,
   shift start + late grace, late-deduction rule, paid leave allowance,
   overtime + multiplier, weekly off days. Defaults are reasonable but
   review them for your workplace before running real payroll.
7. **Admin → Settings**: adjust the geofence radius, whether the app locks
   entirely outside the zone, the auto-clock-out grace period, whether
   admins can sign in from anywhere, and demo mode (see Testing GPS below).
8. **Admin → People → Add someone** for each staff member: name, a user ID,
   a temporary password, and salary/rate/admin. They're asked to pick
   their own password the first time they sign in. Nobody — admins
   included — can see anyone's password; if someone forgets theirs, give
   them a new temporary one from their edit screen.

If every administrator is ever locked out, see README → Security for the
two-minute fix in the Firebase console.

## Testing GPS / geofencing

Three ways, easiest first:

1. **Demo mode** (Admin → Settings → "Demo mode"): treats every device as
   standing exactly at the site. Good for testing the rest of the app
   (payroll, records, admin flows) without worrying about location at all.
   Turn it off before going live — it disables the geofence entirely.
2. **Browser devtools geolocation override**: in Chrome DevTools, the
   "Sensors" panel (Cmd/Ctrl+Shift+P → "Show Sensors") lets you set a fixed
   lat/lng or simulate movement, without touching your real location. Great
   for testing "walk outside the zone and get auto clocked out."
3. **On a real phone at the real site**: the actual end-to-end test.
   Remember it must be https.

To test the auto clock-out specifically: clock in while inside the zone,
then move (or devtools-simulate moving) outside the configured radius and
wait past the configured grace period (Admin → Settings → "Delay before
auto clock-out"). The shift should close on its own, tagged "auto" in
Records.

## Troubleshooting

- **Blank white screen.** Shouldn't happen anymore — `js/ui/render.js` and
  `js/app.js` both catch render/boot failures and show a recovery screen
  with a Reload button instead. If you still see a truly blank page, open
  the browser console; it's almost certainly a network/CDN block (see
  next item) or the page being served from `file://` instead of http(s).
- **"Location unavailable" that never resolves.** Either location
  permission was denied (check the browser/site settings) or the page
  isn't served over https — geolocation is blocked on plain http except on
  `localhost`.
- **"User ID or password is incorrect" for someone who's sure of it.**
  Give them a new temporary password: Admin → People → Edit.
- **"That account is no longer active."** They've been turned off in
  Admin → People (tap "Restore").
- **An installed/PWA copy is stuck on the old version.** Bump `CACHE` in
  `sw.js` and redeploy; the service worker is network-first for same-origin
  requests but the app shell can still lag one load behind on flaky
  connections.

## Security

Since v17 the sign-in screen is a real lock:

- **Passwords** are held by Firebase Authentication (hashed), never in the
  database or the Excel export. Nobody, admins included, can read one.
  Admins can only set a new temporary password, which the person must
  replace at their next sign-in.
- **Database rules** (`firebase/database.rules.json`) are enforced by
  Google's servers, not by the app, so they hold even against someone
  calling the database directly:
  - signed out, or signed in with an account that isn't an active staff
    member: only the workplace name and site (`org:public`);
  - staff: their own profile, attendance, and leave requests (they can't
    change their profile, approve leave, or make themselves admin);
    workplace settings read-only;
  - admins: everything.
- **First-time setup** is only possible while no workplace exists.
- **Phones** cache only the signed-in person's data; signing out clears it.

What's still worth knowing:

- Staff write their own attendance records, so a technically skilled
  staff member could edit their own punches directly. The geofence check
  runs on the phone. Admins see every punch in Records.
- Admins are fully trusted: the "can't remove the last admin" and "can't
  deactivate yourself" checks are in the app, not the rules.
- **Every admin locked out?** Firebase console → Realtime Database → Data:
  find the person's staff id in `kv/org:roster`, then add
  `admins/<staff id>: true` and `uidmap/<their authUid>: <staff id>`.
  For a forgotten password, Authentication → Users → their account →
  Reset password isn't usable (the email is fake); instead add a new
  admin the same way with a freshly created account.
- The `kv-backup-*.json` file the migration writes contains the old
  plaintext passwords. Keep it private, and delete it once you're happy.
