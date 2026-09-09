# Feature Specification: Flagged V1 MVP

**Feature Branch**: `001-flagged-mvp`

**Created**: 2026-09-08

**Status**: Draft

**Input**: Master Product & Technical Brief (V1 MVP) — `docs/00-master-brief.pdf` — plus the
detailed product docs `docs/01`–`docs/10` and `docs/data-schema.md`. This spec defines the
complete first shippable version of Flagged so that the existing codebase can be measured
against a clear finish line.

## Overview

Flagged is a personalized food-label ingredient scanner for phones. A user points their
camera at the ingredients paragraph on a package. The app reads that text entirely on the
device, compares every ingredient against the personal list of things that user wants to
avoid ("Red Flags"), and shows a plain-language result that highlights any matches. It works
with no internet connection. New users get 10 free scans with every feature unlocked; after
that, a single one-time payment unlocks unlimited scanning forever. There is no subscription.

**Primary user**: a US parent managing groceries for a household with multiple dietary
triggers (for example artificial-dye sensitivity / ADHD, severe food allergies, celiac).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Scan a label and get a clear answer (Priority: P1)

A user opens the Scan tab, points the camera at an ingredients list, and within a few
seconds sees whether anything on that label matches what they are avoiding — with the
offending words highlighted and a short explanation of why each one was flagged.

**Why this priority**: This is the entire product. If only this works, Flagged already
delivers its core value: "tell me if this food is a problem for my family."

**Independent Test**: Point the camera (or use the Paste / Choose Photo input) at a known
ingredients list with and without a targeted ingredient; confirm the result screen correctly
shows "clean" or "flagged," highlights the right words, and explains each flag.

**Acceptance Scenarios**:

1. **Given** an active profile that avoids artificial dyes, **When** the user scans a label
   containing "Red 40," **Then** the result screen shows "Red flags detected," highlights
   "Red 40" in the flagged colour, and the breakdown states it matched the Artificial Dyes
   filter.
2. **Given** an active profile, **When** the user scans a label with no avoided ingredients,
   **Then** the result screen shows "No red flags detected" and displays the full ingredient
   text.
3. **Given** the camera cannot read a legible ingredients list, **When** the 3-second capture
   ends, **Then** the app shows an error, does not show a result, and does not use up a free
   scan.
4. **Given** a common OCR misread (for example "1" in place of "l"), **When** the text is
   matched, **Then** a genuine avoided ingredient is still caught, and a valid ingredient
   containing a digit (for example "Red 40") is not corrupted or falsely flagged.
5. **Given** a successful result screen, **When** the user chooses "Scan Another Item," **Then**
   they return to a ready camera (or, if they just used their 10th free scan, to the unlock
   screen).

---

### User Story 2 - Personalise what gets flagged (Priority: P1)

During onboarding and later from the Home tab, a user chooses which ingredient groups to
watch for, fine-tunes individual ingredients, adds their own custom terms, and keeps
separate filter sets for different family members.

**Why this priority**: A scan is only meaningful against the right filter set. Without
personalisation the result is generic and untrustworthy for a multi-trigger household.

**Independent Test**: Create two profiles with different Quick Packs selected, switch the
active profile, and confirm the same label produces different results for each.

**Acceptance Scenarios**:

1. **Given** the onboarding "Personalize Your Scanner" screen, **When** the user selects a
   Quick Pack (for example "Big-9 Allergens"), **Then** all of that pack's categories become
   active on their first profile.
2. **Given** the profile editor, **When** the user turns off one Quick Pack that shares a
   category with another still-active Quick Pack, **Then** the shared category stays active.
3. **Given** an active category, **When** the user turns off a single ingredient within it,
   **Then** only that ingredient is removed from their effective avoid-list and the rest of
   the category still applies.
4. **Given** the profile editor, **When** the user types a custom ingredient and adds it,
   **Then** that term is flagged on future scans for that profile.
5. **Given** more than one profile exists, **When** the user taps a different profile chip on
   Home, **Then** that profile becomes active for the next scan.
6. **Given** any profile, **When** the user taps "Add Profile," **Then** a new independent
   profile is created (available during the trial and after purchase).

---

### User Story 3 - Build and trust a Safe Foods list (Priority: P2)

After a clean scan, a user saves the product (with a front-of-pack photo, brand, and product
name) to their Pantry so they never have to re-check it from scratch.

**Why this priority**: Turns one-off scans into lasting peace of mind and gives users a
reason to keep the app. Not required for the core "is this safe?" answer, so P2.

**Independent Test**: Complete a clean scan, save to Pantry, return to the Pantry tab, and
confirm the item appears in the grid with its photo, brand, and product name.

**Acceptance Scenarios**:

1. **Given** a clean result, **When** the user chooses "Save to Pantry," **Then** the app
   prompts for a front-of-pack photo and then for brand and product name, and saves the item
   with the exact scanned ingredient list.
2. **Given** saved Pantry items, **When** the user opens the Pantry tab, **Then** up-to-date
   items appear in a scrollable grid.
3. **Given** no saved items and no recently deleted items, **When** the user opens the Pantry
   tab, **Then** the calming empty-state message is shown.

---

### User Story 4 - Re-check a product for recipe changes (Priority: P2)

When a saved product hasn't been verified in over 30 days, the Pantry surfaces it in a
"Recheck" list. The user re-scans a newly purchased box, and the app tells them whether the
recipe changed and whether any change now trips one of their Red Flags.

**Why this priority**: This is Flagged's differentiator against static databases ("brands
quietly change recipes"). Valuable but depends on Story 3 existing first.

**Independent Test**: Save an item, artificially age its last-verified date past 30 days,
confirm it moves to the Recheck list, then re-scan with (a) identical, (b) changed-but-safe,
and (c) changed-and-now-flagged ingredients and confirm the three distinct outcomes.

**Acceptance Scenarios**:

1. **Given** a saved item last verified more than 30 days ago, **When** the user opens the
   Pantry, **Then** that item appears at the top in the Recheck checklist instead of the main
   grid.
2. **Given** a Recheck task, **When** the user taps it, **Then** an intercept modal warns them
   to only scan a newly purchased box before the camera opens.
3. **Given** a recheck scan with an identical ingredient list, **When** it completes, **Then**
   the app shows "No changes detected," resets the 30-day timer, and returns the item to the
   grid.
4. **Given** a recheck scan where the recipe changed but no Red Flags match, **When** it
   completes, **Then** the app shows the "Recipe Change Detected" screen with a "No Active Red
   Flags Detected" badge and offers Keep or Delete.
5. **Given** a recheck scan where a change introduces a Red Flag, **When** it completes, **Then**
   the app shows the alert screen naming the new offending ingredient(s) and which filter
   caught them, and offers Delete (primary) or Keep.
6. **Given** the user chooses Keep on a changed recipe, **When** confirmed, **Then** the saved
   ingredient list is updated to the new version and the 30-day timer resets.
7. **Given** the user chooses Delete, **When** confirmed, **Then** the item moves to a
   24-hour "Recent Changes" undo list and is permanently removed after 24 hours.

---

### User Story 5 - Trial, then a one-time unlock (Priority: P1)

A new user can use every feature for 10 successful scans. On the 11th scan attempt, scanning
is locked behind a single $24.99 one-time purchase. A user who has paid is never asked
again, even with no internet.

**Why this priority**: No revenue path without it, and the gating rules touch every scan.
P1 alongside the core scan.

**Independent Test**: Perform 10 successful scans, confirm the 11th attempt is blocked with
the unlock screen; simulate a completed purchase and confirm scanning is restored and the
scan counter UI disappears; relaunch with no network and confirm the paid state persists.

**Acceptance Scenarios**:

1. **Given** a new install, **When** the user finishes onboarding, **Then** a "Scans
   Remaining: 10 / 10" meter is shown on the Scan tab.
2. **Given** a trial user, **When** a scan successfully reaches a result screen, **Then** the
   remaining-scans count goes down by one; **When** a scan is aborted as illegible, **Then**
   the count does not change.
3. **Given** a trial user who has used 10 scans, **When** they open the Scan tab, **Then** the
   scan actions are replaced by a lock and a single "Unlock Unlimited Scans - $24.99" button
   showing "$39.99" struck through.
4. **Given** the unlock screen, **When** the user completes the purchase, **Then** scanning is
   immediately available again and the meter and lock no longer appear anywhere.
5. **Given** a paid user with no internet connection, **When** they open the app, **Then** they
   are not locked out and see no trial meter.
6. **Given** a paid user on a new device, **When** they use "Restore Purchases" in Settings,
   **Then** their paid status is restored.

---

### User Story 6 - Onboarding and first-run setup (Priority: P2)

A first-time user is walked through seven screens explaining the problem, the offline
approach, an interactive filter choice, a name prompt, the navigation, and the trial and
pricing, ending on the Home tab with a working profile.

**Why this priority**: Strongly shapes conversion and gives the user a usable filter set,
but the app could technically function with a default profile and no walkthrough. P2.

**Independent Test**: Launch a fresh install, walk through all seven screens, and confirm the
selected Quick Pack is active on the default profile, the entered name appears on the Home
header, and onboarding never appears again.

**Acceptance Scenarios**:

1. **Given** a fresh install, **When** the app is first opened, **Then** the seven onboarding
   screens are shown in order with the exact copy from `docs/04-onboarding.md`.
2. **Given** the "Personalize Your Scanner" screen, **When** the user picks a starting filter,
   **Then** it is applied to the default profile.
3. **Given** the name screen, **When** the user enters a first name and continues, **Then**
   that name is saved and used for the Home greeting and as the default profile's chip label.
4. **Given** the name screen, **When** the user leaves the field blank and continues (or taps
   "Skip"), **Then** onboarding still completes and the Home greeting uses its graceful
   fallback; the name can be set later in Settings.
5. **Given** the name screen, **When** it is shown, **Then** it explains why the name is asked
   for (that it is used only on-device to personalize the app and is never uploaded).
6. **Given** onboarding is completed, **When** the app is reopened, **Then** onboarding is not
   shown again and the user lands on Home.
7. **Given** onboarding, **When** the user moves through it, **Then** no free scan is consumed.

---

### User Story 7 - Home dashboard shows protection so far (Priority: P3)

The Home tab greets the user by name and shows five running totals: labels read, red flags
caught, clean scans, skimpflation changes caught, and reformulations caught.

**Why this priority**: Reinforces value and habit but is not required to scan or decide. P3.

**Acceptance Scenarios**:

1. **Given** a first name set in Settings, **When** the user opens Home, **Then** the header
   greets them by that name (with a graceful fallback if unset).
2. **Given** completed scans, **When** the user opens Home, **Then** the five totals reflect
   the lifetime counts and update after each scan.
3. **Given** a pantry recheck that detects an ingredient added or removed, **When** it
   completes, **Then** the "reformulations caught" total increases by one.
4. **Given** a pantry recheck that detects the surviving ingredients changing order, **When**
   it completes, **Then** the "skimpflation changes caught" total increases by one.
5. **Given** a recheck that detects both a reformulation and an order shift, **When** it
   completes, **Then** both totals increase by one.

---

### User Story 8 - Ask for an App Store review at the right moment (Priority: P3)

The app asks for a store review using the native prompt only at two well-chosen moments and
never in a way that games the rating.

**Why this priority**: Growth optimisation, entirely optional for a working MVP. P3.

**Acceptance Scenarios**:

1. **Given** a trial user, **When** they catch their 5th flagged ingredient and then leave the
   results screen, **Then** the native review prompt is requested once.
2. **Given** a paid user, **When** they first open the app after 30 days, or upon reaching 50
   total scans (whichever comes first), **Then** the native review prompt is requested.
3. **Given** any review trigger, **When** it fires, **Then** the app never conditions it on the
   user first giving positive feedback.

---

### Edge Cases

- Camera permission denied → the app explains why the permission is needed and offers the
  Paste and Choose Photo inputs as alternatives.
- Ingredients list longer than one camera frame → panning across it stitches into one
  continuous text without duplicated or dropped words.
- The same product scanned twice for the Pantry → allowed; the user manages duplicates.
- Purchase started but not completed (cancelled or interrupted) → the user stays in the
  trial/locked state with no partial entitlement.
- Restore Purchases when nothing was ever bought → clear "no purchases found" message, no
  error state.
- Device date changed backwards → the 30-day recheck and 24-hour undo windows must not
  behave destructively (treat only forward-elapsed time as elapsed).
- App updated with a newer bundled ingredient dictionary → dictionary refreshes without
  disturbing the user's profiles, custom ingredients, pantry, or stats.
- A category or ingredient the user selected is renamed in a future dictionary → the user's
  selection is preserved (selections are stored by identity, not by display text).

## Requirements *(mandatory)*

### Functional Requirements

**Scanning & matching**

- **FR-001**: The app MUST capture an ingredients paragraph from the live camera over a fixed
  short capture window without requiring a shutter press, showing live highlight boxes over
  recognised text and a visible countdown.
- **FR-002**: The app MUST also accept ingredient text via a Paste input and via a Choose
  Photo input, routing both through the same normalisation and matching steps.
- **FR-003**: All text recognition, matching, and storage MUST happen on the device with no
  network request at any point in the scan pipeline.
- **FR-004**: The app MUST normalise recognised text (lowercase, rejoin words split across
  line breaks, split on commas and parentheses) before matching.
- **FR-005**: The app MUST match each token against the active profile's effective avoid-list
  using exact matching first, then conservative correction of common OCR errors, then fuzzy
  matching that flags a token at or above an 85% similarity threshold.
- **FR-006**: OCR error correction MUST NOT alter otherwise-valid ingredient terms, including
  those containing digits.
- **FR-007**: The app MUST reject an illegible or non-ingredient capture with an error, MUST
  NOT show a result screen for it, and MUST NOT count it against the free-scan allowance.
- **FR-008**: On a successful match run, the app MUST show either a Clean result ("No red
  flags detected," full text shown) or a Flagged result ("Red flags detected," offending
  words highlighted, with a breakdown naming each ingredient, its category, and the profile
  filter that caught it).

**Personalisation & profiles**

- **FR-009**: The app MUST ship a fixed, bundled dictionary of 11 Quick Packs, 20 categories,
  and 283 ingredient terms, loaded into local storage once on first launch and identical for
  every install.
- **FR-010**: Users MUST be able to create multiple profiles, name them, and select one as
  active; the active profile's filters apply to the next scan.
- **FR-011**: Selecting a Quick Pack MUST activate all of its categories; deselecting a Quick
  Pack MUST deactivate its categories except any category still required by another active
  Quick Pack.
- **FR-012**: Users MUST be able to toggle an individual category on or off, toggle an
  individual ingredient off within an active category, and add free-text custom ingredients,
  per profile.
- **FR-013**: The effective avoid-list for a profile MUST be: all ingredients in its active
  categories, minus individually excluded ingredients, plus its custom ingredients.
- **FR-014**: Profile selections MUST be stored by stable identity so that renaming a term or
  category in a future dictionary does not lose the user's choices.

**Pantry & recheck**

- **FR-015**: From a Clean result, users MUST be able to save the product to the Pantry with
  a front-of-pack photo (stored as a compressed local thumbnail excluded from device backup),
  a brand name, a product name, and the exact ordered ingredient list from that scan.
- **FR-016**: The Pantry tab MUST show up-to-date saved items in a grid, a "Recheck" list at
  the top for items not verified in over 30 days, a 24-hour "Recent Changes" undo list at the
  bottom, and a defined empty state when nothing is saved or recently deleted.
- **FR-017**: Tapping a Recheck task MUST show an intercept modal instructing the user to scan
  only a newly purchased box before opening the camera.
- **FR-018**: A recheck scan MUST compare the new ingredient list against the saved one and
  produce exactly one of three outcomes: identical, changed but no Red Flags, or changed with
  Red Flags — each with the behaviour and copy defined in `docs/07-results-and-rescan.md`.
- **FR-019**: Choosing "Keep" on a changed recipe MUST replace the saved ingredient list with
  the new one and reset the 30-day timer; choosing "Delete" MUST move the item to the 24-hour
  undo list, after which it is permanently removed.

**Trial, purchase & gating**

- **FR-020**: A non-paying user MUST have full, unrestricted access to every feature for
  exactly 10 successful scans.
- **FR-021**: A scan MUST count against the free allowance only when it reaches a result
  screen, and only for non-paying users.
- **FR-022**: When the free allowance is exhausted, the app MUST block all scan inputs
  (camera, paste, photo) behind a single one-time purchase priced at $24.99 (displayed with
  "$39.99" struck through), and MUST NOT lock any non-scanning feature the user already set
  up.
- **FR-023**: The app MUST offer only a single non-consumable one-time purchase — no
  subscriptions or consumable products.
- **FR-024**: A paid entitlement MUST be cached on the device so a paying user is never locked
  out when offline, and the trial meter and lock MUST disappear everywhere once paid.
- **FR-025**: Settings MUST provide a "Restore Purchases" action and show current status
  (Trial or Premium).

**Onboarding, home, settings, reviews**

- **FR-026**: A first-time user MUST see a seven-screen onboarding flow (exact copy per
  `docs/04-onboarding.md`) that ends by applying their chosen Quick Pack to a default profile
  and landing on Home; onboarding MUST run only once per install and consume no scan.
- **FR-026a**: The onboarding flow MUST include a name screen that asks for the user's first
  name, states plainly why it is asked for (used only on the device to personalize the app;
  never uploaded), and lets the user continue without entering anything (skippable). Any name
  entered is saved as the first name (feeding the Home greeting) and as the default profile's
  chip label.
- **FR-027**: The Home tab MUST greet the user by their first name (graceful fallback when
  unset) and show lifetime totals for labels read, red flags caught, and clean scans.
- **FR-028**: Settings MUST let the user set a first name and MUST provide links to a Privacy
  Policy, Terms of Service, and a support/contact action.
- **FR-029**: The app MUST navigate via a fixed four-tab bottom bar — Home, Scan, Pantry,
  Settings — with no floating action button.
- **FR-030**: The app MUST request an App Store / Play Store review using the native prompt
  only (a) after a trial user catches their 5th flagged ingredient and leaves the results
  screen, and (b) on first open after 30 days of paid use or at 50 total scans, whichever
  comes first — and MUST NOT gate the request on prior positive feedback.

**Presentation & accessibility**

- **FR-031**: All text MUST render in Atkinson Hyperlegible, bundled with the app, with no
  fallback to a system font for primary content.
- **FR-032**: The app MUST provide complete, separate dark ("X-ray") and light ("clinical")
  colour palettes with no shared colour values, follow the semantic roles in
  `docs/09-design-system.md` (cyan = safe/scanning, red = flagged/destructive, orange =
  recipe-change-but-safe), and meet WCAG AA contrast in both modes.
- **FR-033**: The app MUST respect the operating system's text-size / Dynamic Type setting and
  reflow layouts accordingly, and MUST NOT communicate flagged/clean state through colour
  alone (always paired with icon and text).
- **FR-034**: Each category shown in the profile editor MUST display its classification badge
  (regulated / advisory / preference) from the dictionary; badges are display-only and do not
  affect matching.

**Data & lifecycle**

- **FR-035**: All user data (profiles, custom ingredients, pantry items, thumbnails, lifetime
  stats) MUST be stored only on the device.
- **FR-036**: The lifetime stats record MUST be a single per-install record tracking
  free scans used (capped at 10), total labels read, total red flags caught, total clean
  scans, total skimpflation changes caught, and total reformulations caught, updated
  consistently on every successful scan including rechecks.
- **FR-036a**: On a pantry recheck, the app MUST increment the reformulations-caught total
  when it detects an ingredient added or removed, and the skimpflation-caught total when it
  detects the surviving ingredients changing order; both may increment on the same recheck.
- **FR-037**: Loading the bundled dictionary MUST be repeatable without creating duplicates,
  and a future dictionary version MUST refresh dictionary data without altering user data.

### Key Entities

- **Dictionary (bundled, read-only)**: the fixed set of Ingredients (283 canonical terms),
  Categories (20, each with a parent group and a regulated/advisory/preference
  classification and an ordered ingredient list), and Quick Packs (11, each activating one or
  more categories). Shared categories and shared ingredient terms are defined once and
  referenced by identity.
- **Profile**: one family member's filter set — a display name, the set of active categories,
  the set of individually excluded ingredients, and a list of custom free-text ingredients.
  Multiple profiles per install; one is active at a time.
- **Pantry Item**: a saved approved product — brand, product name, local thumbnail path, the
  ordered ingredient list as saved, date added, last-verified date (drives the 30-day
  recheck), and an optional deletion timestamp (drives the 24-hour undo).
- **Lifetime Stats (singleton)**: one record per install — free scans used, total labels
  read, total red flags caught, total clean scans, total skimpflation changes caught, total
  reformulations caught.
- **Scan Result (transient)**: the outcome of one scan — the reconstructed ingredient text,
  the list of matched tokens with the category and filter that caught each, and whether it is
  clean or flagged. Not persisted except through its effects (stats, an optional saved Pantry
  Item, an updated recheck baseline).
- **App State flags (local)**: has-onboarded, first name, cached paid entitlement, and the
  counters needed to evaluate review triggers.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From opening the Scan tab, a user gets a result for a clearly printed
  ingredients label in under 10 seconds.
- **SC-002**: On a test set of representative printed labels, the scanner catches at least
  95% of targeted avoided ingredients that are physically legible, with no false "clean"
  result on a label that contains a targeted ingredient.
- **SC-003**: 100% of core tasks — scan, view result, edit a profile, save to Pantry, recheck
  an item, view stats — complete with the device in airplane mode.
- **SC-004**: A paying user placed in airplane mode and relaunched is never shown the trial
  meter or the lock screen (0% false lockouts).
- **SC-005**: An illegible capture never decreases the remaining free-scan count (0%
  incorrect decrements across a test run of aborted scans).
- **SC-006**: A new user can complete onboarding and reach a working Home screen in under 2
  minutes.
- **SC-007**: Turning off one Quick Pack never removes a category still required by another
  active Quick Pack (0% incorrect deactivations across the shared-category test matrix).
- **SC-008**: All screens remain usable and non-truncated at the largest OS text-size
  setting.
- **SC-009**: Every automated check for the core logic (matching, activation, diff,
  stitching, stats) passes, and every past accuracy bug has a test that would catch its
  return.

## Assumptions

- Implementation technology is React Native + Expo (decided in `docs/02-architecture.md`
  because the maintainer works on Windows without a Mac and Android is a near-term goal). The
  original brief's Swift/SwiftUI choice is superseded; all product decisions from the brief
  are preserved.
- iOS 17+ is the launch target; Android is prepared for but not part of this MVP's release.
- On-device text recognition via the chosen library is accurate enough for printed food
  labels that no cloud OCR fallback is needed (`docs/02`).
- Purchases run through RevenueCat configured for one non-consumable product; store products
  must be set up in App Store Connect before release.
- The bundled ingredient dictionary (`assets/data/ingredients.json`, generated by
  `tools/build_seed.py`) is authoritative for MVP; expanding it is out of scope here.
- "Good Morning" is acceptable as the fixed header greeting for MVP; time-of-day variants are
  optional polish.
- Exact onboarding and results copy is taken verbatim from the `docs/` set.
- Analytics, accounts, cloud sync, sharing, and Android release are explicitly out of scope
  for V1.

## Dependencies

- Bundled assets: the ingredient dictionary JSON and the Atkinson Hyperlegible font files.
- A configured RevenueCat project and store product for the one-time unlock.
- A device or emulator capable of running a custom development build for camera/OCR and
  purchase testing (these cannot be verified in a pure JavaScript sandbox).
- Published Privacy Policy and Terms of Service (drafts exist under `legal/`).
