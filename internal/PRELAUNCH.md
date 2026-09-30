# GDH Prelaunch Package (Sept 10, 2026)

## What was wrong (found in the repo)
| # | Issue | Fixed |
|---|---|---|
| 1 | Backend had NO handler for game requests or league forms. Both were saved as fake helper rows and sent "helper profile is live" emails | Yes, v9 backend |
| 2 | Backend ignored pay apps, pay handle, parent name/email, minor flag. Data was dropped | Yes |
| 3 | No parent consent email or approval link existed, but the site promised one | Yes, one tap approval link |
| 4 | SITE_BASE_URL was still the placeholder, so review links were broken | Yes |
| 5 | No duplicate check, no validation, no lock. Double submits = double rows | Yes |
| 6 | No way to send match emails (relay handles at match time) | Yes, GDH menu in the Sheet |
| 7 | Copy: "never take a cut", "vetted", "summer 2026" everywhere | Yes, all pages |
| 8 | news.html said "Never used GameChanger? Not a problem" | Yes |
| 9 | Age input allowed 13 | Yes, min 14 |

## Deploy (10 min, in this order)
1. Open the Google Sheet > Extensions > Apps Script.
2. Select all, paste `apps-script-code.gs`, Save. Set OWNER_CELL if you want your number in match emails.
3. Deploy > Manage deployments > pencil on the existing deployment > Version: New version > Deploy.
   NEVER click "New deployment".
4. In the Sheet: export Helpers and Coaches tabs to CSV if they hold real people, then delete the Helpers, Coaches, and Games tabs. They rebuild with the new columns on the next signup.
5. Reload the Sheet. A "GDH" menu appears. Run GDH > Install hourly review trigger (once).
6. In Apps Script editor, run `smokeTest`. Authorize. Check: 3 rows appear (Helpers, Coaches, Games) and 3 emails land at info@gamedayhelpers.com.
7. GDH > Delete TEST_ rows.
8. Upload all 9 HTML files AND styles.css to GitHub (or merge the `prelaunch-fixes` branch).
9. Submit the real helper form from your phone with your own email. Confirm the welcome email reads right.

## How matching works now
1. Coach submits request-game.html. You get an email with GameID and coach details. Coach gets a receipt.
2. Open Games tab, type the HelperID (from Helpers tab, column B) into column G on that row.
3. Click that row, GDH menu > Send match emails. Coach gets helper's name, phone, pay app + handle. Helper gets coach's. Status flips to MATCHED.
4. Hourly trigger sends review links 3 hours after first pitch and bumps the helper's game count.
5. Minors cannot be matched until ConsentStatus = APPROVED (the menu blocks it).

## Emails now sent
| Trigger | To | Subject |
|---|---|---|
| Helper signup (adult) | Helper | You're on the team |
| Helper signup (minor) | Helper + Parent | One step left: parent approval / Approve NAME as a GameDay Helper (2 taps) |
| Parent taps approve | Helper + Parent + you | You're approved. You're active. |
| Coach signup | Coach | You're in. Here's how to get a scorekeeper (button to request-game) |
| Game request | Coach + you | Helper request received: DATE |
| Match | Coach + Helper | MATCHED / YOU'RE IN |
| 3 hrs after game | Both | How was NAME? (20 seconds) |
| League inquiry | Director + you | Got your league inquiry |
| Any backend error | You | GDH backend error (with payload) |

## Logo
- Re-export gdh-logo.png: GameDay in white #FFFFFF, Helpers and mark in lime #D7F75B, for the navy header. Keep the same file name. Favicon can stay for now.

## Still needs Chris
- Florida attorney: minors, consent, contractor status (terms.html unchanged except title of section 6).
- Repo is public with the /exec URL in it. Anyone can POST junk rows. Validation limits damage. Fine for beta.
- Site uses `no-cors` fetch, so the browser always shows success even if the backend fails. Your owner alert email is the safety net. Leave it.

## Images (optional, site has none today)
Give these to GPT. Style for all: photoreal, warm late afternoon light, Tampa youth baseball field, no logos, no readable jersey names, 3:2 landscape.
1. HERO (index): "A teenage scorekeeper, 16, sitting on a dugout bench in a youth baseball park, tapping a phone held in both hands, calm and focused, chain link fence and orange sunset behind, shallow depth of field."
2. FOR COACHES: "A youth baseball coach in his 40s kneeling at the dugout rail talking to two 9 year old players, relaxed, not looking at a phone, blurred bleachers of parents behind."
3. FOR HELPERS: "Close up of a hand holding a phone with a generic scorekeeping app open, softball field blurred behind, a $20 bill tucked in a glove on the bench, playful."
4. PARENT: "A mom in the bleachers of a youth softball game, actually watching and cheering, no phone in hand, golden hour."
Place: 1 above the fold on index.html, 2 on coaches.html hero, 3 on helper.html hero, 4 on the "Let parents enjoy the game" section.
