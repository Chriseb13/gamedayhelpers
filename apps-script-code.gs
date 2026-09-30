/**
 * ============================================================
 *  GAMEDAY HELPERS - FULL BACKEND  (Google Apps Script)
 *  v9 - matches the live site forms (Sept 2026)
 * ============================================================
 *  Handles POST types from the site:
 *    HELPER | COACH | GAMEREQUEST | LEAGUE | REVIEW
 *  Handles GET:
 *    ?p=HELPERID        live helper profile
 *    ?consent=TOKEN     parent/guardian approval link
 *
 *  Sheet tabs (auto-created): Helpers | Coaches | Games | Leagues | Reviews
 *
 *  DEPLOY: Deploy > Manage deployments > pencil > New version > Deploy.
 *  NEVER "New deployment" (that makes a new URL the site does not use).
 *  After pasting this version for the first time, delete the old
 *  Helpers and Coaches tabs so they rebuild with the new columns
 *  (export them first if they hold real signups).
 * ============================================================
 */

const OWNER_EMAIL        = "info@gamedayhelpers.com";
const SITE_BASE_URL      = "https://gamedayhelpers.com";
const REVIEW_DELAY_HOURS = 3;
const FOUNDER_LIMIT      = 50;
const OWNER_NAME         = "Chris";
const OWNER_CELL         = "";   // optional, shown in match emails so both sides can text you

/* ---------------- COLUMN MAPS (1-indexed) ---------------- */
const HELPER_COLS = ["Submitted","HelperID","Name","Age (private)","Email","Phone",
  "Leagues","Sports","Roles","Skill","PriorGames","GDHGames","AvgRating","ReviewCount",
  "Availability","Notes","Approved?",
  "PayApps","PayHandle (private)","Minor?","ParentName","ParentEmail","ConsentStatus","ConsentToken",
  "Founder#","AgreedTerms"];
const COACH_COLS  = ["Submitted","Name","Email","Phone","Team","Leagues","Notes","Contacted?",
  "PayApps","PayHandle (private)","Founder#"];
const GAME_COLS   = ["GameID","DateTime","Sport","Field","CoachName","CoachEmail",
  "HelperID","HelperName","HelperEmail","ReviewSent",
  "Needs","League","Team","CoachPhone","FirstRate","AddlRate","Length","Offer","Status","MatchSent"];
const LEAGUE_COLS = ["Submitted","Name","Org","Email","Phone","Notes","Contacted?"];
const REVIEW_COLS = ["Submitted","GameID","RevieweeID","RevieweeRole","ReviewerRole","Stars","Comment"];

// Helper column indexes (0-based) used in lookups
const H = {ID:1,NAME:2,AGE:3,EMAIL:4,PHONE:5,LEAGUES:6,SPORTS:7,ROLES:8,SKILL:9,PRIOR:10,GDH:11,
  AVG:12,COUNT:13,AVAIL:14,NOTES:15,APPROVED:16,PAYAPPS:17,PAYHANDLE:18,MINOR:19,PNAME:20,PEMAIL:21,
  CONSENT:22,TOKEN:23,FOUNDER:24};
const C = {NAME:1,EMAIL:2,PHONE:3,TEAM:4,LEAGUES:5,NOTES:6,PAYAPPS:8,PAYHANDLE:9};
const G = {ID:0,DT:1,SPORT:2,FIELD:3,CNAME:4,CEMAIL:5,HID:6,HNAME:7,HEMAIL:8,REVSENT:9,
  NEEDS:10,LEAGUE:11,TEAM:12,CPHONE:13,FIRST:14,ADDL:15,LEN:16,OFFER:17,STATUS:18,MATCHSENT:19};

/* ==========================================================
 *  ROUTER
 * ========================================================== */
function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    const data = JSON.parse(e.postData.contents || "{}");
    const type = String(data.type || "HELPER").toUpperCase();
    let out;
    if (type === "COACH")            out = handleCoach(data);
    else if (type === "GAMEREQUEST") out = handleGameRequest(data);
    else if (type === "LEAGUE")      out = handleLeague(data);
    else if (type === "REVIEW")      out = handleReview(data);
    else if (type === "HELPER")      out = handleHelper(data);
    else                             out = { result: "error", message: "Unknown type" };
    return json(out);
  } catch (err) {
    if (!err.validation) try { MailApp.sendEmail(OWNER_EMAIL, "GDH backend error", String(err && err.stack || err) + "\n\nPayload:\n" + (e && e.postData ? e.postData.contents : "")); } catch (_) {}
    return json({ result: "error", message: err.message });
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.consent) return HtmlService.createHtmlOutput(handleConsent(p.consent))
      .setTitle("Parent approval | GameDay Helpers").addMetaTag("viewport","width=device-width, initial-scale=1.0");
  if (p.p) return HtmlService.createHtmlOutput(renderProfile(p.p))
      .setTitle("Helper Profile | GameDay Helpers").addMetaTag("viewport","width=device-width, initial-scale=1.0");
  return HtmlService.createHtmlOutput("<p style='font-family:sans-serif'>GameDay Helpers.</p>");
}

/* ==========================================================
 *  VALIDATION
 * ========================================================== */
function clean(v, max){ return String(v == null ? "" : v).trim().slice(0, max || 300); }
function validEmail(s){ return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s); }
function cleanPhone(s){ return clean(s, 30).replace(/[^\d+()\-.\s]/g,""); }
function need(cond, msg){ if(!cond){ const e = new Error(msg); e.validation = true; throw e; } }

/* ==========================================================
 *  HELPER SIGNUP
 * ========================================================== */
function handleHelper(d) {
  const name = clean(d.name, 80), email = clean(d.email, 120).toLowerCase(), phone = cleanPhone(d.phone);
  const age = parseInt(d.age, 10);
  need(name && email && phone, "Missing required fields");
  need(validEmail(email), "Invalid email");
  need(!isNaN(age) && age >= 14 && age <= 99, "Helpers must be 14 or older");
  need(d.agreeTerms === true || d.agreeTerms === "true", "Terms not accepted");

  const sheet = tab("Helpers", HELPER_COLS);
  const existing = findRowByEmail(sheet, H.EMAIL, email);
  if (existing) {
    // Duplicate: do not create a second profile. Re-send their info.
    const row = existing.row;
    confirmEmail(email, name, helperWelcomeBody(row[H.NAME], row[H.ID], row[H.MINOR] === "YES"), "You're already on the team");
    return { result: "success", helperId: row[H.ID], duplicate: true };
  }

  const isMinor = age < 18;
  const parentName = clean(d.parentName, 80), parentEmail = clean(d.parentEmail, 120).toLowerCase();
  if (isMinor) need(parentName && validEmail(parentEmail), "Parent name and email required for helpers under 18");

  const id = makeHelperId(name);
  const token = isMinor ? Utilities.getUuid() : "";
  const founder = nextFounderNumber(sheet, H.FOUNDER);

  sheet.appendRow([new Date(), id, name, age, email, phone,
    clean(d.leagues), clean(d.sports), clean(d.roles), clean(d.skill, 60), num(d.priorGames), 0, "", 0,
    clean(d.availability), clean(d.notes, 1000), "NO",
    clean(d.payApps), clean(d.payHandle, 80), isMinor ? "YES" : "NO", parentName, parentEmail,
    isMinor ? "PENDING" : "N/A", token, founder || "", "YES"]);

  confirmEmail(email, name, helperWelcomeBody(name, id, isMinor, founder), isMinor ? "One step left: parent approval" : "You're on the team");
  if (isMinor) sendParentConsent(parentEmail, parentName, name, token);

  alertOwner("HELPER", name, clean(d.leagues),
    "Age: " + age + (isMinor ? " (MINOR, consent pending)" : "") + "\nEmail: " + email + "\nPhone: " + phone +
    "\nLeagues: " + clean(d.leagues) + "\nSports: " + clean(d.sports) + "\nRoles: " + clean(d.roles) +
    "\nSkill: " + clean(d.skill) + "\nPrior games: " + num(d.priorGames) +
    "\nPay apps: " + clean(d.payApps) + "\nAvailability: " + clean(d.availability) + "\nNotes: " + clean(d.notes) +
    (founder ? "\nFounding Helper #" + founder : "") + "\nProfile: " + profileUrl(id));

  return { result: "success", helperId: id, profileUrl: profileUrl(id) };
}

/* ==========================================================
 *  COACH SIGNUP
 * ========================================================== */
function handleCoach(d) {
  const name = clean(d.name, 80), email = clean(d.email, 120).toLowerCase(), phone = cleanPhone(d.phone);
  need(name && email && phone, "Missing required fields");
  need(validEmail(email), "Invalid email");

  const sheet = tab("Coaches", COACH_COLS);
  const existing = findRowByEmail(sheet, C.EMAIL, email);
  if (existing) {
    confirmEmail(email, name, coachWelcomeBody(name, null), "You're already on the list");
    return { result: "success", duplicate: true };
  }
  const founder = nextFounderNumber(sheet, 10);
  sheet.appendRow([new Date(), name, email, phone, clean(d.team, 80), clean(d.leagues), clean(d.notes, 1000), "NO",
    clean(d.payApps), clean(d.payHandle, 80), founder || ""]);

  confirmEmail(email, name, coachWelcomeBody(name, founder), "You're in. Here's how to get a scorekeeper");
  alertOwner("COACH", name, clean(d.leagues),
    "Email: " + email + "\nPhone: " + phone + "\nTeam: " + clean(d.team) +
    "\nLeagues: " + clean(d.leagues) + "\nPay apps: " + clean(d.payApps) + "\nNotes: " + clean(d.notes) +
    (founder ? "\nFounding Coach #" + founder : ""));
  return { result: "success" };
}

/* ==========================================================
 *  GAME REQUEST (coach needs a helper for one game)
 * ========================================================== */
function handleGameRequest(d) {
  const email = clean(d.coachEmail, 120).toLowerCase();
  need(validEmail(email), "Invalid email");
  need(clean(d.datetime), "Missing game date/time");

  const coaches = tab("Coaches", COACH_COLS);
  const c = findRowByEmail(coaches, C.EMAIL, email);
  const coachName = c ? c.row[C.NAME] : "", team = c ? c.row[C.TEAM] : "", league = c ? c.row[C.LEAGUES] : "", cphone = c ? c.row[C.PHONE] : "";

  const games = tab("Games", GAME_COLS);
  const gameId = "G" + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyMMdd") + "-" + Math.random().toString(36).slice(2,6).toUpperCase();
  const dt = new Date(clean(d.datetime));
  games.appendRow([gameId, isNaN(dt.getTime()) ? clean(d.datetime) : dt, "", clean(d.field, 120), coachName, email,
    "", "", "", "",
    clean(d.notes), league, team, cphone, num(d.firstRate), num(d.addlRate), clean(d.length, 5), clean(d.offer, 10), "OPEN", ""]);

  const when = isNaN(dt.getTime()) ? clean(d.datetime) : Utilities.formatDate(dt, Session.getScriptTimeZone(), "EEE MMM d, h:mm a");
  const body =
    "<p>Got it. Here is what we are lining up:</p>" +
    "<table style='border-collapse:collapse;font-size:14px;'>" +
    tr("Game", when) + tr("Field", clean(d.field) || "TBD") + tr("You need", clean(d.notes)) +
    tr("Your offer", "$" + clean(d.offer) + " (" + clean(d.length) + " hr, $" + num(d.firstRate) + " first hour, $" + num(d.addlRate) + " each additional)") +
    "</table>" +
    "<p><strong>What happens next:</strong> a real person (" + OWNER_NAME + ") is matching your game with a helper from your league now. You will get one email with your helper's name, phone, and payment app. Then you two text each other and lock it in.</p>" +
    "<p>Pay your helper directly after the game, app to app. No cash.</p>" +
    (c ? "" : "<p style='color:#b45309;'><strong>Heads up:</strong> we could not find a coach profile under this email. Take 60 seconds and <a href='" + SITE_BASE_URL + "/coaches.html'>create one</a> so we can match you faster.</p>") +
    "<p>Need to change anything? Reply to this email.</p>";
  confirmEmail(email, coachName || "Coach", body, "Helper request received: " + when);

  alertOwner("GAME REQUEST", coachName || email, league || "unknown league",
    "GameID: " + gameId + "\nWhen: " + when + "\nField: " + clean(d.field) + "\nNeeds: " + clean(d.notes) +
    "\nOffer: $" + clean(d.offer) + " (" + clean(d.length) + "hr @ $" + num(d.firstRate) + "/$" + num(d.addlRate) + ")" +
    "\nCoach: " + (coachName || "NOT FOUND") + " | " + email + " | " + cphone + "\nTeam: " + team +
    "\n\nTo match: open Games tab, put HelperID in column G, then GDH menu > Send match emails.");
  return { result: "success", gameId: gameId };
}

/* ==========================================================
 *  LEAGUE / TOURNAMENT INQUIRY
 * ========================================================== */
function handleLeague(d) {
  const name = clean(d.name, 80), org = clean(d.org, 120), email = clean(d.email, 120).toLowerCase(), phone = cleanPhone(d.phone);
  need(name && org && email && phone, "Missing required fields");
  need(validEmail(email), "Invalid email");
  tab("Leagues", LEAGUE_COLS).appendRow([new Date(), name, org, email, phone, clean(d.notes, 1000), "NO"]);
  confirmEmail(email, name,
    "<p>Thanks for reaching out about <strong>" + esc(org) + "</strong>. " + OWNER_NAME + " will reach out within one business day to talk through covering your fields.</p>" +
    "<p>Quick preview of how it works for leagues: your coaches request helpers, we match them, coaches pay helpers directly. Leagues that add GameDay Helpers to registration earn a share of every team fee. We can walk through the numbers on a quick call.</p>",
    "Got your league inquiry");
  alertOwner("LEAGUE", name, org, "Email: " + email + "\nPhone: " + phone + "\nNotes: " + clean(d.notes));
  return { result: "success" };
}

/* ==========================================================
 *  PARENT CONSENT
 * ========================================================== */
function sendParentConsent(parentEmail, parentName, helperName, token){
  const link = ScriptApp.getService().getUrl() + "?consent=" + encodeURIComponent(token);
  MailApp.sendEmail({ to: parentEmail, subject: "Approve " + firstName(helperName) + " as a GameDay Helper (2 taps)",
    htmlBody: brandWrap(parentName,
      "<p><strong>" + esc(helperName) + "</strong> just signed up to earn money keeping score and running GameChanger at Tampa Bay youth baseball and softball games. Because they are under 18, we need your OK before they work a game.</p>" +
      "<p><strong>How it works:</strong> a coach requests a scorekeeper, we match your kid to a game in a league they chose, the coach pays them directly through Venmo, Cash App, PayPal or Zelle after the game (typically $30 or more for a two hour game). No cash. You and your kid decide which games to take. A real person makes every match and you can reach us any time.</p>" +
      "<p style='text-align:center;margin:24px 0;'><a href='" + link + "' style='background:#1747C8;color:#fff;text-decoration:none;font-weight:bold;padding:14px 28px;border-radius:10px;display:inline-block;'>Yes, I approve</a></p>" +
      "<p style='font-size:13px;color:#666;'>If you did not expect this email, ignore it and nothing happens. Questions: reply to this email or write <a href='mailto:" + OWNER_EMAIL + "'>" + OWNER_EMAIL + "</a>. Our <a href='" + SITE_BASE_URL + "/terms.html'>terms</a> are short and in plain English.</p>") });
}

function handleConsent(token){
  const sheet = tab("Helpers", HELPER_COLS);
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][H.TOKEN] && rows[i][H.TOKEN] === token) {
      const name = rows[i][H.NAME], email = rows[i][H.EMAIL], pname = rows[i][H.PNAME], pemail = rows[i][H.PEMAIL];
      if (rows[i][H.CONSENT] !== "APPROVED") {
        sheet.getRange(i + 1, H.CONSENT + 1).setValue("APPROVED");
        sheet.getRange(i + 1, H.CONSENT + 2).setValue("");  // burn the token
        confirmEmail(email, name, "<p>Your parent or guardian just approved you. You are active. Keep your phone close: when a coach in your league needs a scorekeeper, you will get a text or email with the game details. Say yes to the ones you want.</p>" + profileLine(rows[i][H.ID]), "You're approved. You're active.");
        confirmEmail(pemail, pname, "<p>Thanks. " + esc(firstName(name)) + " is now active on GameDay Helpers. You will not get another email from us unless you write to us. Questions any time: " + OWNER_EMAIL + "</p>", "Approved: " + firstName(name) + " is active");
        alertOwner("CONSENT APPROVED", name, rows[i][H.LEAGUES], "Parent " + pname + " (" + pemail + ") approved. Helper is active.");
      }
      return consentShell("<h1>Approved. Thank you.</h1><p>" + esc(firstName(name)) + " is now active on GameDay Helpers. You can close this page.</p>");
    }
  }
  return consentShell("<h1>Link not found</h1><p>This approval link has already been used or is not valid. If you need help, email <a href='mailto:" + OWNER_EMAIL + "'>" + OWNER_EMAIL + "</a>.</p>");
}
function consentShell(inner){
  return "<!DOCTYPE html><html><head><meta charset='utf-8'><style>body{font-family:Arial,sans-serif;max-width:480px;margin:40px auto;padding:0 20px;color:#172B4D;}h1{font-size:26px;}p{font-size:16px;line-height:1.5;}.b{background:#0d0d0d;color:#fff;padding:14px;text-align:center;border-radius:10px;font-weight:bold;margin-bottom:24px;}</style></head><body><div class='b'>GameDay <span style='color:#1747C8'>Helpers</span></div>" + inner + "</body></html>";
}

/* ==========================================================
 *  MATCH EMAILS (you fill HelperID on a Games row, then run from the GDH menu)
 * ========================================================== */
function onOpen(){
  SpreadsheetApp.getUi().createMenu("GDH")
    .addItem("Send match emails for selected Games row", "sendMatchForSelectedRow")
    .addItem("Install hourly review trigger", "createReviewTrigger")
    .addItem("Delete TEST_ rows", "cleanupTestRows")
    .addToUi();
}

function sendMatchForSelectedRow(){
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getActiveSheet();
  if (sh.getName() !== "Games") { SpreadsheetApp.getUi().alert("Select a row on the Games tab first."); return; }
  const r = sh.getActiveRange().getRow();
  if (r < 2) { SpreadsheetApp.getUi().alert("Select a game row, not the header."); return; }
  const msg = sendMatchEmails(r);
  SpreadsheetApp.getUi().alert(msg);
}

function sendMatchEmails(rowNum){
  const g = tab("Games", GAME_COLS);
  const row = g.getRange(rowNum, 1, 1, GAME_COLS.length).getValues()[0];
  const helperId = clean(row[G.HID]);
  if (!helperId) return "Put a HelperID in column G first.";
  const hs = tab("Helpers", HELPER_COLS);
  const hr = findRowByValue(hs, H.ID, helperId);
  if (!hr) return "HelperID not found in Helpers tab.";
  const h = hr.row;
  if (h[H.MINOR] === "YES" && h[H.CONSENT] !== "APPROVED") return "Helper is a minor without parent approval. Not sent.";

  const cs = tab("Coaches", COACH_COLS);
  const cr = findRowByEmail(cs, C.EMAIL, String(row[G.CEMAIL]).toLowerCase());
  const coachName = row[G.CNAME] || (cr ? cr.row[C.NAME] : "Coach");
  const coachPhone = row[G.CPHONE] || (cr ? cr.row[C.PHONE] : "");
  const coachPay = cr ? (cr.row[C.PAYAPPS] + (cr.row[C.PAYHANDLE] ? " (" + cr.row[C.PAYHANDLE] + ")" : "")) : "";

  const dt = row[G.DT] instanceof Date ? Utilities.formatDate(row[G.DT], Session.getScriptTimeZone(), "EEE MMM d, h:mm a") : String(row[G.DT]);
  const offer = row[G.OFFER] ? "$" + row[G.OFFER] : "the rate you agreed";
  const details = "<table style='border-collapse:collapse;font-size:14px;'>" + tr("Game", dt) + tr("Field", row[G.FIELD] || "TBD") +
    tr("League", row[G.LEAGUE] || "") + tr("Team", row[G.TEAM] || "") + tr("Needs", row[G.NEEDS] || "") + tr("Pay", offer) + "</table>";

  // Coach email: helper's name, phone, pay apps + handle
  confirmEmail(row[G.CEMAIL], coachName,
    "<p>You're matched. Here is your helper:</p>" +
    "<table style='border-collapse:collapse;font-size:14px;'>" + tr("Helper", h[H.NAME]) + tr("Phone", h[H.PHONE]) +
    tr("Pays via", h[H.PAYAPPS] + (h[H.PAYHANDLE] ? " (" + h[H.PAYHANDLE] + ")" : "")) + tr("Skill", h[H.SKILL]) + "</table>" +
    details +
    "<p><strong>Do this now:</strong> text " + esc(firstName(h[H.NAME])) + " to confirm and share the GameChanger team invite. After the game, pay " + offer + " straight to their app. No cash.</p>" +
    "<p>You will get a one tap review link a few hours after first pitch. Problem before the game? Reply here" + (OWNER_CELL ? " or text " + OWNER_NAME + " at " + OWNER_CELL : "") + ".</p>" +
    profileLine(h[H.ID]),
    "MATCHED: " + firstName(h[H.NAME]) + " is scoring your game " + dt);

  // Helper email: coach's name, phone, pay app
  confirmEmail(h[H.EMAIL], h[H.NAME],
    "<p>You got the game. Here is your coach:</p>" +
    "<table style='border-collapse:collapse;font-size:14px;'>" + tr("Coach", coachName) + tr("Phone", coachPhone) + tr("Pays via", coachPay) + "</table>" +
    details +
    "<p><strong>Do this now:</strong> text Coach " + esc(firstName(coachName)) + " to confirm. Ask for the GameChanger invite. Show up 15 minutes early, phone charged.</p>" +
    "<p>After the game the coach pays " + offer + " to your app. If it has not landed by the next morning, reply to this email and we handle it.</p>",
    "YOU'RE IN: " + dt + " with Coach " + firstName(coachName));

  g.getRange(rowNum, G.STATUS + 1).setValue("MATCHED");
  g.getRange(rowNum, G.MATCHSENT + 1).setValue(new Date());
  g.getRange(rowNum, G.HNAME + 1).setValue(h[H.NAME]);
  g.getRange(rowNum, G.HEMAIL + 1).setValue(h[H.EMAIL]);
  return "Match emails sent to " + coachName + " and " + h[H.NAME] + ".";
}

/* ==========================================================
 *  REVIEW INTAKE + ROLLUP
 * ========================================================== */
function handleReview(d) {
  need(clean(d.gameId), "Missing gameId");
  const stars = num(d.stars);
  need(stars >= 1 && stars <= 5, "Stars must be 1-5");
  const sheet = tab("Reviews", REVIEW_COLS);
  sheet.appendRow([new Date(), clean(d.gameId, 40), clean(d.revieweeId, 120), clean(d.revieweeRole, 20),
    clean(d.reviewerRole, 20), stars, clean(d.comment, 600)]);
  if (d.revieweeRole === "helper" && d.revieweeId) recalcHelperRating(clean(d.revieweeId, 120));
  return { result: "success" };
}

function recalcHelperRating(helperId) {
  const rows = tab("Reviews", REVIEW_COLS).getDataRange().getValues();
  let total = 0, count = 0;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][2] == helperId && rows[i][3] === "helper") { total += Number(rows[i][5]) || 0; count++; }
  }
  const avg = count ? Math.round((total / count) * 10) / 10 : "";
  const h = tab("Helpers", HELPER_COLS);
  const hr = findRowByValue(h, H.ID, helperId);
  if (hr) { h.getRange(hr.index, H.AVG + 1).setValue(avg); h.getRange(hr.index, H.COUNT + 1).setValue(count); }
}

/* ==========================================================
 *  HOURLY REVIEW SWEEP
 * ========================================================== */
function sendReviewRequests() {
  const g = tab("Games", GAME_COLS);
  const rows = g.getDataRange().getValues();
  const now = new Date();
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r[G.ID] || r[G.REVSENT] || !r[G.HID]) continue;   // only matched games
    const gameTime = (r[G.DT] instanceof Date) ? r[G.DT] : new Date(r[G.DT]);
    if (isNaN(gameTime.getTime())) continue;
    if (now < new Date(gameTime.getTime() + REVIEW_DELAY_HOURS * 3600 * 1000)) continue;
    if (r[G.CEMAIL]) sendReviewEmail(r[G.CEMAIL], r[G.CNAME] || "Coach", r[G.HNAME] || "your helper", reviewUrl(r[G.ID], r[G.HID], r[G.HNAME], "helper", "coach"));
    if (r[G.HEMAIL]) sendReviewEmail(r[G.HEMAIL], r[G.HNAME] || "Helper", r[G.CNAME] || "the coach", reviewUrl(r[G.ID], "coach:" + (r[G.CEMAIL]||""), r[G.CNAME], "coach", "helper"));
    g.getRange(i + 1, G.REVSENT + 1).setValue(new Date());
    g.getRange(i + 1, G.STATUS + 1).setValue("DONE");
    bumpHelperGames(r[G.HID]);
  }
}
function bumpHelperGames(helperId) {
  const h = tab("Helpers", HELPER_COLS);
  const hr = findRowByValue(h, H.ID, helperId);
  if (hr) h.getRange(hr.index, H.GDH + 1).setValue((Number(hr.row[H.GDH]) || 0) + 1);
}
function createReviewTrigger() {
  ScriptApp.getProjectTriggers().forEach(t => { if (t.getHandlerFunction() === "sendReviewRequests") ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger("sendReviewRequests").timeBased().everyHours(1).create();
}

/* ==========================================================
 *  LIVE PROFILE PAGE  (never shows age, phone, email, or pay handle)
 * ========================================================== */
function renderProfile(helperId) {
  const h = tab("Helpers", HELPER_COLS);
  const hr = findRowByValue(h, H.ID, helperId);
  if (!hr) return profileShell("<div class='pbody'><p>Profile not found.</p></div>");
  const p = hr.row;
  const name = p[H.NAME], leagues = p[H.LEAGUES], sports = p[H.SPORTS], skill = p[H.SKILL],
        prior = Number(p[H.PRIOR]) || 0, gdh = Number(p[H.GDH]) || 0, avg = p[H.AVG], count = Number(p[H.COUNT]) || 0,
        founder = p[H.FOUNDER], payApps = p[H.PAYAPPS];

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
    "<div class='phead'><div class='pname'>" + esc(name) + "</div><span class='pskill'>" + esc(skill) + "</span>" +
    (founder ? "<span class='pskill' style='background:#fff;color:#172B4D;margin-left:8px;'>&#9733; Founding Helper #" + esc(founder) + "</span>" : "") + "</div>" +
    "<div class='pbody'>" +
      section("Sports scored", tags(sports)) +
      section("Leagues served", tags(leagues)) +
      (payApps ? section("Accepts", tags(payApps)) : "") +
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
    "<link href='https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700&family=Inter:wght@400;600;700&display=swap' rel='stylesheet'>" +
    "<style>*{margin:0;padding:0;box-sizing:border-box;}body{font-family:Inter,sans-serif;background:#fff;color:#172B4D;}" +
    ".banner{background:#102A43;color:#fff;text-align:center;font-weight:700;font-size:13px;letter-spacing:.8px;text-transform:uppercase;padding:10px;}" +
    ".wrap{max-width:560px;margin:24px auto;padding:0 18px;}.profile{border:1px solid #e5e7eb;border-radius:18px;overflow:hidden;}" +
    ".phead{background:#0d0d0d;color:#fff;padding:26px 24px;}.pname{font-family:'Barlow Condensed',sans-serif;font-size:32px;letter-spacing:.5px;}" +
    ".pskill{display:inline-block;margin-top:12px;background:#1747C8;color:#fff;font-weight:700;font-size:12px;letter-spacing:1px;text-transform:uppercase;padding:6px 14px;border-radius:999px;}" +
    ".pbody{padding:24px;}.psection{margin-bottom:24px;}.plabel{font-weight:700;text-transform:uppercase;letter-spacing:1.2px;font-size:12px;color:#6b7280;margin-bottom:8px;}" +
    ".tags{display:flex;flex-wrap:wrap;gap:7px;}.tag{background:#f8fafc;border:1px solid #e6e9ee;border-radius:999px;padding:6px 13px;font-weight:600;font-size:13px;}" +
    ".gstats{display:flex;gap:12px;}.gstat{flex:1;background:#f8fafc;border:1px solid #eef0f3;border-radius:14px;padding:18px 14px;text-align:center;}" +
    ".gstat .num{font-family:'Barlow Condensed',sans-serif;font-size:38px;color:#1747C8;}.gstat .lab{font-size:12px;color:#6b7280;font-weight:600;margin-top:6px;}" +
    ".stars{color:#1747C8;letter-spacing:2px;}.rev-empty{background:#f8fafc;border:1px dashed #d8dde4;border-radius:14px;padding:22px;text-align:center;color:#6b7280;font-weight:500;font-size:14px;}" +
    ".rev{border:1px solid #eef0f3;border-radius:14px;padding:16px 18px;margin-bottom:12px;}.rtop{display:flex;justify-content:space-between;margin-bottom:6px;}" +
    ".rdate{font-size:12px;color:#6b7280;font-weight:500;}.rtext{font-size:14px;color:#374151;font-weight:500;}" +
    "</style></head><body><div class='banner'>You coach. We score.</div><div class='wrap'><div class='profile'>" + body + "</div></div></body></html>";
}

/* ==========================================================
 *  EMAIL COPY
 * ========================================================== */
function helperWelcomeBody(name, id, isMinor, founder){
  const f = founder ? "<p style='background:#EEF3FF;border:1.5px solid #1747C8;border-radius:10px;padding:12px;'><strong>&#9733; Founding Helper #" + founder + ".</strong> Only 50 exist. It is on your profile for good.</p>" : "";
  const next = isMinor
    ? "<p><strong>One step left:</strong> we just emailed your parent or guardian a one tap approval. Nudge them. The second they approve, you are active.</p>"
    : "<p><strong>You are active.</strong> Nothing to do now. When a coach in one of your leagues needs a scorekeeper, you get a text or email with the date, field, and pay. Say yes to the ones you want, skip the rest.</p>";
  return f + next +
    "<p><strong>How pay works:</strong> the coach pays you straight to your app after the game, typically $30 or more for a two hour game. GameDay Helpers takes none of it. No cash, ever.</p>" +
    "<p><strong>Three things that get you rebooked:</strong> show up 15 minutes early, phone charged, and text the coach the day before to confirm.</p>" +
    profileLine(id) +
    "<p>Know another kid or parent who can run GameChanger? Forward this. Founding spots are going.</p>";
}
function coachWelcomeBody(name, founder){
  const f = founder ? "<p style='background:#EEF3FF;border:1.5px solid #1747C8;border-radius:10px;padding:12px;'><strong>&#9733; Founding Coach #" + founder + ".</strong> One of the first 50 in Tampa Bay. Free for you for the whole beta.</p>" : "";
  return f +
    "<p><strong>Got a game coming up? Request a helper now:</strong></p>" +
    "<p style='text-align:center;margin:20px 0;'><a href='" + SITE_BASE_URL + "/request-game.html' style='background:#1747C8;color:#fff;text-decoration:none;font-weight:bold;padding:14px 28px;border-radius:10px;display:inline-block;'>Request a scorekeeper</a></p>" +
    "<p>Takes 60 seconds: date, what you need, your offer. " + OWNER_NAME + " personally matches you with a helper from your league and emails you their name, phone, and payment app. You text them, they show up, you pay them after the game, app to app.</p>" +
    "<p><strong>What it costs you:</strong> just the helper's pay, typically $30 or more for a two hour game. Nothing to GameDay Helpers during the Tampa beta.</p>" +
    "<p>Tip: request as early as you can. Two days notice fills every time. Two hours is a coin flip.</p>";
}
function profileLine(id){ return "<p style='font-size:13px;color:#666;'>Your live profile (coaches see this, never your age, phone, or payment handle): <a href='" + profileUrl(id) + "'>" + profileUrl(id) + "</a></p>"; }
function tr(k,v){ return "<tr><td style='padding:4px 12px 4px 0;color:#666;font-weight:bold;white-space:nowrap;'>" + esc(k) + "</td><td style='padding:4px 0;'>" + esc(v == null ? "" : v) + "</td></tr>"; }

function brandWrap(name, msg){
  return "<div style='font-family:Arial,sans-serif;max-width:480px;'>" +
    "<div style='background:#0d0d0d;color:#fff;padding:20px;text-align:center;border-radius:10px 10px 0 0;'>" +
    "<div style='font-size:20px;font-weight:bold;'>GameDay <span style='color:#1747C8;'>Helpers</span></div>" +
    "<div style='color:#D7F75B;font-style:italic;font-size:13px;'>You coach. We score.</div></div>" +
    "<div style='padding:24px;border:1px solid #eee;border-top:none;border-radius:0 0 10px 10px;line-height:1.5;'>" +
    "<p>Hey " + esc(firstName(name) || "there") + ",</p>" + msg +
    "<p>" + OWNER_NAME + "<br>GameDay Helpers, Tampa Bay<br><a href='mailto:" + OWNER_EMAIL + "' style='color:#666;'>" + OWNER_EMAIL + "</a></p></div></div>";
}
function confirmEmail(to, name, body, subject){
  if (!to) return;
  const html = /^<p|^<table|^<div/.test(String(body).trim()) ? body : "<p>" + body + "</p>";
  MailApp.sendEmail({ to: to, name: "GameDay Helpers", replyTo: OWNER_EMAIL, subject: subject, htmlBody: brandWrap(name, html) });
}
function sendReviewEmail(to, name, aboutName, link){
  MailApp.sendEmail({ to: to, name: "GameDay Helpers", replyTo: OWNER_EMAIL, subject: "How was " + aboutName + "? (20 seconds)",
    htmlBody: brandWrap(name,
      "<p>How did your game with <strong>" + esc(aboutName) + "</strong> go?</p>" +
      "<p style='text-align:center;margin:22px 0;'><a href='" + link + "' style='background:#1747C8;color:#fff;text-decoration:none;font-weight:bold;padding:13px 26px;border-radius:10px;display:inline-block;'>Tap a star</a></p>" +
      "<p style='font-size:13px;color:#666;'>Reviews are how the best helpers and coaches get matched first.</p>") });
}
function alertOwner(kind, name, leagues, details){
  MailApp.sendEmail({ to: OWNER_EMAIL, subject: "GDH " + kind + ": " + name + " (" + leagues + ")",
    body: "New " + kind.toLowerCase() + ":\n\nName: " + name + "\n" + details + "\n\nOpen the Sheet to act." });
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
function findRowByValue(sheet, colIdx, value){
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) if (String(rows[i][colIdx]) === String(value)) return { index: i + 1, row: rows[i] };
  return null;
}
function findRowByEmail(sheet, colIdx, email){
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) if (String(rows[i][colIdx]).toLowerCase().trim() === email) return { index: i + 1, row: rows[i] };
  return null;
}
function nextFounderNumber(sheet, colIdx){
  const rows = sheet.getDataRange().getValues();
  let max = 0;
  for (let i = 1; i < rows.length; i++) { const n = Number(rows[i][colIdx]); if (n > max) max = n; }
  return max < FOUNDER_LIMIT ? max + 1 : 0;
}
function cleanupTestRows(){
  ["Helpers","Coaches","Games","Leagues","Reviews"].forEach(function(n){
    const s = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(n); if (!s) return;
    const rows = s.getDataRange().getValues();
    for (let i = rows.length - 1; i >= 1; i--) if (rows[i].some(v => /TEST_/i.test(String(v)))) s.deleteRow(i + 1);
  });
}
function json(obj){ return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
function num(v){ const n = parseInt(v,10); return isNaN(n)?0:n; }
function firstName(n){ return String(n||"").split(" ")[0]; }
function esc(s){ return String(s == null ? "" : s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
function makeHelperId(name){
  const base = String(name||"helper").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,"").slice(0,18) || "helper";
  return base + "-" + Math.random().toString(36).slice(2,6);
}
function profileUrl(id){ return ScriptApp.getService().getUrl() + "?p=" + encodeURIComponent(id); }
function reviewUrl(gameId, revId, revName, revRole, reviewerRole){
  return SITE_BASE_URL + "/review.html?g=" + encodeURIComponent(gameId) + "&rev=" + encodeURIComponent(revId) +
    "&revname=" + encodeURIComponent(revName||"") + "&role=" + revRole + "&by=" + reviewerRole;
}

/* ---------------- SMOKE TEST (run from editor after deploy) ---------------- */
function smokeTest(){
  const r1 = handleHelper({name:"TEST_ Helper Adult",age:"22",email:"test_adult@example.com",phone:"813-555-0100",leagues:"Bayshore",sports:"Baseball",roles:"Run GameChanger",skill:"Experienced",priorGames:"12",availability:"Saturdays",notes:"",payApps:"Venmo",payHandle:"@test",agreeTerms:true});
  const r2 = handleCoach({name:"TEST_ Coach",email:"test_coach@example.com",phone:"813-555-0101",team:"TEST_ Tigers",leagues:"Bayshore",notes:"",payApps:"Zelle",payHandle:"813-555-0101"});
  const r3 = handleGameRequest({coachEmail:"test_coach@example.com",datetime:"2026-09-20T18:00",notes:"Run GameChanger",field:"TEST_ Field 3",firstRate:"20",addlRate:"15",length:"2",offer:"35.00"});
  Logger.log(JSON.stringify([r1,r2,r3]));
}
