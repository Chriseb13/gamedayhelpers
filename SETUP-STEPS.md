# GameDay Helpers - Setup Steps

Everything runs free on Google. No dev team, no monthly fees.

```
[ the site ]        [ Apps Script ]            [ Google Sheet ]
 helper.html  --->   the engine        --->     Helpers
 coaches.html        - saves signups            Coaches
 review.html         - serves profiles          Games
                     - hourly review sweep      Reviews
                          |
                          +-- emails the person + you
                          +-- live profile page per helper
```

The site files (HTML/CSS/logo) go on GitHub Pages or Netlify.
The .gs file goes into Google Apps Script (NOT GitHub Pages).
They talk to each other through one Web app URL.

---

## STEP 1 - Make the Google Sheet (1 min)

1. sheets.google.com, click Blank.
2. Rename it "GameDay Helpers".
3. Leave the tabs alone. The script builds Helpers, Coaches, Games, and
   Reviews automatically the first time each is used.

---

## STEP 2 - Add the script + set 3 values (5 min)

1. In the Sheet: Extensions > Apps Script. Delete any code in the box.
2. Open `apps-script-code.gs`, copy ALL of it, paste it in.
3. Near the top, set these three:
   ```
   OWNER_EMAIL        = your email for new-signup alerts
   SITE_BASE_URL      = your live site URL, no trailing slash
                        (e.g. https://yourname.github.io/gameday-helpers)
   REVIEW_DELAY_HOURS = 3   (hours after a game to ask for a review)
   ```
4. Save (disk icon).

NOTE: SITE_BASE_URL has to point at wherever review.html actually lives,
because that's the link in the review emails. Set it after you know your
GitHub Pages / Netlify address, then re-save the script.

---

## STEP 3 - Publish as a web app (5 min)

1. Top right: Deploy > New deployment.
2. Gear icon > Web app.
3. Execute as: Me.  Who has access: Anyone.   <-- must be "Anyone"
4. Deploy. Authorize when asked:
   Allow > your account > Advanced > Go to project (unsafe) > Allow.
   ("unsafe" is normal for any personal script. It's your own code.)
5. Copy the Web app URL (ends in /exec). You need it next.

---

## STEP 4 - Turn on the auto review sweep (1 min)

1. Still in Apps Script, open the function dropdown (top toolbar).
2. Choose `createReviewTrigger` and click Run. Authorize if asked.
3. That installs ONE hourly timer that watches the Games tab and sends
   review requests on its own. You only do this once.

To confirm: left sidebar > Triggers (clock icon) should show
sendReviewRequests running every hour.

---

## STEP 5 - Connect the three pages (2 min)

Paste your Web app URL into the SCRIPT_URL line in EACH of these:
- helper.html
- coaches.html
- review.html

```
const SCRIPT_URL = "PASTE_YOUR_APPS_SCRIPT_URL_HERE";
```

(index.html and blog.html have no forms, so they don't need it.)

---

## STEP 6 - Put the site online (free)

GitHub Pages (since you're using GitHub):
1. Create a repo, upload the contents of the `site` folder.
2. Settings > Pages > deploy from main branch, root.
3. Your URL appears (e.g. https://yourname.github.io/gameday-helpers).
4. Put that URL into SITE_BASE_URL in the script and re-save.

Or Netlify Drop: drag the whole `site` folder onto app.netlify.com/drop.

---

## STEP 7 - Test the whole loop (5 min)

1. Open your live helper.html, create a test profile with your own email.
   Check: Helpers row appears, you get an alert, you get a confirmation.
2. Grab the HelperID from the Helpers tab (column B). Visit:
   YOUR_WEBAPP_URL/exec?p=THAT_ID
   You should see the live profile page.
3. Add a test row to the Games tab:
   GameID = TEST1, DateTime = a time a few hours in the PAST,
   CoachName + CoachEmail = you, HelperID + HelperName + HelperEmail = your test helper.
   Leave ReviewSent blank.
4. In Apps Script, run `sendReviewRequests` once by hand to test (instead of
   waiting for the hourly timer). You should get the review emails. Click one,
   leave a star rating, submit.
5. Check: a Reviews row appears, the helper's AvgRating + ReviewCount fill in,
   GDHGames goes up by 1, and the review shows on the profile page.

If all that works, you're fully live.

---

## How it runs day to day

- HELPER signs up -> profile row + auto profile page. You set Approved? to YES after vetting.
- COACH joins -> Coaches row. You reach out, mark Contacted? YES.
- You MATCH them -> add a row to Games with the date/time. That's the only manual step.
- The hourly sweep does the rest: after the game it emails both for a review,
  counts the game, and updates the profile. No babysitting.

The one thing to remember: a review only fires if the game is in the Games tab
with a date/time. That row IS the match record.
