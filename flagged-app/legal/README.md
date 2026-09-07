# Legal documents

Drafts of the **Privacy Policy** and **Terms of Service** for Flagged.

| File | Purpose |
|---|---|
| [`privacy-policy.md`](privacy-policy.md) | How the app handles data (100% on-device, no collection) |
| [`terms-of-service.md`](terms-of-service.md) | Usage terms + the important safety/allergen disclaimer |

## ⚠️ These are drafts, not legal advice

They reflect how Flagged is actually built (offline, zero-backend), but they are **templates**.
Before publishing:

1. Have both reviewed by a **qualified attorney**.
2. Replace every `[BRACKETED]` placeholder (legal name, support email, address, governing law, date).
3. Keep the "no data collected" claims **true** — if you ever add analytics, crash reporting, or any
   network transmission, update these documents (and the App Privacy answers in
   `../docs/15-store-listing.md`) first.

## Hosting & wiring

- Apple and Google **require** a publicly reachable **Privacy Policy URL**; a **Terms** URL is
  strongly recommended. Host these at HTTPS URLs, e.g.:
  - `https://flagged.app/privacy`
  - `https://flagged.app/terms`
  - (Rendering the Markdown as simple HTML pages is fine.)
- Wire the same URLs into:
  - The **Settings** tab links (docs/05 Tab 4) — currently point to `https://flagged.app/privacy`
    and `.../terms` in `app/(tabs)/settings.tsx`.
  - App Store Connect and Play Console listing fields (docs/15).
