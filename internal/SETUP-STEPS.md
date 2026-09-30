# GameDay Helpers: Setup Steps (internal)

Everything runs free on Google. Static site on GitHub Pages, one Apps Script web app, one Google Sheet.

```
[ the site ]              [ Apps Script ]              [ Google Sheet ]
 helper.html      --->     doPost / doGet      --->      Helpers
 coaches.html              - saves signups               Coaches
 request-game.html         - serves profiles             Games
 league.html               - consent links               Leagues
 review.html               - hourly review sweep         Reviews
                                 |
                                 +-- emails the person + you
```

The five form pages all POST to ONE web app URL that ends in `/exec`. That URL is
hard coded in the HTML and must never change. That is why the deploy rule below matters.

---

## THE ONE RULE

**Never click "Deploy > New deployment."** A new deployment creates a new `/exec` URL.
The site still points at the old one, so every form on the live site silently stops saving.

You only ever create a **new version of the existing deployment**:

```
Deploy > Manage deployments > pencil icon (Edit) > Version: New version > Deploy
```

The URL shown after that must be the same one already in the HTML files.
If it is different, you clicked the wrong thing. Do not update the HTML. Go back and
edit the existing deployment.

---

## STEP 1: The Sheet (already exists)

The Sheet is "GameDay Helpers". Tabs are created automatically by the script the first
time each one is used: Helpers, Coaches, Games, Leagues, Reviews. Do not rename them.

---

## STEP 2: Paste the script (3 min)

1. Open the Sheet > Extensions > Apps Script.
2. Select all existing code and delete it.
3. Open `apps-script-code.gs` from the repo, copy all of it, paste it in.
4. Set `OWNER_CELL` at the top if you want your number in match emails. It stays `""` in the repo.
5. Save.

`OWNER_EMAIL` and `SITE_BASE_URL` are already set in the file. Do not change them.

---

## STEP 3: Project time zone (1 min, do once)

Apps Script > Project Settings (gear icon) > Time zone > **(GMT-05:00) Eastern Time**.

Coaches enter game times in local time. If the script time zone is UTC, every game is
stored four or five hours off and review emails go out before the game ends.

---

## STEP 4: Publish the new version (2 min)

```
Deploy > Manage deployments > pencil icon > Version: New version > Deploy
```

Settings on the existing deployment must remain: Execute as **Me**, Who has access **Anyone**.
Authorize if prompted (Advanced > Go to project > Allow).

Confirm the web app URL matches the `SCRIPT_URL` line in `helper.html`.

---

## STEP 5: First time after a column change

When the column list in the script changed since the last version:

1. Export Helpers, Coaches, and Games to CSV if they hold real people.
2. Delete those three tabs.
3. They rebuild with the new headers on the next submission.

Do this only when the report or the commit says the columns changed.

---

## STEP 6: Install the hourly review trigger (once)

Reload the Sheet. A **GDH** menu appears. Run GDH > Install hourly review trigger.
Confirm under Apps Script > Triggers (clock icon): `sendReviewRequests`, every hour.
Running it again is safe. It replaces the old trigger instead of adding a second one.

---

## STEP 7: Smoke test (3 min)

1. Apps Script editor > function dropdown > `smokeTest` > Run.
2. Check: one row each appears in Helpers, Coaches, and Games. Three owner alert emails land at info@gamedayhelpers.com.
3. GDH menu > Delete TEST_ rows.

---

## STEP 8: Prove live traffic hits the new version

1. From your phone, submit the real helper form with your own email.
2. Apps Script > Executions (list icon). The top row should be `doPost`, status Completed, and its Deployment column should show the version number you just published, not "Head" and not an older number.
3. Confirm the welcome email arrived.

If the Executions log shows nothing, the site is POSTing to a different deployment. Go back to THE ONE RULE.

---

## Day to day

- HELPER signs up: row in Helpers, welcome email, parent consent email if under 18.
- COACH signs up: row in Coaches, welcome email with the request button.
- COACH requests a game: row in Games with Status OPEN. You get an alert.
- YOU match: type the HelperID in column G on that Games row, click the row, GDH > Send match emails. Status flips to MATCHED. This is the only manual step.
- Hourly sweep: three hours after first pitch, both sides get a review link, Status flips to DONE, the helper's game count goes up.

See `RUNBOOK.md` in this folder for no-shows, non-payment, and pulling the open games list.
