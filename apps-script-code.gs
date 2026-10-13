/**
 * ============================================================
 *  GAMEDAY HELPERS - FULL BACKEND  (Google Apps Script)
 *  v22 - match board no longer wipes HelperID after sending; status page shows full contact card (Oct 2, 2026)
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
const OWNER_NAME         = "The GameDay Helpers team";   // used only in the email signature
const OWNER_CELL         = "";   // optional, shown in match emails so both sides can text you
const ADMIN_KEY          = "";   // set in the editor only. Unlocks match.html. Empty = match board disabled.

/* ---------------- COLUMN MAPS (1-indexed) ---------------- */
const HELPER_COLS = ["Submitted","HelperID","Name","Age (private)","Email","Phone",
  "Leagues","Sports","Roles","Skill","PriorGames","GDHGames","AvgRating","ReviewCount",
  "Availability","Notes","Approved?",
  "PayApps","PayHandle (private)","Minor?","ParentName","ParentEmail","ConsentStatus","ConsentToken",
  "Founder#","AgreedTerms","AccessToken","Source","ParentPhone"];
const COACH_COLS  = ["Submitted","Name","Email","Phone","Team","Leagues","Notes","Contacted?",
  "PayApps","PayHandle (private)","Founder#","AccessToken","GCLink"];
const GAME_COLS   = ["GameID","DateTime","Sport","Field","CoachName","CoachEmail",
  "HelperID","HelperName","HelperEmail","ReviewSent",
  "Needs","League","Team","CoachPhone","FirstRate","AddlRate","Length","Offer","Status","MatchSent","Requested","GCLink"];
const LEAGUE_COLS = ["Submitted","Name","Org","Email","Phone","Notes","Contacted?"];
const REVIEW_COLS = ["Submitted","GameID","RevieweeID","RevieweeRole","ReviewerRole","Stars","Comment"];

// Helper column indexes (0-based) used in lookups
const H = {ID:1,NAME:2,AGE:3,EMAIL:4,PHONE:5,LEAGUES:6,SPORTS:7,ROLES:8,SKILL:9,PRIOR:10,GDH:11,
  AVG:12,COUNT:13,AVAIL:14,NOTES:15,APPROVED:16,PAYAPPS:17,PAYHANDLE:18,MINOR:19,PNAME:20,PEMAIL:21,
  CONSENT:22,TOKEN:23,FOUNDER:24,ACCESS:26,SOURCE:27,PPHONE:28};
const C = {SUB:0,NAME:1,EMAIL:2,PHONE:3,TEAM:4,LEAGUES:5,NOTES:6,CONTACTED:7,PAYAPPS:8,PAYHANDLE:9,FOUNDER:10,ACCESS:11,GCLINK:12};
const G = {ID:0,DT:1,SPORT:2,FIELD:3,CNAME:4,CEMAIL:5,HID:6,HNAME:7,HEMAIL:8,REVSENT:9,
  NEEDS:10,LEAGUE:11,TEAM:12,CPHONE:13,FIRST:14,ADDL:15,LEN:16,OFFER:17,STATUS:18,MATCHSENT:19,REQ:20,GCLINK:21};

/* ==========================================================
 *  ROUTER
 * ========================================================== */
function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    let data;
    try { data = JSON.parse((e && e.postData && e.postData.contents) || "{}"); }
    catch (parseErr) { need(false, "Bad JSON"); }   // bot garbage: reject quietly, no owner email
    const type = String(data.type || "HELPER").toUpperCase();
    let out;
    if (type === "COACH")            out = handleCoach(data);
    else if (type === "GAMEREQUEST") out = handleGameRequest(data);
    else if (type === "LEAGUE")      out = handleLeague(data);
    else if (type === "REVIEW")      out = handleReview(data);
    else if (type === "HELPER")      out = handleHelper(data);
    else if (type === "LOGIN")       out = handleLogin(data);
    else if (type === "MATCH")       out = adminMatch(data);
    else if (type === "APPROVE")     out = adminApprove(data);
    else if (type === "UNFILL")      out = adminUnfill(data);
    else if (type === "CANCEL")      out = adminCancel(data);
    else if (type === "RESEND")      out = adminResend(data);
    else if (type === "NOTE")        out = adminNote(data);
    else if (type === "GCLINK")      out = adminGcLink(data);
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
  if (p.p && p.format === "json") return json(profileData(p.p));
  if (p.op === "board") return json(adminBoard(p.key));
  if (p.me) return json(statusData(p.me));
  if (p.p) return HtmlService.createHtmlOutput(renderProfile(p.p))
      .setTitle("Helper Profile | GameDay Helpers").addMetaTag("viewport","width=device-width, initial-scale=1.0");
  return HtmlService.createHtmlOutput("<p style='font-family:sans-serif'>GameDay Helpers.</p>");
}

/* ==========================================================
 *  VALIDATION
 * ========================================================== */
function clean(v, max){ return String(v == null ? "" : v).trim().slice(0, max || 300); }
function validEmail(s){ return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s); }
function cleanUrl(s){ s = clean(s, 300); return /^https?:\/\/\S+$/i.test(s) ? s : ""; }
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
    confirmEmail(email, name, helperWelcomeBody(row[H.NAME], row[H.ID], row[H.MINOR] === "YES", row[H.FOUNDER]), "You're already on the team");
    return { result: "success", helperId: row[H.ID], founder: row[H.FOUNDER] || 0, duplicate: true };
  }

  const isMinor = age < 18;
  const parentName = clean(d.parentName, 80), parentEmail = clean(d.parentEmail, 120).toLowerCase(), parentPhone = cleanPhone(d.parentPhone);
  if (isMinor) need(parentName && validEmail(parentEmail) && parentPhone, "Parent name, email, and cell required for helpers under 18");

  const id = makeHelperId(name);
  const token = isMinor ? Utilities.getUuid() : "";
  const founder = nextFounderNumber(sheet, H.FOUNDER);

  sheet.appendRow([new Date(), id, name, age, email, phone,
    clean(d.leagues), clean(d.sports), clean(d.roles), clean(d.skill, 60), num(d.priorGames), 0, "", 0,
    clean(d.availability), clean(d.notes, 1000), "NO",
    clean(d.payApps), clean(d.payHandle, 80), isMinor ? "YES" : "NO", parentName, parentEmail,
    isMinor ? "PENDING" : "N/A", token, founder || "", "YES", Utilities.getUuid(), clean(d.source, 40), isMinor ? parentPhone : ""]);

  confirmEmail(email, name, helperWelcomeBody(name, id, isMinor, founder) + statusLine(email),
    founder ? "You're Founding Helper #" + founder + " of 50" : (isMinor ? "One step left: parent approval" : "You're on the team"));
  if (isMinor) sendParentConsent(parentEmail, parentName, name, token);

  alertOwner("HELPER", name, clean(d.leagues),
    "Age: " + age + (isMinor ? " (MINOR, consent pending)\nParent: " + parentName + ", " + parentPhone : "") + "\nEmail: " + email + "\nPhone: " + phone +
    "\nLeagues: " + clean(d.leagues) + "\nSports: " + clean(d.sports) + "\nRoles: " + clean(d.roles) +
    "\nSkill: " + clean(d.skill) + "\nPrior games: " + num(d.priorGames) +
    "\nPay apps: " + clean(d.payApps) + "\nAvailability: " + clean(d.availability) + "\nNotes: " + clean(d.notes) +
    (founder ? "\nFounding Helper #" + founder : "") + "\nSource: " + (clean(d.source, 40) || "direct") + "\nProfile: " + profileUrl(id));

  return { result: "success", helperId: id, founder: founder || 0, profileUrl: profileUrl(id) };
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
    clean(d.payApps), clean(d.payHandle, 80), founder || "", Utilities.getUuid(), cleanUrl(d.gcLink)]);

  confirmEmail(email, name, coachWelcomeBody(name, founder) + statusLine(email), "You're registered. Here is the honest timeline");
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
  const gcLink = cleanUrl(d.gcLink) || (c ? String(c.row[C.GCLINK] || "") : "");

  const games = tab("Games", GAME_COLS);
  const gameId = "G" + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyMMdd") + "-" + Math.random().toString(36).slice(2,6).toUpperCase();
  const dt = new Date(clean(d.datetime));
  games.appendRow([gameId, isNaN(dt.getTime()) ? clean(d.datetime) : dt, "", clean(d.field, 120), coachName, email,
    "", "", "", "",
    clean(d.notes), league, team, cphone, num(d.firstRate), num(d.addlRate), clean(d.length, 5), clean(d.offer, 10), "OPEN", "", new Date(), gcLink]);

  const when = isNaN(dt.getTime()) ? clean(d.datetime) : Utilities.formatDate(dt, Session.getScriptTimeZone(), "EEE MMM d, h:mm a");
  const body =
    "<p>Got it. Here is what we are lining up:</p>" +
    "<table style='border-collapse:collapse;font-size:14px;'>" +
    tr("Game", when) + tr("Field", clean(d.field) || "TBD") + tr("You need", clean(d.notes)) +
    tr("Your offer", "$" + clean(d.offer) + " (" + clean(d.length) + " hr, $" + num(d.firstRate) + " first hour, $" + num(d.addlRate) + " each additional)") +
    "</table>" +
    "<p><strong>What happens next:</strong> We are still building the helper roster (test games this fall and winter, full launch spring 2027), so there may not be a helper for this game yet. We will email you either way. A helper is not confirmed yet. If one accepts, you will get one email with your helper's name, phone, and payment app. Then you two text each other and lock it in.</p>" +
    "<p>Pay your helper directly after the game, app to app. No cash.</p>" +
    (c ? "" : "<p style='color:#b45309;'><strong>Heads up:</strong> we could not find a coach profile under this email. Take 60 seconds and <a href='" + SITE_BASE_URL + "/coaches.html'>create one</a> so we can match you faster.</p>") +
    (gcLink ? "" : "<p style='color:#b45309;'><strong>One thing missing:</strong> we do not have a GameChanger team link for this game. Reply to this email with it so your helper can join the team before first pitch.</p>") +
    "<p>Need to change anything? Reply to this email.</p>" + statusLine(email);
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
    "<p>Thanks for reaching out about <strong>" + esc(org) + "</strong>. We will reach out soon to talk through covering your fields.</p>" +
    "<p>Quick preview of how it works for leagues: your coaches request helpers, a real person matches them, and coaches pay helpers directly. GameDay Helpers is free for coaches and helpers during the Tampa beta. We can walk through it on a quick call.</p>",
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
      "<p><strong>How it works:</strong> a coach requests a scorekeeper, we match your kid to a game in a league they chose, the coach pays them directly through Venmo, Cash App, PayPal or Zelle after the game. Two hour offers start at $35, set by the coach. No cash. You and your kid decide which games to take. A real person makes every match and you can reach us any time.</p>" +
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
        confirmEmail(email, name, "<p>Your parent or guardian just approved you, so your profile is ready. " + BETA_TIMELINE + "</p>" + profileLine(rows[i][H.ID]), "You're approved");
        confirmEmail(pemail, pname, "<p>Thanks. " + esc(firstName(name)) + " is approved on GameDay Helpers. We are building the roster now, running a few test games this fall and winter, and launching in spring 2027. You will only hear from us again if " + esc(firstName(name)) + " is offered a game. Questions any time: " + OWNER_EMAIL + "</p>", "Approved: " + firstName(name) + " is approved");
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

  // ONE shared email: coach + helper (+ parent if minor), owner CC'd. Reply-all = group thread.
  const isMinor = h[H.MINOR] === "YES";
  const hFirst = esc(firstName(h[H.NAME])), cFirst = esc(firstName(coachName));
  const recipients = [row[G.CEMAIL], h[H.EMAIL]].concat(isMinor && h[H.PEMAIL] ? [h[H.PEMAIL]] : []).filter(Boolean);
  const who = "<table style='border-collapse:collapse;font-size:14px;'>" +
    tr("Coach", coachName) + tr("Coach phone", coachPhone) + tr("Coach pays via", coachPay) +
    tr("Helper", h[H.NAME]) + tr("Helper phone", h[H.PHONE]) +
    tr("Helper gets paid via", h[H.PAYAPPS] + (h[H.PAYHANDLE] ? " (" + h[H.PAYHANDLE] + ")" : "")) +
    (isMinor ? tr("Parent", h[H.PNAME]) + tr("Parent cell", h[H.PPHONE] || "") + tr("Parent email", h[H.PEMAIL]) : "") + "</table>";
  const gcLink = String(row[G.GCLINK] || (cr ? cr.row[C.GCLINK] : "") || "");
  const gcBlock = gcLink
    ? "<p style='background:#EEF3FF;border-left:4px solid #1747C8;padding:10px 12px;'><strong>GameChanger access, do this today:</strong><br>" +
      "1. " + hFirst + ": tap <a href='" + gcLink + "'>this team link</a> and request to follow the team.<br>" +
      "2. Coach " + cFirst + ": in GameChanger open the team, go to Staff, and make " + hFirst + " a scorekeeper. Never share your password.</p>"
    : "<p style='background:#FFF8E1;border-left:4px solid #D7F75B;padding:10px 12px;'><strong>GameChanger access:</strong> Coach " + cFirst + ", reply all with your team's GameChanger link so " + hFirst + " can follow the team, then add them as a scorekeeper under Staff.</p>";
  const minorRules = isMinor
    ? "<p style='background:#FFF8E1;border-left:4px solid #D7F75B;padding:10px 12px;'><strong>" + hFirst + " is under 18, so two rules:</strong><br>" +
      "1. Group texts only. Coach, " + hFirst + ", and " + esc(firstName(h[H.PNAME]) || "parent") + " on every thread. No one-on-one texts.<br>" +
      "2. " + hFirst + " gets to and from the field on their own or with family. Coaches never drive helpers.</p>"
    : "";
  const body =
    "<p><strong>Game on.</strong> Everyone who needs to know is on this email. Reply all to keep it in one thread.</p>" +
    who + details + minorRules + gcBlock +
    "<p><strong>Coach " + cFirst + ":</strong> start a " + (isMinor ? "group " : "") + "text to confirm and share the GameChanger team invite. After the game, pay " + offer + " straight to " + hFirst + "'s app. No cash.</p>" +
    "<p><strong>" + hFirst + ":</strong> confirm when the coach texts, accept the GameChanger invite, and show up 15 minutes early, phone charged.</p>" +
    "<p><strong>Cancellations:</strong> coach cancels at least two hours before arrival time, nothing owed. Later than that, including a rainout, $15 that day. If the game started, pay for time worked at the agreed rates, $15 minimum.</p>" +
    "<p>Review links go out a few hours after first pitch. Problem? Reply all" + (OWNER_CELL ? " or text us at " + OWNER_CELL : "") + ".</p>" +
    profileLine(h[H.ID]) + "<p style='font-size:13px;color:#666;'>Both of you can see this game any time at <a href='" + SITE_BASE_URL + "/me.html'>gamedayhelpers.com/me.html</a> (enter your email for a private link).</p>";
  MailApp.sendEmail({ to: recipients.join(","), cc: OWNER_EMAIL, name: "GameDay Helpers",
    subject: "GAME ON: " + firstName(h[H.NAME]) + " + Coach " + firstName(coachName) + ", " + dt,
    htmlBody: brandWrap("team", body) });

  g.getRange(rowNum, G.STATUS + 1).setValue("MATCHED");
  g.getRange(rowNum, G.MATCHSENT + 1).setValue(new Date());
  g.getRange(rowNum, G.HNAME + 1).setValue(h[H.NAME]);
  g.getRange(rowNum, G.HEMAIL + 1).setValue(h[H.EMAIL]);
  return MATCH_OK + " to " + coachName + ", " + h[H.NAME] + (isMinor ? ", and parent " + h[H.PNAME] : "") + ".";
}
// One source of truth for "did the match email go out". adminMatch and adminResend both read it.
const MATCH_OK = "Match email sent";
function matchSent(msg){ return String(msg || "").indexOf(MATCH_OK) === 0; }

// A MATCHED game must carry its HelperID. Older board sends cleared it after emailing, which hid the
// helper from both status pages and skipped review emails. Refill it from HelperEmail.
function healHelperIds(){
  const g = tab("Games", GAME_COLS), rows = g.getDataRange().getValues();
  let hs = null, fixed = 0;
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (r[G.STATUS] !== "MATCHED" || r[G.HID] || !r[G.HEMAIL]) continue;
    hs = hs || tab("Helpers", HELPER_COLS);
    const hr = findRowByEmail(hs, H.EMAIL, String(r[G.HEMAIL]).toLowerCase().trim());
    if (hr) { g.getRange(i + 1, G.HID + 1).setValue(hr.row[H.ID]); fixed++; }
  }
  return fixed;
}
// The helper on a game row: by HelperID, or by HelperEmail when the ID is blank.
function gameHelper(hs, r){
  if (r[G.HID]) return findRowByValue(hs, H.ID, r[G.HID]);
  return r[G.HEMAIL] ? findRowByEmail(hs, H.EMAIL, String(r[G.HEMAIL]).toLowerCase().trim()) : null;
}

/* ==========================================================
 *  STATUS PAGES (me.html). One private token per person, sent by email only.
 * ========================================================== */
function statusLine(email){ return "<p style='font-size:13px;color:#666;'>See your games and status any time: <a href='" + SITE_BASE_URL + "/me.html'>gamedayhelpers.com/me.html</a> (enter " + esc(email) + " and we email you a private link).</p>"; }
function ensureToken(sheet, rowIndex, col, current){
  if (current) return String(current);
  const t = Utilities.getUuid(); sheet.getRange(rowIndex, col + 1).setValue(t); return t;
}
function handleLogin(d){
  const email = clean(d.email, 120).toLowerCase();
  need(validEmail(email), "Invalid email");
  const hs = tab("Helpers", HELPER_COLS), cs = tab("Coaches", COACH_COLS);
  const hr = findRowByEmail(hs, H.EMAIL, email), cr = findRowByEmail(cs, C.EMAIL, email);
  const links = [];
  if (hr) links.push({ role: "helper", name: hr.row[H.NAME], token: ensureToken(hs, hr.index, H.ACCESS, hr.row[H.ACCESS]) });
  if (cr) links.push({ role: "coach", name: cr.row[C.NAME], token: ensureToken(cs, cr.index, C.ACCESS, cr.row[C.ACCESS]) });
  if (links.length) {
    const body = links.map(l => "<p style='text-align:center;margin:18px 0;'><a href='" + SITE_BASE_URL + "/me.html?t=" + encodeURIComponent(l.token) + "' style='background:#1747C8;color:#fff;text-decoration:none;font-weight:bold;padding:14px 28px;border-radius:10px;display:inline-block;'>Open my " + l.role + " status</a></p>").join("") +
      "<p style='font-size:13px;color:#666;'>This link is private to you. Do not forward it. If you did not request it, ignore this email.</p>";
    confirmEmail(email, links[0].name, "<p>Here is your private GameDay Helpers link.</p>" + body, "Your GameDay Helpers status link");
  }
  // Always the same answer, so nobody can probe which emails are registered.
  return { result: "success" };
}
function statusData(token){
  token = clean(token, 60); if (!token) return { result: "notfound" };
  const hs = tab("Helpers", HELPER_COLS), cs = tab("Coaches", COACH_COLS), gs = tab("Games", GAME_COLS);
  const hr = findRowByValue(hs, H.ACCESS, token), cr = findRowByValue(cs, C.ACCESS, token);
  if (!hr && !cr) return { result: "notfound" };
  const tz = Session.getScriptTimeZone();
  const gRows = gs.getDataRange().getValues();
  const fmt = v => v instanceof Date ? Utilities.formatDate(v, tz, "EEE MMM d, h:mm a") : String(v || "");
  const out = { result: "success" };
  if (hr) {
    const h = hr.row;
    out.helper = { name: h[H.NAME], id: h[H.ID], profileUrl: profileUrl(h[H.ID]), skill: h[H.SKILL], leagues: h[H.LEAGUES], roles: h[H.ROLES], avail: h[H.AVAIL],
      approved: h[H.APPROVED] === "YES", minor: h[H.MINOR] === "YES", consent: h[H.CONSENT], founder: h[H.FOUNDER] || "", phone: h[H.PHONE], email: h[H.EMAIL], parentName: h[H.PNAME], parentPhone: h[H.PPHONE] || "", gdh: Number(h[H.GDH]) || 0, avg: h[H.AVG] === "" ? null : Number(h[H.AVG]), count: Number(h[H.COUNT]) || 0, games: [] };
    const hEmail = String(h[H.EMAIL]).toLowerCase().trim();
    for (let i = 1; i < gRows.length; i++) { const r = gRows[i];
      const matched = r[G.STATUS] === "MATCHED" || r[G.STATUS] === "DONE";
      const mine = r[G.HID] ? String(r[G.HID]) === String(h[H.ID]) : (matched && hEmail && String(r[G.HEMAIL]).toLowerCase().trim() === hEmail);
      if (!mine) continue;
      const cr2 = findRowByEmail(cs, C.EMAIL, String(r[G.CEMAIL]).toLowerCase());
      out.helper.games.push({ gcLink: matched ? String(r[G.GCLINK] || (cr2 ? cr2.row[C.GCLINK] : "") || "") : "", id: r[G.ID], when: fmt(r[G.DT]), whenIso: r[G.DT] instanceof Date ? r[G.DT].toISOString() : "", field: r[G.FIELD], league: r[G.LEAGUE], team: r[G.TEAM], needs: r[G.NEEDS], offer: r[G.OFFER], status: r[G.STATUS],
        coach: matched ? { name: r[G.CNAME] || (cr2 ? cr2.row[C.NAME] : ""), phone: r[G.CPHONE] || (cr2 ? cr2.row[C.PHONE] : ""), email: r[G.CEMAIL], payApps: cr2 ? cr2.row[C.PAYAPPS] : "" } : null }); }
  }
  if (cr) {
    const c = cr.row;
    out.coach = { name: c[C.NAME], team: c[C.TEAM], leagues: c[C.LEAGUES], founder: c[C.FOUNDER] || "", email: c[C.EMAIL], games: [] };
    for (let i = 1; i < gRows.length; i++) { const r = gRows[i]; if (String(r[G.CEMAIL]).toLowerCase() !== String(c[C.EMAIL]).toLowerCase()) continue;
      const matched = r[G.STATUS] === "MATCHED" || r[G.STATUS] === "DONE";
      let helper = null;
      if (matched) { const h2 = gameHelper(hs, r); if (h2) { const x = h2.row, minor = x[H.MINOR] === "YES";
        // Same facts the GAME ON email carries. Age itself is never sent, only the under-18 flag.
        helper = { name: x[H.NAME], phone: x[H.PHONE], email: x[H.EMAIL], payApps: x[H.PAYAPPS], payHandle: x[H.PAYHANDLE], profileUrl: profileUrl(x[H.ID]), minor: minor,
          parentName: minor ? x[H.PNAME] : "", parentPhone: minor ? (x[H.PPHONE] || "") : "", parentEmail: minor ? x[H.PEMAIL] : "" }; } }
      out.coach.games.push({ gcLink: String(r[G.GCLINK] || c[C.GCLINK] || ""), id: r[G.ID], when: fmt(r[G.DT]), whenIso: r[G.DT] instanceof Date ? r[G.DT].toISOString() : "", field: r[G.FIELD], needs: r[G.NEEDS], offer: r[G.OFFER], status: r[G.STATUS], helper: helper }); }
  }
  return out;
}

/* ==========================================================
 *  MATCH BOARD (match.html). Every call needs ADMIN_KEY.
 * ========================================================== */
function adminOk(key){ return ADMIN_KEY && key && String(key) === ADMIN_KEY; }
function adminBoard(key){
  if (!adminOk(key)) return { result: "error", message: "Bad key" };
  const tz = Session.getScriptTimeZone();
  try { healHelperIds(); } catch (_) {}
  const gRows = tab("Games", GAME_COLS).getDataRange().getValues();
  const games = [];
  for (let i = 1; i < gRows.length; i++) {
    const r = gRows[i]; if (!r[G.ID]) continue;
    const dt = r[G.DT] instanceof Date ? r[G.DT] : new Date(r[G.DT]);
    const req = r[G.REQ] instanceof Date ? r[G.REQ] : null;
    games.push({ row: i + 1, id: r[G.ID], when: isNaN(dt.getTime()) ? String(r[G.DT]) : dt.toISOString(),
      requested: req ? req.toISOString() : idDate(r[G.ID]), matchSent: r[G.MATCHSENT] instanceof Date ? r[G.MATCHSENT].toISOString() : "",
      firstRate: Number(r[G.FIRST]) || 0, addlRate: Number(r[G.ADDL]) || 0,
      whenText: isNaN(dt.getTime()) ? String(r[G.DT]) : Utilities.formatDate(dt, tz, "EEE MMM d, h:mm a"),
      field: r[G.FIELD], coach: r[G.CNAME], coachEmail: r[G.CEMAIL], coachPhone: r[G.CPHONE], league: r[G.LEAGUE], team: r[G.TEAM],
      needs: r[G.NEEDS], offer: r[G.OFFER], length: r[G.LEN], status: r[G.STATUS] || "OPEN", helperId: r[G.HID], helperName: r[G.HNAME],
      reviewSent: r[G.REVSENT] instanceof Date ? r[G.REVSENT].toISOString() : "", gcLink: String(r[G.GCLINK] || "") });
  }
  const hRows = tab("Helpers", HELPER_COLS).getDataRange().getValues();
  const helpers = [];
  for (let i = 1; i < hRows.length; i++) {
    const h = hRows[i]; if (!h[H.ID]) continue;
    helpers.push({ row: i + 1, id: h[H.ID], name: h[H.NAME], submitted: h[0] instanceof Date ? h[0].toISOString() : "", leagues: String(h[H.LEAGUES] || ""), sports: String(h[H.SPORTS] || ""),
      roles: String(h[H.ROLES] || ""), skill: h[H.SKILL], prior: Number(h[H.PRIOR]) || 0, gdh: Number(h[H.GDH]) || 0,
      avg: h[H.AVG] === "" ? null : Number(h[H.AVG]), count: Number(h[H.COUNT]) || 0, avail: String(h[H.AVAIL] || ""),
      approved: h[H.APPROVED] === "YES", minor: h[H.MINOR] === "YES", consent: h[H.CONSENT], founder: h[H.FOUNDER] || "", phone: h[H.PHONE], email: h[H.EMAIL], parentName: h[H.PNAME], parentPhone: h[H.PPHONE] || "",
      notes: String(h[H.NOTES] || "").slice(0, 200) });
  }
  const cRows = tab("Coaches", COACH_COLS).getDataRange().getValues();
  const coaches = [];
  for (let i = 1; i < cRows.length; i++) {
    const c = cRows[i]; if (!c[C.EMAIL]) continue;
    coaches.push({ row: i + 1, name: c[C.NAME], email: String(c[C.EMAIL]).toLowerCase(), phone: c[C.PHONE], team: c[C.TEAM], leagues: String(c[C.LEAGUES] || ""),
      submitted: c[C.SUB] instanceof Date ? c[C.SUB].toISOString() : "", contacted: c[C.CONTACTED], founder: c[C.FOUNDER] || "", payApps: c[C.PAYAPPS], gcLink: String(c[C.GCLINK] || "") });
  }
  const lRows = tab("Leagues", LEAGUE_COLS).getDataRange().getValues();
  const leagues = [];
  for (let i = 1; i < lRows.length; i++) { const l = lRows[i]; if (!l[2]) continue; leagues.push({ submitted: l[0] instanceof Date ? l[0].toISOString() : "", name: l[1], org: l[2], email: l[3], contacted: l[6] }); }
  const rRows = tab("Reviews", REVIEW_COLS).getDataRange().getValues();
  const reviews = [];
  for (let i = 1; i < rRows.length; i++) { const r = rRows[i]; if (!r[1]) continue; reviews.push({ submitted: r[0] instanceof Date ? r[0].toISOString() : "", gameId: r[1], revieweeId: r[2], revieweeRole: r[3], stars: Number(r[5]) || 0, comment: String(r[6] || "").slice(0, 200) }); }
  return { result: "success", games: games, helpers: helpers, coaches: coaches, leagues: leagues, reviews: reviews, generated: new Date().toISOString() };
}
// Games created before the Requested column existed: date from the GameID (GyyMMdd-XXXX), day precision.
function idDate(id){ const m = /^G(\d{2})(\d{2})(\d{2})-/.exec(String(id || "")); return m ? new Date(2000 + Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12).toISOString() : ""; }
function adminMatch(d){
  if (!adminOk(d.key)) return { result: "error", message: "Bad key" };
  const g = tab("Games", GAME_COLS);
  const gr = findRowByValue(g, G.ID, clean(d.gameId, 40));
  if (!gr) return { result: "error", message: "Game not found" };
  if (gr.row[G.STATUS] === "MATCHED" || gr.row[G.STATUS] === "DONE") return { result: "error", message: "Game already " + gr.row[G.STATUS] };
  g.getRange(gr.index, G.HID + 1).setValue(clean(d.helperId, 120));
  const msg = sendMatchEmails(gr.index);
  const ok = matchSent(msg);
  if (!ok) g.getRange(gr.index, G.HID + 1).setValue("");
  return { result: ok ? "success" : "error", message: msg };
}
function adminApprove(d){
  if (!adminOk(d.key)) return { result: "error", message: "Bad key" };
  const h = tab("Helpers", HELPER_COLS);
  const hr = findRowByValue(h, H.ID, clean(d.helperId, 120));
  if (!hr) return { result: "error", message: "Helper not found" };
  h.getRange(hr.index, H.APPROVED + 1).setValue(d.approved === false ? "NO" : "YES");
  return { result: "success", message: (d.approved === false ? "Unapproved " : "Approved ") + hr.row[H.NAME] };
}
function adminCancel(d){
  if (!adminOk(d.key)) return { result: "error", message: "Bad key" };
  const g = tab("Games", GAME_COLS);
  const gr = findRowByValue(g, G.ID, clean(d.gameId, 40));
  if (!gr) return { result: "error", message: "Game not found" };
  const r = gr.row, reason = clean(d.reason, 200);
  g.getRange(gr.index, G.STATUS + 1).setValue("CANCELLED");
  const when = r[G.DT] instanceof Date ? Utilities.formatDate(r[G.DT], Session.getScriptTimeZone(), "EEE MMM d, h:mm a") : String(r[G.DT]);
  const body = "<p>The game on <strong>" + esc(when) + "</strong>" + (r[G.FIELD] ? " at " + esc(r[G.FIELD]) : "") + " is cancelled." + (reason ? " Reason: " + esc(reason) + "." : "") + "</p>" +
    "<p>Reminder on the cancellation rule: cancelled at least two hours before the helper's arrival time, nothing is owed. Later than that, including a rainout, the coach pays the helper $15 that day.</p>";
  const to = [r[G.CEMAIL], r[G.HEMAIL]].filter(Boolean);
  if (r[G.HID]) { const h = findRowByValue(tab("Helpers", HELPER_COLS), H.ID, r[G.HID]); if (h && h.row[H.MINOR] === "YES" && h.row[H.PEMAIL]) to.push(h.row[H.PEMAIL]); }
  if (to.length) MailApp.sendEmail({ to: to.join(","), cc: OWNER_EMAIL, name: "GameDay Helpers", replyTo: OWNER_EMAIL, subject: "Cancelled: " + when, htmlBody: brandWrap("team", body) });
  return { result: "success", message: "Cancelled " + r[G.ID] + (to.length ? " and emailed " + to.length + " people" : "") };
}
function adminResend(d){
  if (!adminOk(d.key)) return { result: "error", message: "Bad key" };
  const g = tab("Games", GAME_COLS);
  const gr = findRowByValue(g, G.ID, clean(d.gameId, 40));
  if (!gr) return { result: "error", message: "Game not found" };
  if (!gr.row[G.HID]) return { result: "error", message: "No helper on this game yet" };
  const msg = sendMatchEmails(gr.index);
  return { result: matchSent(msg) ? "success" : "error", message: msg };
}
function adminNote(d){
  if (!adminOk(d.key)) return { result: "error", message: "Bad key" };
  const g = tab("Games", GAME_COLS);
  const gr = findRowByValue(g, G.ID, clean(d.gameId, 40));
  if (!gr) return { result: "error", message: "Game not found" };
  g.getRange(gr.index, G.NEEDS + 1).setValue(clean(d.needs, 500));
  return { result: "success", message: "Saved" };
}
function adminGcLink(d){
  if (!adminOk(d.key)) return { result: "error", message: "Bad key" };
  const g = tab("Games", GAME_COLS);
  const gr = findRowByValue(g, G.ID, clean(d.gameId, 40));
  if (!gr) return { result: "error", message: "Game not found" };
  const link = cleanUrl(d.gcLink); if (!link) return { result: "error", message: "Paste a full https:// link" };
  g.getRange(gr.index, G.GCLINK + 1).setValue(link);
  return { result: "success", message: "GameChanger link saved" };
}
function adminUnfill(d){
  if (!adminOk(d.key)) return { result: "error", message: "Bad key" };
  const g = tab("Games", GAME_COLS);
  const gr = findRowByValue(g, G.ID, clean(d.gameId, 40));
  if (!gr) return { result: "error", message: "Game not found" };
  if (gr.row[G.STATUS] !== "OPEN") return { result: "error", message: "Only OPEN games can be marked unfilled" };
  g.getRange(gr.index, G.STATUS + 1).setValue("UNFILLED");
  const when = gr.row[G.DT] instanceof Date ? Utilities.formatDate(gr.row[G.DT], Session.getScriptTimeZone(), "EEE MMM d, h:mm a") : String(gr.row[G.DT]);
  confirmEmail(gr.row[G.CEMAIL], gr.row[G.CNAME] || "Coach",
    "<p>We could not find an available helper for your game on <strong>" + esc(when) + "</strong>. Sorry about that.</p>" +
    "<p>More notice helps a lot. Request your next game as early as you can and we will do our best.</p>",
    "No helper available: " + when);
  return { result: "success", message: "Marked unfilled and emailed " + gr.row[G.CEMAIL] };
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
  try { healHelperIds(); } catch (_) {}
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
// Public JSON for profile.html. Same fields the HTML profile shows, nothing private.
function profileData(helperId) {
  const h = tab("Helpers", HELPER_COLS);
  const hr = findRowByValue(h, H.ID, helperId);
  if (!hr) return { result: "notfound" };
  const p = hr.row;
  const rev = tab("Reviews", REVIEW_COLS).getDataRange().getValues();
  const reviews = [];
  for (let i = 1; i < rev.length; i++) {
    if (rev[i][2] == helperId && rev[i][3] === "helper") {
      reviews.unshift({ stars: Number(rev[i][5]) || 0,
        when: rev[i][0] instanceof Date ? Utilities.formatDate(rev[i][0], Session.getScriptTimeZone(), "MMM yyyy") : "",
        comment: String(rev[i][6] || "") });
    }
  }
  return { result: "success", name: String(p[H.NAME]), skill: String(p[H.SKILL]), founder: p[H.FOUNDER] || "",
    sports: String(p[H.SPORTS] || ""), leagues: String(p[H.LEAGUES] || ""), payApps: String(p[H.PAYAPPS] || ""),
    gdhGames: Number(p[H.GDH]) || 0, priorGames: Number(p[H.PRIOR]) || 0,
    avg: p[H.AVG] === "" ? null : Number(p[H.AVG]), count: Number(p[H.COUNT]) || 0, reviews: reviews };
}

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
    (founder ? "<span class='pskill' style='background:#102A43;color:#D7F75B;border:2px solid #D7F75B;margin-left:8px;box-shadow:0 0 0 3px rgba(215,247,91,.25);'>&#9733; Founding 50 &middot; #" + esc(founder) + "</span>" : "") + "</div>" +
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
const HELPER_SHARE_URL = SITE_BASE_URL + "/helper.html?ref=share";
const BETA_TIMELINE = "Right now we are building the roster. A few test games run this fall and winter by invitation. Full launch is spring 2027. Until then it may be quiet, and that is normal. We only email when there is something real.";

function founderBadgeEmail(n){
  return "<table role='presentation' cellpadding='0' cellspacing='0' align='center' style='margin:6px auto 18px;border-collapse:separate;'><tr><td style='background:#102A43;border:3px solid #D7F75B;border-radius:18px;padding:18px 34px;text-align:center;'>" +
    "<div style='color:#D7F75B;font-size:12px;font-weight:bold;letter-spacing:3px;'>&#9733; FOUNDING 50 &#9733;</div>" +
    "<div style='color:#ffffff;font-family:Impact,Arial Narrow,Arial,sans-serif;font-size:56px;line-height:1;margin:6px 0 4px;'>#" + esc(n) + "</div>" +
    "<div style='display:inline-block;background:#1747C8;color:#fff;font-size:11px;font-weight:bold;letter-spacing:2px;padding:5px 12px;border-radius:999px;'>GAMEDAY HELPERS &middot; TAMPA BAY</div>" +
    "</td></tr></table>";
}
function shareButtonEmail(){
  const subj = "I just joined GameDay Helpers";
  const body = "Hey! I just signed up as a Founding Helper with GameDay Helpers. Local youth baseball and softball coaches pay helpers to keep score and run GameChanger at games, usually $35+ for a two hour game. Only 50 founding spots. Grab one here: " + HELPER_SHARE_URL;
  const href = "mailto:?subject=" + encodeURIComponent(subj) + "&body=" + encodeURIComponent(body);
  return "<p style='text-align:center;margin:20px 0 6px;'><a href='" + href + "' style='background:#D7F75B;color:#102A43;text-decoration:none;font-weight:bold;padding:14px 28px;border-radius:10px;display:inline-block;'>Invite a friend to the Founding 50</a></p>" +
    "<p style='text-align:center;font-size:13px;color:#666;margin-top:0;'>Or send them this link: <a href='" + HELPER_SHARE_URL + "'>" + HELPER_SHARE_URL + "</a></p>";
}
function helperWelcomeBody(name, id, isMinor, founder){
  const f = founder
    ? founderBadgeEmail(founder) +
      "<p><strong>You are one of the Founding 50.</strong> Your number is locked to your profile for good.</p>" +
      "<p><strong>What happens next:</strong> nothing right away. See the timeline below. Every friend you invite helps fill the roster.</p>"
    : "<p><strong>You are on the team.</strong> We will email you when there is a real game for you in one of your leagues.</p>";
  const timeline = "<p style='background:#F7F9FC;border-left:4px solid #1747C8;padding:10px 12px;'><strong>Timeline:</strong> " + BETA_TIMELINE + "</p>";
  const minor = isMinor
    ? "<p><strong>One step left:</strong> we just emailed your parent or guardian a one tap approval. Nudge them. Once they approve, your profile is ready for test games this fall and winter.</p>" : "";
  return f + minor + timeline +
    "<p><strong>How pay works:</strong> the coach pays you straight to your app after the game. Two hour offers start at $35, set by the coach. No cash, ever.</p>" +
    shareButtonEmail() +
    profileLine(id);
}
function coachWelcomeBody(name, founder){
  const f = founder ? "<p style='background:#EEF3FF;border:1.5px solid #1747C8;border-radius:10px;padding:12px;'><strong>&#9733; Founding Coach #" + founder + ".</strong> One of the first 50 in Tampa Bay. No matching fee for the whole beta.</p>" : "";
  return f +
    "<p style='background:#F7F9FC;border-left:4px solid #1747C8;padding:10px 12px;'><strong>Honest timeline:</strong> " + BETA_TIMELINE + "</p>" +
    "<p><strong>Have a game this fall or winter?</strong> You can still send a request. We will tell you whether we have a helper for it.</p>" +
    "<p style='text-align:center;margin:20px 0;'><a href='" + SITE_BASE_URL + "/request-game.html' style='background:#1747C8;color:#fff;text-decoration:none;font-weight:bold;padding:14px 28px;border-radius:10px;display:inline-block;'>Request a scorekeeper</a></p>" +
    "<p>Takes 60 seconds: date, what you need, your offer. When we have a helper, we match you by hand and email you their name, phone, and payment app. You text them, they show up, you pay them after the game, app to app.</p>" +
    "<p><strong>What it costs you:</strong> just the helper's pay, which you set when you request. Two hour offers start at $35. No matching fee to GameDay Helpers during the Tampa beta.</p>" +
    "<p>Tip: request as early as you can. Two days notice gives us the best shot at finding you a helper. Two hours is a coin flip.</p>";
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
  else if (s.getLastColumn() < headers.length) {
    // New columns were added at the end. Write only the missing headers; existing data is untouched.
    const have = s.getLastColumn();
    s.getRange(1, have + 1, 1, headers.length - have).setValues([headers.slice(have)]);
  }
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
function profileUrl(id){ return SITE_BASE_URL + "/profile.html?p=" + encodeURIComponent(id); }
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
