# Nivium Continuity Handoff
Prepared: May 2, 2026 (America/Vancouver)

## Critical Guardrails
- Do not modify: `/Users/robertreindl/Desktop/Skeena Profile Engine`
- Treat `/Users/robertreindl/Desktop/Skeena Profile Engine` as read-only reference only
- Active mobile workspace: `/Users/robertreindl/Desktop/Skeena Profile App/mobile`
- Active backend workspace: `/Users/robertreindl/Desktop/Skeena Profile App/nivium-backend`
- User preference: very short, one-step-at-a-time guidance when user action is required
- Keep UI simple; avoid adding extra confusing flows

## Stable State Summary
- Current state is stable end-to-end.
- Verified working path:
  - Voice Notes
  - formatter/transcribe
  - rendered profile
  - MED edit
  - re-render
- User confirmed: “everything works, end2end”.

## Production / Hosted Backend State
- Hosted formatter health endpoint:
  - `https://api.nivium.ca/health`
- Verified live response at handoff time:
  - `mode: openai (gpt-4.1-mini)`
  - `transcribeModel: gpt-4o-transcribe`
- Railway formatter service now has:
  - `OPENAI_API_KEY`
  - `OPENAI_FORMATTER_MODEL=gpt-4.1-mini`

## Repos And Commits

### Backend
- Repo: `/Users/robertreindl/Desktop/Skeena Profile App/nivium-backend`
- Branch: `main`
- Latest important commits:
  - `fd8bda2` `formatter: clamp malformed transcribe overlap profile`
  - `eabf7be` `backend: ignore local formatter env and track lockfile`
  - `841ba70` `formatter: stabilize transcribe layer and test canonicalization`
- These are already committed, pushed, and deployed to Railway.

### Mobile
- Repo: `/Users/robertreindl/Desktop/Skeena Profile App/mobile`
- Checkpoint branch: `codex/med-roundtrip-guardrail`
- Latest important commits:
  - `0c80d8a` `tests: tighten transcribe regression for overlap profile`
  - `f6ccba8` `mobile: checkpoint working voice notes med and render flow`
- Mobile repo was cleaned up and checkpointed so current working state is preserved remotely.

## What Was Fixed In This Stable Round

### Backend formatter / transcribe
- Stabilized layer and test canonicalization for real audio dictation cases
- Prevented malformed overlap output like:
  - `35-67 FC/RG P-1F+`
  - `37-67 FC/RG 1F-1F+ 4mm/1mm`
- Added final clamp for the known malformed transcribe overlap signature
- Preserved:
  - `CTE7 SC at 36 cm`
  - `PST 45/100 END at 97 cm`
- Backend `.gitignore` now safely ignores local `formatter/.env`
- `formatter/package-lock.json` is now tracked for reproducibility

### Mobile app
- ExpoGo local config now points to hosted services:
  - formatter: `https://api.nivium.ca/format`
  - transcribe: `https://api.nivium.ca/transcribe-format`
- Voice Notes display/save path now normalizes engine-formatted text so inline stability lines break onto their own lines in the app view
- Mobile repo was cleaned up with `.gitignore` updates to hide screenshots, local artifacts, renderer outputs, backups, and other non-source noise

## Important Local Config Notes
- Mobile local env file:
  - `/Users/robertreindl/Desktop/Skeena Profile App/mobile/.env.local`
- At stable handoff, it should include hosted endpoints:
  - `EXPO_PUBLIC_NIVIUM_FORMATTER_ENDPOINT=https://api.nivium.ca/format`
  - `EXPO_PUBLIC_NIVIUM_TRANSCRIBE_ENDPOINT=https://api.nivium.ca/transcribe-format`
  - `EXPO_PUBLIC_NIVIUM_RENDER_ENDPOINT=https://render.nivium.ca/render`

## Test / Regression State

### Confirmed passing
- Local formatter regression suite for core cases
- Local transcribe/audio regression on alternate clean port
- Hosted health check
- User real-device end-to-end check after final Railway deploy

### Strengthened regression coverage
- Mobile regression file updated:
  - `/Users/robertreindl/Desktop/Skeena Profile App/mobile/scripts/transcribe-audio-regression-cases.json`
- This now explicitly rejects the malformed overlap pattern from the real failing profile

## Store / Release Context
- User context from current project state:
  - App Store build 15 exists/live for user testing
  - Google production is still gated by tester situation
- Release blocker still applies:
  - restore full paywall enforcement before final release
  - remove dev bypass logic
  - validate non-entitled behavior for Voice Notes, Archive, Share, Print

## Temporary / Operational Notes
- A long-running local formatter process may still be running on port `8788` from the user terminal
- This is not needed for hosted-path verification now that ExpoGo points to `api.nivium.ca`
- If future local tests are run on `8788`, be aware that a stale process can mask newer local code unless restarted or moved to a different port

## Recommended Next Step
- Start a fresh chat and test the next prepared dictation
- Use this handoff as the first message in that new chat
- Best next workflow:
  - run one new Voice Notes dictation
  - inspect rendered profile
  - make one MED edit
  - re-render
  - only then investigate any remaining profile-specific edge cases

## Recommendation On New Chat
- Yes, a new chat is a good idea now
- Reason:
  - this stable state is cleanly checkpointed
  - next work is a new dictation / new edge-case investigation
  - a new thread reduces context drag from earlier false starts and old deployment confusion
