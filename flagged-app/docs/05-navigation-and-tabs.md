# 05 — Core Architecture: The 4-Tab Hub

Standard **4-tab bottom navigation** (25% width each). **No floating action buttons.**
Tabs: **Home · Scan · Pantry · Settings.**

---

## Tab 1 — HOME (Dashboard & Filter Hub)

### Personalized header
- "Good Morning, [Name]." — `[Name]` pulled from Settings → First Name (fall back gracefully if
  unset). Consider time-of-day variants ("Good Afternoon/Evening") but the brief specifies morning
  copy; time-based is optional polish.

### "Shopping For" — Profile chips (profile management)
A horizontal row of **Profile Chips**.
- **Selecting:** tap a family member's chip to make that profile **active** (its filters apply to
  the next scan).
- **Editing:** tapping the `[ Edit ]` icon on a chip opens a **bottom sheet** — the profile editor.
  This is where the user:
  - toggles the **11 Quick Packs** (pill buttons; selecting a pack activates its categories),
  - expands a **category** ("N names · tap for details") to toggle **individual ingredients** off,
  - toggles a whole **category** on/off (row switch),
  - manages **Custom Ingredients** (text field + `Add`).
  See `data-schema.md` for exact activation semantics and `09` for the classification badges
  (REGULATED / ADVISORY / PREFERENCE) shown on each category row.
- **Adding:** a functional `[ Add Profile + ]` button creates a new profile (all users, during
  trial and after purchase).

### Trial-ending banner (top of Home)
Shown only while a free trial is in its **last 3 days** and hasn't been cancelled (RevenueCat's
`willRenew` is still true): "Your free trial ends Tue 5:42 PM — Cancel by Mon 5:42 PM if you don't
want to be charged $24.99", with a **Manage subscription** link. Apple only stops the charge if you
cancel at least 24 hours before the trial ends, so it shows that deadline instead of a countdown;
in the final 24 hours it says the cancel window has passed. It's the app's own in-app reminder (no
push notifications). See `08`.

### Protection Summary (the pillars of value)
Four tiles in a 2×2 grid (`app/(tabs)/index.tsx`), read from the **per-profile** counters on
`Profile` (`03` §3.1). When Home is viewing "All" profiles, each tile sums every profile's counters.
- **Total Scans** (`totalLabelsRead`) — labels read, including rechecks.
- **Pantry Items Saved** — number of saved Pantry items (for the viewed profile, or all).
- **Red Flags Found** (`totalRedFlagsCaught`) — danger avoided.
- **Reformulations Found** (`totalReformulationsCaught`) — rechecks where a category/term that was
  already being screened for turned up (`07` §7.1).

> `totalCleanScans` is still tracked per profile but has no tile. **Skimpflation Caught was retired
> on 2026-09-14** (`07` §7.1): the recheck redesign no longer stores ingredient order, so it can't
> be detected.

---

## Tab 2 — SCAN (The Core Action Tab)

### State 1 — Standby (default)
- **Top 2/3:** the viewfinder box (a dark placeholder until the camera is opened).
- **Bottom 1/3 (action menu):** `[ 🎥 Scan Label ]` (primary), `[ Paste Text ]`,
  `[ Choose Photo ]`.
- There is **no scan meter** (the 10-scan counter was retired 2026-09-21).

### State 2 — Hard Paywall Lockout
- Shown whenever the user is **not premium** (no active trial or subscription): the whole Scan
  tab — camera, Paste and Choose Photo — is replaced by the **paywall**, rendered inline
  (`src/purchases/PaywallView.tsx`, see `08` and the `paywall.png` mockup in `17`): "FLAGGED PRO"
  header, the `$24.99 / year` price card with a "7-day free trial" pill, four feature rows, and a
  `[ Start your 7-day free trial ]` button with the required subscription disclosure beneath.
  After a successful purchase the tab unlocks in place. The trial wording (the pill, the reminder
  line, the button text and the summary) only shows to users RevenueCat reports as **eligible** for
  the free trial; everyone else sees a plain `[ Subscribe for $24.99/year ]` (`08`).
- Every other tab (Home, Pantry, Settings, profile setup) stays fully usable while locked.
- Premium users (trial or paid) never see this state.

### State 3 — Active Mode (Live Scan)
- The live camera renders **inline inside the Scan tab's viewfinder box** (never full-screen),
  with a **dashed cyan (#22D3EE) guide box** — OCR is restricted to what's inside it. The user
  aims and **taps a shutter button** (manual capture; nothing triggers automatically). An
  optional **Add more** repeats the capture for a second photo (e.g. a curved label) and joins
  the two reads. See `06` and the doc comment at the top of `src/ocr/CameraScanner.tsx`.

---

## Tab 3 — MY PANTRY (Saved Products & Recheck Hub)
- **Icon:** a clean, modern pantry jar / open box.
- **Title:** "My Pantry", with an "N items saved" line under it.
- **Wording rule (owner, 2026-09-25):** never call this a "safe list", "safe foods", "approved" or
  "cleared" anything, and don't write "all clear" or "still approved". A scan only reports which of
  the user's red flags it found in the text it read — it can miss things — so saving a product is a
  bookmark, not a safety claim. (`src/__tests__/copyGuard.test.ts` enforces this.) The mockup's
  "CLEARED PRODUCTS" heading and "all clear" subtitle are deliberately not used.
- **Top to bottom:** the recheck to-do list → the saved-product cards → Recent Changes.

### Section 1 — Reformulation Checks (the to-do list)
- The **Pantry tab icon shows a red dot** whenever any saved item is due (more than 30 days since
  it was last verified) — the in-app stand-in for a notification (`src/domain/pantryDue.ts`).
- **Trigger:** any saved item whose `lastVerifiedDate` is **older than 30 days** is also listed at
  the **top** of the screen as a checklist item. **It stays in Saved Products too** (owner,
  2026-09-25: being due is a to-do about the item, not the item leaving the Pantry; removing it made
  the counts disagree with what was on screen). The old spec said it "moves out of the main grid" —
  that was wrong.
- **Header:** a small bold caps label, "REFORMULATION CHECKS", styled exactly like the other two
  section labels — no amber, no dot (owner, 2026-09-25: a due card already says "Recheck"). There is no paragraph under it (2026-09-25 layout: content carries the weight,
  not the headings). **The rule the user must be told when an item is due:** they can't rescan the
  box already in their freezer/pantry (it can't show anything new) — they have to **buy it again
  first**, then scan the **new** package.
- **That instruction is shown once, in one line directly under the label and above the cards, in the
  mockup's own words** (`docs/screenshots/pantry.png`) — "Next time you buy one of these, scan the
  new package to check if the recipe has changed." — and only while at least one item is due. (The
  capture screen repeats the strict "only scan a NEWLY PURCHASED box".) It is **not** repeated inside each card
  (owner, 2026-09-25: it wasted space and grows with every due item), and not shown in the empty
  state, which stays short.
- **Each to-do card** is a slim row with an amber left edge: a small product photo on the left
  (the item's saved photo, ~64px — only if it has one), brand, product, the profile it was saved
  for, and a `Recheck →` action. The same photo also shows (larger) on the recheck capture screen.
- **Tapping `Recheck →` goes straight to the recheck capture screen** (`app/recheck-capture.tsx`) —
  there is **no separate confirmation popup** (owner, 2026-09-25: the old "Grab the new box → Yes,
  open camera" popup, followed by that screen's own "Open camera", asked the same thing twice). The
  capture screen itself carries the rule that prevents scanning the old box already at home:
  > "Only scan the ingredient list on a NEWLY PURCHASED box."
  with `[ Open camera ]`, `[ Paste ]` and `[ Cancel ]`. See the recheck/diff engine in `07`.

### Section 2 — Saved Products (the cards)
- A two-column grid of **all** of the user's saved items — including any that are also listed as due
  under Reformulation Checks. Each
  card: the front-of-pack photo (a brand-initial tile if there isn't one), brand over product name,
  and the **profile it was saved for** ("● Sofia", in that profile's color). An item is tagged with
  whichever profile the scan was for — e.g. a parent scanning for the child with a peanut allergy,
  and the product coming back with no red flags, saves it under that child's profile.
- **Profile filter** (shown with 2+ profiles): `All` plus one chip per profile, each with a count, so
  every profile can see its own saved products (and `All` shows everything). It is a view filter
  only — it does not change which profile a scan checks (that's Home's switcher).
- Tapping a card opens `app/pantry-item.tsx`: photo, brand/product, **SAVED TO PROFILE** (the profile
  as a pill), **Scan History**, **Remove from Pantry**. No separate "saved" / "last checked" date rows
  (owner, 2026-09-25: they repeated the Scan History's first-saved date and newest entry). Editing brand/product and an ingredient list from
  the old mockup are **not built** (the app stores no ingredient text — `07` §7.1).
- **Scan History** (owner's mockups, 2026-09-25 — `pantry_item_scan_history_v2.png`,
  `scan_history_v2.png`; only the Scan History parts of those were specified): on the item screen, a
  `SCAN HISTORY` label over a tappable card — a cyan dot, **"N scans"** (a running total that goes up
  with every rescan; the save counts as the first, so a new item says "1 scan") and **"First saved
  [date]"**, with a chevron. Tapping opens `app/scan-history.tsx`: a timeline, **newest first**
  (`LATEST` on the top entry); each entry is a card with **date · time**, a line saying what it was
  ("Saved to Pantry" / "Rescanned — no red flags found" / "Rescanned — red flags found"), then
  **SCANNED FOR** (past tense — a snapshot of the profile at the time of that scan, per the owner):
  the profile (color dot + name) and the red flags it had switched on at that
  moment (category names, custom red flags, "N ingredients turned off"). This is the record the user
  can go back to for "the filters I used when this first came back clean". Data: `03` §3.2b.

### Section 3 — Recent Changes log (24-hour undo)
- At the very bottom: a list of items deleted in the last 24 hours, each with `[ Undo ]`.
- After 24 hours, items are **permanently purged** (`deletedAt` window, `03`) — the row **and its
  photo file** are deleted, at launch and whenever the app returns to the foreground. The list itself
  is filtered by age when read (`getRecentlyDeleted`), so an item removed more than 24 hours ago never
  shows here with an Undo, even before the purge has run.
- The recheck screen shows the item's saved product photo (small, above the name) when it has one, so
  the user can confirm it's the right product; nothing new is stored for that.

### Empty state
- **There is no all-or-nothing empty screen.** Every section is always shown (owner's rule: no
  invisible features, `CLAUDE.md`); a section with nothing in it says so:
  - Reformulation Checks: "Nothing to recheck yet. Items you save show up here 30 days after their
    last check." (Short on purpose. The buy-it-again-first instructions appear only when an item is
    actually due — on its card — not in the empty state.)
  - Saved Products: "Nothing saved yet. When a scan comes back with no red flags, you can save the
    product here under the profile you scanned for." (or "Nothing saved for this profile yet.")
  - Recent Changes: "Nothing removed in the last 24 hours." (Short on purpose. Only when something
    has been removed do the rows get the small centered footnote, "Changes become permanent after
    24 hours.")
  - The profile filter (`All` + one chip per profile) is always shown.

### Development-only test aid
- In a development build only (`__DEV__`; absent from release builds), the Pantry item screen has a
  clearly labelled **Force recheck (mark as due)** button that backdates the item's last check to 31
  days ago (`devForceRecheckDue` — touches only `lastVerifiedDate`). It puts the item in Reformulation
  Checks and lights the tab's red dot, so the whole recheck flow can be tested without waiting 30 days.

---

## Tab 4 — SETTINGS (App Administration)
Strictly global app management + Apple/Play compliance.
- **User Details:** a text field for **First Name** (feeds the Home header).
- **Purchases:** `[ Restore Purchases ]` + a status indicator (Trial / Premium). See `08`.
- **Support:** `[ Report an Issue / Contact Us ]`.
- **Legal:** `[ Privacy Policy ]` and `[ Terms of Service ]` links.
