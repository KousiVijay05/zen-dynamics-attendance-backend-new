# Staff Attendance & Payroll

A geofenced clock-in/out app with payroll, built as static files (no
build step, no server framework) that talk to a Google Sheet through a
small Apps Script backend. See `CHANGES.md` for exactly what changed in
this rebuild vs. the original single-file version, and
`google-apps-script/README-google-sheets.md` for detailed Sheets setup.

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
  storage/                storage-local.js, storage-gsheets.js (plain scripts,
                          set window.storage — swap one for the other in
                          index.html), storage-api.js (the module the app uses)
  domain/                 business logic: auth, geofence, attendance,
                          payroll, roster, org settings, excel export
  ui/                     render dispatcher, views (one file per screen),
                          small shared components
  events/                 click/change delegation -> domain functions
google-apps-script/
  Code.gs                 the backend (paste into Apps Script)
  README-google-sheets.md detailed Sheets setup walkthrough
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

By default it uses `js/storage/storage-local.js` (per-device localStorage
— good for trying it out solo). First run takes you through workplace
setup automatically.

## Setting up shared storage (Google Sheets)

For real use — where every staff phone and the admin see the same
records — follow `google-apps-script/README-google-sheets.md` end to end.
Short version:

1. Create a Google Sheet, paste `google-apps-script/Code.gs` into its
   Apps Script editor, set a strong `SECRET`, run `setup()` once, deploy as
   a web app (**Execute as: Me**, **Who has access: Anyone**).
2. Put that deployment's URL and your `SECRET` into
   `js/storage/storage-gsheets.js`.
3. In `index.html`, change:
   ```html
   <script src="js/storage/storage-local.js"></script>
   ```
   to:
   ```html
   <script src="js/storage/storage-gsheets.js"></script>
   ```

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
version string at the top of `sw.js` (already at `attendance-v4`) so
installed phones pick up the update instead of serving a stale cached copy.

## First-time configuration walkthrough

1. **Open the app.** No workplace exists yet, so you land on "Set up
   attendance".
2. **Workplace name + your name + a 4-digit PIN.** You become the first
   administrator.
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
8. **Admin → People → Add someone** for each staff member: name, 4-digit
   PIN, salary/rate, and whether they can administer.

If everyone with admin rights is ever deactivated or their PIN forgotten
beyond recovery, the sign-in screen has a **"Recover administrator
access"** link (shown automatically whenever no active administrator
exists) that lets you create a new admin without losing any records.

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
- **"WEB_APP_URL is not set in js/storage/storage-gsheets.js".** You swapped
  in the Sheets adapter but didn't paste your deployment URL in.
- **"Unexpected reply from the Sheet. Is the web app deployed to Anyone?"**
  Usually means the Apps Script deployment's "Who has access" isn't set to
  Anyone — Google is returning a sign-in page instead of JSON. Redeploy
  with that setting.
- **"Wrong token"** — `SECRET` in `Code.gs` doesn't match `SECRET` in
  `js/storage/storage-gsheets.js`. They must be identical strings.
- **"Busy, try again"** — two requests hit the Apps Script lock at once;
  it's transient, the offline queue will retry automatically.
- **Changes not showing on other devices.** Check `POLL_SECONDS` in
  `storage-gsheets.js` (default 60s) — other devices only pick up changes
  on that interval, on regaining focus, or via the Refresh button.
- **An installed/PWA copy is stuck on the old version.** Bump `CACHE` in
  `sw.js` and redeploy; the service worker is network-first for same-origin
  requests but the app shell can still lag one load behind on flaky
  connections.

## Security

Read this before you rely on this app for anything sensitive. The
short version: **the PIN screen is a UI convenience, not a real access
control.** The only actual gate on who can read or write your data is
`SECRET` — and `SECRET` ships inside `js/storage/storage-gsheets.js`,
which is downloaded to every visitor's browser. Anyone who views page
source has it, and with it, full read/write access to the whole
spreadsheet through the Apps Script endpoint directly — no PIN needed.
This is true of any purely static front end talking to a shared-secret
backend; it is not something obfuscating or minifying the JS fixes.

What this rebuild does to reduce the actual risk, without replacing the
architecture (which you asked me not to do):

- **Server-side input validation in `Code.gs`**: every write is checked
  against an allowlist of key shapes the app actually uses, value size is
  capped at 200,000 characters, batches are capped at 200 items, and a
  simple per-minute counter throttles a single runaway/abusive caller.
  This stops accidental or malicious garbage from reaching your sheet or
  blowing through your daily Apps Script quota — it does not stop someone
  who has `SECRET` from reading or editing legitimate-looking data.
- **PIN not included in the readable `Staff` sheet** (this was already
  true in the original — confirmed and kept).

What I deliberately did **not** implement, and why:

- **PIN hashing.** I considered it, but decided against silently changing
  it: any hashing scheme needs a migration story for PINs already saved in
  someone's existing sheet, and since PINs currently reach the server only
  as part of the whole roster blob (not as a standalone "login" call), a
  hash mostly protects against someone reading the raw sheet — which
  `SECRET` exposure already defeats more directly. If you want this
  anyway (e.g., to protect against a curious co-admin who can see the
  sheet but not `SECRET`), it's a contained change — happy to add it as a
  follow-up with an explicit migration step.
- **Real per-user authentication.** The only way to actually close the
  "anyone with SECRET has full access" gap is to put real auth in front of
  the Apps Script endpoint — e.g., restricting the deployment to a Google
  Workspace domain and requiring a Google Identity token, or moving the
  backend off Apps Script entirely to something that supports per-user
  sessions. Both are meaningfully bigger changes than "harden the existing
  architecture," so I didn't make them — flagging it here so it's your
  informed decision, not a silent gap.

Practical mitigations, in order of effort:

1. **Treat `SECRET` as a leak-and-rotate credential.** If you ever suspect
   it's been shared (e.g., someone screenshots the page source), change it
   in both `Code.gs` and `storage-gsheets.js` and redeploy.
2. **Don't publish your deployed app's source publicly** (private repo,
   unlisted hosting) if the extra obscurity matters to you — it's not real
   security, but it raises the bar against casual discovery.
3. **Keep the underlying Google Sheet private** to whoever manages
   payroll. Staff and other administrators only ever need the app URL, not
   sheet access.
4. **If you outgrow this model** (a large team, sensitive pay data,
   compliance requirements), that's the point to invest in real per-user
   backend auth rather than continuing to harden a shared-secret static
   front end — happy to help scope that as a separate project.
