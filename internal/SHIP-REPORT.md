# SHIP REPORT: GameDay Helpers, Sept 30, 2026

**GO.** No launch blockers remain in code. Two deploy steps need Chris before the site is truly live (Apps Script time zone, new version of the existing deployment).

Audited from branch `launch-v2` (c4d12ba), fixes on `ship-audit`. Everything below was verified by reading the code and rendering every page at 390px in headless Chromium. Nothing was POSTed to the live backend. The Sheet and the Apps Script editor were not opened; Phase 4 items are verified in code only.

---

## Launch blockers (ranked)

| # | Blocker | File | Status |
|---|---|---|---|
| 1 | Apps Script project time zone must be Eastern. Coaches enter local times with no offset. A UTC script stores games hours off and fires review emails before the game ends. | Apps Script > Project Settings | **Needs Chris** (1 min, deploy checklist step 4) |
| 2 | Live site still runs the old backend until the .gs is pasted and a NEW VERSION of the existing deployment is published. | apps-script-code.gs | **Needs Chris** (deploy checklist) |
| 3 | Coach page offered "Arrange annual access" in the success screen and form hint. Contradicts free beta. | coaches.html:24, :143 | Fixed |
| 4 | Helper page promised a free hat after the first game. Unbackable. | helper.html:94 | Fixed |
| 5 | League confirmation email promised a reply "within one business day" and said leagues "earn a share of every team fee". Response-time promise and a fee model that does not exist. | apps-script-code.gs:215 to 216 | Fixed |
| 6 | Coach welcome email said "Two days notice fills every time". A guarantee. | apps-script-code.gs:467 | Fixed |
| 7 | Helper emails promised "a text or email". No SMS exists. | apps-script-code.gs:244, :453 | Fixed |
| 8 | Internal docs were public pages on gamedayhelpers.com (PRELAUNCH.md, OPERATIONS-MAP.html, SETUP-STEPS.md). | repo root | Fixed, moved to /internal, excluded in _config.yml |
| 9 | Bot posting non-JSON emailed the owner as a "backend error" (JSON.parse threw outside the validation path). | apps-script-code.gs:58 | Fixed, now a quiet validation reject |
| 10 | No 404 page, no robots.txt, no sitemap, no canonical or Open Graph on any page, no og image. Four pages had no meta description. | all pages | Fixed |

---

## Fixed on this branch

- Moved `PRELAUNCH.md`, `OPERATIONS-MAP.html`, `SETUP-STEPS.md`, `gdh-logo-light.png` to `/internal/`. Added `_config.yml` with `exclude: [internal]`.
- Rewrote `internal/SETUP-STEPS.md`. Old Step 3 said "Deploy > New deployment". Replaced with the edit-existing-deployment sequence, time zone step, Executions check.
- Added `internal/RUNBOOK.md`.
- Every page: unique title kept, unique meta description, canonical, og:type/site_name/title/description/url/image (absolute), twitter:card, theme-color.
- `review.html` and `profile.html`: `noindex, nofollow` (private link page and a layout preview).
- Built `og.png` (1200x630, navy, lime, cobalt, logo). Wired into all nine pages.
- Added `404.html` on brand with Home, For Coaches, For Helpers.
- Added `robots.txt` and `sitemap.xml` (seven public pages only).
- Favicons (16, 32, apple-touch, icon-512, favicon.ico) recolored from #0d0d0d black to navy #102A43. Cobalt mark unchanged.
- coaches.html: removed "Arrange annual access" button and hint. Error-state button text restored to "Join free" (was "Keep me posted").
- helper.html: removed hat promise.
- apps-script-code.gs: v10 header, JSON parse failure is a validation error, league email copy, coach welcome copy, "text or email" to "email" in two helper emails.

No form input `id`, `name`, or `value` was changed. `CNAME` untouched. `/exec` URL untouched (identical in all five form pages). No em dashes anywhere in the repo.

---

## Needs Chris

**Deploy (in order, see checklist at the bottom).**

**Decisions.**
1. `Approved?` is not enforced. `sendMatchEmails` only blocks unapproved minors. Adults you never reviewed can be matched if you paste their ID. Terms section 6 says "We review helpers before matching them". Either enforce it in code (one line: block if `Approved?` is not YES) or keep it as your own discipline. Recommend enforcing. Not applied because it changes your matching flow.
2. Reviews have no dedupe. The same review link can be submitted many times and every submit counts toward the star average. Fine for a hand-run beta, a problem the first time someone spams five stars. Recommend: reject a second review for the same GameID + reviewer role. Not applied.
3. The helper's review link carries the coach's email in the URL (`rev=coach:<email>`). The helper already has the coach's phone at match time, so this is not new exposure, but it is an email in a query string in an email. Recommend keying coach reviews by CoachName + GameID.
4. `renderProfile` shows the helper's payment app names (Venmo, Zelle) publicly under "Accepts". Not the handle. Decide if that is fine. Everything else private stays private (verified in the raw HTML output: no age, email, phone, handle, parent fields).
5. Logo wordmark reads "Gameday" (lowercase d). Copy everywhere says "GameDay". Raster file, cannot fix in code. Re-export when convenient.
6. Silent failure fix (see Phase 1.1 below). Recommend applying after launch, on a quiet morning, with a TEST_ submit right after.

**Legal (ask the attorney, do not write this yourself).**
- Section 5: parental consent by a one-tap email link with no identity check. Is that adequate under Florida law for a 14 to 17 year old doing paid work arranged by a third party?
- Section 2 and 6: "not the employer" and "our review is limited" alongside a public rating system and an Approved? column. Does controlling who gets matched and rating them weaken the independent contractor position?
- Section 9: "We do not share it outside GameDay Helpers except as needed to make a match". The match email shares phone and payment handle with the other party. Confirm the wording covers that.
- Age (private) and a minor's parent contact are stored in a Google Sheet. Any retention or deletion obligations?
- Payment: the site says GameDay Helpers never processes payments and that is true in code. Confirm no money transmitter concern from setting a suggested rate.

---

## Scorecard

| Area | Score | Why |
|---|---|---|
| Backend | 4 | Lock wraps all of doPost, founder number computed inside it, duplicates by email blocked, validation vs real errors separated. Loses a point for no review dedupe and Approved? not enforced. |
| Data integrity | 4 | Every posted field the backend cares about is stored. Column maps match. Time zone is the one thing that can silently corrupt game times, and it is a settings step, not code. |
| Privacy | 4 | Profile page leaks nothing private. Consent token burns. Coach email in the helper's review URL costs a point. |
| Copy | 4 | Claims trimmed to the verified three stats, free beta, hand matching, direct pay. "Experienced helper" on news.html is the softest remaining stretch. |
| Design polish | 4 | Consistent brand across nine pages, 404, og image. Logo wordmark casing mismatch. Email templates still use #0d0d0d headers instead of navy. |
| Mobile | 5 | 390px: no horizontal scroll on any page, every control 44px or taller, no text under 14px, nothing overlapping. |
| Accessibility | 5 | Every input labeled, every image has alt, skip link, visible focus, aria-live on errors and success, chips are real checkboxes and radios. |
| SEO | 4 | All meta in place now, sitemap, robots, canonical. No structured data, no images on content pages. |
| Operator readiness | 4 | Menu, match function, minor block, MATCHED flip, trigger installer, TEST_ cleanup all present and wired. Verified in code only. Runbook written. |

---

## Phase 0: Ground truth

**Files (last commit date).** All site files 2026-09-29 except CNAME and favicon.ico (2026-05-30). Full list in git.

**/exec URL.** One URL, identical in helper.html, coaches.html, request-game.html, league.html, review.html. index, news, terms, profile have no form.

**Forms vs backend.**

| Page | Form | POST type | Fields sent | Saved | Mismatch |
|---|---|---|---|---|---|
| helper.html | Helper profile | HELPER | name, age, email, phone, leagues, sports, roles, skill, priorGames, availability, notes, payApps, payHandle, isMinor, parentName, parentEmail, agreePhone, agreeTruth, agreeTerms, submittedAt | all except isMinor (backend recomputes from age), agreePhone, agreeTruth, submittedAt (backend uses its own timestamp) | N. Dropped fields are intentional. |
| coaches.html | Coach signup | COACH | name, email, phone, team, leagues, notes, payApps, payHandle, submittedAt | all except submittedAt | N |
| request-game.html | Game request | GAMEREQUEST | coachEmail, datetime, notes, field, firstRate, addlRate, length, offer | all (notes lands in Needs) plus coach name, team, league, phone looked up from Coaches | N |
| league.html | League inquiry | LEAGUE | name, org, email, phone, notes | all | N |
| review.html | Review | REVIEW | gameId, revieweeId, revieweeRole, reviewerRole, stars, comment | all | N |

---

## Phase 1: Hidden breakage

**1. Silent failures (no-cors).** Every form shows the takeover success screen as soon as the fetch resolves, regardless of the backend result. Paths where the user sees success and nothing was saved:
- LockService wait exceeds 20 seconds (burst of submits or a slow Sheet). Owner gets the error email. User sees success. Row not saved.
- Backend validation the front end does not mirror: backend requires a phone on coach and league forms (front end also requires, so covered); backend rejects an age over 99 (front end max=99, covered); backend rejects a malformed email that passed the browser's looser check. User sees success, nothing saved, no owner email (validation is quiet by design).
- MailApp daily quota exhausted: row IS saved (appendRow runs before email), emails fail, owner error email also fails. User sees success and never gets the welcome email.
- Wrong deployment (site pointing at an old version): the old code runs, which is exactly the Sept 10 state. Owner alert still fires from the old code so you would notice.

Proposed fix, not applied: change each fetch to `mode:'cors'`, keep `Content-Type: text/plain;charset=utf-8` (avoids a preflight), then `const r = await res.json(); if (r.result !== 'success') throw new Error(r.message)`. Show `r.message` in the existing `.err` element. Apps Script web apps return `Access-Control-Allow-Origin: *` on ContentService output, so this works in current browsers. Risk: if the deployment is not set to "Anyone", the redirect chain breaks and nothing submits. Test with one TEST_ submit right after applying.

**2. Field name drift.** None. Every `getElementById` in the five scripts resolves to markup. Every payload key the backend reads exists in the payload.

**3. Broken links.** Every local href and src resolves to a file. All anchor targets (#main, #apply, #join) exist. External links: Google Fonts only. No dead links.

**4. Email link tracing.**

| Link built in .gs | Target | Param the target reads | OK |
|---|---|---|---|
| profileUrl(id): exec?p= | doGet | p | Yes |
| consent: exec?consent= | doGet | consent | Yes |
| SITE_BASE_URL/request-game.html | request-game.html | none needed (optional ?email=) | Yes |
| SITE_BASE_URL/coaches.html | coaches.html | none | Yes |
| SITE_BASE_URL/terms.html | terms.html | none | Yes |
| reviewUrl: review.html?g&rev&revname&role&by | review.html | g, rev, revname, role, by | Yes |

**5. Orphan pages.** `profile.html` (static layout preview) and `review.html` (email-only link) are linked from no page. Both now noindex and excluded from the sitemap. `OPERATIONS-MAP.html` was an orphan public page; moved to internal.

**6. Dead JS and dead markup.** `helperSuccess`, `coachSuccess`, `leagueSuccess`, `reviewSuccess` and the `.request-sent` paragraph exist but the takeover screen is what users see (review.html does use its success block). Harmless. No function is called but undefined. No function is defined but unused.

**7. Offer calculator.** All 45 combinations computed: total = first + (length - 1) x additional, half hours charge half the additional rate. Zero mismatches. Default 2 hr, $20, $15 = $35.00. Submitted `offer` is `calcOffer().toFixed(2)`, the same value displayed. Backend stores `length` as text ("1.5" survives) and `offer` as text. `firstRate` and `addlRate` go through `num()` and are whole dollars, correct.

**8. Duplicate and concurrent submits.** Submit button disables on click and re-enables only on fetch error. `LockService.getScriptLock().waitLock(20000)` wraps the entire doPost body including the founder number read and the appendRow, so two simultaneous helpers cannot both get #17. Duplicate email: `findRowByEmail` returns the existing row, no second row, a "You're already on the team" email goes out, response is success with `duplicate:true`. Same for coaches. Game requests and league inquiries are not deduped (correct: a coach can have many games).

**9. Minor consent chain (verified in code).**
1. helper.html shows the parent block when 14 <= age < 18 and requires both parent fields.
2. `handleHelper`: age < 18 sets Minor? YES, ConsentStatus PENDING, generates a UUID token, stores parent name and email.
3. `sendParentConsent` emails the parent a link `exec?consent=<token>`.
4. `doGet` routes `consent` to `handleConsent`.
5. `handleConsent` finds the row by token, sets ConsentStatus APPROVED, clears the token (burn), emails helper, parent, and owner, returns an approved page.
6. Reuse: the token column is now empty, so a second tap returns "Link not found". Blocked.
7. Matching: `sendMatchEmails` returns "Helper is a minor without parent approval. Not sent." when Minor? is YES and ConsentStatus is not APPROVED.
Gap: no resend. A parent who lost the email needs you to forward it by hand (runbook section 6). A duplicate signup by an unapproved minor re-sends the helper welcome but not the parent email.

**10. Privacy leak check.** `renderProfile` raw HTML contains: name, skill, founder number, sports, leagues, payment app names, GDH game count, prior game count, average rating, review count, review stars, review date, review comment. It does not contain age, email, phone, payment handle, parent name, or parent email. All values pass through `esc()`. The unknown-id path returns "Profile not found" with nothing else. `doGet` with no params returns a one-line page. The consent page shows the helper's first name only.

---

## Phase 2: Polish

- **Meta and SEO:** fixed on all nine pages (see Fixed list).
- **Favicons:** all four PNGs and the .ico exist and are referenced. Recolored to navy + cobalt.
- **404:** added.
- **robots.txt, sitemap.xml:** added.
- **Internal files:** moved. Root now holds only public pages, assets, CNAME, _config.yml, robots, sitemap, og.png.
- **Mobile 390px:** all nine pages pass (no horizontal scroll, controls 44px+, text 14px+). Footer text links are 44px tall.
- **Accessibility:** every input has a `label for` or wrapping label; every image has alt; `:focus-visible` outline on everything, lime on dark surfaces; chip groups have role and aria-label; error regions are `role=alert`; skip link present; body text #172b4d on white is 13.6:1, muted #4b5b70 on white is 7.3:1, inverse muted #c7d3df on navy is 9.7:1.
- **Form UX:** all five forms disable the button, show "Sending...", show a specific validation message, and show a next-step success screen. Coach error-state label fixed.
- **Consistency:** "GameDay Helpers" 68 uses, zero variants. Tagline "You coach. We score." on every page. Footer, nav, info@gamedayhelpers.com, and 2026 identical everywhere. Pay anchor $30+ and $20/$15 floor consistent across index, helper, request-game, and all emails.

---

## Phase 3: Trust and legal

Grep of all pages and all email strings for: guarantee, background, screen, vet, testimonial, partner, press, response time, review counts, extra statistics.

| Hit | Where | Action |
|---|---|---|
| "within one business day" | .gs league email | Replaced with "soon" |
| "earn a share of every team fee" | .gs league email | Removed |
| "Two days notice fills every time" | .gs coach welcome | Replaced with "gives us the best shot" |
| "the hat is yours too" | helper.html | Removed |
| "Arrange annual access" | coaches.html | Removed |
| "we match you with an experienced helper" | news.html May post | Left. Soft. Replacement if wanted: "we match you with a local helper who knows GameChanger". |
| "does not guarantee any helper's identity, background..." | terms.html section 6 | Correct usage, disclaims. Left. |

Stats on site: 9,000+ games (verified). No league count or team count appears on any page. The eight District 6 league names appear as form choices, not as partners.

Contact route: mailto info@gamedayhelpers.com in nav, footer, and body of every page. Same address in every email. No real phone number or payment handle anywhere in the repo (only 813-555 test numbers inside smokeTest).

Payment processing: every page and email says the coach pays the helper directly, app to app, no cash, GameDay Helpers never touches it. Code agrees: no payment code exists.

---

## Phase 4: Operator readiness (verified in code, not in the live Sheet)

| Tooling | Function | Wired | Notes |
|---|---|---|---|
| Custom menu | `onOpen` | Yes, three items | |
| Match email | `sendMatchForSelectedRow` > `sendMatchEmails` | Yes | Requires Games tab active, row >= 2, HelperID in col G |
| Minor block | inside `sendMatchEmails` | Yes | Minor? YES and ConsentStatus != APPROVED returns without sending |
| Status to MATCHED | inside `sendMatchEmails` | Yes | Also sets MatchSent, HelperName, HelperEmail |
| Hourly trigger installer | `createReviewTrigger` | Yes, deletes old trigger first | |
| TEST_ cleanup | `cleanupTestRows` | Yes, all five tabs | Matches TEST_ case-insensitively in any cell |

Owner alerts: helper signup, coach signup, game request, consent approved, league inquiry all call `alertOwner`. Backend errors email the owner with stack and payload. Validation failures (`need()`) and now bad JSON do not.

---

## Deploy checklist (exact order)

1. Merge the PR `ship-audit` into `main`.
2. GitHub > Actions or Settings > Pages: confirm the Pages build finished. Load https://gamedayhelpers.com/404.html and https://gamedayhelpers.com/og.png in a browser. Confirm https://gamedayhelpers.com/internal/RUNBOOK.md returns 404.
3. Open the Sheet > Extensions > Apps Script. Select all, paste the new `apps-script-code.gs`. Save.
4. Project Settings (gear) > Time zone > Eastern Time. Save.
5. Set `OWNER_CELL` in the editor if you want it in match emails.
6. Deploy > Manage deployments > pencil on the EXISTING deployment > Version: New version > Deploy. Confirm the URL is unchanged.
7. Sheet: export Helpers, Coaches, Games to CSV if they hold real people. Delete those three tabs.
8. Reload the Sheet. GDH menu > Install hourly review trigger. Confirm one trigger under Apps Script > Triggers.
9. Apps Script editor > run `smokeTest`. Authorize.
10. Confirm three rows (Helpers, Coaches, Games) and three owner emails at info@gamedayhelpers.com.
11. GDH menu > Delete TEST_ rows.
12. From your phone, submit the real helper form with your own email.
13. Apps Script > Executions: top row is `doPost`, Web App, Completed, Deployment shows the new version number. Welcome email arrived.
