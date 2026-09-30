# Site revision, Sept 30, 2026 (branch `site-revision`, not published)

## Launch status used
Signup phase. Matching opens once 50 helpers have joined. Source: Chris, this session. Founding badge (first 50 helpers and first 50 coaches) is stated separately from the threshold.

## Changes
- Every page: status banner, nav (For Coaches, For Helpers, How It Works, FAQ, Contact), News in footer, shared `site.js` for the menu (aria-expanded, Escape closes, focus returns to button).
- index.html: coach-first hero with grouped copy, price line, status line, filled primary + outline secondary. Three steps. Founder section (Chris Barnwell, Tampa youth baseball coach). Compact helper invite. Ten-item FAQ (native details/summary). Final CTAs. Removed: $30+ stat, 9,000+ stat (no documented source), five persona cards, repeated reassurance.
- coaches.html: "Register your team" primary, returning-coach link, shorter steps, form trimmed to name, email, phone, team, league, notes, one preferred payment app (radio) plus handle with app-specific label (Zelle: email or phone). What-happens-next block. Success copy says nothing is booked.
- helper.html: "Get Paid to Run GameChanger" kept. Flexibility + responsibility wording. Form in three groups. One preferred payment app plus handle. Founding line kept modest, "in Tampa Bay history" removed. Button and success say "profile created" (matches backend: row created immediately).
- request-game.html: local time label, field/location required, "Your proposed game pay", not-confirmed messaging, what-happens-next, specific inline errors with focus.
- league.html: scope wording, what-happens-next.
- news.html: dated Sept 30 status post at top; older posts kept, "stipend" and "experienced helper" softened in the May post.
- apps-script-code.gs (v12): five email strings only. "$30 or more" to "two hour offers start at $35"; game receipt says a helper is not confirmed yet; helper welcome says offers start once matching opens. No handler, column, or endpoint changes.

## Backend contract
Unchanged. Same POST keys: helper (`payApps`, `payHandle` now single app), coach (same), game request (same, `field` now required client-side only), league, review. Same input ids. Radios reuse the chip container ids so `getChecked()` still works. Existing rows unaffected: `PayApps` column now holds one value instead of a list.

## Verification (headless Chromium, local server, backend stubbed)
- 9 pages x 4 widths (375, 390, 768, 1280): no horizontal overflow, no clipped headings, all controls 44px+, every input labeled, all images have alt, no console errors.
- Mobile menu: opens by keyboard, aria-expanded toggles, Escape closes and returns focus.
- FAQ opens by Enter. All anchors resolve.
- Calculator: 45 combinations, 0 mismatches, default $35.00, submitted value equals displayed.
- Coach form: specific errors, data preserved on error, Zelle relabels handle, payload keys unchanged, failure restores button.
- Helper form: parent block appears at 15, minor blocked without parent, checkbox gate, payload includes age, isMinor, parentEmail, agreeTerms.
- Request form: field required, payload unchanged shape.
- Apps Script and site.js pass a syntax check.

## Not verified
- No real submission was made. End-to-end email delivery and Sheet writes for the revised forms are untested on this branch. The handlers did not change, so behavior should match the smoke test run earlier today.
- Live Pages build of this branch (not merged).

## Deployment steps after approval
1. Merge `site-revision` to main. Pages rebuilds in about a minute.
2. Apps Script: paste `apps-script-code.gs` (v12), Save, Deploy > Manage deployments > pencil > New version. URL unchanged.
3. One TEST_ helper submit from a phone, then GDH > Delete TEST_ rows.

## Unresolved business decisions
1. Travel teams: RESOLVED, eligible. Added to homepage scope line, FAQ, and coach page.
2. Rain out or cancellation: any pay owed to a helper who showed up? No policy exists, so no FAQ entry.
3. Response time commitment for league inquiries: none promised.
4. Hero photo: none exists. Best shot: a teen on a dugout bench scoring on a phone, chain link and field behind, no readable names on screen, 3:2 landscape, plus a portrait of Chris for the founder section.
5. `Approved?` enforcement in `sendMatchEmails` (site now says Chris reviews every profile before a first match; the code does not block an unreviewed adult).
6. RESOLVED: review claim printed without a name.

## Published live?
No. Everything is on branch `site-revision`. Main and the live site are unchanged.
