# 07 — Results Screen & The Rescan (Diff) Engine

## The Results Screen (static output)

After the engine (`06`) produces matches, route to a Results Screen. Two outcomes.

### Outcome A — Clean Result
- **Header:** the compact hero card (owner, 2026-09-25 — `src/design/HeroCard.tsx`, the same card the
  rescan results use: a small checkmark in a circle beside the headline; the big circular `CLEAN`
  stamp and its tag are gone), headline "No red flags found", and a "for <profile>" line under it in
  that profile's color (same as the flagged result). **Nothing else describes the scan — in particular
  no ingredient list and no explanatory sentence** (2026-09-24): the raw OCR text is often messy
  (nutrition-panel debris, bilingual duplicates) and isn't something to proofread on the result.
- **Required actions — the clean screen must always offer all three:** `[ Save to Pantry ]`
  (clean results only), `[ Scan Another Item ]`, and `[ Return to Home ]`.
- **Primary action:** `[ Save to Pantry ]`
  - Opens a quick camera viewfinder: "Snap a photo of the front of the packaging."
  - After the photo, a modal prompts for **Brand Name** and **Product Name**.
  - Compress the photo to a thumbnail (`expo-image-manipulator`), store its local path
    (`imageFilePath`, excluded from backup), and save a `pantryItem` (`03`) with
    `profileSnapshot` = the active profile's current filters (not the ingredient text — see
    §7.1), `dateAdded`/`lastVerifiedDate` = now.
- **Stats:** increment `totalCleanScans` (and `totalLabelsRead`).

### Outcome B — Flagged Result
- **Header:** the compact red hero card (small flag in a circle — no digit inside it — beside
  "N red flags on your list", with "for <profile>" under it; owner, 2026-09-25, replacing the big
  `FLAGGED` stamp with the count inside).
- **Flagged ingredients:** only the matched red-flag terms, grouped by category (their own correct
  spelling; abbreviations in capitals — "TBHQ", "BHA", "E320", `src/domain/displayTerm.ts`) — not the
  raw OCR paragraph (removed 2026-09-13).
- **The Breakdown:** a charcoal card explaining exactly **why** each flag fired (which
  ingredient / which category / which profile filter).
- **Stats:** increment `totalRedFlagsCaught` by the number of highlighted ingredients (and
  `totalLabelsRead`).

### Secondary actions (both outcomes)
- `[ Scan Another Item ]` — returns to the Scan tab. (Reaching Results already required an active
  trial or subscription — the Scan tab hard-locks otherwise, see `08` — so there is no in-result
  upsell branch.)
- `[ Return to Home ]`.

### Disclaimer placement (both outcomes)
The compliance disclaimer ("Flagged is an informational tool… Always verify the physical label…")
is the **last thing on the screen, below all the action buttons** — never between the verdict/
content and the buttons (2026-09-24).

> Reminder: a scan's per-profile stats (`totalLabelsRead`, `totalRedFlagsCaught`,
> `totalCleanScans`) are committed **only** because it reached this Results Screen (successful
> extraction). Illegible captures commit nothing. See `06`.

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
   that exact term was already being screened for in the saved `profileSnapshot` (`attributeRecheckMatches`):
   - **Was already being screened for** — its category was active, the user hadn't excluded that
     ingredient, or (custom) the term was already in the custom list → a **reformulation**
     (counts toward `totalReformulationsCaught`). It is never stated as fact — a clean scan only
     means nothing matched in the text it read, and it can miss things. Message: *"Not flagged
     when you saved this on [date, time], even though you were already watching for it. The recipe
     may have changed — or the earlier scan missed it. Check the label."*
   - **Wasn't being screened for** (the filter changed, not necessarily the product) → a
     **profile change**, with a `cause`, each looked up in the `ProfileChangeLog` (`03` §3.2a) for the
     most recent entry **made at or after the item's `snapshotAt`**:
     - `category_added` — its category wasn't active at save time. *"You added [filter] to your red
       flags on [date, time], after you saved this on [date, time]. That's why it's flagging now."*
     - `ingredient_included` — the category was active, but the user had **excluded this ingredient**
       at save time and has since turned it back on. *"You stopped excluding [X] on … after you
       saved this on …"* (This used to be mislabeled a reformulation.)
     - `custom_added` — a custom term added after saving. *"You added "[X]" to your custom red
       flags on …"*
     - No log entry found (e.g. an edit from before change logging existed) → the same message
       without the edit time: *"[filter] wasn't on your red flags when you saved this on …"*
   - After a **Keep Item** the item's red flags are re-recorded, so the wording says "kept" instead
     of "saved" and the dates use that moment.

   Every moment involved is stored with an exact timestamp (`03` §3.2 `dateAdded` / `snapshotAt`,
   §3.2a `timestamp`, §3.2b `scannedAt`) and shown with the time, not just the date. The flagged
   result screen also shows a small timeline: *saved (or last kept)* → *this scan*; the profile-edit
   time is cited per match.
   Known limit: the snapshot records the profile's category/exclusion/custom settings, not the
   resulting list of red-flag terms from the app's own dictionary (never the OCR'd label text, which
   is deliberately not stored), so if a future app update changes which ingredients a category contains
   (the dictionary is re-seeded when its schema version changes), a newly-included term reads as a
   reformulation rather than a dictionary change.

This recovers **reformulation** (an ingredient appearing that wasn't there) without ever storing
ingredient text. It cannot recover **skimpflation** (relative order shifting among ingredients that
were already present in both scans) — that specifically requires knowing the old ingredient order,
which this design deliberately never keeps. Skimpflation detection is retired; `totalSkimpflationCaught`
no longer exists (see `03` §3.1).

### Recheck results UI

**The product's saved photo carries through the whole recheck** (owner, 2026-09-25): if the item has
a photo, it's shown on the capture screen (larger), the clean result (small, in the header beside
the name) and the flagged result (in its header too), so the user always sees which product
they're rescanning. No photo → nothing extra. It only displays the existing saved file
(`ProductPhoto`, `src/design/ProductPhoto.tsx`); nothing is copied.

**Outcome 1 — No red flags found**
- Layout from the owner's mockup (`docs/screenshots/recheck_result_clean_v2.png`, 2026-09-25): a
  header (back arrow · product photo · brand / product — **no `CLEAN` pill/tag**, owner 2026-09-25:
  a status tag can be read as a safety claim and works against the disclaimer; the mockup's tag was
  removed), a compact teal hero card (small check in a circle beside the headline,
  **"No red flags found"**, "No new red flags found for **[Profile]'s** current profile."), a
  **PROFILE AT TIME OF EACH SCAN** card, and a **Back to Pantry** button. The back arrow and the
  button both accept the result.
- **The "Profile at time of each scan" card** is a side-by-side comparison of what was being scanned
  for: left = the date the item's red flags were recorded (`snapshotAt`) over **SCANNING FOR** + the
  categories in its saved `profileSnapshot` (plus custom red flags, and "N ingredients turned off"
  when any); right = "Today" (the rescan date) over the profile's filters now. Footer, italic:
  **"Same filter set — no new red flags detected."** when the two sets are identical
  (`sameFilterSet`, `src/domain/filterSet.ts`). If the user changed their filters since saving but
  the rescan is still clean, the footer instead says **"Your filters changed since you saved this —
  no red flags detected with the current set."** — the card never claims "same" when it isn't.
- This means only that nothing matched the current filters this time — not that nothing about the
  product changed, and not a safety claim; see above. Exact times are still stored (`03` §3.2b).
- **A clean rescan becomes the item's new baseline** (owner, 2026-09-25), recorded the moment the
  screen opens (not on a button, so backing out can't skip it): the item's `profileSnapshot` is
  re-recorded as the profile's filters *as of this scan*, `snapshotAt` and `lastVerifiedDate` are set
  to the scan's timestamp (30-day timer restarts), and the scan is logged (`03` §3.2b). So in 30
  days the left side of the "Profile at time of each scan" card shows **this** scan's date and
  filters, and "Today" is the new rescan — the comparison always runs from the previous check.
  (The screen you're looking at still shows the *previous* baseline; it's read before this runs.)

**Outcome 1b — Nothing new since your last scan** (`known_flags`; owner, 2026-09-25)
- **Why it exists:** after **Keep anyway** on a flagged rescan, the next rescan of the *same* product
  flags the *same* things. Calling that "New red flags detected … likely a product reformulation" was
  a logic error — nothing new has shown up. A rescan only reads as a possible reformulation when a flag
  appears that the **last scan** did not have.
- **The rule** (`evaluateRecheck`, `src/domain/recheckEngine.ts`): the last scan's matched terms come
  from the newest scan-history entry (`lastFlaggedTerms`, `src/domain/scanHistory.ts`; empty after the
  save or a no-red-flags rescan). If the rescan finds flags and **every** term was in that list →
  `known_flags`. One term that wasn't → `changed_flagged`, exactly as before. Only terms are compared;
  no ingredient text is stored.
- **Screen:** the clean layout, with an honest headline — one bold sentence,
  **"No new red flags found for [Profile]'s current profile"**, with no second line (the owner had a
  separate "Nothing new since your last scan" line removed as a repeat, and didn't want half the
  sentence bold). It is deliberately *not* "No red flags
  found" (the flags are still on the label) and uses a flag icon, not a checkmark. The
  PROFILE AT TIME OF EACH SCAN card follows (footer: "Same filter set — no new red flags detected.", or
  "Your filters changed since your last scan — no new red flags detected."), then a **SAME RED FLAGS AS
  YOUR LAST SCAN** caption and the flagged-filter cards, so the flags are never hidden. Two buttons:
  **Back to Pantry** (primary, filled, on top) and **Remove from Pantry** (plain secondary, not red —
  owner, 2026-09-25: no new red flags were found, so nothing is pushing the user to remove it, but the
  flags are still on the label so they still can). The profile card here is the
  flagged screen's pill-style card titled "PROFILE AT TIME OF EACH SCAN" (not the clean screen's
  side-by-side bullets).
- **Effects:** like a clean rescan it becomes the new baseline on open (30-day timer restarts) and is
  logged in the scan history as "Rescanned — red flags found" with its terms (so the next rescan
  compares against them). Stats: `totalLabelsRead` +1 only — the flags aren't counted again.

**Outcome 2 — New red flag detected** (owner's mockups, 2026-09-25 — `recheck_result_flagged_v2.png`,
with the "Why is this flagging now?" card from `recheck_result_flagged_v3.png`;
the older `recheck_result_red_flag*.png` are superseded). Top to bottom:
- **Header:** back arrow + the title **"Rescan Result"** (every screen has a title beside its back
  arrow; owner, 2026-09-25), then the product photo · brand / product on a row below. **No pill.** The pills in the
  owner's mockups (`CLEAN`, `SAME PROFILE`) are mockup-only labels the owner uses to switch between
  result states — they are not part of the app (owner, 2026-09-25). Whether the filters changed is
  shown by the side-by-side card below.
- **Compact hero card** (owner's redesign, `recheck_result_compact_hero_v4.png`; only the hero
  changed in that mockup): a small flag in a circle on the left, and beside it **"New red flag
  detected"** (plural when several) with "for **[Profile]**" under it — a fraction of the old
  centered hero's height so the content starts higher. The clean result uses the same `HeroCard`
  in cyan with a checkmark: **"No red flags found"** / "No new red flags found for **[Profile]'s**
  current profile."
- **"WHY IS THIS FLAGGING NOW?" card — directly under the banner** (owner, 2026-09-25: it's the
  immediate visual clue for *why* the flag is showing now, so it must not need a scroll; redesigned
  from a cramped two-column layout to the mockup `recheck_result_flagged_v3.png`). Top to bottom:
  **"Profile of last scan · [date]"** (the date the item was last scanned — its save, or its last
  rescan) with the red flags it was scanned for then as small **pills**; a divider with a **down
  arrow**; **"Profile of today's scan"** (parallel wording, owner 2026-09-25) with today's red flags
  as pills; then a one-line italic footer
  (`flaggedFooter`, `recheckExplain.ts`). (The clean result keeps the earlier two-column "Profile at
  time of each scan" card.)
  - **Same filters:** *"Same red flag set — this is likely a product reformulation."* (Worded
    "likely": a scan can't prove a recipe changed.)
  - **Profile changed** (owner's mockup `recheck_result_flagged_profile_changed_v3.png`): today's
    the filters the user **added** since the last scan are highlighted (cyan pill, prefixed **"+"**,
    e.g. "+ Seed Oils") next to the unchanged neutral ones — cyan is used only for that; the
    "Profile of today's scan" label stays white. The footer depends on where the flags come from (`flagSource`, from each
    match's attribution) so it's never overstated: **all** flags from added filters → *"Red flags
    triggered by your updated profile. Probably not a product reformulation."* (the mockup's
    wording); **some** → *"Some red flags come from your updated profile; the rest are likely a
    product reformulation."*; **none** (the flags are from filters already on) → *"Your profile was
    updated, but these flags come from filters you already had — likely a product reformulation."*
    No "View scan history" link (the mockup has none). The exact times filters were changed are
    still recorded in the profile change log (`03` §3.2a) — not spelled out on this screen. The
    mockup's `PROFILE CHANGED` header pill is a mockup-only state label and is NOT built.
- **One card per filter that flagged**, below that, like the main Results screen: the filter's name,
  its classification badge (REGULATED / ADVISORY / PREFERENCE) and the matched ingredients as chips.
  (This replaced a paragraph per ingredient, which repeated the same sentence for every ingredient.)
- **Buttons:** **Remove from Pantry** (destructive) and **Keep anyway** (secondary).

Either way, the rescan is added to the item's scan history once when the result opens (`03` §3.2b:
when, the red flags used, and what matched).

### Post-choice behavior

- **`[ Keep anyway ]`:** replace the item's `profileSnapshot` with the profile's **current** filter
  state, set `snapshotAt` = the rescan's timestamp, and reset the **30-day** timer
  (`lastVerifiedDate` = the same).
- **`[ Remove from Pantry ]`:** send the item to the **Recent Changes** log with the **24-hour undo**
  timer (`deletedAt` = now; purge after 24h).

### Notes
- The recheck also updates stats consistently with a normal scan (it is a successful scan → counts
  as a label read; red flags caught increment on Outcome 2).
- **Recheck-specific stat (`03`):** increment `totalReformulationsCaught` once per recheck where at
  least one match is attributed as a reformulation (not merely a filter change). Independent of
  whether the recheck also trips a red flag stat.
