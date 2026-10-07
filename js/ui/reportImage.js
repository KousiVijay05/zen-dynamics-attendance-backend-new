/* ---------------------------------------------------------------
   Draws the attendance card (a PNG) on the phone, from the data in
   reports.js attendanceSheet(). Nothing is uploaded: the image is drawn
   on a <canvas> in the browser and handed to the phone's own Share
   menu (utils/whatsapp.js). Brand: black header, ivory body, gold.
----------------------------------------------------------------*/

var W = 1080, PAD = 56;
var C = {
  paper: "#F5F2EB", panel: "#FFFFFF", ink: "#15130F", ink2: "#5E5A51", ink3: "#9C978B", line: "#E6E1D5",
  hero: "#12110E", hero2: "#1F1C16", heroInk: "#F6F1E4", heroInk2: "rgba(246,241,228,.65)",
  gold: "#D2AA55", goldSoft: "#F6EDD7", goldStrong: "#A9832F",
  good: "#1C7A4D", goodSoft: "#E1F2E8", bad: "#B5412D", badSoft: "#F8E5E0"
};
var FONT = '"Plus Jakarta Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

var logo = null;
function loadLogo() {
  if (logo) return Promise.resolve(logo);
  return new Promise(function (res) {
    var img = new Image();
    img.onload = function () { logo = img; res(img); };
    img.onerror = function () { res(null); };
    img.src = "icons/mark.png";
  });
}
function fontsReady() {
  if (!document.fonts || !document.fonts.load) return Promise.resolve();
  return Promise.all(["800 44px", "700 34px", "600 28px", "500 26px"].map(function (f) {
    return document.fonts.load(f + ' "Plus Jakarta Sans"').catch(function () {});
  }));
}
/* Start fetching early so the first tap is quick. */
export function warmUpReportImage() { loadLogo(); fontsReady(); }

function font(weight, size) { return weight + " " + size + "px " + FONT; }
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function fit(ctx, text, max) {
  if (ctx.measureText(text).width <= max) return text;
  while (text.length > 1 && ctx.measureText(text + "…").width > max) text = text.slice(0, -1);
  return text + "…";
}
function initials(name) {
  var p = String(name || "?").trim().split(/\s+/);
  return ((p[0][0] || "?") + (p.length > 1 ? p[p.length - 1][0] : (p[0][1] || ""))).toUpperCase();
}
/* Name chips that wrap onto as many lines as needed; returns the height used. */
function chips(ctx, names, x, y, maxW, fill, color, measureOnly) {
  ctx.font = font(650, 28);
  var cx = x, cy = y, h = 58, gap = 14;
  names.forEach(function (n) {
    var label = fit(ctx, n, maxW - 48);
    var w = ctx.measureText(label).width + 48;
    if (cx + w > x + maxW) { cx = x; cy += h + gap; }
    if (!measureOnly) {
      ctx.fillStyle = fill; rr(ctx, cx, cy, w, h, h / 2); ctx.fill();
      ctx.fillStyle = color; ctx.textBaseline = "middle"; ctx.fillText(label, cx + 24, cy + h / 2 + 1);
    }
    cx += w + gap;
  });
  return names.length ? cy - y + h : 0;
}

/** -> Promise<Blob> (PNG) */
export function renderReportImage(d) {
  return Promise.all([loadLogo(), fontsReady()]).then(function (r) {
    var img = r[0];
    var cv = document.createElement("canvas"), ctx = cv.getContext("2d");
    var inner = W - PAD * 2;

    /* ---- measure ---- */
    ctx.font = font(650, 28);
    var ROW = 132, HEAD = 300, SUM = 150;
    var h = HEAD + 40 + SUM + 56;
    h += 64 + (d.present.length ? d.present.length * ROW : 90) + 40;
    if (d.leave.length) h += 64 + chips(ctx, d.leave, PAD, 0, inner, "", "", true) + 40;
    if (d.absent.length) h += 64 + chips(ctx, d.absent, PAD, 0, inner, "", "", true) + 40;
    h += 110;
    cv.width = W; cv.height = h;

    /* ---- page ---- */
    ctx.fillStyle = C.paper; ctx.fillRect(0, 0, W, h);

    /* ---- header ---- */
    var g = ctx.createLinearGradient(0, 0, 0, HEAD);
    g.addColorStop(0, C.hero2); g.addColorStop(1, C.hero);
    ctx.fillStyle = g; rr(ctx, 0, -40, W, HEAD + 40, 56); ctx.fill();
    var glow = ctx.createRadialGradient(W, 0, 10, W, 0, 700);
    glow.addColorStop(0, "rgba(210,170,85,.35)"); glow.addColorStop(1, "rgba(210,170,85,0)");
    ctx.fillStyle = glow; rr(ctx, 0, -40, W, HEAD + 40, 56); ctx.fill();
    var lg = ctx.createLinearGradient(PAD, 0, W - PAD, 0);
    lg.addColorStop(0, "rgba(210,170,85,0)"); lg.addColorStop(.5, C.gold); lg.addColorStop(1, "rgba(210,170,85,0)");
    ctx.fillStyle = lg; ctx.fillRect(PAD, HEAD - 2, inner, 2);

    var lx = PAD;
    if (img) {
      ctx.save(); rr(ctx, PAD, 64, 112, 112, 28); ctx.clip(); ctx.drawImage(img, PAD, 64, 112, 112); ctx.restore();
      ctx.strokeStyle = "rgba(210,170,85,.5)"; ctx.lineWidth = 2; rr(ctx, PAD, 64, 112, 112, 28); ctx.stroke();
      lx = PAD + 112 + 32;
    }
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = C.heroInk; ctx.font = font(800, 46); ctx.fillText(fit(ctx, d.org, W - lx - PAD), lx, 112);
    ctx.fillStyle = C.gold; ctx.font = font(700, 34); ctx.fillText(fit(ctx, d.title, W - lx - PAD), lx, 160);
    ctx.fillStyle = C.heroInk2; ctx.font = font(500, 28); ctx.fillText(fit(ctx, d.subtitle, inner), PAD, 238);

    /* ---- summary tiles ---- */
    var y = HEAD + 40, tw = (inner - 2 * 20) / 3;
    [["Present", d.present.length + " / " + d.total, C.good],
     ["Late", String(d.lateCount), d.lateCount ? C.bad : C.ink],
     ["On leave", String(d.leave.length), C.goldStrong]].forEach(function (t, i) {
      var x = PAD + i * (tw + 20);
      ctx.fillStyle = C.panel; rr(ctx, x, y, tw, SUM, 32); ctx.fill();
      ctx.strokeStyle = C.line; ctx.lineWidth = 2; rr(ctx, x, y, tw, SUM, 32); ctx.stroke();
      ctx.fillStyle = C.ink2; ctx.font = font(600, 26); ctx.fillText(t[0], x + 30, y + 52);
      ctx.fillStyle = t[2]; ctx.font = font(800, 46); ctx.fillText(t[1], x + 30, y + 112);
    });
    y += SUM + 56;

    function section(label) {
      ctx.fillStyle = C.ink3; ctx.font = font(750, 24);
      ctx.fillText(label.toUpperCase().split("").join(String.fromCharCode(8202)), PAD + 4, y + 30);
      y += 64;
    }

    /* ---- present ---- */
    section("Present (" + d.present.length + ")");
    var listH = d.present.length ? d.present.length * ROW : 90;
    ctx.fillStyle = C.panel; rr(ctx, PAD, y, inner, listH, 36); ctx.fill();
    ctx.strokeStyle = C.line; ctx.lineWidth = 2; rr(ctx, PAD, y, inner, listH, 36); ctx.stroke();
    if (!d.present.length) {
      ctx.fillStyle = C.ink3; ctx.font = font(600, 28); ctx.textAlign = "center";
      ctx.fillText("Nobody clocked in", W / 2, y + 56); ctx.textAlign = "left";
    }
    d.present.forEach(function (p, i) {
      var ry = y + i * ROW;
      if (i) { ctx.fillStyle = C.line; ctx.fillRect(PAD + 30, ry, inner - 60, 2); }
      var cx = PAD + 36 + 38, cy = ry + ROW / 2;
      ctx.fillStyle = C.goldSoft; ctx.beginPath(); ctx.arc(cx, cy, 38, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = C.goldStrong; ctx.font = font(800, 26); ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(initials(p.name), cx, cy + 1); ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
      if (!p.outT) { ctx.fillStyle = C.good; ctx.beginPath(); ctx.arc(cx + 28, cy + 28, 11, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = C.panel; ctx.lineWidth = 4; ctx.stroke(); }

      var tx = PAD + 36 + 76 + 26, rightX = W - PAD - 36;
      var times = p.inT + " → " + (p.outT || "still in");
      ctx.font = font(700, 30); var tW = ctx.measureText(times).width;
      ctx.fillStyle = C.ink; ctx.font = font(700, 32);
      ctx.fillText(fit(ctx, p.name, rightX - tW - 30 - tx), tx, cy - 6);
      ctx.fillStyle = C.ink2; ctx.font = font(500, 25);
      ctx.fillText(fit(ctx, p.shift || " ", rightX - tW - 30 - tx), tx, cy + 34);

      ctx.textAlign = "right";
      ctx.fillStyle = p.outT ? C.ink : C.good; ctx.font = font(700, 30); ctx.fillText(times, rightX, cy - 6);
      ctx.fillStyle = C.ink2; ctx.font = font(600, 25); ctx.fillText(p.hours, rightX, cy + 34);
      if (p.late) {
        var hw = ctx.measureText(p.hours).width;
        ctx.font = font(750, 22); var lw = ctx.measureText("LATE").width + 28;
        var bx = rightX - hw - 16 - lw;
        ctx.fillStyle = C.badSoft; rr(ctx, bx, cy + 10, lw, 36, 18); ctx.fill();
        ctx.fillStyle = C.bad; ctx.textAlign = "center"; ctx.fillText("LATE", bx + lw / 2, cy + 36);
      }
      ctx.textAlign = "left";
    });
    y += listH + 40;

    /* ---- leave / not in ---- */
    if (d.leave.length) { section("On leave (" + d.leave.length + ")"); y += chips(ctx, d.leave, PAD, y, inner, C.goldSoft, C.goldStrong) + 40; }
    if (d.absent.length) { section("Not in (" + d.absent.length + ")"); y += chips(ctx, d.absent, PAD, y, inner, C.badSoft, C.bad) + 40; }

    /* ---- footer ---- */
    ctx.fillStyle = C.line; ctx.fillRect(PAD, h - 92, inner, 2);
    ctx.fillStyle = C.ink3; ctx.font = font(600, 24); ctx.textBaseline = "alphabetic";
    ctx.fillText(fit(ctx, d.org + " Attendance", inner / 2), PAD, h - 42);
    ctx.textAlign = "right"; ctx.fillText("Made " + d.generated, W - PAD, h - 42); ctx.textAlign = "left";

    return new Promise(function (res, rej) {
      cv.toBlob(function (b) { b ? res(b) : rej(new Error("Couldn't create the image.")); }, "image/png");
    });
  });
}
