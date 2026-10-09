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

## 2026-09-24 (later) — Username/password sign-in, replaces the name picker

**Why:** the sign-in screen used to list every active staff member's
name in a public grid — anyone with the link could see who works here
before signing in at all. Combined with the PIN being a shared,
low-entropy 4 digits, this was a bigger exposure than a small
workplace tool needs. Each person now has an admin-assigned username
and password instead.

**What changed:**
- `vSignin()` (`js/ui/views/signin.js`) no longer lists any names —
  just a User ID + Password form. The geofence-lock behavior is
  unchanged: outside the site, the form stays hidden behind the locked
  screen unless "Administrator sign-in" is tapped, and even then only
  an admin's credentials actually get through
  (`js/domain/auth.js#attemptLogin`).
- **Forced password change on first login.** A brand-new account (or
  one an admin just reset) has `mustChangePassword: true`; a correct
  login routes to a new screen (`js/ui/views/changepw.js`) instead of
  the dashboard, and there's no way to skip it. The very first admin,
  created during workplace setup, picks their own password up front —
  nothing to force-change there.
- **Admin visibility, on purpose.** Passwords are stored in plaintext
  in `org:roster`, exactly like PINs always were (see README's
  Security section) — the admin can see and reset anyone's password
  from Admin → People. Editing a person's password field to a
  *different* value there is itself a reset: `mustChangePassword`
  flips back to `true`, so they're asked to pick their own again next
  time. Saving the form with the field unchanged doesn't touch it.
  Passwords are deliberately left out of the Excel export and the
  live Sheet's readable "Staff" tab, same reasoning as PINs before —
  visible to whoever manages staff in the app, not baked into a file
  that gets shared more loosely.
- `js/ui/views/pin.js` (the PIN keypad) is gone — nothing routes to it
  anymore. `js/core/store.js`'s `pinFor`/`pinBuf` fields are gone too,
  replaced by `changePwFor` (which roster id is mid-forced-change).
- **No backend changes.** `Code.gs` never read individual roster
  fields — it stores/retrieves the whole JSON blob — so this shipped
  without touching or redeploying the Apps Script project. Its
  comments were updated to stop saying "PIN screen" for accuracy, but
  that's text only.
- **Existing staff migrated**, not left locked out: everyone in the
  live roster got a generated username + temporary password (handed
  to the admin out of band, not committed anywhere), with
  `mustChangePassword: true` so each picks their own on first use.
  Nothing else about their records (shifts, tasks, salary, join date)
  was touched.

**Tested:** 31 automated scenarios across first-time setup validation,
the existing-workplace overwrite guard, login success/failure paths
(wrong username, wrong password, deactivated account, case
sensitivity), the forced password-change flow end to end (including
old-password-rejected-after-change), admin People-tab behavior
(visible/editable password, reset detection, duplicate-username
rejection), the geofence-lock + admin-bypass interaction, and a
regression pass over clock-in/out, leave requests, and Shift Master —
all against an isolated local copy, not the live workplace. 31/31
passed. Excel export's Username-not-PIN column change was verified by
code inspection only; the XLSX CDN is blocked in this sandbox (noted
earlier in this file), and the export flow itself was already
confirmed working against production before this change.

**What this still doesn't do:** this is not real per-user backend
authentication — same `SECRET`-in-client-JS caveat as everything else
in this app (see README's Security section, and the entry above this
one). It raises the bar against casual/accidental exposure
significantly; it does not stop someone who deliberately extracts
`SECRET` from the deployed page's source from calling the Apps Script
endpoint directly, bypassing this login screen entirely.

## 2026-09-24 (same day, hours later) — Fixed: recovery flow corrupted real accounts

**What happened:** within hours of the username/password redesign
shipping, the real workplace's staff lost the ability to sign in — a
roster read showed one real staff member's account (`kousi`) replaced
by a near-duplicate with a different internal id, a 4-character
password, and `mustChangePassword: false`, while the other five had
silently lost their `username`/`password` fields entirely, reverting
to look like pre-migration records.

**Root cause, two compounding bugs, both introduced in the redesign
earlier the same day:**
1. `createAdminRecovery()` (the "no administrator found" / "Recover
   administrator access" flow) pushed onto and saved whatever
   `state.roster` happened to already be sitting in memory — not a
   fresh fetch. If that in-memory copy predated the credential
   migration (a stale local snapshot, a tab that had been open a
   while, a fetch race at boot — same family of issue as the
   `createWorkplace()` overwrite guard from earlier today), completing
   this flow saved that *stale* roster back over the real one,
   discarding the migration.
2. Separately, and worse: `vSignin()` was changed to show "Recover
   administrator access" as a permanent, always-clickable link on the
   ordinary sign-in screen. The original app only ever surfaced this
   entry point when it was actually relevant (empty roster, or
   automatically via `app.js`'s boot() when no active admin exists at
   all) — that gating was lost when the name-picker grid it depended
   on was removed. Combined with bug 1, anyone who landed on the
   sign-in screen — including a legitimate user confused by the new
   login form — could reach a flow that grants a brand-new admin
   account with no existing credentials required, and (until fixed)
   could silently corrupt the real roster while doing it.

**Fix:**
- `createAdminRecovery()` (`js/domain/auth.js`) now forces a fresh
  `window.storageSync()` + `sget("org:roster")` before checking
  username uniqueness or saving, exactly mirroring
  `createWorkplace()`'s existing guard. A collision against the *real*
  current data is now correctly rejected instead of silently
  overwritten.
- `vSignin()` (`js/ui/views/signin.js`) no longer shows "Recover
  administrator access" on a clean sign-in screen. It only appears
  after an actual failed sign-in attempt on that screen — someone has
  to try real credentials first, not just land on the page. The
  genuine "no admin left at all" case is unaffected: `app.js`'s
  boot() already routes straight to this same recovery screen
  automatically in that situation, no link needed.
- Real data was repaired: removed the accidental duplicate `kousi`
  entry, re-applied the correct username/password to all six real
  staff, verified against a fresh read.

**Tested:** 5 new automated scenarios (recover link absent on a clean
screen, appears only after a failed attempt, duplicate username via
recovery correctly rejected against fresh data, original admin
unaffected by the rejected attempt, a genuinely new non-colliding
recovery still succeeds) plus a smoke check of the ordinary login and
clock-in path — all against an isolated local copy, all passing, zero
console/page errors. Verified live against production afterward
(read-only) that the real roster held six entries with correct
usernames after redeploy.

**Lesson applied going forward:** any UI element that becomes reachable
after a redesign — not just the data-writing function behind it — gets
checked for whether the ORIGINAL app gated its visibility for a
reason, before assuming a straight port of "what it does when clicked"
was the whole story.

## 2026-09-24 — Apps Script: reads no longer wait on the write lock

`Code.gs`'s `doPost()` took the exclusive script lock for every request,
including the `all` read every device polls. Reads now skip it; writes
still take it. Deployed to the live Apps Script project the same day
(this entry records it in the repo).

## 2026-10-01 — Backend moved from Google Apps Script to Firebase

**Why:** measured Apps Script round-trips of 3–70+ seconds per request,
on a dataset of 7 keys — platform latency, not data size or our code.
Firebase Realtime Database acknowledges writes in ~2–60ms in testing and
pushes other devices' changes in ~120ms instead of a 60-second poll.

**What changed:**
- New `js/storage/storage-firebase.js` — same `window.storage`
  contract, `storageSync()`, `storageStatus()` and private-key prefix as
  `storage-gsheets.js`, so nothing above the storage layer changed.
  Data lives at `/kv/<key>` as the same JSON strings.
- Validation moved from `Code.gs` to `firebase/database.rules.json`:
  same key allowlist, same 200,000-char cap, string values only, nothing
  readable or writable outside `/kv`.
- Offline: writes go to a persisted localStorage queue and leave it only
  on server acknowledgement (survives a reload with no signal). The
  service worker now also caches the version-pinned Firebase SDK, so the
  app still opens offline from the last saved copy.
- `js/app.js`: if no storage backend loaded at all (SDK unreachable on a
  first visit), boot stops with a clear error instead of an empty store
  that would read as "no workplace" and show the setup screen.
- The Google Sheet is untouched and remains a working fallback: swapping
  the `<script>` line in `index.html` back to `storage-gsheets.js`
  reverts. `firebase/migrate-from-sheets.js` copies data across
  (`--dry-run`, default copy, and `--catch-up` to merge in punches made
  from a device still running the old version after cutover).
- Lost in the move: Apps Script rebuilt human-readable "Shifts"/"Staff"
  tabs in the Sheet on every write. Firebase doesn't; the Excel export
  (Payroll/Records → Download Excel) covers the same need.

**Bugs found while testing the move (fixed here, affected the Sheets
backend too):**
- **Stale roster on an open tab.** Login, password change, and every
  People-tab save read/wrote the roster copy loaded at page boot. Result:
  a sign-in device left open couldn't log in a newly added person, and —
  worse — an admin tab left open would save its old copy over newer
  changes (e.g. silently reverting a staff member's own new password).
  All of these now refresh from storage first (`refreshRoster()` in
  `js/domain/roster.js`), and the edit form compares against the
  password it was opened with, so an untouched field never reverts one
  changed elsewhere.
- **Working days never saved.** `updateStaff()` received the edit form's
  working-day checkboxes and dropped them. Now persisted.

**Tested:** 18 automated scenarios against the real (then-empty)
Firebase project — boot, setup, persistence across devices, real-time
sync, forced password change, clock-in/out, leave, the stale-tab and
working-days fixes, offline queue + banner + recovery, and SDK-blocked
safety — plus geofence-lock/recovery-link regression and an offline
reopen through the service worker. All passing; test data wiped after.

**Security model unchanged:** the Firebase web config is public by
design, and the rules let any visitor read/write the allowed keys — the
same exposure the shared `SECRET` had. See README's Security section.

## 2026-10-01 — Late arrival per shift, live admin screens

**Late arrival per shift (payroll callout — see payroll.js header).**
"Late" was measured only against the single Payroll Rules "Shift starts"
time, so anyone on an evening shift was marked late every day. It's now
measured against the start of the shift that day's first clock-in was
tagged with, falling back to the global time when there's no shift.
Grace minutes and the late-deduction rule are unchanged. Records uses the
same rule and now shows which shift each punch counted against.

Also fixed: with two shifts assigned, a clock-in *before* either had
started fell back to the first one — arriving at 4:45 PM for a 5:00 PM
shift was tagged as the morning shift. `pickShift()` now takes the
nearest start among shifts that haven't ended.

Shift times now display with AM/PM in Shift Master and the People shift
picker — the live data had two "evening" shifts saved as morning times
(04:50, 05:30), easy to miss in 24h format.

**Live admin screens.** storage-firebase.js fires `storage-remote-change`
when another device's save lands; app.js pulls the changed keys into
state and redraws — On site, Records, Leave, People update within ~0.1s
with no Refresh. Never redraws under someone mid-typing (catches up on
blur). A person deactivated elsewhere is signed out live.

**Tested:** 14 unit tests (shift picking, payroll lateness) and 12
end-to-end tests against the Firebase local emulator (never the live
database), using a faked clock for the shift-time cases. All passing.

## 2026-10-01 — Real sign-in security (v17, free plan)

Until now the database was readable and writable by anyone with the
link: every staff member's password, everyone's attendance, and the
workplace itself. The sign-in screen only *looked* like a lock.

**Now (all on Firebase's free Spark plan — no card, no server code):**
- **Sign-in runs through Firebase Authentication.** Passwords are stored
  hashed by Google, never in the database. Nobody — admins included — can
  see a password. An admin who needs to help someone sets a **new
  temporary password** (People → Edit → "New temporary password"); the
  person must pick their own at next sign-in. *Trade-off accepted: admins
  can no longer look passwords up.* Minimum length is now 6 (Firebase's).
- **Database rules enforce who sees what** (`firebase/database.rules.json`),
  checked by Google's servers even against someone calling the database
  directly. Membership lives in small admin-only records:
  `/uidmap/<account>` = staff id (present only while active),
  `/admins/<staff id>`, `/mustchange/<staff id>`, `/logins/<user ID>`.
  - signed out, or an account that isn't linked to an active staff member
    (Firebase lets anyone create an account — it gets nothing): only the
    workplace name and site;
  - staff: their own profile, attendance and leave requests; settings
    read-only. They **cannot approve their own leave** (decisions live in
    an admin-only `leavedec:<id>` key) or make themselves admin;
  - admins: everything.
- **First-time setup** is allowed by the rules only while no workplace
  exists — the "someone registered over my company" attack is closed for
  good. The "Delete this workplace" link is gone.
- **Admin actions** are single all-or-nothing database writes from the
  admin's phone: adding someone creates their sign-in account; turning
  someone off unlinks their account (their phone is signed out within a
  second); a password reset issues a fresh account with the temporary
  password and unlinks the old one (records are keyed by staff id, so
  nothing is lost). The app refuses to let an admin deactivate/demote
  themselves or remove the last active admin.
- **No in-app "recover administrator" screen** any more — nothing on the
  free plan could check "no admin left" safely. If every admin is ever
  locked out, fix it in the Firebase console (README → Security).
- Phones cache only the signed-in person's own data, and sign-out clears
  it (shared phones). Offline punches still queue and replay — only under
  the person who made them.
- `profile:<id>` is each person's own copy of their roster entry (shifts,
  tasks, working days) so staff never need the full staff list.

**Migration:** `firebase/migrate-security.js` (dry run by default). Backs
up the database, creates a sign-in account per staff member with their
current password, marks everyone "must change password", links accounts,
splits leave into the new keys, strips passwords from the roster and from
the old Google Sheet.

**Tested** against the Firebase emulators (database + auth — never the
live project): 73 security end-to-end tests (direct database calls the
way an attacker would try them — including a stranger with their own
self-made account — plus the UI flows), 9 tests on a copy of the live
data after migration (real passwords replaced with test values), the 12
live-update/lateness tests and 14 unit tests re-run. All passing.

## 2026-10-05 — WhatsApp share buttons (v18)

One tap writes a ready-to-send WhatsApp message; you pick the group and
press send. (Posting to a WhatsApp *group* automatically isn't possible
with WhatsApp's official API, and unofficial bots risk the number being
banned — so the app prepares the message and a person sends it.)

- **Admin → On site → "Share today on WhatsApp"**: who's in (in/out
  times, hours, late flag), who's on leave, who isn't in.
- **Admin → Records → "Weekly report" / "<month> report"**: per person
  days worked, hours, late marks, leave days, absences; team total.
  Weekly = the last 7 days; monthly = the month picked in Records.
- **Leave**: a WhatsApp button on every request — staff can announce
  their own request; admins can share the request or the decision.

Late/absent use the same rules as payroll and Records. New code:
`js/domain/reports.js` (text), `js/utils/whatsapp.js` (opens WhatsApp).
Tested: 10 new end-to-end tests on the emulators; security (73),
live-update (12) and unit (14) suites re-run. All passing.

## 2026-10-05 — Old Google Sheets code removed (v19)

The app has run on Firebase since v15. Removed the unused Sheets backend
(`google-apps-script/`), its storage adapter (`storage-gsheets.js`), the
per-device test adapter (`storage-local.js`), and the one-off
`migrate-from-sheets.js` — about 500 lines. All remain in git history.
No behaviour change; security, WhatsApp and live-update test suites re-run,
all passing.

## 2026-10-07 — Redesigned look (v20)

A full visual refresh in the Zen & Dynamics black, ivory and gold:
Plus Jakarta Sans typeface with tabular figures (times line up), card-based
sections, softer shadows, a rounded black header with a gold glow.

- **Sign-in / first password / setup**: a dark welcome panel with the logo
  and a floating card; "outside the site" is now a calm card, not a red block.
- **Staff home**: fixed a layout bug that wrapped the whole page (month
  stats, past shifts, leave) inside the black timer card. Now: a hero card
  with an "On shift" badge, the live timer and a big Clock in/out button,
  then month tiles, recent shifts, and a leave card with a balance bar.
- **Admin**: pill tabs that scroll sideways (the selected one stays in
  view), an "on site now" summary with a progress bar, initials avatars
  with a green dot for who's in, pending leave with Approve/Reject on their
  own line, payroll rules and settings grouped into cards, People → Edit
  reordered (details, schedule, password).
- WhatsApp buttons are now properly green with the WhatsApp icon (a CSS
  slip had left them plain outside the header).
- Times show as 12-hour ("5:47 AM") everywhere; dates as "29 Sep".
- Dark mode follows the phone's setting.

No behaviour changes; every button and field works as before. All test
suites re-run and passing.

## 2026-10-07 — Fixes from a full end-to-end test pass (v21)

Ran the owner's whole test checklist (setup, first sign-in, clock in/out,
WhatsApp reports, leave, password reset, turning someone off) plus extra
cases (outside the site, mandatory tasks, leave limits, offline, Excel,
renaming the workplace, deleting a shift, 320px and 430px phones, very long
names) — 77 automated checks. Fixed what it found:

- **Taps could be ignored** on the staff and sign-in screens: they were
  rebuilt from scratch every second (for the timer), so a tap landing
  mid-rebuild was lost, and the new cards' entrance animation replayed every
  second. The screen now updates in place (js/ui/render.js) — only the
  timer digits change. Form fields are kept separate so text typed in one
  field can never carry over into another; forms are emptied after a
  successful submit.
- **Password reset message**: someone signed in when their password was
  reset was told "That account is no longer active". Now: "You've been
  signed out… use the new one your administrator gave you."
- **"Days present 0.5 / 0"** on someone's first day: the "of N" is left off
  until there are finished working days to count.
- **Narrow phones**: in People, Edit/Off move under the name so names and
  "no pay set" don't break over lines; date boxes no longer clip
  "dd-mm-yyyy".

## 2026-10-07 — New address: zenanddynamics.web.app (v22)

The app moved from `kousivijay05.github.io/zen-dynamics-attendance-backend-new/`
to **https://zenanddynamics.web.app** (Firebase Hosting, free Spark plan,
same Firebase project). The old address forwards automatically. Added the
new domain to Firebase Authentication's authorized domains.

## 2026-10-07 — Attendance as an image + shift-end reminder (v23)

- **Attendance image**: Admin → On site → "Share today's attendance" (or one
  shift via the chips underneath) draws a black-and-gold card — present /
  late / on leave counts, each person's in → out times, hours, LATE badge,
  who's on leave and who isn't in. A preview opens first; "Share to
  WhatsApp" hands the PNG to the phone's own Share menu. "Send as text
  instead" keeps the old text message.
- **Shift-end reminder**: for two hours after a shift's end time, the admin
  screen shows "Morning Shift ended — share the attendance?" with Share and
  × (dismiss). Remembered per device, per day.
- **Privacy**: drawn on the phone (canvas), never uploaded. The Web Share
  API only hands the file to the system Share menu: the app never sees
  WhatsApp, contacts or chats, gets nothing back, and asks for no
  permission. Devices without a Share menu download the image instead.
- Admins with no shift aren't listed as "not in" (text or image).

New: `js/ui/reportImage.js`; `attendanceSheet()` / `endedShifts()` in
reports.js. Tests: 14 new (image + reminder) and all existing suites.

## 2026-10-09 — Sign staff out when they leave the site (v24)

- New setting, **on by default**: Admin → Settings → "Sign staff out when
  they leave the site". After at least a minute continuously outside the
  zone (and after any open shift has been closed automatically), the person
  is signed out: "You left the gym, so you've been signed out." Admins are
  exempt while "Administrators can sign in from anywhere" is on.
- Outside means beyond the allowed distance *plus* the phone's reported GPS
  accuracy (capped at 100 m), so a jumpy reading near the edge doesn't count.
  This also applies to the existing automatic clock-out — slightly more
  forgiving at the boundary than before (called out: affects when an
  "auto" clock-out happens, not how hours are calculated).
- Sign-out waits up to 5 s for a just-made punch to reach the server.
- Fixed: a punch made with no signal, followed by signing out, was dropped
  when the server refused it (no longer signed in). It's now kept and sent
  when that person next signs in.
- The "outside the site" sign-in screen now shows the sign-out message.

Tests: 14 new (leaving mid-shift, brief GPS jump, admin exempt, setting
off/on, no signal) plus all suites re-run: 73 + 77 + 12 + 10 + 14 + 14.

## 2026-10-09 — Staff are signed out when they leave the site (v24)

- New setting, **on by default**: Admin → Settings → "Sign staff out when
  they leave the site". Once someone has been outside the zone for at least
  a minute (or the auto clock-out delay, if longer), their open shift is
  closed (tagged auto, as before) and they're signed out with "You left the
  gym, so you've been signed out." — shown on the sign-in / outside-the-site
  screen. Their cached records are cleared from the phone. Admins are exempt
  while "Administrators can sign in from anywhere" is on.
- GPS accuracy now counts in the person's favour (capped at 100 m) before
  deciding they're outside, for both this and the automatic clock-out —
  fewer false clock-outs from a jumpy fix.
- Sign-out waits up to 5 s for unsent punches to reach the server.
- **Fixed**: a punch made with no signal could be lost if the person was
  signed out before the signal returned (the server refused it as nobody
  was signed in, and the app dropped it). It's now kept and sent the next
  time that person signs in.

Tests: 14 new (walk out mid-shift, brief GPS jump, admin exempt, setting
off, leaving with no signal) and all existing suites re-run.

## 2026-10-09 — Cleaner black (v25)

The dark header, clock card, sign-in panel and summary card used a warm
near-black with a strong gold glow, which read as muddy brown on many
screens. Now a neutral deep black (#0A0A0A → #1A1A1A) with only a faint
gold highlight. Colours only; nothing else changed.

## 2026-10-09 — Clients module (v26)

**Coaches** — a "Client attendance" card on the home screen opens the list:
search, one tap ✓ per client for today, each client's plan status
("12 days left", "3 left", "Expired"), and who ticked whom. Locked outside the
gym like clocking in. One tick per client per day; a coach can only untick
their own ticks. Coaches never see phone numbers or payments.

**Admin → Clients**
- Renewals: active / ending soon (≤ 7 days or ≤ 2 sessions) / expired counts,
  money collected this month; lists with *Remind on WhatsApp* (opens the
  client's chat with a reminder; you press send) and *Renew*.
- Clients: search, open a client: renew (new plan + payment), edit name /
  phone / notes, turn off/restore, previous plans with sessions used.
- Add: name, phone, plan (months, or a session pack with optional validity),
  start date, amount paid + mode (Cash / UPI / Card / Bank transfer / Other).
- Reports: visits per client, payments, totals by mode, Excel (Clients,
  Visits, Payments sheets).

**Plans**: a 1-month plan from 9 Oct ends 8 Oct next month (31st clamps to
the month's last day). A session pack uses one session per day ticked from
its start (to its validity end, if set). Renewing an active plan suggests
starting the day after it ends.

**Storage & rules**: `kv/cl:roster` (names + plans; members read, admins
write), `kv/cl:private` (phones, notes, plan history; admins only),
`kv/cl:pay:<yyyymm>` (payments; admins only), `clatt/<yyyymmdd>/<id>`
(`{by, at}`; a member may add a tick in their own name or remove their own;
admins anything; no other fields; `at` can't be in the future).

Tests: 46 new (clients.test.js) — validation, renewals, WhatsApp link,
coach ticks, direct database attacks by a coach and by a stranger, session
counting, renew + history + payments, reports, Excel, outside-the-gym lock,
320 px layout; all other suites re-run (246 checks total).

## 2026-10-09 — Import clients from Excel (v27)

Admin → Clients → Add → **Import from Excel**: download the template
(Name, Phone, Plan type, Months, Sessions, Sessions already used, Start date,
Amount paid, Paid by, Paid on, Notes + a Help sheet), fill it, choose the
file. A preview marks every row OK or explains the problem (no name, bad
phone, missing/invalid date, too many sessions used, already a client,
repeated in the file); nothing is saved until **Import**. OK rows are saved
in one write; payments are filed under their "Paid on" month (or the start
date). Dates: Excel date cells, yyyy-mm-dd, or day-first dd-mm-yyyy /
dd/mm/yyyy. Headings are matched loosely (e.g. "Mobile" = Phone). Max
1,000 rows / 5 MB. The file is read in the browser — not uploaded.

Also: **Sessions already used** on session packs (Add form, Renew, import),
for clients part-way through a pack; and a layout fix for list rows with
no buttons (details were squeezed onto one line).

Known limitation: the Excel library is SheetJS 0.18.5 from cdnjs (the last
version published there), which has a published prototype-pollution issue
when reading crafted files (CVE-2023-30533). Only admins import, from files
they choose; noted for a future upgrade to a self-hosted newer SheetJS.

Tests: 25 new (import.test.js); clients, checklist, security re-run.

## 2026-10-09 — Import sales-register exports from other gym software (v28)

The importer now recognises a **sales register** export (one row per
invoice: Customer ID, Customer Name, Customer Phone No., Plan Name, Start
Date, End Date, Plan Status, Paid Amount, Payment Type, Invoice Date…), such
as the owner's previous software produces. Per customer:
- plan = the one running today, else the next one paid in advance, else the
  most recent — with the file's exact start/end dates and plan name
  ("FT - 3 Month - 6 Days"); "N sessions" plans become session packs;
- other plans -> history; cancelled (CN) invoices ignored;
- every paid invoice -> a payment on its invoice date (Cash / UPI; Online and
  others -> Other), so past months' collection reports are right;
- an unpaid balance on the chosen plan is noted on the client;
- duplicates are matched by phone; different people sharing a name get the
  last 4 digits of their phone added ("Ravi Kumar (·3210)").
The preview shows current / starting later / plan ended / problems, with an
option to leave out clients whose plan has ended.

Renewals → "Expired" now lists clients who expired in the last 60 days;
older ones are counted and remain in Clients.

Verified with the owner's real export on the LOCAL emulator only (data wiped
afterwards): 307 invoices → 175 clients, 296 payments, ₹24,06,202, matching
the file month by month for all 26 months; re-import adds nothing.
Regression: import (25), clients (46).

## 2026-10-10 — Client membership history (v29)

- **Client page**: total paid, member since, number of memberships, last
  payment; **Membership history** — every plan, newest first, with start →
  end, current / upcoming / ended, sessions used (packs), and each payment
  (date, mode, amount) under the plan it paid for; any unmatched payments
  listed separately; notes (e.g. balance due) shown at the top.
- **Reports → "Full client history"** Excel: Clients (status, current plan,
  member since, memberships, total paid, last payment, notes), Memberships
  (every plan), Payments (every payment ever recorded).
- Payment history loads every month from the earliest plan/joining date.

Verified with the owner's real export on the LOCAL emulator (wiped after):
all 175 clients' totals match the file; Excel has 175 clients, 305
memberships, 296 payments. clients.test.js now 49 checks.

## 2026-10-10 — Batch sessions, permanent marks, client filters (v30)

**Batches** (Admin → Shifts → Client batches): time slots such as 6 AM / 7 AM
/ 6 PM, kept in org:config. Clients aren't assigned to a batch.

**Sessions** (coaches and admins): Start session → the batch running now is
pre-selected → search + tick → Submit. Nothing is saved until Submit; then
the session (`clsess/<day>/<sid>`) and one mark per client
(`clatt/<day>/<client>`) are written in one all-or-nothing update. A session
in progress survives a reload; Discard asks first. A client already marked
today shows "Already in · batch · by coach" and can't be marked twice.

**Marks can't be removed** (enforced by database rules): no deletes by
anyone; a submitted session can't be changed; the coach who made a mark can
undo it within 10 minutes and an admin can void it any time with a reason —
both add a `void` record and the mark stays, shown struck through. Re-marking
a voided client keeps the voided mark inside (`prev`). Mark/session times
are stamped by the server, so a phone's clock can't backdate them.

**Finding clients** (Admin → Clients → Clients): status, plan dates (ends
within 7/15/30 days, expired in last 30/90 days or earlier), last visit (not
seen in 7/14/30 days, never), plan, balance due; sort by name / ending
soonest / ended most recently / longest since last visit / member since;
search by name or phone; live "X of Y" count; Excel of the filtered list.

**Reports**: visits per batch, sessions taken per coach, voided marks
(excluded from counts, listed in the Excel with reason).

Tests: sessions.test.js (30), clients.test.js now 61 (incl. delete / late
void / backdate / session rewrite attempts against the rules); all suites
re-run: 326 checks.

## 2026-10-10 — Membership packages, batch timetable, coach on sessions (v31)

- **Packages**: Zen & Dynamics' price list is built in — 6 days/week 1M/3M/6M/12M
  (₹4,000 / 10,500 / 16,500 / 22,200; 6M valid 7 months and 12M valid 13
  months, incl. a 1-month pause), 3 days/week 1M/3M/6M/12M (₹3,000 / 7,900 /
  12,400 / 16,500), session packs 1 / 3 / 6 / 8 / 10 / 12 (₹400 / 999 / 1,499
  / 2,500 / 3,000 / 3,500; 1 week or 45 days validity). Add and Renew open
  with a package picked: validity and fee fill in (amount editable for
  discounts); "Custom plan…" keeps the old fields. Plans remember their
  package so renewals offer the same one. Manage in Admin → Shifts →
  Membership packages (validity in months or days).
- **Batches**: 6–7 AM, 8–9 AM, 9:30–10:30 AM, 5–6 PM, 7–8 PM built in;
  editable in Admin → Shifts.
- **Coach** dropdown when starting a session (defaults to me). Marks and
  sessions record `coach` (who took it) and `by` (who submitted); reports
  count sessions per coach. Coaches can read a names-only staff list
  (`kv/org:staffnames`: id, name, active — admins write it on every roster
  change); they still can't read the roster, phones, pay or others' records.
- Fix: a sign-in made right after a sign-out on the same phone could be
  undone by the still-finishing sign-out; sign-in now waits for it.

Tests: packages.test.js (27); all suites re-run on fresh emulators
(packages 27, sessions 30, clients 61, import 25, security 73, checklist 77,
live 12, whatsapp 10, image 14, leavesite 14, unit 14 = 363).

## 2026-10-10 — Import a hand-kept accounts book (v32)

- **Clients → Add → Import** now recognises an accounts book (one sheet per
  month, e.g. `ZnD_Accounts.xlsx`) as well as the sales register and the
  template.
- **Only what the register lacks.** Each book row is matched one-to-one
  against payments already recorded for that client, same amount, within
  45 days. Rows dated after the last recorded payment are added by default.
  Earlier unmatched rows are left out unless you tick that month. Each
  month shows the book total next to your records, so you can see where
  money is actually missing.
- Dates are read to fit the sheet's month: month-first dates are swapped,
  and year typos are fixed. A cell that can't be read uses the 1st of the
  sheet's month and is marked "date from sheet".
- Package codes and amounts map to the built-in membership packages. New
  names become new clients, and package payments renew the plan.
- Importing the same book twice adds nothing.
- Tested locally with the real files (counts only, data wiped). All of
  October (₹66,700) is added as new. September's unmatched ₹37,200 is
  opt-in, and the book shows ₹45,200 more than the register for that month.

## 2026-10-10 — Batch list shows each time once (v33)

- The batch picker no longer repeats the time ("6–7 AM · 6:00 AM–7:00 AM"
  is now "6–7 AM"). Times are added only when a batch name has none.

## 2026-10-10 — More client filters (v34)

- **Membership:** Monthly, 3 months, 6 months, Yearly, Session packs.
  Worked out from each plan's dates, so 6- and 12-month packages with
  a bonus month still count as 6 and 12.
- **Paid:** Paid this month, Paid last month, Not paid this month, Paid
  last month but not this month. These two months of payments load when
  the filter is first used.
