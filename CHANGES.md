# What changed vs. the original app

This rebuild's brief was explicit: don't change business logic, payroll
math, or the storage architecture without calling it out. This file is
that call-out — everything that is different from the original single-file
app, and everything that was deliberately left alone even though it looked
fixable.

## Verified unchanged (regression-tested, not just "should be the same")

- **Payroll formulas.** `js/domain/payroll.js`'s `payrollFor()` is the same
  arithmetic as the original, statement for statement. This was checked by
  running the original algorithm (kept as a reference copy) and the new
  module against 300 randomized scenarios — different pay bases, weekly-off
  patterns, late-grace windows, overtime settings, partial months, mid-month
  joiners — and asserting every numeric output matches exactly. All 300
  matched. See `CHANGES.md`'s Testing note below for how to re-run this.
- **Geofencing.** Haversine distance (`metres()`) and bearing math are
  copied verbatim; spot-checked against a known reference distance
  (1° of latitude ≈ 111.2 km).
- **Attendance state machine.** `clockIn`/`clockOut`/`enforceBoundary`
  (the auto clock-out-after-grace-period rule) and `openEntryFor`
  (which lets a shift spanning a month boundary or midnight still be found
  and closed) are ported line-for-line.
- **Storage semantics.** The in-memory cache, offline write queue with
  exponential backoff, localStorage snapshot fallback, polling cadence, and
  keeping `device:last` local-only and never synced — all unchanged in
  `js/storage/storage-gsheets.js` / `js/storage/storage-local.js`.
- **Data model.** Same keys (`org:config`, `org:roster`, `log:<id>:<yyyymm>`,
  `device:last`), same Apps Script sheet structure (`_data` hidden KV sheet,
  auto-rebuilt `Shifts`/`Staff` sheets). Existing data from the original app
  loads without a migration step.

## Deliberately preserved even though it's a little odd

- **The "Short day" pay quirk.** A day where someone worked more than 0
  hours but fewer than `halfDayHours` is *labeled* "Short" in the UI, but
  for pay purposes it's counted as a full absence (`r.absent++`), not a
  half-credit. That was true in the original `payrollFor()` and still is
  here — I didn't think it was my call to silently "fix" it, since it
  changes how much people get paid. If you want a short day to count as a
  partial credit instead, say so and I'll change the one line it takes.
- **PINs are still plaintext 4-digit codes**, stored as-is in `org:roster`.
  I didn't add hashing — see the Security section of `README.md` for why,
  and what it would take.
- **`state.period` (`"week"`)** exists in the state object but nothing
  reads it, same as the original `A.period`. Left in for fidelity; harmless.

## Zen & Dynamics branding pass (this update)

Requested separately, after the initial rebuild: replace the sage/green
theme with the Zen & Dynamics black/white/gold brand and put the logo on
every screen. Functionality, storage, GPS/geofencing, payroll logic and
auth were not touched in this pass — this section only covers
`styles/*.css`, the small set of view files that render the header bar,
and the new logo assets.

- **Logo assets, real files in the ZIP.** The lockup you supplied is in
  `icons/logo-source.jpg` (untouched, full fidelity). From it I generated:
  `icons/logo-lockup.png` (tightly cropped, rounded badge — the prominent
  hero logo on Setup/Recover) and `icons/mark.png` (just the geometric
  mark, square, rounded — used inline in the header bar on every other
  screen, and as the PWA/app icon). `icons/icon-192.png`/`icon-512.png`
  were regenerated from the real mark (previously a generic placeholder
  clock icon I'd drawn — that's gone). All five are referenced from actual
  `<img>`/manifest tags, not just dropped in the folder — see "Verifying
  the logo is wired up" below.
- **New `js/ui/components/brand.js`** exports `brandMark()` (small inline
  logo used in the header bar) and `brandHero()` (large logo used at the
  top of Setup/Recover, which had no header before). Wired into
  `setup.js`, `recover.js`, `signin.js`, `pin.js`, `staff.js`, and
  `admin/index.js` — i.e. every screen that renders anything.
- **Palette replaced in `styles/tokens.css`.** `--paper`/`--panel` are now
  white/near-white, `--ink` is near-black, and a new `--gold`/
  `--gold-strong`/`--gold-soft` trio (sampled from your actual logo,
  `#E7B657`) is the only accent/CTA color. Dark mode (`prefers-color-scheme:
  dark`) still exists but now swaps to black-background-with-gold-accent
  rather than a different color family, so it stays on-brand instead of
  reverting to the old sage palette.
- **Green removed except as a live status signal**, per your instruction.
  The old `--go`/`--stop` tokens are gone, replaced by `--status-good`/
  `--status-bad`, and every usage was individually re-checked:
  - Kept green/red (status only): the geofence proximity dot and "m from
    site" reading (inside/outside zone), the small pulsing dot on an
    active shift, the "open shift" tag, success/error message text, the
    offline/syncing banner.
  - Moved to gold (these were decorative/CTA, not status): the Clock
    In/Out button, every primary "go" button (Create workplace, Save
    rules, Save settings, etc.), focus rings, input focus borders,
    checkbox accents, the big running shift-timer number, the selected-tab
    underline, text selection color. The geofence radar's dashed ring and
    center dot (the fixed site marker, as opposed to the moving live-
    position dot) are also gold now, since the site marker itself isn't a
    status — only your current in/out position is.
- **Header bar restyled** (`.bar` in `styles/base.css`) from a plain
  transparent strip into a black bar with a 3px gold underline, spanning
  every screen that has one, with the mark logo inline at the left.
- **Loading/splash state branded.** The placeholder in `index.html` (what
  shows before `app.js` finishes booting) and the render-layer loading/
  error screens now show the mark logo instead of plain "Loading…" text.
- **`manifest.json`** name/colors updated to Zen & Dynamics + white/black;
  `index.html`'s `<title>`, theme-color meta and favicon updated to match.
- **`sw.js` cache bumped to `attendance-v5`** and the new icon files added
  to the precache list — required so an already-installed PWA picks up the
  new branding instead of serving the old cached version.

### Verifying the logo is wired up

Every reference below is a real file that ships in this ZIP, not a
placeholder:

| Where | File | Referenced from |
|---|---|---|
| Setup / Recover hero | `icons/logo-lockup.png` | `js/ui/components/brand.js` → `brandHero()` |
| Header bar (every other screen) | `icons/mark.png` | `js/ui/components/brand.js` → `brandMark()` |
| Pre-JS splash | `icons/mark.png` | `index.html` |
| Browser tab / home screen icon | `icons/icon-192.png`, `icons/icon-512.png` | `index.html`, `manifest.json` |
| Original supplied logo, unmodified | `icons/logo-source.jpg` | kept for reference/future re-export |

## Genuinely new (additive, not a business-logic change)

- **Render error boundary.** The original had no protection around
  `paint()` — an exception left `<div id="root">` blank with no way back.
  `js/ui/render.js` now catches render failures and shows a small recovery
  screen with a Reload button instead. Same for boot failures in `js/app.js`.
- **Offline/sync status banner.** New — the original silently queued writes
  when offline but never told the user. `js/ui/components/syncStatus.js`
  shows a small banner ("Offline — changes are saved on this device…" /
  "N changes syncing…") on the staff, sign-in, and admin screens when
  `storage-gsheets.js` reports it isn't caught up. Does nothing (renders
  nothing) under `storage-local.js`, which has no such concept.
- **Apps Script hardening.** `Code.gs` now rejects any key that doesn't
  match the shape the app actually uses (`org:config`, `org:roster`, or
  `log:<id>:<yyyymm>`), caps value size (200,000 chars) and batch size (200
  items), and does simple per-minute request throttling. These only reject
  malformed/abusive requests — every request the original app actually
  sends still succeeds unchanged. See the Security section of `README.md`
  for what this does and doesn't protect against.
- **Visual/UX polish**: shadows, motion, a dark-mode palette
  (`prefers-color-scheme`), larger touch targets on touch devices, a sticky
  admin tab bar, a pulsing "on shift" indicator, loading skeletons. No class
  name that the render functions rely on was removed or repurposed, and no
  markup that `data-act`/element-id event wiring depends on changed.

## Structural (where things live now)

- Single `app.js` → ES modules under `js/` (`core/`, `storage/`, `domain/`,
  `ui/`, `events/`). No build step — still plain `<script>`/`<script
  type="module">` tags, still deployable as static files.
- `storage.js` → `js/storage/storage-local.js`;
  `storage-gsheets.js` → `js/storage/storage-gsheets.js`. The documented
  swap (change one `<script src>` line in `index.html`) still works the
  same way, just at the new path.
- `styles.css` → `styles/tokens.css` + `base.css` + `components.css` +
  `views.css`, loaded as four `<link>` tags.
- `Code.gs` unchanged in location (`google-apps-script/Code.gs`).
- `sw.js` cache bumped to `attendance-v4`, then `attendance-v5` for the
  branding pass, with its asset list updated each time for the new file
  layout — required so phones pick up the new version instead of serving
  a stale cached copy of an older build.

## Testing performed

- `node` regression test (300 randomized scenarios) comparing the ported
  `payrollFor()` against the original algorithm — 300/300 matched exactly,
  plus geofence math spot checks.
- Playwright end-to-end smoke test against a local static server: boot →
  first-run workplace setup with real (mocked) geolocation → auto sign-in
  → clock in → clock out → admin → add staff → payroll rules save → pay
  run render → records render → settings save → on-site tab render, with
  console/page-error monitoring throughout. No errors. Excel export was
  also checked in a network-restricted environment to confirm it fails
  with a friendly message (not a crash) when the CDN library can't load.
- Branding pass: same Playwright walkthrough re-run after the palette/logo
  changes, with a full-page screenshot captured at every screen (setup,
  staff dashboard, clocked-in, admin × all 5 tabs, sign-in picker, PIN) to
  visually confirm the black/white/gold palette and logo placement on each
  one, plus the same console/page-error monitoring (clean, aside from the
  same sandboxed-environment CDN block noted above).

## 2026-09-22 — Mandatory staff tasks
- Mandatory tasks are captured when a staff member clocks in.
- Each open shift has its own task checklist, so a second shift on the same day starts fresh.
- Manual clock-out is blocked until all assigned tasks are checked.
- Completed task names and completion status are saved inside the attendance record.
- Admin Records displays task completion/incomplete status.
- Fixed attendance persistence to use the storage API (`sset`) so task data reaches Google Sheets.
- Fixed Records late-arrival calculation to use the actual time-of-day.

## 2026-09-23 — Go-live fixes + leave requests

**Fixes (found while preparing this app for real deployment):**
- `js/storage/storage-gsheets.js` had been overwritten with the wrong
  file's content (a copy of the Records tab code) — the Google Sheets
  backend was silently non-functional despite being the active storage
  backend in `index.html`. Restored.
- Shift Master (`state.cfg.shifts`) and per-person shift assignment used
  to live in this device's own `localStorage`, so a shift an admin
  created never reached staff on other devices. Moved onto the synced
  `org:config` key, same pattern as site/pay settings.
- Fixed a crash on brand-new workplace setup (`Add shift` threw —
  `cfg.shifts` was never initialized for a freshly created workplace).
- Wired up the "Edit" button on Shift Master, which had no click handler
  at all.

**New: Leave requests**
- Staff can request a date range of leave (with an optional reason) from
  their own dashboard; a per-year allowance defaults to 15 days and is
  configurable in Admin → Payroll → Rules ("Requestable leave allowed
  per year"). A pending request reserves its days against the balance
  so two overlapping requests can't both be approved past the allowance.
- Admin gets a new "Leave" tab: approve/reject pending requests, browse
  history.
- **Payroll callout (not silent — payroll math is otherwise untouched
  per this file's own rule):** a day covered by an *approved* leave
  request is now its own status, "On leave", counted separately
  (`r.leave`) and folded into `creditedDays` alongside full/half days —
  so an approved leave day is paid, not deducted as an absence. See
  `js/domain/payroll.js`'s file header for the exact mechanics.
- Leave data lives in `state.cfg.leaves`, saved through the existing
  `org:config` key — no Apps Script / `Code.gs` changes needed.
- Excel export gets a fifth sheet, "Leave" (every request, staff,
  dates, status, reason).

## 2026-09-23 (later same day) — Fixed: couldn't pick a leave date
- The staff screen re-renders every second (live shift timer) and on
  every GPS position update, and `render()` replaces `#root`'s entire
  `innerHTML` each time. That was destroying and recreating the leave
  form's date inputs mid-interaction, closing an open native date
  picker before a date could be selected — reported as "not able to
  pick dates."
- Fixed in `js/domain/geofence.js`: the tick interval and the
  geolocation watch callback now skip `emitChange()` while an input/
  textarea/select has focus (`js/ui/dom.js`'s new `userIsTyping()`).
  Trade-off: the live seconds counter visually pauses while a field is
  focused and resumes the moment it loses focus — confirmed correct,
  not a regression.

## 2026-09-23 (later still) — Faster first load on slow connections
- There's no bundler (by design — see README), so `js/app.js` and its
  ~35 imported modules were loading as a sequential discovery chain:
  fetch a file, parse it, discover its imports, fetch those, repeat.
  Measured under a throttled ("slow mobile") network against a plain
  HTTP/1.1 server, the last file in that chain didn't finish until
  ~9.5s in. Against the real GitHub Pages deployment (HTTP/2) it was
  already much better (~4s) but still a fully sequential dependency
  before anything renders.
- Added `<link rel="modulepreload">` for every JS module in
  `index.html`'s `<head>`, so the browser starts fetching the whole
  module graph in parallel immediately instead of discovering it one
  file at a time. Keep this list in sync with `sw.js`'s `ASSETS` when
  adding new files.
- Investigated but ruled out as the cause of "leave/tasks not visible
  on some phones": realistic multi-staff data, a mobile viewport, a
  throttled network, and touch interaction all reproduced fine in
  testing. Since the app has no lazy-loading (every view module is
  imported eagerly by `app.js`, all-or-nothing), a still-loading file
  can't explain a *specific* section going missing while the rest of
  the screen works.

## 2026-09-23 (later still) — Fixed: the actual "not visible" bug
- A screenshot from the field showed it precisely: the Leave section's
  "15 / 15" balance was rendering in near-white text on its own white
  card — readable in no lighting condition, not just "slow to load."
- Root cause: `.stat .v` (`styles/components.css`) never set its own
  `color` — every prior use of `.stat` sat directly on the page's
  light background with default dark text, so nobody had reason to
  notice the value span was inheriting rather than declaring its
  color. Nesting the new Leave `.stat` inside `.clock` (dark
  background, light text, for the live timer) exposed it: `.stat`
  keeps its own light card background, but the number inherited
  `.clock`'s light text — white on white.
- Fixed by giving `.stat .v` an explicit `color: var(--ink)`, so it's
  correct regardless of what it's nested inside. Verified: computed
  color is now `rgb(10, 10, 10)` against the card's `rgb(255, 255,
  255)` background.
- The fix didn't visibly land on a phone that had loaded the app
  recently. Root cause: GitHub Pages sends `Cache-Control: max-age=600`
  on every file, and `sw.js`'s "network first" fetch handler was still
  calling plain `fetch(e.request)` — which itself respects that header,
  so it could silently return the browser's 10-minute-old cached copy
  instead of actually hitting the network. Added `cache: "no-store"`
  to that fetch call so it truly always goes to network, and added
  `?v=` cache-busting query strings to the CSS `<link>` tags in
  `index.html` so a fresh page load isn't waiting on the service
  worker to update either. Bump both together (`sw.js`'s `CACHE`
  constant and the `?v=` numbers) on every future deploy.

## 2026-09-24 — Fixed: a shared visitor could overwrite the whole workplace

**What happened:** someone on the same public link ended up on the
"Set up attendance" screen and completed it, which overwrote the real
`org:config` and `org:roster` with a brand-new single-admin workplace.
Real data wasn't deleted (attendance logs under the original staff IDs
were untouched) but the roster/settings pointing to it were replaced.
Restored from a copy captured earlier in the same working session.

**Root cause:** `vSetup()` (and the "Create workplace" flow behind it)
shows/runs whenever `state.cfg` is falsy. That's also what happens
after a *failed* or *stale* fetch of `org:config` — `storage-gsheets.js`
falls back to a local snapshot, and a network hiccup or race at boot
can leave that snapshot empty. The client never had this distinguished
from "no workplace has ever been created," and `createWorkplace()`
overwrote `org:config`/`org:roster` unconditionally.

**Fix (`js/domain/auth.js`):** immediately before committing
`createWorkplace()`'s writes, force a *fresh* network check —
`window.storageSync()` (bypasses any cached/stale snapshot) followed by
`sget("org:config", true)` — and refuse with a clear message if a
workplace turns out to already exist. Regression-tested: genuine
first-time setup (nothing exists yet) still works exactly as before.

**What this doesn't fix, and can't from the client alone:** `SECRET` is
inherently visible to anyone who views this deployed page's source (see
README's Security section) — a deliberate actor who extracts it can
call the Apps Script endpoint directly, bypassing this check and the
app entirely. This change closes the *accidental* path (by far the
likelier one for a link shared casually) and narrows the *deliberate*
one's window, but real protection against a deliberate attacker
requires either real per-user backend authentication or restricting who
ever receives this link. Worth deciding whether that's needed for how
this app is actually being shared.
