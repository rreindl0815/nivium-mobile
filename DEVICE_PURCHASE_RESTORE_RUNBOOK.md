# Nivium Device Purchase/Restore QA Runbook

Date: April 10, 2026  
Scope: Real-device validation of paid access, purchase, and restore behavior.

## Goal
Verify that:
1. Free users are gated correctly.
2. Purchase unlocks paid features.
3. Restore works for previously paid users.
4. Wrong-account restore fails gracefully.
5. Paid access survives app restart and reinstall.

## Feature Access Baseline
- Free: Manual Data Entry, sample profiles, profile viewing.
- Paid: Voice Notes, Archive, Share, Print.

---

## Test Matrix (Execute All)
| ID | Scenario | Platform |
| --- | --- | --- |
| T1 | Free user hits paywall from locked feature | iOS + Android |
| T2 | Purchase success unlocks paid features | iOS + Android |
| T3 | Restore success after reinstall/new device (same account) | iOS + Android |
| T4 | Restore failure on different account | iOS + Android |
| T5 | Persisted paid state after app restart | iOS + Android |
| T6 | Network interruption during purchase/restore | iOS + Android |

---

## Prerequisites

### App/Backend
1. Build installed from TestFlight/internal test track.
2. RevenueCat project configured with entitlement `pro`.
3. Store products active and mapped to `pro`.

### iOS
1. iPhone with latest TestFlight build installed.
2. Sandbox tester Apple ID available.
3. Device signed into App Store with sandbox test flow ready.

### Android
1. Internal testing build available in Play (or staged equivalent once account unblock completes).
2. License tester account configured in Play Console.
3. Tester account invited and accepted.

### Evidence
Capture screenshot/screen recording for each PASS/FAIL at:
- paywall shown
- purchase success
- paid feature unlocked
- restore success/failure alert

---

## Standard Starting State (before each test)
1. Force-close app.
2. Re-open app and land on Home.
3. Confirm expected access state (free/paid) for the scenario.
4. If test requires clean state, uninstall/reinstall first.

---

## T1: Free User Gating
1. Ensure account has no active entitlement.
2. Open app Home.
3. Tap `Voice Notes`.
4. Confirm Upgrade screen appears with feature context.
5. Repeat for `Archive` (and optionally deep-link to Share/Print if route testing).

Expected:
1. Free user cannot enter locked screens directly.
2. Upgrade screen appears every time for paid features.

Pass/Fail:
- PASS if all locked features route to Upgrade.
- FAIL if any paid feature opens directly as free user.

---

## T2: Purchase Success Unlock
1. Start from free state on Upgrade screen.
2. Tap `View Paid Access`.
3. Complete purchase in native store paywall flow.
4. Wait for app to return.
5. Confirm app returns to requested feature (or Home) with paid access active.
6. Open all paid features: Voice Notes, Archive, Share, Print.

Expected:
1. Purchase completes without app error.
2. Paid features open directly after unlock.
3. Upgrade screen shows paid subscription state.

Pass/Fail:
- PASS if unlock is immediate and all paid features are available.
- FAIL if purchase succeeds but gating remains locked.

---

## T3: Restore Success (Same Account)
1. Use account that already purchased subscription.
2. Uninstall app (or use second device).
3. Reinstall and open app.
4. Trigger Upgrade via paid feature.
5. Tap `Restore Purchases`.

Expected:
1. `Access Restored` (or equivalent success) appears.
2. Paid features unlock immediately.

Pass/Fail:
- PASS if paid access returns without repurchase.
- FAIL if active subscriber cannot restore on same account.

---

## T4: Restore Failure (Different Account)
1. Ensure no purchase on current store account.
2. Open Upgrade.
3. Tap `Restore Purchases`.

Expected:
1. `No Purchases Found` (or equivalent non-destructive message).
2. App remains in free mode.

Pass/Fail:
- PASS if failure is clear and app stays stable.
- FAIL if app crashes, hangs, or unlocks incorrectly.

---

## T5: Paid State Persistence
1. Complete T2 (paid unlocked).
2. Force-close app.
3. Reopen app.
4. Open Voice Notes and Archive directly.

Expected:
1. Paid access remains active.
2. No unexpected return to free during active entitlement.

Pass/Fail:
- PASS if paid state persists across restart.
- FAIL if access regresses without entitlement change.

---

## T6: Network Interruption Handling
1. Open Upgrade.
2. Disable network (airplane mode) before purchase/restore.
3. Tap `View Paid Access` and then `Restore Purchases`.
4. Re-enable network and retry.

Expected:
1. App shows graceful error/unavailable messaging.
2. No crash or frozen screen.
3. Flow recovers after network returns.

Pass/Fail:
- PASS if messaging is clear and retry works.
- FAIL if unrecoverable state occurs.

---

## Post-Run Signoff
Record:
1. App build number tested.
2. Device model + OS version.
3. Store account type used (sandbox/license tester).
4. Result per test ID (PASS/FAIL).
5. Links/paths to evidence screenshots.
6. Any bug ticket IDs opened.

## Suggested Result Table
| Test ID | iOS Result | Android Result | Notes |
| --- | --- | --- | --- |
| T1 |  |  |  |
| T2 |  |  |  |
| T3 |  |  |  |
| T4 |  |  |  |
| T5 |  |  |  |
| T6 |  |  |  |
