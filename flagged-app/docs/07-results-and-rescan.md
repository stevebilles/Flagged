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
    `profileSnapshot` = the active profile's current filters (not the ingredient text — see
    §7.1), `dateAdded`/`lastVerifiedDate` = now.
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

## 7.1 — The Pantry Recheck Flow (Profile-Snapshot Comparison + Red Flag Check)

Triggered when the user re-scans a **newly purchased** box from the Pantry "Recheck" section
(`05`), always evaluated against **the profile the pantry item was saved under** (`item.profileId`)
— never whichever profile happens to be globally active at that moment. Recheck cards belong to
one profile permanently; a card saved under Steve's profile is never rechecked against Stacy's
filters just because Stacy's tab happens to be open.

> **2026-09-14 — replaced the original text-diff design.** The recheck was originally specified as
> comparing the newly-scanned ingredient text against a saved `originalIngredients` list
> word-for-word (add/remove/order-shift). Real-device testing found OCR output too inconsistent
> run-to-run (spelling/spacing variance on the same physical label) to diff reliably — a diff would
> as often report a phantom change from OCR noise as a real one. The app no longer stores or
> compares raw ingredient text at all; see `03` §3.2 for the replacement (`profileSnapshot`).

### How the comparison works

A Pantry save only ever happens on a **clean** result (`Outcome A` above) — so by construction, at
save time, **none** of the then-active filter terms were present in that scan. The recheck exploits
this: run a **completely fresh scan** against the current live profile, and interpret the result
against what was being screened for **then** vs. **now**:

1. Run the new photo through OCR + matching (`06`) using the current profile's active filters.
2. **New scan is clean** → nothing to report. Reset `lastVerifiedDate`, return to the grid.
3. **New scan is flagged** → for **each individual match**, decide why it's new by checking whether
   that match's category (or, for a custom ingredient, that exact term) was already part of the
   saved `profileSnapshot`:
   - **Was already being screened for** → the product was clean under this exact filter before and
     isn't now, so the ingredient itself is presumably new — a reformulation. Message: *"This
     ingredient wasn't present in your last scan."*
   - **Wasn't in the snapshot** (the filter itself is what's new, not necessarily the ingredient) →
     look up the `ProfileChangeLog` (`03` §3.2a) for the most recent entry that turned this
     category/ingredient on for this profile. Found → cite it: *"On [date], you added [filter] to
     your red flags — that's why this is now flagging."* Not found (e.g. a pre-2026-09-14 profile
     edit, before logging existed) → the generic fallback: *"This now matches a filter you've added
     since you last saved this item."*

This recovers **reformulation** (an ingredient appearing that wasn't there) without ever storing
ingredient text. It cannot recover **skimpflation** (relative order shifting among ingredients that
were already present in both scans) — that specifically requires knowing the old ingredient order,
which this design deliberately never keeps. Skimpflation detection is retired; `totalSkimpflationCaught`
no longer exists (see `03` §3.1).

### Recheck results UI

**Outcome 1 — Still Clean**
- Green confirmation: "No changes detected." (Note: this means "still clean under current
  filters," not a provable claim that nothing about the product changed — see above.)
- Reset `lastVerifiedDate` to today; return the item to the normal Pantry grid.

**Outcome 2 — Now Flagged**
- Trigger the **Alert Red** warning screen.
- **Breakdown:** each matched ingredient, with its own attribution message (reformulation, dated
  filter change, or generic filter-change fallback — see above) and which filter caught it.
- **Choice:**
  > "Red Flag Detected! This new recipe contains an ingredient you are avoiding. Do you want to
  > remove this item from your pantry?"
  → `[ Delete Item ]` (primary) or `[ Keep Item ]` (muted secondary).

### Post-choice behavior

- **`[ Keep Item ]`:** replace the item's `profileSnapshot` with the profile's **current** filter
  state and reset the **30-day** timer (`lastVerifiedDate` = now).
- **`[ Delete Item ]`:** send the item to the **Recent Changes** log with the **24-hour undo** timer
  (`deletedAt` = now; purge after 24h).

### Notes
- The recheck also updates stats consistently with a normal scan (it is a successful scan → counts
  as a label read; red flags caught increment on Outcome 2).
- **Recheck-specific stat (`03`):** increment `totalReformulationsCaught` once per recheck where at
  least one match is attributed as a reformulation (not merely a filter change). Independent of
  whether the recheck also trips a red flag stat.
