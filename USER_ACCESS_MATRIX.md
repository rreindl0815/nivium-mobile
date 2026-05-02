# Nivium User Access Matrix (Store / Reviewer / Internal)

Date: April 10, 2026  
App: Nivium (iOS/Android)

## Scope
Nivium is a snowpack documentation tool. It is not a safety, forecasting, or decision-support app.

## Access Tiers

| Tier | Available Features | Restricted Features |
| --- | --- | --- |
| Free | Manual Data Entry, sample profile workflow (including Load Sample and Test Profile 1/2/3), profile viewing | Voice Notes, Archive, Share, Print |
| Paid (Active subscription entitlement `pro`) | Manual Data Entry, Voice Notes, Archive, Share, Print | None |

## Entry-Point Behavior

| User Action | Free User Result | Paid User Result |
| --- | --- | --- |
| Tap Manual Data Entry | Opens directly | Opens directly |
| Tap Voice Notes | Routed to Upgrade | Opens Voice Notes |
| Tap Archive | Routed to Upgrade | Opens Archive |
| Deep-link/open Share or Print | Routed to Upgrade | Opens selected screen |

Notes:
- Paid-only screens enforce gating and redirect free users to the Upgrade screen.
- Access is entitlement-based in production (`pro` subscription entitlement).

## Upgrade Sequence (How a User Becomes Paid)
1. User taps a paid feature (Voice Notes, Archive, Share, or Print).
2. App routes to Upgrade with the requested feature context.
3. User taps **View Paid Access**.
4. RevenueCat paywall is presented.
5. If purchase completes and entitlement `pro` becomes active, app unlocks paid access and returns to the requested feature.

## Restore Purchases (When It Is Used)
Use **Restore Purchases** when a user has already paid but the app currently appears free. Typical scenarios:
- New phone/device
- App reinstalled
- Same store account, but local entitlement state is out of sync
- Existing subscription is active but not yet reflected locally

Restore behavior:
1. User taps **Restore Purchases** on Upgrade.
2. App asks store/RevenueCat for restored purchases and re-checks entitlement `pro`.
3. If entitlement is found: paid access unlocks immediately.
4. If entitlement is not found: app shows **No Purchases Found**.

Important:
- Restore works only for purchases on the same Apple ID / Google account that originally purchased the subscription.

## Purchase Availability Fallback
If purchase configuration is unavailable in a given build (for example missing runtime keys/config), Upgrade does not unlock access and shows a purchase-unavailable/restore-unavailable message.

## Reviewer Notes
- Free experience is functional (Manual Data Entry + sample profiles + profile viewing).
- Paid features are clearly gated behind in-app subscription entitlement.
- No hidden tester unlock path is part of production behavior.
