# Nivium Progress Note
Prepared: May 7, 2026 (America/Vancouver)

## Sun-Oka Audio Regression
- Canonical audio file:
  - `/Users/robertreindl/Desktop/Sun-Oka Beach Park.m4a`
- Regression case file:
  - `/Users/robertreindl/Desktop/Skeena Profile App/mobile/scripts/transcribe-audio-sun-oka-regression-cases.json`
- Synthetic formatter challenge:
  - `/Users/robertreindl/Desktop/Skeena Profile App/mobile/scripts/formatter-service-regression-cases.json`
  - case name: `dual-grain-dual-concern-stability-challenge`

## Why This Case Matters
- This profile exposed the recurring `Voice Notes` weak spots more clearly than most test cases:
  - dual grainform / grain-size order
  - second layer of concern
  - second stability test
  - `surface` temperature retention
  - stability-line fracture character retention (`ECTP7 SP`)

## Expected Protected Output
- `0-45 DF/PP 4F+-4F 7mm/4mm`
- `55-56 PP 4F red`
- `95-109 SH/FC 4F 10mm/4mm red`
- `-1 surface`
- `ECTP7 SP at 55 cm`
- `PST 8/100 ARR at 179 cm`

## How To Re-Run It
- Local patched backend on `8791`:
  - `npm run check:audio:sun-oka:local`
- Hosted API after deploy:
  - `npm run check:audio:sun-oka:api`
- Combined local formatter guardrails:
  - `npm run check:guardrails:local`

## Automation Burn-In
- Backend pre-push guardrail hook is tracked at:
  - `/Users/robertreindl/Desktop/Skeena Profile App/nivium-backend/.githooks/pre-push`
- Backend CI workflow is tracked at:
  - `/Users/robertreindl/Desktop/Skeena Profile App/nivium-backend/.github/workflows/formatter-guardrails.yml`
- The pre-push hook runs:
  - deterministic formatter guardrails every push
  - Sun-Oka live audio regression too when the local `8791` formatter is running

## Workflow Guidance
- Treat Sun-Oka as a regression guardrail, not as a special profile to hard-code around in UI behavior.
- If future voice changes break this case, investigate formatter/transcribe parsing before changing working mobile review or renderer code.
- If Sun-Oka passes but a new dictation fails, add that new dictation as its own regression case rather than weakening this one.
