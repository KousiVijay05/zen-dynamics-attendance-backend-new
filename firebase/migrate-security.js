/* ---------------------------------------------------------------
   One-off migration to v17 security (Firebase Authentication +
   per-user database rules). Run ONCE, right before deploying the v17
   rules and frontend.

     ACCESS_TOKEN=<owner OAuth token> node firebase/migrate-security.js            dry run (changes nothing)
     ACCESS_TOKEN=<owner OAuth token> node firebase/migrate-security.js --apply    do it
     node firebase/migrate-security.js --emulator --apply                         against the local emulators

   ACCESS_TOKEN must belong to a project owner (e.g. `gcloud auth
   print-access-token`, or the token the Firebase CLI holds). With it,
   database reads/writes bypass the security rules.

   What it does:
     1. Saves a full backup of /kv to --backup=<file> (default
        ./kv-backup-<time>.json in the CURRENT folder — keep it out of the
        repo: it contains the old plaintext passwords).
     2. Turns on the Email/Password sign-in provider (production only).
     3. Creates a sign-in account for every roster entry, uid = roster id,
        with their CURRENT password — or a generated temporary one if theirs
        is shorter than Firebase's 6-character minimum (printed at the end;
        hand those out). Re-running skips accounts that already exist.
     4. Marks everyone "must change password" (/mustchange): every old
        password was visible to admins, so each person picks a fresh private
        one at next sign-in.
     5. In ONE atomic update: links accounts to staff (/uidmap for active
        people, /admins for administrators), writes org:public, profile:<id>,
        leave:<id> / leavedec:<id> (from the old org:config.leaves list), and
        strips passwords from org:roster and leaves from org:config.
     6. Removes the plaintext passwords from the old Google Sheet too
        (production only; --skip-sheet to leave it).
----------------------------------------------------------------*/

const fs = require("fs");
const crypto = require("crypto");

const PROJECT = "zen-dynamics-attendance-a2f73";
const EMAIL_DOMAIN = PROJECT + ".firebaseapp.com";            // must match js/storage/storage-firebase.js
const SHEETS_URL = "https://script.google.com/macros/s/AKfycbw2KaetubZ5a4k2fA-H6kCdmHAZugDCMzkdVaj4ftZDPo_Tt-sg4C_62S-d2eH_cJFXww/exec";
const SHEETS_SECRET = "scFJnv_q9aCIHR6uBCjRWfvke8HlAQ20";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const EMU = args.includes("--emulator");
const SKIP_SHEET = EMU || args.includes("--skip-sheet");
const BACKUP = (args.find(a => a.startsWith("--backup=")) || "").slice(9) || "kv-backup-" + new Date().toISOString().replace(/[:.]/g, "-") + ".json";

const DB = EMU ? "http://127.0.0.1:9000" : "https://zen-dynamics-attendance-a2f73-default-rtdb.asia-southeast1.firebasedatabase.app";
const DB_Q = EMU ? "?ns=" + PROJECT + "-default-rtdb" : "";
const IDT = EMU ? "http://127.0.0.1:9099/identitytoolkit.googleapis.com" : "https://identitytoolkit.googleapis.com";
const TOKEN = EMU ? "owner" : process.env.ACCESS_TOKEN;
if (!TOKEN) { console.error("Set ACCESS_TOKEN (a project owner's OAuth access token)."); process.exit(1); }

const H = Object.assign({ Authorization: "Bearer " + TOKEN, "Content-Type": "application/json" }, EMU ? {} : { "x-goog-user-project": PROJECT });

async function req(method, url, body) {
  const r = await fetch(url, { method, headers: H, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text();
  let j; try { j = t ? JSON.parse(t) : null; } catch (e) { j = t; }
  if (!r.ok) { const e = new Error(method + " " + url.split("?")[0] + " -> " + r.status + " " + (j && j.error && j.error.message || t)); e.body = j; throw e; }
  return j;
}

const publicOf = c => ({ org: c.org, site: c.site, lockOutside: c.lockOutside, adminAnywhere: c.adminAnywhere, demo: c.demo });
const strip = p => { const c = Object.assign({}, p); delete c.password; delete c.pin; return c; };
function tempPassword() {
  const abc = "abcdefghjkmnpqrstuvwxyz23456789";       // no 0/o/1/l/i
  return Array.from(crypto.randomBytes(8), b => abc[b % abc.length]).join("");
}

(async () => {
  console.log("Mode:", APPLY ? "APPLY" : "dry run", "|", EMU ? "EMULATOR" : "PRODUCTION");

  // ---------- 1. read + backup ----------
  const kv = (await req("GET", DB + "/kv.json" + DB_Q)) || {};
  const get = k => kv[k] == null ? null : JSON.parse(kv[k]);
  const cfg = get("org:config"), roster = get("org:roster");
  if (!cfg || !Array.isArray(roster)) throw new Error("No org:config / org:roster found — nothing to migrate.");
  if (kv["org:public"] && !roster.some(p => "password" in p || "pin" in p) && !args.includes("--force")) {
    throw new Error("Already migrated (org:public exists, no passwords left in the roster). Re-running would force everyone to change password again; pass --force if you really mean it.");
  }
  if (APPLY) { fs.writeFileSync(BACKUP, JSON.stringify(kv, null, 1)); console.log("Backup:", BACKUP, "(" + Object.keys(kv).length + " keys — contains old passwords, keep it private)"); }

  // ---------- 2. Email/Password provider ----------
  if (!EMU) {
    const url = IDT + "/admin/v2/projects/" + PROJECT + "/config";
    if (APPLY) {
      try {
        await req("PATCH", url + "?updateMask=signIn.email.enabled,signIn.email.passwordRequired", { signIn: { email: { enabled: true, passwordRequired: true } } });
        console.log("Email/Password sign-in: enabled");
      } catch (e) {
        throw new Error("Couldn't enable Email/Password sign-in (" + e.message + "). Turn it on in Firebase console -> Authentication -> Sign-in method, then re-run.");
      }
    } else console.log("Would enable Email/Password sign-in");
  }

  // ---------- 3+4. accounts ----------
  const handOut = [];
  const newRoster = [];
  for (const p of roster) {
    const username = String(p.username || "").trim().toLowerCase();
    if (!username) { console.log("  SKIP (no user ID):", p.name); newRoster.push(strip(p)); continue; }
    let pw = String(p.password || p.pin || "");
    let generated = false;
    if (pw.length < 6) { pw = tempPassword(); generated = true; }
    const entry = Object.assign(strip(p), { username, authUid: p.id, authEmail: username + "@" + EMAIL_DOMAIN });
    delete entry.mustChangePassword;                  // now lives in /mustchange
    newRoster.push(entry);

    const line = "  " + (p.admin ? "[admin] " : "        ") + p.name + " (" + username + ", id " + p.id + ")" + (p.active === false ? " [inactive]" : "");
    if (!APPLY) { console.log(line + (generated ? " — password too short, would get a temporary one" : " — keeps current password")); continue; }

    let created = true;
    try {
      await req("POST", IDT + "/v1/projects/" + PROJECT + "/accounts", {
        localId: p.id, email: username + "@" + EMAIL_DOMAIN, password: pw, displayName: p.name
      });
    } catch (e) {
      if (/DUPLICATE_LOCAL_ID|EMAIL_EXISTS/.test(e.message)) created = false; else throw e;
    }
    console.log(line + (created ? (generated ? " — created, TEMPORARY password" : " — created") : " — account already existed, left its password alone"));
    if (created && generated) handOut.push({ name: p.name, username, password: pw });
  }

  // ---------- 5. data ----------
  const updates = {};
  const kvp = {};
  const fullCfg = Object.assign({}, cfg);
  const oldLeaves = Array.isArray(cfg.leaves) ? cfg.leaves : [];
  delete fullCfg.leaves;
  const byStaff = {};
  for (const l of oldLeaves) {
    const s = byStaff[l.staffId] || (byStaff[l.staffId] = { reqs: get("leave:" + l.staffId) || [], dec: get("leavedec:" + l.staffId) || {} });
    if (!s.reqs.some(q => q.id === l.id)) s.reqs.push({ id: l.id, from: l.from, to: l.to, days: l.days, reason: l.reason || "", requestedAt: l.requestedAt });
    if (l.status && l.status !== "pending") s.dec[l.id] = { status: l.status, decidedAt: l.decidedAt || null, decidedBy: l.decidedBy || null };
  }
  Object.keys(byStaff).forEach(id => {
    byStaff[id].reqs.sort((a, b) => b.requestedAt - a.requestedAt);
    kvp["leave:" + id] = JSON.stringify(byStaff[id].reqs);
    kvp["leavedec:" + id] = JSON.stringify(byStaff[id].dec);
  });
  kvp["org:config"] = JSON.stringify(fullCfg);
  kvp["org:public"] = JSON.stringify(publicOf(withDefaults(fullCfg)));
  kvp["org:roster"] = JSON.stringify(newRoster);
  newRoster.forEach(p => {
    kvp["profile:" + p.id] = JSON.stringify(p);
    if (!p.username) return;
    if (p.active !== false) updates["uidmap/" + p.id] = p.id;
    if (p.admin) updates["admins/" + p.id] = true;
    updates["mustchange/" + p.id] = true;
  });
  Object.keys(kvp).forEach(k => { updates["kv/" + k] = kvp[k]; });

  console.log("Data: org:public + " + newRoster.length + " profiles + leave for " + Object.keys(byStaff).length + " staff (" + oldLeaves.length + " requests); passwords stripped from org:roster");
  if (APPLY) {
    await req("PATCH", DB + "/.json" + DB_Q, updates);
    const check = (await req("GET", DB + "/kv/org:roster.json" + DB_Q));
    if (!(await req("GET", DB + "/uidmap.json" + DB_Q))) throw new Error("/uidmap missing after the update!");
    if (/"(password|pin)"/.test(check)) throw new Error("org:roster still contains a password field after the update!");
    console.log("Database updated.");
  }

  // ---------- 6. Google Sheet ----------
  if (!SKIP_SHEET) {
    if (APPLY) {
      const r = await fetch(SHEETS_URL, {
        method: "POST", redirect: "follow", headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action: "setMany", token: SHEETS_SECRET, items: [{ key: "org:roster", value: JSON.stringify(newRoster) }] })
      });
      const d = JSON.parse(await r.text());
      console.log(d.ok ? "Google Sheet: passwords removed from its staff list." : "Google Sheet scrub FAILED: " + d.error + " (remove them by hand)");
    } else console.log("Would remove passwords from the old Google Sheet's staff list");
  }

  if (handOut.length) {
    console.log("\nThese people's old password was under 6 characters. Give them this TEMPORARY password:");
    handOut.forEach(h => console.log("  " + h.name + "  user ID: " + h.username + "  temporary password: " + h.password));
  }
  console.log(APPLY ? "\nDone." : "\nDry run only — re-run with --apply to make these changes.");
})().catch(e => { console.error("FAILED:", e.message); process.exit(1); });

function withDefaults(c) {
  return Object.assign({ lockOutside: true, adminAnywhere: true, demo: false }, c);
}
