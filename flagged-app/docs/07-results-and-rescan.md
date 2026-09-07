# 07 — Results Screen & The Rescan (Diff) Engine

## The Results Screen (static output)

After the engine (`06`) produces matches, route to a Results Screen. Two outcomes.

### Outcome A — Clean Result
- **Header:** Cyan icon + "No red flags detected."
- **Ingredient list:** the full paragraph in plain primary text.
- **Primary action:** `[ Save to Pantry ]`
  - Opens a quick camera viewfinder: "Snap a photo of the front of the packaging."
  - After the photo, a modal prompts for **Brand Name** and **Product Name**.
  - Compress the photo to a thumbnail (`expo-image-manipulator`), store its local path
    (`imageFilePath`, excluded from backup), and save a `pantryItem` (`03`) with
    `originalIngredients` = the ordered scanned list, `dateAdded`/`lastVerifiedDate` = now.
- **Stats:** increment `totalCleanScans` (and `totalLabelsRead`).

### Outcome B — Flagged Result
- **Header:** Alert Red icon + "Red flags detected."
- **Ingredient list:** full paragraph; **flagged ingredients highlighted in Alert Red**.
- **The Breakdown:** a charcoal card explaining exactly **why** each flag fired (which
  ingredient / which category / which profile filter).
- **Stats:** increment `totalRedFlagsCaught` by the number of highlighted ingredients (and
  `totalLabelsRead`).

### Secondary actions (both outcomes)
- `[ Scan Another Item ]` — **if the free user just used their 10th scan, this button becomes
  `[ Unlock Unlimited Scans ]`** (routes to paywall; see `08`).
- `[ Return to Home ]`.

> Reminder: a scan counts toward `freeScansUsed` **only** because it reached this Results Screen
> (successful extraction). See `06`/`08`.

---

## 7.1 — The Pantry Recheck Flow (Lite Diff Engine + Red Flag Check)

Triggered when the user re-scans a **newly purchased** box from the Pantry "Recheck" section
(`05`). Cross-reference the newly scanned ingredients against the item's saved
`originalIngredients` (`03`).

### The three background checks (evaluated instantly on scan)
1. **Reformulation Check:** are any ingredients **missing** from the old list, or **new** ones
   added?
2. **Skimpflation Check:** did the **relative order** of the remaining ingredients shift?
3. **Red Flag Check:** if **any** change is detected in (1) or (2), run the **new** ingredient array
   through the active profile's red-flag filters (`06` matching).

### Recheck results UI

**Outcome 1 — Identical & Safe**
- Green success toast: "No changes detected."
- Reset `lastVerifiedDate` to today; return the item to the normal Pantry grid.

**Outcome 2 — Recipe Changed, but STILL APPROVED**
- Pause and present a **Yellow/Orange "Recipe Change Detected"** screen.
- **Breakdown:** plainly highlight the **Skimpflation** (order shift) and/or **Reformulation**
  (additions/deletions), plus a clear badge: **"No Active Red Flags Detected."**
- **Choice:**
  > "The recipe changed, but we didn't catch any of your active red flags. Do you want to keep this
  > item in your pantry?"
  → `[ Keep Item ]` or `[ Delete Item ]`.

**Outcome 3 — Recipe Changed AND RED FLAGS CAUGHT (the climax)**
- Trigger the **Alert Red** warning screen.
- **Breakdown:** highlight the specific **new** ingredients added (e.g., "Added: Red 40, High
  Fructose Corn Syrup") **and** explicitly show which active filter caught it (e.g., "Matches
  Tommy's Artificial Dyes filter").
- **Choice:**
  > "Red Flag Detected! This new recipe contains an ingredient you are avoiding. Do you want to
  > remove this item from your pantry?"
  → `[ Delete Item ]` (primary) or `[ Keep Item ]` (muted secondary).

### Post-choice behavior (applies to Outcomes 2 & 3)
- **`[ Keep Item ]`:** update the item's `originalIngredients` to the **new** baseline and reset the
  **30-day** timer (`lastVerifiedDate` = now).
- **`[ Delete Item ]`:** send the item to the **Recent Changes** log with the **24-hour undo** timer
  (`deletedAt` = now; purge after 24h).

### Notes
- The recheck also updates stats consistently with a normal scan (it is a successful scan → counts
  as a label read; red flags caught increment on Outcome 3).
- Order-shift detection should compare the sequence of the **surviving** ingredients (ignore pure
  additions/removals when assessing "order shift," which the Reformulation check already reports).
