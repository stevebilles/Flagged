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

### Protection Summary (the pillars of value)
Read from the Stats singleton (`03`):
- **Labels Read** (`totalLabelsRead`) — volume of text processed / time saved.
- **Red Flags Caught** (`totalRedFlagsCaught`) — danger avoided.
- **Clean Scans** (`totalCleanScans`) — peace of mind delivered.
- **Skimpflation Caught** (`totalSkimpflationCaught`) — pantry rechecks where the surviving
  ingredients changed order (`07`).
- **Reformulations Caught** (`totalReformulationsCaught`) — pantry rechecks where an ingredient
  was added or removed (`07`).

> The first three are the "core" pillars from the brief; the two recheck totals only become
> meaningful once the user has a pantry and rechecks running. Design may present them as a
> secondary row or reveal them once non-zero — but all five are tracked from day one.

---

## Tab 2 — SCAN (The Core Action Tab)

### State 1 — Standby (default)
- **Top 2/3:** dark placeholder screen.
- **The Meter (trial users only):** a prominent pill at the top reading
  `Scans Remaining: [ 10 − freeScansUsed ] / 10`.
- **Bottom 1/3 (action menu):** `[ Start Camera Scanner ]` (primary), `[ Paste ]`,
  `[ Choose Photo ]`.

### State 2 — Hard Paywall Lockout
- When `freeScansUsed == 10`: the action menu is replaced by a **large lock icon** and a single
  primary button:
  `[ Unlock Unlimited Scans - $24.99 ]` (show `$39.99` struck through).
- The user can **no longer** open the camera, paste text, or choose a photo until they purchase.
  See `08`.
- Paid users never see the meter or this state.

### State 3 — Active Mode (Live Scan)
- Live camera feed with **Cyan (#22D3EE) bounding boxes** over recognized text and a **3-second
  visual countdown**. No shutter button — point and hold. See `06` for the full engine.

---

## Tab 3 — PANTRY (My Approved List & Audit Hub)
- **Icon:** a clean, modern pantry jar / open box.

### Section 1 — Skimpflation & Reformulation Checks (the to-do list)
- **Trigger:** any saved item whose `lastVerifiedDate` is **older than 30 days** moves out of the
  main grid to the **top** of the screen as a checklist item.
- **Header & subtitle:**
  > "Skimpflation & Reformulation Checks: Brands sneakily change recipes all the time. Re-scan
  > these items to ensure they are still approved."
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
