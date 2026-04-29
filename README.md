# Nivium Mobile App

This Expo app captures snow profiles through two paths:

- structured manual entry for the free/manual workflow
- raw notes / dictation for the later paid AI workflow

Both paths are intended to converge on the same engine-ready formatter output and
then render a plotted Nivium profile.

## Core Commands

Install dependencies:

```bash
npm install
```

Start the Expo app:

```bash
npm run start
```

Run typecheck:

```bash
npx tsc --noEmit
```

Start the local plotted-render service:

```bash
npm run render:service
```

Start the local raw-notes formatter service:

```bash
npm run format:service
```

## Plotted Renderer Flow

The app now has a renderer abstraction at:

- `utils/profile-renderer.ts`

Current behavior:

- if `EXPO_PUBLIC_NIVIUM_RENDER_ENDPOINT` is configured, the app will try to fetch a
  plotted Nivium PDF from that endpoint
- otherwise it falls back to the existing report PDF output

See the backend contract here:

- `NIVIUM_RENDER_BACKEND_CONTRACT.md`

## Raw Notes Formatter Flow

The paid raw-notes path now has a formatter abstraction at:

- `utils/formatter-service.ts`

Current behavior:

- if `EXPO_PUBLIC_NIVIUM_FORMATTER_ENDPOINT` is configured, raw notes will be sent to that endpoint
- if the formatter call fails, raw notes are still saved locally and routed to the waiting screen
- for local development, `npm run format:service` provides a formatter backend that can run in:
  - `local-mock` mode using the current local parser/formatter logic
  - `openai` mode when `OPENAI_API_KEY` is set

See the formatter backend contract here:

- `NIVIUM_FORMATTER_BACKEND_CONTRACT.md`

## Renderer Assets

The active Nivium renderer lab lives here:

- `nivium-renderer-lab/Nivium_Profile_Template.svg`
- `nivium-renderer-lab/Nivium_Profile_Template_PRINTSAFE.png`
- `nivium-renderer-lab/Nivium_logo_transparent.svg`
- `nivium-renderer-lab/skeena_profile_engine_nivium_v2.py`

The original live Skeena engine is intentionally kept separate and should remain untouched.
