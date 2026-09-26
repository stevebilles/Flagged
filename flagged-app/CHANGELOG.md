# Changelog

Session-by-session log of substantive work on Flagged, kept so a new session (human or Claude)
can quickly see what happened and why without digging through commit-by-commit history. Full
detail lives in git history and commit messages; this is the narrative summary.

## 2026-09-25

**WHERE WE LEFT OFF (end of 2026-09-25) — pick up here tomorrow**

*Built today, all committed (see the sections below for detail):* My Pantry rebuild + Scan History +
timestamps; rescan results (clean / "nothing new" / new red flags) rebuilt to the owner's mockups with
the compact `HeroCard` everywhere and the pill-style profile card; the "nothing new" (`known_flags`)
logic fix; "What we checked for" card on the clean scan result; acronyms shown in capitals (TBHQ);
non-English scan warning (in-app card, one "Scan again" button); product photos shown whole (never
cropped); off-column + above-the-header text dropped from camera captures (the false "Fish" flag).

*Needs a check on the phone (built and tested in code, not yet seen working):*
1. **Rescan the bread-crumb tin** — Fish should no longer flag; the Metro log prints
   `OFF-COLUMN TEXT DROPPED` (what was removed and where), the full scan text, and each flag's exact
   matching word with context.
2. **A two-photo scan ("Scan More")** — a list too wide for one photo; confirm nothing is cut off between
   the photos (the above-header rule is first-photo-only by design).
3. Pantry: the 24-hour undo actually expiring; the 20-minute temp-photo cleanup. Also the whole-photo
   display, the clean rescan screen (one-sentence hero, pill-style card, "same red flag profile…"
   footer). (Already confirmed working by the owner, so NOT to re-check: Save to Pantry fields above the
   keyboard, and the Pantry tab's red dot when a rescan to-do item appears.)

*Plans / open decisions, in the order I'd take them:*
1. **Top-line cue on the guide box** (awaiting the owner's go + wording): bold top and left edge with a
   short label ("Line up just above the first ingredient"), ignore everything above it, warn if the
   first line of the list looks cut off. Then, only if needed, grow the list's right/bottom edge from
   that top-left corner using **OCR block positions** (stop at a bigger vertical gap or a shift in the
   left edge) — collect more real captures first (curved can/bottle, other packaging, a two-photo list).
   **Colour-based edge detection was ruled out.**
2. Start-anchor rule for a list, if a trim is ever built: "ingredient(s)" first, "contains" only when no
   ingredient header exists; must not depend on a trailing "Contains" line or on French. The owner does
   NOT want the scan/matching/extraction rules rewritten — position-only additions.
3. Pantry photos in iCloud backups: needs the small Expo config plugin (T110) + a new EAS build.
4. Undecided: item Edit (rename brand/product) on the Pantry item screen — not built.
5. Not planned: French/other-language names in the dictionary (the warning is the safeguard).
6. Older open items: fresh sandbox tester for the trial-eligible paywall, app icon + splash, Terms/Privacy
   pages, EAS production build, onboarding redesign, the 2026-09-24 device checks (Onboarding name step,
   Profile edit search results, launch on a poor connection).

*Standing rules to keep following (all in `CLAUDE.md`):* follow the owner's mockups but ask before building
mockup-only labels; no invisible features; never "safe/approved/cleared" wording; no status pills on result
screens; never a digit in a circle; theme text sizes only; timestamp everything; store no OCR text; commit
only when asked.

**Two-photo scans protected; colour-based edge detection ruled out**
- `splitAboveListBlocks` now (1) drops only SHORT blocks (nutrition rows, corner text), never long list
  lines, and (2) is applied to the first photo of a scan only (`CameraScanner`), because stitching is
  text-only and photo positions can't be compared — a "Scan More" continuation with a later header in
  frame is never cut. Tested with a simulated second photo.
- Owner decided **not** to detect the list's edges from image colours (needs native pixel code, fragile
  on glossy/curved packs). If edge-finding is extended it will use OCR block positions, optionally
  anchored on the guide box's top-left (not built; the "top line" cue idea is awaiting the owner's go).

**False "Fish" flag: text from a side panel of the tin was scanned — off-column text is now dropped**
- A rescan of a bread-crumb tin flagged Fish as a new red flag; the ingredient list has none. The
  camera frame also caught a recipe printed down the tin's side ("Dip fish, chicken…"). Confirmed from
  the dev log's block positions: ingredient lines x ≈ 240–1450, the recipe strip x ≈ 1440–1740. The OCR
  gives every block's position but the app only used it for reading order, so the strip was matched
  like the ingredients (the owner pointed out position should have been a giveaway — it was).
- **Fix:** `splitOffColumnBlocks` (`src/ocr/recognition.ts`) drops text outside the main column of the
  long lines, for camera captures only. Tested with that capture's real positions. **Also**
  `splitAboveListBlocks`: once the ingredient header is found ("ingredient(s)" first, "contains" only if
  none), text well above it (the nutrition panel, corner text — "Dip fish," alone would have been caught)
  is dropped. Owner's constraints: position-only, no rewrite of the scan/extraction rules, nothing that
  relies on a "Contains" line at the end or on French. Dev log now shows the full scan text, each flag's exact
  matching word with context, and what was dropped. Needs a device re-test: rescan the tin.

**Clean rescan footer no longer says "no NEW red flags"**
- "Same filter set — no new red flags detected." implied red flags had existed. The clean rescan's
  profile-card footer is now `cleanRescanFooter`: "Same red flag profile as your last scan — no red
  flags were found either time." (or "…this time, no red flags were found." when the previous scan
  DID have flags; or "Your red flag profile has changed…" when the filters changed). The "nothing new"
  screen keeps "no new" because flags were found there. Tests added; the previous scan is read once on
  first render (before this scan is logged).

**Clean rescan screen brought in line (repeated hero sentence + old side-by-side card)**
- The clean rescan still showed "No red flags found" over "No new red flags found for Steve's current
  profile." (two lines saying the same thing — fixed earlier only for the "nothing new" screen) and the
  old side-by-side bullet columns. I had left it because the clean mockup showed them, and said so, but
  the owner expected them gone everywhere. Now the clean rescan and "nothing new" share one hero
  sentence and the pill-style "Profile at time of each scan" card; the old `ProfileAtScanCard` /
  `FilterColumn` are deleted so it can't reappear.

**Product photos are shown whole, never cropped**
- A tall Cheez-It shot lost the top of its brand name on the item screen. The saved photo was never
  cropped (the camera call has no crop step and it's stored at 600px wide, full frame) — the crop was
  only in how it was DISPLAYED: every screen fit it into a square with `resizeMode="cover"`, which trims
  the top and bottom of a tall photo. All of them now use `contain` (whole photo, leftover space is the
  card's own color) and the big ones got taller boxes: Pantry item 300, Save to Pantry preview 260 (so
  the user sees it's all in frame before saving), Scan History 200, recheck capture 180; thumbnails
  (Pantry tiles and recheck rows, `ProductPhoto`) fit the whole photo in their box. Photos already
  saved are fixed too — nothing to redo.
- Not built: a crop/reposition step at capture time (iOS' built-in editor forces a fixed crop). Ask if
  wanted.

**Clean scan result: "What we checked for" card**
- With the compact hero the clean result was top-heavy with an empty lower half. Added the owner's
  mockup section under the hero: `WHAT WE CHECKED FOR` — the scanned profile(s)' switched-on red flags
  as pills, and "None of these red flags were found in the ingredient list that was scanned." (new pure
  `checkedForLines` in `src/domain/filterSet.ts`, tested; `FilterPill` moved to `src/design/`).
- **Deliberate deviations from the mockup (owner to confirm):** no ✓ on the pills (reads as "verified
  free of it" — legal wording rule); footer says "red flags" rather than "filter packs" (Quick Packs
  were removed from the app); "TRY FLAGGED" is a mockup-only label, not built; disclaimer kept at the
  bottom per the standing rule. With nothing switched on the card says so rather than disappearing.

**Warning when a scan isn't English (found on a device: French side of a label gave 1 flag, not 7)**
- **What happened:** the same product scanned on its English side gave 7 red flags, on its French side
  1 (only TBHQ, which is spelled the same). Not a regression — the Metro log showed the camera had read
  "Ingrédients : Farine de blé…" — but it's a real false-negative risk: the dictionary is English only,
  so another language's list looks like a normal, nearly-empty result.
- **Fix (owner chose option 1, not language-specific):** `src/matching/language.ts` —
  `looksLikeNonEnglish(text)` is true when at least 3 words are clearly another language (foreign
  function/food words, letters English doesn't use, non-Latin scripts) and they outnumber recognisably
  English words. The Scan tab and the recheck capture screen show a warning first: "Check the language…
  please scan the English ingredient list". **First version used the phone's native alert with Scan
  again / Continue anyway; the owner rejected both** — it looked like an iOS notification rather than
  part of the app, and "Continue anyway" defeated the point. It is now an in-app card
  (`src/design/LanguageWarning.tsx`) with a single **Scan again** button and no way past it.
  Doesn't name a language, so a Portuguese + English label works the same way. Tests use the real English
  and French text from the log plus Portuguese, Spanish, German, Italian and Cyrillic samples.
- **Not done (bigger job, only if wanted):** adding French/other-language names to the dictionary so
  those scans actually match. Until then the warning is the safeguard.

**Scan result screen: compact hero card, and abbreviations shown in capitals**
- The normal (non-rescan) Results screen still had the old big circular `CLEAN`/`FLAGGED` stamp (with
  the count inside a circle). It now uses the same compact `HeroCard` as the rescan results — moved to
  `src/design/HeroCard.tsx` and shared — for both clean ("No red flags found" / "for <profile>") and
  flagged ("N red flags on your list" / "for <profile>"). The unused `VerdictStamp` was deleted.
- Everything in the hero card is one style — same size, same bold weight, same color (red or cyan) —
  on every result screen, clean and flagged, scan and rescan. The "for Steve" line used to be smaller,
  gray, with only the name bold and in the profile's color; that read as not bold at all next to the
  headline, and bolding it alone wasn't enough. So the profile color on the scan result's "for
  <profile>" is gone (`HeroCard`'s second line is a plain string in the headline's own style).
- "TBHQ" was showing as "Tbhq" (it *is* in the Synthetic preservatives list). Terms were shown with only
  the first letter capitalized; new `src/domain/displayTerm.ts` shows abbreviations and E-numbers in
  capitals (TBHQ, BHA, BHT, EDTA, MSG, HFCS, FD&C, E320…) on both result screens. Tests added.

**Rescan logic fix: flags already found at the last scan aren't "new" (`known_flags`)**
- **Bug (owner found it on a device):** force-rescanning the same product, with no profile change,
  showed "New red flags detected … likely a product reformulation" — because after **Keep anyway** the
  filters were re-baselined but *which flags were accepted* wasn't remembered, so any flag counted as new.
- **Fix:** `evaluateRecheck` now also takes the terms the last scan matched (newest scan-history entry,
  `lastFlaggedTerms`). If a rescan's flags are all in that list, the outcome is the new `known_flags`;
  one term the last scan didn't have still gives `changed_flagged` (a real possible reformulation).
- **Screen:** clean layout, headline as ONE bold sentence, **"No new red flags found for [Profile]'s current profile"**, with a
  flag icon (an earlier "Nothing new since your last scan" line repeated it, and a half-bold split was
  rejected too) — not "No
  red flags found", since the flags are still on the label — plus the known flags listed under "SAME RED
  FLAGS AS YOUR LAST SCAN", with `Back to Pantry` (filled, on top) above a plain, non-red `Remove from Pantry` (owner
  asked to keep Remove here) and the flagged screen's pill-style profile card (first version wrongly reused the clean
  screen's side-by-side bullets). Re-baselines on open, logged with its terms, no
  red-flag/reformulation counts added. Tests added (engine, helper, stats); docs/07 Outcome 1b.
- **Wording deviation to confirm with the owner:** the owner's phrasing was "clean recheck"/"clean
  scan"; the screen says "No new red flags found" instead, because "clean" would read as no
  red flags found.

**Device check of the 2026-09-24 changes (partly done — the remaining items are in "Where we left off" above)**
- **Confirmed on a device:** the clean result (stamp / "No red flags found" / "for <profile>", Save to
  Pantry + Scan Another + Return to Home, disclaimer below the buttons) and the flagged result
  (disclaimer below the buttons). Still to check from the 2026-09-24 list below: (3) Onboarding name step,
  (4) Profile edit search results, (5) launch on a poor connection. ((2) Save to Pantry fields above the
  keyboard was later confirmed working by the owner.)

**Flagged result: the "can't be saved to your Pantry" note is now a notice, not a caption**
- On a flagged result the old small, muted, centered line read as easy-to-miss (and sat below the
  fold on long flag lists). It is now a filled panel with a left accent bar and an info icon,
  left-aligned, directly above `Scan Another Item` / `Return to Home` (`app/results.tsx`) — in the
  spot where the missing `Save to Pantry` button would be, so a user looking for it sees why.
- First attempt used the buttons' outlined, rounded look and was mistaken for a button; the notice is
  deliberately filled, un-outlined and left-aligned so it can't be. It is not a legal disclaimer, so
  it stays above the disclaimer, which remains the last thing on the screen. Contract updated in
  `specs/001-flagged-mvp/contracts/screens.md`.

**My Pantry rebuilt to the mockup, and "safe"-style wording removed everywhere**
- **Why:** the Pantry tab had been built from the spec's text only — plain text cards, no photo, no
  profile shown, no way to open or remove an item — and titled "My Safe Foods" (wording that came from
  the first spec doc, not from the design). The owner's rule: never name or imply a product is
  "safe", "approved" or "cleared" — a scan can miss things, which is why the disclaimer exists.
- **Renamed** to **My Pantry** (screen title, empty state, store listing, privacy policy, docs, Spec
  Kit headings). Removed "safe list / safe foods / second-guess / still approved"; the recheck
  "Still clean." headline is now "No red flags found." **Guard:** `src/__tests__/copyGuard.test.ts`
  fails on those phrases in `app/`, `src/`, `legal/` and the store listing. Rule added to CLAUDE.md.
- **Layout** (`app/(tabs)/pantry.tsx`): Reformulation Checks to-do list on top (each card now says to
  buy the product again first, then scan the new package, and shows its profile) → saved-product
  cards (front-of-pack photo or brand-initial tile, brand over product, a tag for the profile it was
  saved for) with an All + per-profile filter (2+ profiles) → Recent Changes / Undo at the bottom.
  Re-reads on every focus (it used to go stale, e.g. after Undo).
- **New:** `app/pantry-item.tsx` (tap a card: photo, profile, saved / last-checked dates, **Remove
  from Pantry** → soft delete, undoable for 24h). Home's profile chips moved to
  `src/design/profileChips.tsx` so the Pantry filter reuses them. Not built from the mockup: item
  Edit, scan-history timeline, ingredient list (the app stores no ingredient text).

**Scan History two-column list: content-sized columns (no needless wrapping)**
- The first two-column version used equal halves, so "Synthetic preservatives" wrapped on a phone even
  though the other column had spare room. Columns are now sized to their content (each takes what its
  longest item needs and only shrinks — wrapping — when both together don't fit). Trade-off: the right
  column's start varies slightly between cards. Couldn't measure on a device from here; from the
  screenshot the two columns should fit on one line each with ~20pt to spare on this phone.

**Scan History: red flags in a real two-column list**
- The list of red flags under "SCANNED FOR" was a wrapping row, so short items sat wherever they
  fitted ("Trans fats" beside the second item) and a long list would have been very tall. Now a true
  two-column list: the first half down the left column, the rest continuing at the top of the right,
  with wrapped names hanging under their text. (`TwoColumnList` in `app/scan-history.tsx`.)

**Compact hero card on both rescan results**
- The big centered hero (80px icon, headline, sub-line stacked) took about a third of the screen. New
  shared `HeroCard` from the owner's mockup (`recheck_result_compact_hero_v4.png`; only the hero was
  changed in it): a 48px icon in a circle on the left with the headline and "for [name]" beside it.
  Used by the flagged result (red, flag, "New red flag(s) detected — for Steve") and the clean result
  (cyan, checkmark, "No red flags found" / "No new red flags found for Steve's current profile.").
  Everything below now starts higher.

**Flagged rescan: parallel labels in the "Why is this flagging now?" card**
- After seeing it on a device: "Last checked · Sep 25" vs "Today's scan · profile updated" didn't line
  up. Now **"Profile of last scan · [date]"** and **"Profile of today's scan"** (both white); cyan is
  used only for the filters added since the last scan (the "+" pills). The "When first saved" /
  "Last checked" switch is gone — the last scan is the last scan, whether it was the save or a rescan.

**Flagged rescan: the "profile changed" version of the card**
- From the owner's mockup of the case that actually happens (`recheck_result_flagged_profile_changed_v3.png`):
  when the profile changed, today's label turns cyan — "Today's scan · profile updated" — and the
  filters added since the last check are highlighted (cyan pill, "+ Seed Oils", "+ Preservatives")
  next to the unchanged neutral ones. The "View scan history" link I'd added was removed (not in the
  mockup). The mockup's `PROFILE CHANGED` header pill is a mockup-only state label — not built.
- **Footer kept honest:** the mockup's "Red flags triggered by your updated profile. Probably not a
  product reformulation." is only true if EVERY flag comes from an added filter, so `flagSource`
  (from each match's attribution, tested) picks the wording: all from added filters → the mockup's
  line; a mix → "Some red flags come from your updated profile; the rest are likely a product
  reformulation."; none → "Your profile was updated, but these flags come from filters you already
  had — likely a product reformulation." Tests: 192.

**Flagged rescan: "Why is this flagging now?" card (replaces the clunky two-column section)**
- Rebuilt from the owner's new mockup (`recheck_result_flagged_v3.png`): a card titled **WHY IS THIS
  FLAGGING NOW?** — "When first saved · [date]" (or "Last checked · [date]" after a recheck) with that
  scan's red flags as pills, a divider with a down arrow, "Today's scan" with today's red flags as
  pills, then the one-line footer ("Same red flag set — this is likely a product reformulation." /
  "Your filters changed since you last checked this." + the View scan history link). The clean
  result keeps its two-column "Profile at time of each scan" card.

**Flagged rescan: the long "what changed and when" text is gone**
- The side-by-side's footer had grown into a paragraph naming every filter change with its exact time
  ("Hidden sugars added on Sep 25, 2026 at 6:26 PM; Synthetic preservatives added on … That's likely
  why it's flagging now."). Cut as too much text: the side-by-side already shows what changed. Now
  one short line — "Your filters changed since you last checked this." — with a **View scan
  history →** link (opens the item's Scan History). Same-filters footer unchanged.
- Trade-off, by the owner's choice: the exact times a filter was added are no longer spelled out on
  this screen. They're still recorded (`profile_change_log`); the scan history lists what each scan
  was checked against. The per-match attribution logic (reformulation / added / re-included) still
  runs and is tested, but the screen no longer uses it — the change-time lookups it needed
  (`findCategoryEnabledChange` etc.) are now unused. Tests: 189.

**Flagged rescan: the side-by-side moves up under the banner**
- The "Profile at time of each scan" card now sits directly under "New red flags detected — for
  Steve", above the per-filter cards, so the reason for the flag (what the profile was scanning for
  then vs. now, and what changed) is visible without scrolling. Order: header → banner → side-by-side
  → flagged filters → Remove / Keep anyway.

**Rescan result screens get a title ("Rescan Result")**
- After seeing the flagged screen on a device: the header jumped straight to the product with nothing
  saying what the screen was, unlike every other screen (Pantry Item, Scan History, Result). Both
  rescan results (clean and flagged) now have the back arrow with the title **"Rescan Result"**, and
  the product photo · brand/product on a row below.

**Flagged rescan screen rebuilt to the owner's mockup**
- Same idea as the clean screen: header (back · photo · brand/product — no pill), a red banner ("New red flag detected — for Steve"), one card per flagged
  filter (name + classification badge + ingredient chips — replacing the paragraph repeated for every
  ingredient), the shared **Profile at time of each scan** side-by-side, and **Remove from Pantry** /
  **Keep anyway**. Header and side-by-side card are now shared with the clean screen.
- Footer of the side-by-side (`flaggedFooter`, tested): same filters → "Same red flag filter set —
  this is likely a product reformulation, not a profile change." Filters changed → it says what
  changed and the exact time ("Preservatives added on Oct 20, 2026, 3:12 PM … likely why it's
  flagging now"), so that explanation survives dropping the per-flag paragraphs. The mockup drew only
  the same-filters case; the changed case is the app's own honest counterpart.
- Mockup saved as `docs/screenshots/recheck_result_flagged_v2.png`; older flagged mockups marked
  superseded. I first built the mockup's header pill ("SAME PROFILE" / "PROFILE CHANGED"); the owner
  clarified it's a mockup-only label for switching states, so it was removed. Lesson: pills/labels in
  the owner's mockups can be state switchers — ask before building one. Tests: 192.

**"CLEAN" pill removed from the clean rescan screen**
- The header's `CLEAN` tag came from the owner's mockup, but a status tag can be taken literally and
  works against the disclaimer. Removed; the verdict card ("No red flags found") says what was found
  and nothing more. Rule added to CLAUDE.md, and `copyGuard.test.ts` now fails on a `<Text>` whose
  whole content is CLEAN / CLEAR / SAFE / OK. (The scan-result screen's `CLEAN` / `FLAGGED` verdict
  *stamp* is a different element and was left as designed.)

**Product photo carries through every recheck screen**
- After forcing a rescan on a device: the photo was on the capture screen but not on the two result
  screens. New small `ProductPhoto` component (`src/design/ProductPhoto.tsx` — renders nothing if
  there's no photo or it can't load; only displays the saved file) is now on the clean result (56px,
  in the header) and the flagged result (80px, under "Red Flag Detected!"), as well as the capture
  screen. Rule recorded in `docs/07`.

**Scan History screen: product block at the top; "SCANNED FOR"**
- After seeing it on a device: "Real Foods · Corn Thins" in the header was easy to miss, so the screen
  now shows a product block like the item card — photo (when it has one), brand, product — under the
  title, then the timeline (newest first, `LATEST` on top; the whole screen scrolls). The label
  "SCANNING FOR" became **"SCANNED FOR"** (it's a past snapshot of the profile's red flags). The clean
  rescan screen's card is the owner's own mockup wording, so it was left as drawn.

**Pantry item screen de-duplicated**
- The item screen repeated itself: "Saved for Steve", a "Saved" date, a "Last checked" date, then the
  Scan History card showing the same first-saved date. Now: photo · brand/product · **SAVED TO
  PROFILE** (a pill with the profile's dot and name, per the owner's mockup style) · Scan History ·
  Remove. The two date rows are gone — the Scan History card has the first-saved date and the history
  screen has every scan's date and time.

**Scan History: every Pantry item keeps a log of each scan and the red flags used**
- From the owner's two mockups (`pantry_item_scan_history_v2.png`, `scan_history_v2.png`; only the
  Scan History parts): the item screen has a **Scan History** card ("N scans" running total — the
  save counts as the first — and "First saved [date]"), which opens `app/scan-history.tsx`, a
  timeline (newest first, `LATEST` tag) of each scan's date · time, what it was, and the profile +
  red flags it was scanning for at that scan.
- **Why it's needed:** a clean rescan re-records the item's current baseline, which would overwrite the
  filters it first came back clean under. New table `pantry_scan_history` (replaces the short-lived
  `pantry_rechecks`, which had no filters) keeps them: a `saved` row from `addPantryItem` and a
  `rescan` row from the recheck-result screen, each with the exact time and the settings used.
  `ensureSavedHistoryEntry` persists the original save before any re-recording; an item saved before
  the history existed still shows its "saved" entry (filters known only if never re-recorded).
- Text only (a few hundred bytes per entry); deleted with the item at the 24h purge (that also fixes
  the old rescan-log rows being left behind). Pure, tested wording in `src/domain/scanHistory.ts`.
  Tests: 187.

**A clean rescan becomes the new baseline (so the side-by-side moves forward)**
- Before: a clean rescan only reset the 30-day timer, so the "Profile at time of each scan" card kept
  comparing against the *original save* forever. Now, when a clean result opens, the item's recorded
  filters are re-recorded as of that scan and `snapshotAt` / `lastVerifiedDate` become the scan's
  timestamp (`rebaselinePantryItem` takes the scan time). In 30 days the left column shows this
  scan's date and filters and "Today" is the new rescan. Done on open (not on the button), so the
  back arrow or a swipe can't skip it; the open screen still shows the previous baseline.
- "Keep Item" uses the scan's timestamp too, and flagged-screen wording after any recheck reads
  "you last checked this on…" / "LAST CHECKED" (was "kept"). `markVerified` is now unused (dead code).

**Due items now stay in Saved Products; photo on the to-do card**
- An item due for a recheck used to be removed from Saved Products (the original spec said it "moves
  out of the main grid"), so the header and filter counts said 2 while the grid showed 1 and the item
  looked deleted. It now appears in **both** places (owner's call); counts match what's on screen.
  `docs/05` corrected.
- The Reformulation Checks card now shows the item's small saved product photo (~64px) on the left,
  only if it has one.

**Storage cleanup: temporary scan photos deleted after ~20 minutes; product photo on the recheck screen**
- **Leak found:** every scan left full-size photos in the phone's temp/cache folders forever — the
  camera's original, the cropped copy the OCR reads (~1–3 MB JPEG), the Choose Photo copy, and the
  full-quality source of every Pantry product photo. New `src/domain/tempPhotos.ts` (+ pure, tested
  `tempPhotoRules.ts`): each is registered when created and deleted 20 minutes later. Sweeps run at
  launch, on returning to the foreground, and ~20 min after each capture. Only registered files
  inside the app's own temp/cache folders can be deleted — never the Pantry thumbnails or the photo
  library.
- **The product photo saved with a Pantry card is untouched** (compressed file in `pantry/`, kept
  until the card is permanently deleted). Only the camera's temporary full-size original that it's
  made from is cleaned up.
- **24-hour undo fixed:** Recent Changes now filters by age when it's read (an item removed >24h ago
  used to show with an Undo until the next launch), and the permanent purge — the row and its photo
  file — now also runs whenever the app returns to the foreground, not just at launch.
- **Recheck capture screen** shows the item's saved product photo (~120px, above the name) when it
  has a readable one — for visual confirmation only; no new copy is stored. No photo → the generic icon.
- Tests: 184 (was 177).

**Recheck flow: one step to the capture screen, not two**
- Tapping `Recheck →` used to open a "Grab the new box — Yes, open camera / Remind me later" popup,
  which then opened the capture screen with its own "Open camera" button: the same question asked
  twice. The popup is gone; `Recheck →` goes straight to `recheck-capture.tsx`, which now reads "Only
  scan the ingredient list on a NEWLY PURCHASED box." (the rule the popup carried) with Open camera /
  Paste / Cancel. (The Spec Kit files `spec.md` FR-017 / `tasks.md` still describe the popup — they're
  the historical planning record; `docs/05` and the screens contract are current.)

**Clean rescan screen rebuilt to the owner's new mockup**
- `app/recheck-result.tsx` (no-red-flags outcome) now follows `docs/screenshots/recheck_result_clean_v2.png`:
  header (back · brand/product · `CLEAN` tag), teal verdict card, a **PROFILE AT TIME OF EACH SCAN**
  card, Back to Pantry. Much shorter than the old paragraph version. The back arrow accepts the
  result (resets the 30-day timer), like the button.
- **Profile-at-time-of-each-scan card:** two columns — the date the item's red flags were recorded
  (`snapshotAt`) with the categories it was saved under, and "Today" with the profile's filters now
  (`filterSetLines`, `sameFilterSet` in the new `src/domain/filterSet.ts`, tested). Footer: "Same
  filter set — no new red flags detected." — or, if the filters changed but the rescan is still
  clean (a case the mockup doesn't cover), "Your filters changed since you saved this — no red flags
  detected with the current set." so it never claims "same" falsely.
- The owner's updated mockup already uses the compliant wording ("No red flags found", "Back to
  Pantry"). The older recheck mockups in `docs/screenshots/` are marked superseded in `docs/17`; the
  flagged-rescan screen is next, from the owner's new mockup.

**No invisible features: the Pantry always shows every section; dev-only "Force recheck"**
- The Reformulation Checks to-do list, the profile filter and Recent Changes used to disappear when
  empty (and the whole screen collapsed to one message when nothing was saved). Every section is now
  always on screen with a plain-words empty message ("Nothing to recheck yet…"). Rule added to
  CLAUDE.md, `docs/05` and the screens contract — it was not written down before.
- **Dev-only test aid:** the Pantry item screen has a labelled **Force recheck (mark as due)** button
  in `__DEV__` builds only (`devForceRecheckDue` backdates just `lastVerifiedDate` to 31 days ago) so
  the to-do list, red dot and full recheck flow can be tested without waiting 30 days.
- The Pantry tab's red dot now also refreshes on any route change (it used to miss returns from the
  item screen / a recheck result until you switched tabs).

**Recheck explains itself with exact timestamps (owner's rule: every change is timestamped)**
- **The scenario it must handle:** Hidden sugars on → scan comes back clean → saved to the Pantry →
  30 days later the user has also added Preservatives → the rescan flags Preservatives. The app now
  knows and shows *when the item was saved*, *when Preservatives was added to the profile*, and *when
  the rescan happened*, all with the time of day, and says why it's flagging.
- **New data** (additive, guarded migration in `src/db/client.ts`): `pantry_items.snapshot_at` (when
  an item's red flags were recorded — the save time, or the last "Keep Item"; old rows read as their
  `date_added`) and an append-only `pantry_rechecks` table (item, profile, `scanned_at`, outcome,
  matched terms — written once when the recheck result opens). The change-log lookups now only count
  profile edits made at or after `snapshot_at`. The scan itself is stamped in `recheck-capture.tsx`.
- **Four attributions, not two** (`recheckEngine.ts`): reformulation, or a profile change that is a
  category added / an ingredient the user had excluded and turned back on / a custom term added. The
  "excluded then re-included" case used to be mislabeled a reformulation. Messages live in the new
  pure `src/domain/recheckExplain.ts`; a reformulation is now worded as "the recipe may have changed —
  or the earlier scan missed it. Check the label." (a clean scan can miss things), never as fact.
  The flagged recheck screen also shows a saved/last-kept → this-scan timeline.
- **"All profiles" save:** a clean scan run for several profiles now saves one card per profile, each
  tagged to it with its own snapshot (previously one card on the active profile only). They share one
  photo file; the 24h purge no longer deletes a photo another card still uses. The Save screen says
  which profiles it's saving under.
- **Known limit:** the snapshot stores category / exclusion / custom settings, not the resulting term
  list, so a dictionary update that adds an ingredient to a category (the dictionary re-seeds when its
  schema version changes) would read as a reformulation. A fix would be to snapshot the profile's own
  red-flag terms (from the bundled dictionary — exact, never OCR'd label text; the app deliberately
  stores no scanned ingredient text, see docs/07 §7.1) — not built, low priority. Also: only Pantry rechecks are logged as scans — normal Scan-tab scans aren't stored (they
  only update the profile's counters).
- **Not yet checked on a device:** the migration on an existing install (adds `snapshot_at`), and the
  whole flagged-recheck flow with real dates. Tests: 168 (was 157).

## 2026-09-24

**Where things stand at the end of this session — pick up here**
- **Everything below is committed and pushed, but only typecheck/lint/155 tests were run — none of
  it has been looked at on a device yet.** First thing next session, with the phone on Metro
  (`npm start`, dev client): (1) clean result shows only the stamp / "No red flags found" / "for
  <profile>" with Save to Pantry, Scan Another, Return to Home, and the disclaimer *below* the
  buttons (also check a flagged result); (2) Save to Pantry — both fields visible with the keyboard
  up; (3) Onboarding name step — Continue/Skip above the keyboard; (4) Profile edit — ingredient
  search results stay visible and tap on the first try; (5) launch on a very poor connection opens
  within ~3 s.
- **Resolved, not a bug:** the 8:49 scan flagged 13 items for Steve and the 8:51 scan of a label with
  the same wheat/soy/sugar ingredients came back CLEAN because the owner had switched Steve's filters
  off to get a clean result (confirmed 2026-09-24). Matching behaved correctly.
- **New small follow-ups:** `cleanForDisplay` (`src/matching/normalize.ts`) has no caller in the app
  anymore (still unit-tested) — remove it and its tests if nothing needs it; Settings' name field
  didn't get `keyboardAvoiding` (not needed today).
- The 2026-09-23 open items (fresh sandbox tester for the eligible paywall / "7 days free", Pantry
  red dot, app icon + splash, Terms/Privacy pages, EAS production build) are unchanged — see below.

**Launch no longer waits indefinitely on RevenueCat**
- `bootstrap()` used to `await refreshEntitlement()` with no time limit, so on a slow or hung
  connection the app sat on the launch spinner even though a valid cached entitlement was available.
  It now races the refresh against a 3-second timeout (`ENTITLEMENT_LAUNCH_TIMEOUT_MS` in
  `src/bootstrap/init.ts`): whichever finishes first decides launch, and on timeout the app opens on
  the cached value (`isPremiumCached`).
- The refresh is not abandoned: its late answer is still applied via `setPremium`, so a subscription
  that lapsed while the app opened on the cache re-locks (the live listener is activation-only, so
  it could not have done this). Offline/fast-failure behaviour is unchanged.
- Logic is the pure, tested `src/purchases/launchEntitlement.ts` (`entitlementWithinTimeout`, 8
  tests, written test-first: in-time answer, timeout fallback, late answer delivered, late/early
  rejection handled, no leftover timer). `docs/08` updated. Typecheck, lint, all 155 tests pass.
  **Not yet checked on a device** — simulate with the phone on a throttled/very poor connection.

**Clean result screen simplified**
- Found on a device: the CLEAN result dumped the entire OCR'd ingredient list (nutrition-panel
  debris and French duplicates included) and added an explanatory sentence, "None of the
  ingredients flagged for X appear on the label we read." Neither belongs on a result.
- `app/results.tsx` now shows, for a clean scan: the CLEAN stamp, "No red flags found", and the same
  "for <profile>" line (profile color) the flagged result uses — then Save to Pantry / Scan Another /
  Return to Home. The ingredient card and its highlighting code (`segments`) are gone; a flagged
  result was already list-free (2026-09-13).
- The old clean design lived in `docs/07`, the screens contract, and the `results_clean.png` mockup,
  so all three were stale rather than the code being wrong: `docs/07` and the contract are updated,
  and `docs/17` notes the mockup is out of date. `cleanForDisplay` (`normalize.ts`) now has no
  caller in the app (still unit-tested) — remove it if nothing else needs it. Typecheck, lint, all
  155 tests pass. **Not yet checked on a device** (Metro fast-refresh should show it).

**Keyboard no longer hides text fields (Save to Pantry, Onboarding, Profile edit)**
- Found on a device: tapping into Brand Name / Product Name on Save to Pantry raised the keyboard
  over the form, and Product Name (and Save/Cancel) ended up underneath it. Nothing in the app
  handled the keyboard at all.
- The shared `Screen` (`src/design/components.tsx`) has a new opt-in `keyboardAvoiding` prop: it
  wraps the content in a `KeyboardAvoidingView` (iOS `padding`), so the visible area shrinks to what's
  above the keyboard. Default is off, so the other screens render exactly as before. Use it on any
  screen with a text field, together with `keyboardShouldPersistTaps="handled"` on its ScrollView so
  a tap on a button/result works with the keyboard up instead of only dismissing it.
- Turned on for: **Save to Pantry** (both fields fit on a standard iPhone; scrolls on shorter ones;
  still centered with the keyboard down), **Onboarding** (the name step autofocuses, so the keyboard
  covered Continue/Skip — only the attribute changed; onboarding's copy/flow is still deferred), and
  **Profile edit** (the ingredient-search results list grows below the field and was covered).
- **Settings** was deliberately left alone: its name field is at the top of the screen, so the
  keyboard can't cover it. Add `keyboardAvoiding` there if it ever grows a field lower down.
- **Not yet checked on a device**, and not tested on a short-screen phone.

**Results disclaimer moved below the buttons**
- The "Flagged is an informational tool…" disclaimer sat between the verdict/content and the action
  buttons on both clean and flagged results. It's now the last thing on the screen, below Save to
  Pantry / Scan Another Item / Return to Home (`app/results.tsx`). It was the only disclaimer in the
  app. Owner's standing rule — disclaimers and legal text go at the bottom, after the buttons — is now
  in `CLAUDE.md` (Hard rules) and `docs/07`. Typecheck, lint, tests pass. Not yet checked on a device.

## 2026-09-23

**Where things stand at the end of this session (2026-09-24) — open items**
- **Verified working on a device (sandbox):** paywall → Apple purchase sheet with the 1-week free
  trial → RevenueCat → Scan tab unlocks; trial converts to a paid period; the ineligible-user
  paywall ("Subscribe for $24.99/year", no trial promise) displays correctly.
- **Not yet verified on a device:** the *eligible*-user paywall after the spacing rework (needs a
  fresh sandbox tester who hasn't used the trial); the Pantry red dot (needs an item >30 days old —
  a dev-only "age an item" button would help — since added, and the owner has confirmed the dot works); a subscription lapsing back to the paywall.
- **Before App Store submission:** app icon (1024×1024, in progress) + splash config; Terms of
  Service and Privacy Policy pages hosted at a URL the owner controls (`flagged.app` currently
  serves a different product; drafts are in `legal/`); subscription Display Name/Description are
  set in App Store Connect; production EAS build, upload, attach the subscription to the version,
  final review screenshot/notes (owner says done); set `EXPO_PUBLIC_RC_IOS_KEY` as an EAS
  environment variable (`.env` only feeds dev builds); decide whether to add Restore Purchase to the
  paywall if App Review asks.
- **Known/deferred:** onboarding is still the original flow (stale 10-scan copy) — deliberately
  deferred; RevenueCat/Play Android side is not built; eligibility lookup could use a timeout on
  slow connections. (The launch wait on RevenueCat is now capped at 3 s — see the 2026-09-24 entry
  above.)
- **Later, after release:** move the repo folder into `C:\Users\steve\Apps\` (see CLAUDE.md /
  memory note for the steps).

**CLAUDE.md rewritten to match the code**
- The old `CLAUDE.md` described a stack the app never used (`expo-camera`, Claude vision OCR,
  FlashList, `expo-linear-gradient`, `@expo-google-fonts`). Rewrote it from the actual code:
  Expo SDK 51, `react-native-vision-camera`, on-device Apple Vision OCR (`modules/vision-ocr`,
  iOS only), `expo-sqlite` + Drizzle, Zustand, RevenueCat, real screen list, current 7-day-trial
  model, repo layout (git root is one level above `flagged-app/`), and a "Keeping this file
  current" rule: any change that departs from `CLAUDE.md` must update it in the same change.
- Code was deliberately not changed to match the old file — the code is the source of truth.
- Onboarding (`app/onboarding.tsx`) is intentionally still the original flow (stale "10 free
  scans" copy, no soft paywall) until onboarding work starts.
- Stale docs still to refresh: `docs/17` screen paths, 10-scan mentions in `docs/01`/`06`/`13`
  and the Spec Kit constitution/contracts (tracked in `CLAUDE.md`).

**Stale-docs refresh (docs/, README, Spec Kit)**
- Audited every doc against the code and fixed the retired-model leftovers: the 10-free-scan
  trial → 7-day trial + hard Scan-tab lock (`01`, `03`, `05`, `06`, `07`, `10`, `13`), the
  3-second live scan / frame processor / ML Kit → manual-shutter guide-box capture with Apple
  Vision (`02`, `05`, `06`, `14` rewritten, `16`), `diffEngine.ts`/skimpflation → `recheckEngine.ts`
  (`13`), Home tiles/Pantry headings (`05`), Quick Packs removed from the profile editor and the
  scan-meter component (`09`), screen file paths and missing screens (`17`).
- `docs/04-onboarding.md` got a "pending redesign" banner only (onboarding is deliberately
  deferred); README's skeleton-era claims (camera "stub", `flagged_lifetime`, 13 tests, fonts TODO)
  corrected.
- Spec Kit: constitution amended to **v2.0.0** (Principle III now the 7-day trial + annual
  subscription, not a 10-scan gate + one-time purchase); contracts `purchases-gating`,
  `recheck-diff`, `ocr-pipeline` rewritten and `screens` updated to match the code;
  spec/plan/tasks/research/data-model/quickstart marked as a historical planning record.
- Found while auditing: the "Habit" review trigger's 50-scan path read the legacy `stats`
  singleton, which nothing updates, so it never fired — superseded by the review-schedule rewrite
  below. Also corrected `CLAUDE.md`: the JS code runs no camera frame processor.
- Not read in full (only searched for retired terms): `docs/11`, `12`, `15`, `data-schema.md`,
  `legal/`.

**New paywall in the Scan tab**
- Rebuilt the Figma paywall mockup as `src/purchases/PaywallView.tsx` — "FLAGGED PRO" header,
  $24.99/year card with a 7-day-trial pill, four feature rows, a CTA, a short summary sentence
  under it ("7-day free trial, then $24.99 per year, renewing automatically. No charge today. You'll see
  an in-app reminder before billing, and you can cancel anytime."), and the
  required subscription disclosure — in the app's design system (Atkinson Hyperlegible, brand
  cyan instead of the mockup's green, theme tokens, Dynamic Type sizes only).
- The Scan tab now shows it inline for non-subscribers instead of the old lock icon + button;
  `app/paywall.tsx` now just wraps the same component (kept for the future onboarding soft
  paywall). `withAlpha` is now exported from `src/design/components.tsx`. Mockup saved as
  `docs/screenshots/paywall.png`. Docs/contracts updated. Typecheck, lint, 120 tests pass.
- Paywall legal text trimmed: removed the Terms/Privacy links (they stay in Settings — Apple
  requires them in the app and App Store metadata, not on the purchase screen) and cut the
  disclosure to one line + a "Subscription details" link to a new in-app screen
  (`app/subscription-details.tsx`) holding the longer wording, with a Back button. Restore
  Purchase stays in Settings only (add to the paywall if App Review asks). The details wording is
  standard auto-renewal boilerplate and hasn't been reviewed by a lawyer.
- RevenueCat wiring check: the paywall is shown exactly when `isPremium` is false (cache at launch →
  confirmed by RevenueCat in bootstrap → refreshed on foreground / purchase / restore). Added a live
  RevenueCat listener (`subscribeToEntitlement`, activation-only) so an Ask-to-Buy approval or
  redeemed code unlocks the app without a restart. Dashboard (project "Flagged-Food Label
  Scanner"): entitlement `premium` ← Flagged Annual products, offering `default` with an Annual
  package — all present.
- Verified on a device (2026-09-23, sandbox): paywall → Apple purchase sheet
  ([Environment: Sandbox]) → RevenueCat records `flagged_annual` and the `premium` entitlement →
  the Scan tab unlocks by itself. Getting there needed a fix on the user's side: the RevenueCat iOS
  key in `.env` matched neither Flagged RevenueCat project (401 "Invalid API Key"); it now matches
  the "Flagged iOS" app in project "Flagged-Food Label Scanner".
- **Trial mismatch found and fixed (RevenueCat side):** the sandbox purchase was NOT a free trial
  (Apple's sheet showed "$24.99 per year" / "Subscribe"; the period ended about an hour later).
  Cause: the free-week introductory offer (Sep 21, 2026, no end date; US/CA/UK/AU/NZ) is on the App
  Store Connect subscription whose Product ID is **`Flagged_Pro_Annual`** — the only subscription in
  the "Flagged Pro" group — but the app/RevenueCat were still using a leftover `flagged_annual`
  product from an earlier setup, which has no trial. Fix: created RevenueCat product
  `Flagged_Pro_Annual` (id `proddda71ffb3d`) on the Flagged iOS app, attached it to the `premium`
  entitlement and the `default` offering's Annual package, detached the old iOS product from that
  package (left on the entitlement, not deleted), and set `ANNUAL_PRODUCT_ID` and the docs to
  `Flagged_Pro_Annual`. **Still to verify:** a fresh sandbox tester (or cleared purchase history +
  reinstall) should now see "7 days free" on Apple's sheet.
- Product note: some real users won't be eligible for the trial (already used it, returning
  subscribers); the paywall currently always says "7-day free trial / No charge today". Planned:
  check eligibility via RevenueCat and show the trial wording only to eligible users.

**Trial eligibility: only promise the trial to people who get it**
- Apple allows one introductory offer per Apple account per subscription group, so returning
  subscribers, reinstalls and anyone who already used the trial pay right away — but the paywall
  always said "7-day free trial / No charge today". Now `PaywallView` asks RevenueCat
  (`getTrialEligibility`, using `checkTrialOrIntroductoryPriceEligibility`) and shows the trial
  wording only to eligible users; everyone else gets "Subscribe for $24.99/year" with a plain
  price-and-renewal summary. "Unknown" (e.g. offline) does not promise a trial. Copy rules are the
  pure, tested `trialEligibility.ts` (10 tests, written test-first). The Subscription details
  screen now words the trial as "if you're eligible". All 147 tests, typecheck and lint pass.
  **Not yet verified on a device** (an account that already used the trial should see the plain
  "Subscribe" wording; a fresh sandbox tester should see the trial wording).

**In-app reminders: trial-ending banner + Pantry red dot**
- Apple sends no reminder before a trial converts to a charge (owner-verified), so the paywall now
  promises an "in-app reminder" and the app delivers it — no push notifications, by design:
  - Home banner during the last 3 days of a trial that hasn't been cancelled: "Your free trial ends
    Tue 5:42 PM — Cancel by Mon 5:42 PM if you don't want to be charged $24.99" + Manage
    subscription. Shows the cancel-by time (Apple needs 24h notice), not a countdown; in the final
    24 hours it says the cancel window has passed. Logic is the pure, tested `trialBanner.ts`
    (11 tests, written test-first); UI is `TrialEndingBanner.tsx`.
  - Red dot on the Pantry tab icon while any item is >30 days since last verified
    (`src/domain/pantryDue.ts`, 6 tests) — the Pantry already lists those at the top.
  - `purchases.ts` now caches the entitlement's `periodType` and `willRenew` (needed to know a trial
    is active and not already cancelled) and notifies the app store when they change.
  - Settings' dev-only buttons "Simulate trial ending in 48h / 20h" show the banner without waiting.
- Paywall wording updated to match ("You'll see an in-app reminder before your trial ends, so you can
  cancel before your card is charged"; bullet 4 now describes the Pantry recheck instead of a
  reminder). Typecheck, lint, and all 137 tests pass. **Not yet checked on a device.**

**Review requests redesigned for the 7-day trial**
- Replaced the old "Aha" (5th flagged ingredient) and "Habit" (30 days premium / 50 scans)
  triggers with three requests, each at most once, each right after a completed scan once the user
  has left Results: (1) inside the 7-day trial, (2) after the trial ends, (3) 30+ days after the
  trial was activated. At most one per scan, in that order.
- New pure, unit-tested `src/review/reviewSchedule.ts` (14 tests, written test-first);
  `onScanCompleted()` replaces `onFlaggedResultDismissed`/`onAppForeground` and is called from
  `app/results.tsx` for clean and flagged scans; the foreground trigger was removed from
  `app/_layout.tsx`. `purchases.ts` now caches the store's original purchase date
  (`cachedPremiumSince`) as the trial-start anchor.
- Typecheck, lint, and all 120 tests (9 suites) pass. **Not yet verified on a device** — the native
  prompt and RevenueCat dates can only be checked in a TestFlight/sandbox build. Because scanning
  requires premium, requests 2–3 only reach people who kept their subscription; iOS caps the system
  prompt at about three per year, so this schedule uses that whole allowance in the first month.
  Docs updated (`docs/10`, `03`, `14`, README).

**Seed cleanup**
- `src/db/seed.ts`: the first-launch `stats` insert no longer names the retired
  `total_skimpflation_caught` column (it falls back to its `DEFAULT 0`). This was never a crash
  — `client.ts` still creates the column — just a leftover; `client.ts`'s `CREATE TABLE` is
  intentionally unchanged so existing and fresh installs keep the same table shape. Typecheck
  and all 106 Jest tests pass; not yet verified on a fresh device install.

**`eas.json` submit block — reviewed, closed (no change)**
- Contains the App Store Connect key path, key ID and issuer ID only. The private `.p8` is
  gitignored and never committed, so nothing sensitive is exposed; the IDs can't authenticate
  alone. Accepted as-is. Recorded under "Settled decisions" in `CLAUDE.md` so it isn't re-raised.

**Moved everything Flagged-related out of OneDrive**
- API keys, design bundle, Red Flag Ingredients source docs, mascot folder, workspace file and
  master brief moved from `OneDrive\Desktop\...` to `C:\Users\steve\Apps\` (local, non-synced).
- `eas.json` `ascApiKeyPath` updated to `C:\Users\steve\Apps\API Keys\Flagged_AuthKey_M69U92KZ2K.p8`
  (the old OneDrive path no longer existed). Not yet re-tested with a real `eas submit`.

## 2026-09-21

**Tooling & CI**
- Installed and configured ESLint (`.eslintrc.js` extending `expo`), fixed all findings —
  including a real bug: Settings' subscription renewal date was memoized on `isPremium`, which
  doesn't change on a `true→true` renewal, leaving the displayed date stale.
- Added `.github/workflows/ci.yml` — lint, typecheck, and Jest run automatically on every
  push/PR.

**Apple business-account migration (resolved)**
- Root-caused a week-old blocker: the app's iOS bundle ID/App ID/provisioning profile had been
  silently registered under the old *personal* Apple team (`HYQMQAMA7Q`) instead of the new
  *business* team (`TX2LUQ529P`) back on 2026-09-14, because EAS defaulted to whichever Apple
  session was already cached.
- Fixed via `EXPO_ASC_API_KEY_PATH` / `EXPO_ASC_KEY_ID` / `EXPO_ASC_ISSUER_ID` /
  `EXPO_APPLE_TEAM_ID` / `EXPO_APPLE_TEAM_TYPE` environment variables, forcing EAS to
  authenticate against the correct team; registered a device and produced a working iOS
  development build under the business team.

**Dev workflow**
- Diagnosed and fixed OneDrive Camera Upload (OneDrive had silently stopped syncing) so iPhone
  screenshots sync to this PC automatically instead of an email round-trip.
- Discovered the project existed as **two independent local git clones** of the same GitHub
  repo (`C:\Users\steve\Flagged` and a OneDrive copy) that had silently diverged — the OneDrive
  one fell 3 commits behind. Decision: retire the OneDrive copy; `C:\Users\steve\Flagged` is the
  one true local copy going forward. Run `eas build` / `expo start` from here from now on.

**Design system**
- Added a `subheadline` token (15pt, Apple's "Subheadline" text style) filling the gap between
  `caption` (13pt) and `body` (17pt) — used for genuinely-informational secondary text (privacy
  explanation, trial counts, Pro feature subtitles) that was previously stuck at the smallest,
  least-legible size.

**UI fixes**
- Home: stat tiles now 2-per-row instead of 4 squeezed into one row; relabeled
  `Scans`/`Saved`/`Flags`/`Reformulated` → `Total Scans`/`Pantry Items Saved`/`Red Flags
  Found`/`Reformulations Found` — self-explanatory instead of generic.
- Settings/paywall: added a monthly price breakdown ($2.08/mo) alongside the daily one, paired
  with "less than a pack of gum."

**Business model pivot: 10-free-scans → 7-day free trial**
- Removed the scan-count gate entirely (`canScan`/`scansRemaining`/`bumpTrialCounter`/
  `FREE_SCAN_LIMIT`) — gating is now purely `isPremium`-based.
- Scan tab: the hard-lock screen (already built for this shape) now triggers on trial/subscription
  status, not scan count; copy updated to match.
- Settings: removed the "Free Trial"/"Flagged Pro" upsell card entirely for non-premium users —
  the paywall now lives in onboarding (soft, skippable — **not yet built**) and the Scan tab's
  hard lock.
- Confirmed via RevenueCat's `rc` CLI: no dashboard restructuring needed — entitlement/offering/
  product were already correctly wired, and RevenueCat already marks `premium` active from trial
  start, not delayed until the first real charge. The 7-day trial itself needs to be configured
  on the App Store Connect side (Steve's task).
- Documented in `docs/08-monetization.md`.

**Known follow-ups, not yet done**
- Onboarding soft-paywall screen — not built yet (Figma redesign in progress).
- ~~`src/db/seed.ts`'s `ensureStatsSingleton()` inserts a retired `total_skimpflation_caught`
  column~~ — resolved 2026-09-23 (see above).
- The OneDrive copy of the repo still exists on disk — safe to delete once tonight's work is
  pushed (see "Dev workflow" above).
