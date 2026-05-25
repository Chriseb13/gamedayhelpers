/**
 * ============================================================
 *  GAMEDAY HELPERS - FULL BACKEND  (Google Apps Script)
 * ============================================================
 *  One script runs everything, all free:
 *   - Helper + Coach signups (POST from the site forms)
 *   - Live helper profile pages (GET, served by this script)
 *   - Auto review requests: one hourly sweep emails both sides
 *     X hours after each game. No manual step.
 *   - Review intake (POST from review.html) + rating rollup
 *
 *  Sheet tabs are created automatically on first use:
 *   Helpers | Coaches | Games | Reviews
 *
 *  SET THE THREE VALUES BELOW, then follow SETUP-STEPS.md.
 * ============================================================
 */

// 1) Where YOUR alert emails go:
const OWNER_EMAIL = "info@gamedayhelpers.com";

// 2) Your live site address (GitHub Pages / Netlify), no trailing slash.
//    Used to build the "leave a review" links. Example:
//    https://yourname.github.io/gameday-helpers
const SITE_BASE_URL = "https://REPLACE-WITH-YOUR-SITE-URL";

// 3) How many hours after a game to ask for a review:
const REVIEW_DELAY_HOURS = 3;


/* ----------------------------------------------------------
 *  COLUMN MAPS (1-indexed). Change headers here if you edit.
 * ---------------------------------------------------------- */
const HELPER_COLS = ["Submitted","HelperID","Name","Age (private)","Email","Phone",
  "Leagues","Sports","Roles","Skill","PriorGames","GDHGames","AvgRating","ReviewCount",
  "Availability","Notes","Approved?"];
const COACH_COLS  = ["Submitted","Name","Email","Phone","Team","Leagues","Notes","Contacted?"];
const GAME_COLS   = ["GameID","DateTime","Sport","Field","CoachName","CoachEmail",
  "HelperID","HelperName","HelperEmail","ReviewSent"];
const REVIEW_COLS = ["Submitted","GameID","RevieweeID","RevieweeRole","ReviewerRole","Stars","Comment"];


/* ==========================================================
 *  ROUTER
 * ========================================================== */
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    if (data.type === "COACH")  return json(handleCoach(data));
    if (data.type === "REVIEW") return json(handleReview(data));
    return json(handleHelper(data)); // default: HELPER
  } catch (err) {
    return json({ result: "error", message: err.message });
  }
}

function doGet(e) {
  // Live profile page:  .../exec?p=HELPERID
  if (e && e.parameter && e.parameter.p) {
    return HtmlService.createHtmlOutput(renderProfile(e.parameter.p))
      .setTitle("Helper Profile | GameDay Helpers")
      .addMetaTag("viewport", "width=device-width, initial-scale=1.0");
  }
  return HtmlService.createHtmlOutput("<p style='font-family:sans-serif'>GameDay Helpers. No profile specified.</p>");
}


/* ==========================================================
 *  SIGNUPS
 * ========================================================== */
function handleHelper(d) {
  const sheet = tab("Helpers", HELPER_COLS);
  const id = makeHelperId(d.name);
  sheet.appendRow([new Date(), id, d.name, d.age, d.email, d.phone,
    d.leagues, d.sports, d.roles, d.skill, num(d.priorGames), 0, "", 0,
    d.availability, d.notes, "NO"]);

  confirmEmail(d.email, d.name,
    "Thanks for setting up your helper profile. We review every helper, then reach out by text or email when a game in your area needs you. No commitment until you claim a game.",
    "Your helper profile is live");

  alertOwner("HELPER", d.name, d.leagues,
    "Age: " + d.age + "\nEmail: " + d.email + "\nPhone: " + d.phone +
    "\nLeagues: " + d.leagues + "\nSports: " + d.sports + "\nRoles: " + d.roles +
    "\nSkill: " + d.skill + "\nPrior games: " + num(d.priorGames) +
    "\nAvailability: " + (d.availability||"") + "\nNotes: " + (d.notes||"") +
    "\nProfile: " + profileUrl(id));

  return { result: "success", helperId: id, profileUrl: profileUrl(id) };
}

function handleCoach(d) {
  const sheet = tab("Coaches", COACH_COLS);
  sheet.appendRow([new Date(), d.name, d.email, d.phone, d.team, d.leagues, d.notes, "NO"]);

  confirmEmail(d.email, d.name,
    "Thanks for joining as a founding coach. We will reach out as we open helper matching in your league. No payment until you choose a season pass.",
    "You're on the early list");

  alertOwner("COACH", d.name, d.leagues,
    "Email: " + d.email + "\nPhone: " + d.phone + "\nTeam: " + (d.team||"") +
    "\nLeagues: " + d.leagues + "\nNotes: " + (d.notes||""));

  return { result: "success" };
}


/* ==========================================================
 *  REVIEW INTAKE  (posted by review.html)
 *  payload: {type:"REVIEW", gameId, revieweeId, revieweeRole,
 *            reviewerRole, stars, comment}
 * ========================================================== */
function handleReview(d) {
  const sheet = tab("Reviews", REVIEW_COLS);
  sheet.appendRow([new Date(), d.gameId, d.revieweeId, d.revieweeRole,
    d.reviewerRole, num(d.stars), d.comment || ""]);

  // Roll the new rating up onto the helper's profile
  if (d.revieweeRole === "helper" && d.revieweeId) {
    recalcHelperRating(d.revieweeId);
  }
  return { result: "success" };
}

function recalcHelperRating(helperId) {
  const rev = tab("Reviews", REVIEW_COLS);
  const rows = rev.getDataRange().getValues(); // incl header
  let total = 0, count = 0;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][2] == helperId && rows[i][3] === "helper") {
      total += Number(rows[i][5]) || 0;
      count++;
    }
  }
  const avg = count ? Math.round((total / count) * 10) / 10 : "";
  const h = tab("Helpers", HELPER_COLS);
  const hrows = h.getDataRange().getValues();
  for (let i = 1; i < hrows.length; i++) {
    if (hrows[i][1] == helperId) {
      h.getRange(i + 1, 13).setValue(avg);    // AvgRating col 13
      h.getRange(i + 1, 14).setValue(count);  // ReviewCount col 14
      break;
    }
  }
}


/* ==========================================================
 *  HOURLY SWEEP  (install once via createReviewTrigger)
 *  Finds games whose time + REVIEW_DELAY_HOURS has passed and
 *  that haven't had review requests sent. Emails both sides,
 *  marks them sent, bumps the helper's GameDay Helpers count.
 * ========================================================== */
function sendReviewRequests() {
  const g = tab("Games", GAME_COLS);
  const rows = g.getDataRange().getValues();
  const now = new Date();
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const gameId = r[0], dt = r[1], helperId = r[6], helperName = r[7],
          helperEmail = r[8], coachName = r[4], coachEmail = r[5], sent = r[9];
    if (!gameId || sent) continue;
    const gameTime = (dt instanceof Date) ? dt : new Date(dt);
    if (isNaN(gameTime.getTime())) continue;
    const dueAt = new Date(gameTime.getTime() + REVIEW_DELAY_HOURS * 3600 * 1000);
    if (now < dueAt) continue;

    // Email the coach -> review the helper
    if (coachEmail) {
      sendReviewEmail(coachEmail, coachName || "Coach", helperName || "your helper",
        reviewUrl(gameId, helperId, helperName, "helper", "coach"));
    }
    // Email the helper -> review the coach (collected, not shown publicly yet)
    if (helperEmail) {
      sendReviewEmail(helperEmail, helperName || "Helper", coachName || "the coach",
        reviewUrl(gameId, "coach:" + (coachEmail||""), coachName, "coach", "helper"));
    }

    g.getRange(i + 1, 10).setValue(new Date()); // ReviewSent timestamp
    if (helperId) bumpHelperGames(helperId);    // count this completed game
  }
}

function bumpHelperGames(helperId) {
  const h = tab("Helpers", HELPER_COLS);
  const rows = h.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][1] == helperId) {
      const cur = Number(rows[i][11]) || 0;       // GDHGames col 12
      h.getRange(i + 1, 12).setValue(cur + 1);
      break;
    }
  }
}

// Run this ONCE to install the hourly trigger.
function createReviewTrigger() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === "sendReviewRequests") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("sendReviewRequests").timeBased().everyHours(1).create();
}


/* ==========================================================
 *  LIVE PROFILE PAGE (rendered HTML, no CORS issues)
 * ========================================================== */
function renderProfile(helperId) {
  const h = tab("Helpers", HELPER_COLS);
  const rows = h.getDataRange().getValues();
  let p = null;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][1] == helperId) { p = rows[i]; break; }
  }
  if (!p) return profileShell("<div class='pbody'><p>Profile not found.</p></div>");

  const name = p[2], leagues = p[6], sports = p[7], skill = p[9],
        prior = Number(p[10]) || 0, gdh = Number(p[11]) || 0,
        avg = p[12], count = Number(p[13]) || 0;

  const rev = tab("Reviews", REVIEW_COLS).getDataRange().getValues();
  let revHtml = "";
  for (let i = 1; i < rev.length; i++) {
    if (rev[i][2] == helperId && rev[i][3] === "helper") {
      const stars = "&#9733;".repeat(Number(rev[i][5]) || 0);
      const when = rev[i][0] instanceof Date ? Utilities.formatDate(rev[i][0], Session.getScriptTimeZone(), "MMM yyyy") : "";
      revHtml = "<div class='rev'><div class='rtop'><div class='stars'>" + stars + "</div><div class='rdate'>" + when + "</div></div><div class='rtext'>" + esc(rev[i][6] || "") + "</div></div>" + revHtml;
    }
  }
  const reviewBlock = count
    ? "<div class='plabel'>Reviews &middot; <span class='stars'>&#9733;</span> " + avg + " (" + count + ")</div>" + revHtml
    : "<div class='plabel'>Reviews</div><div class='rev-empty'>No reviews yet. Be the first coach to work with " + esc(firstName(name)) + ".</div>";

  const body =
    "<div class='phead'><div class='pname'>" + esc(name) + "</div><span class='pskill'>" + esc(skill) + "</span></div>" +
    "<div class='pbody'>" +
      section("Sports scored", tags(sports)) +
      section("Leagues served", tags(leagues)) +
      "<div class='psection'><div class='plabel'>Games scored</div><div class='gstats'>" +
        "<div class='gstat'><div class='num'>" + gdh + "</div><div class='lab'>with GameDay Helpers<br>(and counting)</div></div>" +
        "<div class='gstat'><div class='num'>" + prior + "</div><div class='lab'>before joining</div></div>" +
      "</div></div>" +
      "<div class='psection' style='margin-bottom:0'>" + reviewBlock + "</div>" +
    "</div>";

  return profileShell(body);
}

function section(label, inner){return "<div class='psection'><div class='plabel'>"+label+"</div>"+inner+"</div>";}
function tags(csv){
  if(!csv) return "<div class='tags'></div>";
  return "<div class='tags'>" + String(csv).split(",").map(s=>"<span class='tag'>"+esc(s.trim())+"</span>").join("") + "</div>";
}

function profileShell(body){
  return "<!DOCTYPE html><html><head><meta charset='utf-8'>" +
    "<link href='https://fonts.googleapis.com/css2?family=Anton&family=Quicksand:wght@400;600;700&display=swap' rel='stylesheet'>" +
    "<style>" +
    "*{margin:0;padding:0;box-sizing:border-box;}body{font-family:Quicksand,sans-serif;background:#fff;color:#0d0d0d;}" +
    ".banner{background:#f97316;color:#0d0d0d;text-align:center;font-weight:700;font-size:13px;letter-spacing:.8px;text-transform:uppercase;padding:10px;}" +
    ".wrap{max-width:560px;margin:24px auto;padding:0 18px;}" +
    ".profile{border:1px solid #e5e7eb;border-radius:18px;overflow:hidden;}" +
    ".phead{background:#0d0d0d;color:#fff;padding:26px 24px;}" +
    ".pname{font-family:Anton,sans-serif;font-size:32px;letter-spacing:.5px;}" +
    ".pskill{display:inline-block;margin-top:12px;background:#f97316;color:#fff;font-weight:700;font-size:12px;letter-spacing:1px;text-transform:uppercase;padding:6px 14px;border-radius:999px;}" +
    ".pbody{padding:24px;}.psection{margin-bottom:24px;}" +
    ".plabel{font-weight:700;text-transform:uppercase;letter-spacing:1.2px;font-size:12px;color:#6b7280;margin-bottom:8px;}" +
    ".tags{display:flex;flex-wrap:wrap;gap:7px;}.tag{background:#f8fafc;border:1px solid #e6e9ee;border-radius:999px;padding:6px 13px;font-weight:600;font-size:13px;}" +
    ".gstats{display:flex;gap:12px;}.gstat{flex:1;background:#f8fafc;border:1px solid #eef0f3;border-radius:14px;padding:18px 14px;text-align:center;}" +
    ".gstat .num{font-family:Anton,sans-serif;font-size:38px;color:#f97316;}.gstat .lab{font-size:12px;color:#6b7280;font-weight:600;margin-top:6px;}" +
    ".stars{color:#f97316;letter-spacing:2px;}" +
    ".rev-empty{background:#f8fafc;border:1px dashed #d8dde4;border-radius:14px;padding:22px;text-align:center;color:#6b7280;font-weight:500;font-size:14px;}" +
    ".rev{border:1px solid #eef0f3;border-radius:14px;padding:16px 18px;margin-bottom:12px;}.rtop{display:flex;justify-content:space-between;margin-bottom:6px;}" +
    ".rdate{font-size:12px;color:#6b7280;font-weight:500;}.rtext{font-size:14px;color:#374151;font-weight:500;}" +
    "</style></head><body><div class='banner'>You coach. We score.</div><div class='wrap'><div class='profile'>" + body + "</div></div></body></html>";
}


/* ==========================================================
 *  EMAIL HELPERS
 * ========================================================== */
function brandWrap(name, msg){
  return "<div style='font-family:Arial,sans-serif;max-width:480px;'>" +
    "<div style='background:#0d0d0d;color:#fff;padding:20px;text-align:center;border-radius:10px 10px 0 0;'>" +
    "<div style='font-size:20px;font-weight:bold;'>GameDay <span style='color:#f97316;'>Helpers</span></div>" +
    "<div style='color:#99f6e4;font-style:italic;font-size:13px;'>You coach. We score.</div></div>" +
    "<div style='padding:24px;border:1px solid #eee;border-top:none;border-radius:0 0 10px 10px;'>" +
    "<p>Hey " + esc(name) + ",</p>" + msg + "</div></div>";
}

function confirmEmail(to, name, line, subject){
  MailApp.sendEmail({ to: to, subject: subject + " - GameDay Helpers",
    htmlBody: brandWrap(name, "<p>" + line + "</p><p>Talk soon,<br>The GameDay Helpers team</p>") });
}

function sendReviewEmail(to, name, aboutName, link){
  MailApp.sendEmail({ to: to, subject: "How was " + aboutName + "? - GameDay Helpers",
    htmlBody: brandWrap(name,
      "<p>Thanks for using GameDay Helpers. How did your game with <strong>" + esc(aboutName) + "</strong> go?</p>" +
      "<p style='text-align:center;margin:22px 0;'><a href='" + link + "' style='background:#f97316;color:#fff;text-decoration:none;font-weight:bold;padding:13px 26px;border-radius:10px;display:inline-block;'>Leave a quick review</a></p>" +
      "<p style='font-size:13px;color:#666;'>Takes 20 seconds. It helps the whole community.</p>") });
}

function alertOwner(kind, name, leagues, details){
  MailApp.sendEmail({ to: OWNER_EMAIL, subject: "New " + kind + ": " + name + " (" + leagues + ")",
    body: "New " + kind.toLowerCase() + " signed up:\n\nName: " + name + "\n" + details + "\n\nOpen the Sheet to review." });
}


/* ==========================================================
 *  UTILITIES
 * ========================================================== */
function tab(name, headers){
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let s = ss.getSheetByName(name);
  if (!s) s = ss.insertSheet(name);
  if (s.getLastRow() === 0) s.appendRow(headers);
  return s;
}
function json(obj){ return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
function num(v){ const n = parseInt(v,10); return isNaN(n)?0:n; }
function firstName(n){ return String(n||"").split(" ")[0]; }
function esc(s){ return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
function makeHelperId(name){
  const base = String(name||"helper").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,"").slice(0,18) || "helper";
  return base + "-" + Math.random().toString(36).slice(2,6);
}
function profileUrl(id){ return ScriptApp.getService().getUrl() + "?p=" + encodeURIComponent(id); }
function reviewUrl(gameId, revId, revName, revRole, reviewerRole){
  return SITE_BASE_URL + "/review.html?g=" + encodeURIComponent(gameId) +
    "&rev=" + encodeURIComponent(revId) + "&revname=" + encodeURIComponent(revName||"") +
    "&role=" + revRole + "&by=" + reviewerRole;
}
