/* ---------------------------------------------------------------
   One-off migration: Google Sheets (Apps Script) -> Firebase.

     node firebase/migrate-from-sheets.js --dry-run   read both, change nothing
     node firebase/migrate-from-sheets.js             copy every key Firebase doesn't have yet
     node firebase/migrate-from-sheets.js --catch-up  after cutover: merge in punches made
                                                      from devices still on the old version

   The Sheet is only ever READ — it stays intact as a backup/fallback.
   Writes go through the same public REST endpoint and security rules
   the app uses, so anything the rules would reject is rejected here too.
----------------------------------------------------------------*/

const SHEETS_URL = "https://script.google.com/macros/s/AKfycbw2KaetubZ5a4k2fA-H6kCdmHAZugDCMzkdVaj4ftZDPo_Tt-sg4C_62S-d2eH_cJFXww/exec";
const SHEETS_SECRET = "scFJnv_q9aCIHR6uBCjRWfvke8HlAQ20";
const FB = "https://zen-dynamics-attendance-a2f73-default-rtdb.asia-southeast1.firebasedatabase.app";

const mode = process.argv.includes("--dry-run") ? "dry-run" : process.argv.includes("--catch-up") ? "catch-up" : "copy";

async function sheetsAll() {
  const r = await fetch(SHEETS_URL, {
    method: "POST", redirect: "follow",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action: "all", token: SHEETS_SECRET })
  });
  const d = JSON.parse(await r.text());
  if (!d.ok) throw new Error("Sheets read failed: " + d.error);
  return d.kv;
}
async function fbAll() {
  const r = await fetch(FB + "/kv.json");
  if (!r.ok) throw new Error("Firebase read failed: " + r.status);
  return (await r.json()) || {};
}
async function fbPut(key, value) {
  const r = await fetch(FB + "/kv/" + encodeURIComponent(key) + ".json", { method: "PUT", body: JSON.stringify(value) });
  if (!r.ok) throw new Error("Firebase write failed for " + key + ": " + r.status + " " + (await r.text()));
}

/* Union of two punch lists by entry id. For an id in both, keep the one
   that's closed (has an end) — a clock-out on either side wins. */
function mergeLogs(a, b) {
  const byId = {};
  [].concat(a, b).forEach(e => {
    if (!e || !e.id) return;
    const cur = byId[e.id];
    if (!cur || (!cur.end && e.end)) byId[e.id] = e;
  });
  return Object.values(byId).sort((x, y) => y.start - x.start);
}

(async () => {
  const [sheets, fb] = await Promise.all([sheetsAll(), fbAll()]);
  const keys = Object.keys(sheets).filter(k => sheets[k] !== "null");
  console.log("Mode:", mode, "| Sheet keys:", keys.length, "| Firebase keys:", Object.keys(fb).length);

  let wrote = 0;
  for (const key of keys) {
    const inFb = key in fb;
    if (mode === "dry-run") {
      console.log("  " + (inFb ? (fb[key] === sheets[key] ? "same      " : "DIFFERENT ") : "would copy") + " " + key + " (" + sheets[key].length + " chars)");
      continue;
    }
    if (mode === "copy" && !inFb) {
      await fbPut(key, sheets[key]); wrote++;
      console.log("  copied", key);
    }
    if (mode === "catch-up") {
      if (!inFb) { await fbPut(key, sheets[key]); wrote++; console.log("  copied (new since cutover)", key); continue; }
      if (key.indexOf("log:") === 0 && fb[key] !== sheets[key]) {
        const merged = JSON.stringify(mergeLogs(JSON.parse(fb[key]), JSON.parse(sheets[key])));
        if (merged !== fb[key]) { await fbPut(key, merged); wrote++; console.log("  merged punches into", key); }
      } else if (fb[key] !== sheets[key]) {
        console.log("  NOTE: " + key + " differs between Sheet and Firebase — left Firebase's copy alone (review manually if needed)");
      }
    }
  }

  if (mode !== "dry-run") {
    const after = await fbAll();
    const missing = keys.filter(k => !(k in after));
    console.log("Wrote", wrote, "key(s). Missing from Firebase after run:", missing.length ? missing : "none");
  }
})().catch(e => { console.error("FAILED:", e.message); process.exit(1); });
