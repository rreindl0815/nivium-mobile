# Android AAB Release Sanity Checklist (Nivium)

## Scope
Use this checklist before creating and uploading the next Android AAB for `ca.nivium.mobile`.

## Current Snapshot (from this pass)
- Route bypass status: PASS
  - Legacy `/field-card` now redirects to `/manual-entry`.
  - Voice Notes route in `dictation` mode now redirects free users to `/upgrade`.
- Type/lint status: PASS
  - `npm run lint` passed
  - `npx tsc --noEmit` passed
- RevenueCat Android key in EAS production env: FAIL (blocker)
  - `EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY` is not present in production environment.

## Blocker (must fix before build)
1. Add Android RevenueCat public SDK key to EAS production env:
   - Name: `EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY`
   - Scope: `production`
2. Confirm entitlement id stays:
   - `EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID=pro`

## Pre-Build Verification Commands
Run from mobile workspace:

```bash
npx eas whoami
npx eas env:list --environment production
npm run lint
npx tsc --noEmit
```

Expected:
- Logged in as intended Expo account.
- `production` env includes:
  - `EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY`
  - `EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY`
  - `EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID=pro`
- Lint/typecheck pass.

## Build Command
```bash
npx eas build --platform android --profile production
```

## On-Device Android Smoke Test (must pass)
Install the generated AAB build and validate:

1. Home screen gating
- Tap `Voice Notes` as free user -> should open `/upgrade`.
- Tap `Manual Data Entry` as free user -> should open manual entry directly.

2. Upgrade screen behavior
- `View Paid Access` opens paywall (no silent no-op).
- If paywall closes without purchase, user sees explicit feedback.
- `Restore Purchases` gives explicit success/failure feedback.

3. Legacy route safety checks
- Any old route to `field-card` should land in manual entry, not paid voice flow.

4. Paid feature gates (free user)
- Attempt `Archive`, `Share`, `Print` -> all route to `/upgrade`.

5. Post-purchase behavior
- Complete test purchase (or activate entitlement) and verify:
  - `Voice Notes` opens normally.
  - `Archive`, `Share`, `Print` open normally.

6. Regression checks
- Create profile from manual flow and confirm rendered profile opens.
- Open, edit, and re-save profile from Archive.

## Release Go/No-Go
- GO only if all of the following are true:
  - Android RC key present in production env
  - Build succeeds
  - All smoke test items pass
- NO-GO if any paywall/restore action silently fails or does nothing.
