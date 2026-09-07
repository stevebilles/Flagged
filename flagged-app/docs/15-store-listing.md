# 15 — Store Listing & App Privacy

Metadata, assets, and privacy answers for submitting Flagged. Draft copy below — adjust to taste,
but keep the positioning consistent with `01-overview.md` (offline X-Ray, no barcodes, no scores).

> **Compliance guardrails:** don't make medical or safety guarantees. Flagged reports objective
> matches against the user's own filters — it is **not** a substitute for reading labels or medical
> advice. Keep allergen language careful (see the disclaimer in `legal/terms-of-service.md`).

## App name & subtitle

- **App name (iOS, ≤30 chars):** `Flagged: Food Label Scanner`
- **Subtitle (iOS, ≤30 chars):** `Your offline ingredient X-Ray`
- **Android title (≤30 chars):** `Flagged: Food Label Scanner`
- **Short description (Android, ≤80 chars):**
  `Scan any food label offline and instantly flag the ingredients you avoid.`

## Keywords (iOS, ≤100 chars, comma-separated, no spaces)

```
ingredient,scanner,food label,allergy,allergen,dye free,gluten,additives,celiac,seed oil,offline
```

## Promotional text (iOS, ≤170 chars, updatable without review)

```
Point your camera at any ingredient list. Flagged reads it on-device and highlights exactly what
you're avoiding — no barcodes, no health scores, no internet.
```

## Full description (draft)

```
Reading food labels is exhausting. Manufacturers hide dozens of ingredients behind confusing
chemical names, and memorizing which ones matter for your family shouldn't be your full-time job.

Flagged is your offline ingredient X-Ray. Point your camera at any printed ingredient list and
Flagged reads the raw text right on your device — then highlights the exact ingredients you've
chosen to avoid.

• 100% offline. No barcodes, no arbitrary "health scores," no accounts, no data leaving your phone.
• Personalized filters. Start with Quick Packs like Artificial Dyes, Big-9 Allergens, Gluten Free,
  Seed Oils, Hidden Sugars and more — then fine-tune down to individual ingredients.
• Multiple family profiles. Different triggers for different people, switched with a tap.
• Custom ingredients. Add anything you want flagged.
• Your Safe List (Pantry). Save approved products, and get reminded to re-check items in case a
  brand quietly changes the recipe.

Try it free: 10 full scans with every feature unlocked. Then unlock unlimited scanning for life for
a one-time $24.99 — no subscriptions.

Flagged helps you read labels faster; it is not medical advice and does not replace reading the
packaging yourself.
```

## Screenshots

Must be **real captures** of the running app (docs/11 to get it running; fonts installed so the UI
looks final). Do NOT fabricate.

**iOS required sizes** (upload at least the 6.7" set; App Store Connect can scale):
- 6.7" iPhone: **1290 × 2796** px (portrait)
- 6.5" iPhone: **1242 × 2688** px (portrait)
- Capture in iOS Simulator with **⌘S**, or on-device.

**Android:** 2–8 phone screenshots, min 1080 px on the short edge, PNG/JPG, plus a
**1024 × 500** feature graphic.

**Suggested screenshot set (the story):**
1. Live scan with cyan bounding boxes over a label.
2. A **Flagged** result — red highlights + breakdown card.
3. A **Clean** result — "No red flags detected."
4. Profile editor — Quick Packs + category toggles with classification badges.
5. Pantry / Safe List.
6. Pricing card — $24.99 lifetime, "no subscriptions."

**IAP review screenshot (App Store Connect → the in-app purchase):** a real capture of the
**paywall screen** (`app/paywall.tsx`). Same size rules as above.

## App icon

- iOS: 1024 × 1024 px, no transparency, no rounded corners (the OS masks it).
- Android adaptive icon: foreground + background layers.
- Design cue: an X-Ray / scan motif in the dark canvas + cyan palette (docs/09).

## Category & age rating

- **Primary category:** Health & Fitness (alt: Food & Drink).
- **Age rating:** 4+ (no objectionable content).

## App Privacy (iOS) / Data safety (Android)

Flagged is architecturally **zero-backend, on-device** (docs/01/02). This makes the privacy
answers simple and strong.

- **Data collected:** **None.** The app does not collect or transmit personal data.
- **Camera:** used **only** on-device to read label text; **no images or text are uploaded or
  stored off-device** (thumbnails saved to the Pantry stay local and are excluded from backup —
  docs/03). Declare camera **usage**, but it is not "data collection."
- **Tracking:** none. No ATT prompt needed (no cross-app tracking, no ad SDKs).
- **Purchases:** processed by Apple/Google + RevenueCat for entitlement. If RevenueCat's SDK is
  considered a data recipient, disclose the minimal purchase/identifier data it processes per their
  guidance — it is used for purchase functionality, not tracking. Confirm current RevenueCat
  privacy guidance at submission time.
- **Account:** none (no sign-in).

> **Answer with care:** the "no data collected" claim must remain true. If any future analytics or
> crash reporting is added, update these answers and the Privacy Policy accordingly.

## Support & marketing URLs

- **Support URL:** `https://flagged.app/support` (or a contact form / mailto).
- **Marketing URL (optional):** `https://flagged.app`.
- **Privacy Policy URL (required):** host `legal/privacy-policy.md` at a public URL, e.g.
  `https://flagged.app/privacy`.
- **Terms of Service URL:** `https://flagged.app/terms` (from `legal/terms-of-service.md`).

Wire the same URLs into the Settings tab links (docs/05 Tab 4).

## Pre-submission checklist

- [ ] Real screenshots at required sizes (app running, fonts installed)
- [ ] IAP review screenshot = the paywall
- [ ] Privacy Policy + Terms hosted at public HTTPS URLs; linked in Settings
- [ ] App Privacy / Data safety completed ("no data collected", camera on-device)
- [ ] IAP `flagged_lifetime` attached to the version; iOS Agreements Active (docs/08/12)
- [ ] Description avoids medical/safety guarantees
