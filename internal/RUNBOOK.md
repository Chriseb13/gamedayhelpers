# GameDay Helpers: Operator Runbook (internal)

One manual step in the business: matching a coach's game to a helper. Everything below is
verified against `apps-script-code.gs` in code. It was not exercised against the live Sheet from the audit branch.

---

## 0. The dashboard (fastest way)

gamedayhelpers.com/match.html. Open requests sit at the top, longest waiting first, with waiting time and time to game. Below that: tap any number tile (helpers, coaches, requests, average offer, average hourly pay, time to match, ratings, league inquiries, minors) to see the rows behind it. Then 8-week trends for helper signups, coach signups, and game requests. Enter the admin key (set as `ADMIN_KEY` in the Apps Script editor, never in the repo). The board lists every OPEN game with helpers ranked for it: eligible first (reviewed, and parent-approved if under 18), then league match, then tasks, then day availability, then rating and games scored. Green badges are reasons to pick, red are blockers, yellow are cautions.

- **Send match**: writes the HelperID to the Games row and sends both match emails. Same code as the GDH menu.
- **Approve**: flips `Approved?` to YES after you have looked at the profile. Unapprove is in the All helpers table.
- **No helper available, notify coach**: marks the game UNFILLED and emails the coach.
- **All games table** (top of the page): every game with a step tracker (requested, matched, parent consent, match email sent, game played, review links, reviews in). Yellow row = needs a helper, red = cancelled, unfilled, or a minor without consent, green = fully done. Filters: Needs attention, Upcoming, Done, Cancelled, All. Actions per row: Pick helper, Resend match email, Cancel game (emails everyone, parent included for minors), and an editable Needs box.

The Sheet method below still works and is the fallback.

## 0b. Status pages (me.html)

Anyone registered can go to gamedayhelpers.com/me.html, enter their email, and get a private link by email. The page shows their profile status, every game they are on, and the other side's name, phone, and payment app once matched. Links are in every welcome, receipt, and match email too. A lost link: send them to me.html again, the same link is re-sent. To revoke someone's link, clear their AccessToken cell (last column on Helpers or Coaches).

## 1. Match a game in the Sheet (under 2 minutes)

Trigger: an email with subject `GDH GAME REQUEST: <coach> (<league>)`. It contains the GameID, when, field, needs, offer, and coach contact.

1. Open the Sheet > **Games** tab. Find the row with that GameID. Status is `OPEN`.
2. Open the **Helpers** tab. Pick a helper who:
   - lists that league in column G (Leagues),
   - has `Approved?` = YES (column Q, you set this after your own review),
   - if `Minor?` = YES, has `ConsentStatus` = APPROVED (column W). The menu blocks the send otherwise.
3. Copy their HelperID (column B).
4. Back on Games, paste it into **column G (HelperID)** on the game row.
5. Click any cell in that row, then **GDH menu > Send match emails for selected Games row**.
6. A popup confirms "Match emails sent to <coach> and <helper>". The row's Status becomes `MATCHED`, MatchSent gets a timestamp, HelperName and HelperEmail fill in.

What went out: the coach got the helper's name, phone, pay apps and handle, skill, and profile link. The helper got the coach's name, phone, and pay app. Both were told to text each other now.

If the popup says "Helper is a minor without parent approval. Not sent." pick a different helper or wait for the parent.

---

## 2. Helper no-show

1. Reply to the coach's match email the same day. Apologize, say the helper's account is under review, and offer to prioritize their next request.
2. Helpers tab: set that helper's `Approved?` to NO. Put the reason in Notes (column P) with the date.
3. The hourly sweep will still send review emails for that game because HelperID is set. To stop that, clear column G (HelperID) and set Status to `NOSHOW` before three hours after first pitch. Otherwise let the coach's one star review land. It shows on the helper's profile.
4. Two no-shows: leave `Approved?` at NO permanently.

---

## 3. Coach does not pay

The helper's match email tells them: if the money has not landed by the next morning, reply to this email. That reply comes to info@gamedayhelpers.com.

1. Confirm with the helper: game happened, coach was present, amount expected (the Offer column on the Games row).
2. Email the coach from info@gamedayhelpers.com. Restate the game, the offer they set on the form, and the helper's pay handle (Helpers tab, column S). Ask them to send it today.
3. No payment within 48 hours: Coaches tab, set `Contacted?` to `HOLD` and add the reason in Notes. Do not match that coach again until it is settled.
4. GameDay Helpers never pays out of pocket and never holds funds. Say so plainly if asked. The coach owes the helper directly.

---

## 4. Confirm which deployment version live traffic is hitting

1. Apps Script editor > **Executions** (the list icon in the left rail).
2. Each row shows Function, Type, Start, Duration, Status, and **Deployment**.
3. Live form submissions appear as `doPost`, type `Web App`. The Deployment column shows a version number (for example `@12`).
4. That number must equal the version you last published under Deploy > Manage deployments. If it shows an older number, the last publish created a new deployment instead of a new version. Fix by editing the existing deployment to a new version. Never change the URL in the HTML.
5. `Head` means the code ran from the editor (smokeTest, menu actions), not from the site.
6. A failed `doPost` shows red. Click it to read the error. The same error also arrived at info@gamedayhelpers.com with the payload, unless it was a plain validation failure.

---

## 5. Pull the list of unmatched OPEN games

Option A, in the Sheet:
1. Games tab > click the Status header (column S) > Data > Create a filter.
2. Filter Status to `OPEN`. Sort DateTime (column B) ascending. That is your queue, soonest first.

Option B, formula in an empty tab:
```
=SORT(FILTER(Games!A:T, Games!S:S="OPEN"), 2, TRUE)
```

Anything OPEN with a DateTime in the past is a game you missed. Email the coach and clear it: set Status to `UNFILLED`.

---

## 6. Weekly hygiene (5 minutes)

- Helpers with `Approved?` = NO and no Notes: review them and flip to YES or leave a reason.
- Minors with `ConsentStatus` = PENDING older than 3 days: email the parent yourself (ParentEmail, column V). The system does not resend.
- GDH menu > Delete TEST_ rows if you ran a smoke test.
- Apps Script > Triggers: confirm exactly one `sendReviewRequests` hourly trigger exists.

---

## 7. Emails the system sends without you

| When | To | Subject |
|---|---|---|
| Helper signs up (18+) | Helper | You're on the team |
| Helper signs up (14 to 17) | Helper, Parent | One step left: parent approval / Approve NAME as a GameDay Helper (2 taps) |
| Parent taps approve | Helper, Parent, You | You're approved. You're active. |
| Coach signs up | Coach | You're in. Here's how to get a scorekeeper |
| Coach requests a game | Coach | Helper request received: DATE |
| You send the match | Coach, Helper | MATCHED: ... / YOU'RE IN: ... |
| 3 hours after first pitch | Coach, Helper | How was NAME? (20 seconds) |
| League inquiry | Director | Got your league inquiry |
| Any of the above, plus errors | You | GDH HELPER / COACH / GAME REQUEST / CONSENT APPROVED / LEAGUE / backend error |

Duplicate signups (same email) do not create a second row. The person gets a "You're already on the team" email instead.
