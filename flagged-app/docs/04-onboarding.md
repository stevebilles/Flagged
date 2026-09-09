# 04 — The 7-Screen Onboarding Flow

**Logic:** Problem → The Tech/Moat → Interactive Setup → Name (Personalization) → Navigation
Overview → The Fully Unlocked Trial → Lifetime Upsell Intro.

Onboarding runs once (persist a `hasOnboarded` flag locally). All copy below is **exact** — use
verbatim.

---

## Screen 1 — Label Fatigue (The Problem)
- **Visual:** A densely packed, confusing ingredient list.
- **Copy:**
  > "Reading food labels is exhausting. The FDA allows thousands of confusing additives in our
  > food, and memorizing which ones are approved for your family shouldn't be your full-time job."

## Screen 2 — No Barcodes. No Health Scores. (The Moat)
- **Visual:** An animation of scanning a handwritten bakery label.
- **Copy:**
  > "Flagged doesn't use barcodes or arbitrary 'health scores.' Our offline X-Ray instantly reads
  > raw text on any printed label."

## Screen 3 — Personalize Your Scanner (Interactive Baseline Setup)
- **Visual:** A clean list of the **11 default filters** (the 11 Quick Packs — e.g., Artificial
  Dyes, Big-9 Allergens, Gluten Free).
- **Copy:**
  > "What are you trying to avoid? Select a starting filter to customize your X-Ray (you can change
  > this or add more later)."
- **Behavior:** Selecting a Quick Pack here activates all its categories/ingredients on the user's
  first profile (see activation rules in `data-schema.md`). This writes to the default profile
  created during onboarding.

## Screen 4 — What Should We Call You? (Name / Personalization)
- **Visual:** A single clean text field, friendly and low-friction. Keyboard opens automatically.
- **Copy (heading):**
  > "What should we call you?"
- **Copy (subtext):**
  > "We use your first name to personalize the app — like your Home greeting. It stays on this
  > device and is never uploaded anywhere."
- **Field:** First Name (single line). Placeholder: "First name".
- **Action buttons:**
  - `[ Continue ]` (primary) — saves the name if entered, advances.
  - `[ Skip ]` (text button) — advances without a name.
- **Behavior:**
  - A name entered here is saved as **Settings → First Name** (feeds the Home header, `05`)
    **and** used as the label of the default profile chip created during onboarding.
  - Blank / skipped is allowed: onboarding still completes, the Home greeting uses its
    graceful fallback, and the user can set a name later in **Settings**.
  - No validation beyond trimming whitespace. No scan consumed.

## Screen 5 — The 4-Tab Hub (Navigation Overview)
- **Visual:** A sleek graphic highlighting the bottom menu.
- **Copy:**
  > "Your command center: Home, Scan, Pantry, and Settings."

## Screen 6 — The 10-Scan Trial (The Hook)
- **Visual:** A large graphic of a battery or scanner charging up to "10".
- **Copy:**
  > "You're all set! You have 10 free scans to test Flagged in the real world. We've unlocked every
  > feature—including Custom Ingredients and Multiple Family Profiles—so you can see the magic for
  > yourself."

## Screen 7 — The "Founding Member" Transparent Pricing (The Climax)
- **Visual:** A clean, high-contrast pricing card.
- **Copy:**
  > "Ditch the $40/year subscriptions. After your 10 free scans, unlock unlimited scanning for life
  > for a one-time fee of $24.99. No hidden fees. Pay once, own it forever."
- **Action button (primary):** `[ Start My 10 Free Scans ]`
  - Tapping completes onboarding and drops the user into the **Home** tab. It does **not** trigger a
    purchase — the trial begins.

---

## Implementation notes
- Persist `hasOnboarded=true` on completion; never show onboarding again on that install.
- The default profile created here is named from **Screen 4** if a name was given, and is later
  renamable via **Settings → First Name** and **Home → profile chips** (`05`).
- Screen 4 (name) is **skippable**; a blank name must not block completion.
- No scan is consumed during onboarding.
