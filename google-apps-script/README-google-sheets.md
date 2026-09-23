# Google Sheets backend — setup

This turns a Google Sheet into the shared database for the attendance app,
so every phone/device sees the same staff, punches and settings instead of
each device keeping its own local copy.

## 1. Create the Sheet

1. Go to [sheets.google.com](https://sheets.google.com) and create a new,
   blank spreadsheet. Name it something like "Attendance data".
2. Extensions → Apps Script. This opens the script editor bound to that sheet.
3. Delete the placeholder `Code.gs` contents and paste in the contents of
   `google-apps-script/Code.gs` from this project.
4. Near the top, change:
   ```js
   var SECRET = "change-me-please";
   ```
   to a long random string only you know (a password manager's "generate
   password" button is fine — 24+ characters, letters and digits).
5. Save (Ctrl/Cmd+S).

## 2. Grant permissions once

1. In the script editor, select the `setup` function from the function
   dropdown at the top, then click **Run**.
2. Google will ask you to authorize the script — accept it (you'll see an
   "unverified app" warning because this is your own private script; click
   **Advanced → Go to (project name), unsafe** to proceed).
3. Switch back to the spreadsheet tab — you should now see a hidden `_data`
   sheet (View → Show hidden sheets if you want to peek at it) plus empty
   `Shifts` and `Staff` sheets.

## 3. Deploy as a web app

1. In the script editor: **Deploy → New deployment**.
2. Click the gear icon next to "Select type" → **Web app**.
3. Set:
   - **Execute as:** Me
   - **Who has access:** Anyone
4. Click **Deploy**, authorize again if asked, and copy the **Web app URL**
   (it ends in `/exec`).

Keep this URL and your `SECRET` together somewhere safe — you'll need both
in the next step, and you'll need them again any time you redeploy.

## 4. Point the app at your sheet

1. In this project, open `js/storage/storage-gsheets.js`.
2. Set:
   ```js
   var WEB_APP_URL = "https://script.google.com/macros/s/AKfycb.../exec";
   var SECRET = "the same string you put in Code.gs";
   ```
3. In `index.html`, swap the storage script include:
   ```html
   <!-- change this -->
   <script src="js/storage/storage-local.js"></script>
   <!-- to this -->
   <script src="js/storage/storage-gsheets.js"></script>
   ```
4. Redeploy/re-upload the site (see the main `README.md` for hosting options).

## 5. Verify it worked

Open the app. First run should show the "Set up attendance" screen — create
your workplace and first administrator as normal. Then check the Google
Sheet: within a few seconds you should see rows appear in the hidden
`_data` sheet, and the `Shifts`/`Staff` sheets populate once there's data
in them.

If instead you see an error message in the app: open the web app URL
directly in a browser tab. You should get
`{"ok":true,"message":"Attendance backend is running."}`. If you get an
HTML sign-in page instead, the deployment's "Who has access" isn't set to
Anyone — redeploy with that setting.

## Redeploying after you edit Code.gs

Apps Script web app URLs are pinned to a specific deployment. If you edit
`Code.gs` later, you have two options:
- **Deploy → Manage deployments → edit (pencil) → New version** — keeps
  the same URL, so nothing in the frontend needs to change. Do this for
  routine updates.
- **Deploy → New deployment** — gives you a new URL, which you'd then need
  to update in `js/storage/storage-gsheets.js`. Only do this if you
  specifically need a fresh deployment.

## Multiple devices / sharing the sheet

Anyone who can open the underlying Google Sheet can read every staff PIN's
salary and every punch (though not PINs themselves — see the Security
section of the main README). Keep the sheet private to whoever manages
payroll; staff and other administrators only need the app itself, not
access to the sheet.

## Quotas

Apps Script web apps on a free/personal Google account get roughly 90
minutes of script runtime per day, shared across everyone hitting your
deployment. Each call to this backend runs in well under a second, so this
comfortably supports a small-to-mid-size team; if you have many dozens of
staff polling constantly, consider raising `POLL_SECONDS` in
`js/storage/storage-gsheets.js` (default 60).
