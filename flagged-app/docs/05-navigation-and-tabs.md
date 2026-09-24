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

## Tab 3 — PANTRY (My Approved List & Audit Hub)
- **Icon:** a clean, modern pantry jar / open box.

### Section 1 — Reformulation Checks (the to-do list)
- The **Pantry tab icon shows a red dot** whenever any saved item is due (more than 30 days since
  it was last verified) — the in-app stand-in for a notification (`src/domain/pantryDue.ts`).
- **Trigger:** any saved item whose `lastVerifiedDate` is **older than 30 days** moves out of the
  main grid to the **top** of the screen as a checklist item.
- **Header & subtitle:**
  > "Reformulation Checks" — "Brands sneakily change recipes all the time. Re-scan these items to
  > ensure they are still approved."
- **Intercept modal** (prevents scanning the old box already at home): tapping a task shows a strict
  modal:
  > "Only scan a NEWLY PURCHASED box to check for changes. Do you have a new box ready?"
  → `[ Yes, open camera ]` or `[ Remind me later ]`.
  See the recheck/diff engine in `07`.

### Section 2 — My Safe Foods (the grid)
- A scrollable grid of the user's saved, **up-to-date** safe foods (thumbnail + brand/product).

### Section 3 — Recent Changes log (24-hour undo)
- At the very bottom: a list of items deleted in the last 24 hours, each with `[ Undo ]`.
- After 24 hours, items are **permanently purged** (`deletedAt` window, `03`).

### Empty state
- If the grid **and** the log are empty, show a calming graphic with:
  > "Your safe list is empty. When you scan an item with no red flags, save it here so you never
  > have to second-guess it again."

---

## Tab 4 — SETTINGS (App Administration)
Strictly global app management + Apple/Play compliance.
- **User Details:** a text field for **First Name** (feeds the Home header).
- **Purchases:** `[ Restore Purchases ]` + a status indicator (Trial / Premium). See `08`.
- **Support:** `[ Report an Issue / Contact Us ]`.
- **Legal:** `[ Privacy Policy ]` and `[ Terms of Service ]` links.
