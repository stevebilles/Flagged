<!--
Sync Impact Report
- Version change: (template) → 1.0.0
- Ratification: initial adoption of the Flagged project constitution
- Principles defined:
  I. Offline-First, Zero Backend (NON-NEGOTIABLE)
  II. Safety-Critical Accuracy (NON-NEGOTIABLE)
  III. Full-Featured Trial, Hard Usage Gate
  IV. Accessibility-First, Objective Reporting
  V. Test-First for Core Logic; Keep It Simple
- Added sections: Technology & Architecture Constraints; Development Workflow & Quality Gates; Governance
- Templates reviewed: plan-template.md, spec-template.md, tasks-template.md — no changes required
- Deferred TODOs: none
-->

# Flagged Constitution

Flagged is a personalized, on-device food-label ingredient scanner. Users point their camera
at an ingredients list; the app reads the text locally, checks it against the user's personal
"Red Flag" filters, and highlights ingredients to avoid. This constitution defines the rules
that every specification, plan, and implementation for Flagged MUST honor.

## Core Principles

### I. Offline-First, Zero Backend (NON-NEGOTIABLE)

All OCR, ingredient matching, persistence, and purchase-entitlement checks MUST run entirely
on the device. The app MUST fully perform its core jobs — scan a label, match ingredients,
save a pantry item, read the pantry, and honor a paid entitlement — with no network
connection of any kind.

- No cloud OCR APIs, no barcode lookups, no application server, ever.
- No analytics or third-party SDK may be on the critical path such that its failure or a
  missing network breaks a core flow.
- A paid user opening the app in a store with no signal MUST NOT be locked out: entitlement
  is read from a local cache.

Rationale: the product's entire competitive moat is being a 100% offline "X-ray" for any
printed label. Any network dependency in a core flow destroys the moat and the user promise.

### II. Safety-Critical Accuracy (NON-NEGOTIABLE)

Users rely on Flagged to protect family members with allergies, celiac disease, and dye
sensitivities. A **missed red flag** (a dangerous ingredient not caught) or a **false clean**
(a flagged label reported as safe) is treated as a P0 defect.

- Every P0 accuracy bug MUST ship with a regression test that fails before the fix.
- The pure logic — text normalization, exact matching, fuzzy matching, category activation,
  and the pantry diff engine — MUST have unit tests and is the source of truth for behavior.
- OCR error-correction (regex cleanup) is a fallback only and MUST NOT corrupt otherwise
  valid ingredient terms, including names containing digits (e.g. "red 40", "yellow 5").

Rationale: the cost of a wrong answer is a health incident, not an inconvenience.

### III. Full-Featured Trial, Hard Usage Gate

Conversion is driven by proving the technology, never by frustrating the user with locked
features.

- During the free trial (10 successful scans) every feature is unlocked: multiple family
  profiles, custom ingredients, and the full pantry.
- A scan counts against the trial ONLY when it successfully extracts text and reaches a
  results screen. Illegible/aborted scans do not count.
- Monetization is a single one-time purchase (non-consumable). No subscriptions, no
  consumables, no recurring billing.
- On the gate (11th scan attempt), the scanning engine is fully locked until purchase; the
  rest of the app the user already set up remains viewable.

Rationale: the audience has subscription fatigue; the pitch is "pay once, own it forever,"
and the trial must deliver the real product.

### IV. Accessibility-First, Objective Reporting

- Atkinson Hyperlegible is the only typeface, everywhere, to eliminate ambiguous characters.
- The UI MUST respect the OS Dynamic Type / font-scale setting.
- Dark mode (default, "X-ray" feel) and light mode ("clinical" feel) are both first-class;
  no single hex value is shared between the two palettes.
- Flagged reports **objective matches against the user's own filters only** — never a health
  "score," grade, or opinion about whether a food is good or bad.

Rationale: the users are reading tiny label text under stress; legibility is a feature, and
objectivity is what separates Flagged from score-based competitors.

### V. Test-First for Core Logic; Keep It Simple

- Pure-logic modules (matching, activation, diff, stitching, trial/stats math) are written
  or extended test-first: add the failing test, then implement.
- The local database is the single source of truth. Global in-memory state is kept minimal
  (active profile, trial status) and never diverges from the DB.
- Prefer the simplest solution that satisfies the spec (YAGNI). New dependencies and new
  architectural layers MUST be justified against this principle.

Rationale: Flagged's correctness lives in small pure functions; testing them is cheap and
keeping the surface small keeps a solo, non-developer-led project maintainable.

## Technology & Architecture Constraints

- **Platform:** React Native + Expo (Expo SDK, current stable) with TypeScript in strict
  mode. iOS 17.0+ is the MVP target; Android (minSdk 26+) is a near-term goal from the same
  codebase and MUST NOT be designed out.
- **Native modules required:** camera + on-device OCR (`react-native-vision-camera` with an
  on-device text-recognition frame processor) and purchases (`react-native-purchases` /
  RevenueCat). Because of these, builds use an Expo **development client** and **EAS Build** —
  Expo Go is not sufficient.
- **Local database:** `expo-sqlite` with Drizzle ORM and typed migrations. The bundled
  `assets/data/ingredients.json` seed is parsed into SQLite once on first launch.
- **Purchases:** RevenueCat configured for a non-consumable one-time purchase with local
  entitlement caching.
- **No cloud OCR, no server, no network-dependent core feature** — this restates Principle I
  as a hard technical boundary.
- The `docs/` set (`00`–`16`, `data-schema.md`) is the detailed product source of truth.
  Where a spec and `docs/` disagree, resolve the conflict explicitly before building.

## Development Workflow & Quality Gates

- Feature work follows the Spec Kit flow: `/speckit-specify` → `/speckit-plan` →
  `/speckit-tasks` → `/speckit-implement`, with `/speckit-converge` used to measure the
  existing codebase against the specs and record remaining work.
- `npm run typecheck` and `npm test` MUST pass before a change is considered done.
- Any missed-flag or false-clean bug is P0: stop, add a regression test, then fix.
- Changes are reviewed against this constitution; a change that violates a NON-NEGOTIABLE
  principle is not merged, it is redesigned.
- Native-only behavior (live camera OCR accuracy, real IAP purchase/restore, offline
  entitlement, Dynamic Type scaling) MUST be verified on a real device before release.

## Governance

- This constitution supersedes other process preferences. When guidance conflicts, the
  constitution wins.
- Amendments MUST be recorded in this file with an updated version and a Sync Impact Report
  comment describing what changed.
- Versioning of this document follows semantic versioning: MAJOR for removing or redefining a
  principle in a backward-incompatible way, MINOR for adding a principle or materially
  expanding guidance, PATCH for clarifications and wording.
- Complexity that appears to violate Principle V MUST be justified in the plan's Complexity
  Tracking section or removed.

**Version**: 1.0.0 | **Ratified**: 2026-09-07 | **Last Amended**: 2026-09-08
