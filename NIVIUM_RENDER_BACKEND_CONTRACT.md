# Nivium Render Service Contract

The mobile app can generate plotted PDFs by POSTing engine-ready profile text to a
small render endpoint backed by the lab Python renderer.

## Local Dev Service

Start the service from the app project:

```bash
npm run render:service
```

By default it listens on:

```text
http://0.0.0.0:8787/render
```

Point the Expo app at it with:

```bash
EXPO_PUBLIC_NIVIUM_RENDER_ENDPOINT=http://127.0.0.1:8787/render
```

If you are testing on a physical phone, replace `127.0.0.1` with your Mac's LAN IP.
The service itself should also be started on `0.0.0.0` so devices on your Wi‑Fi can reach it.

## Request

```json
{
  "engineText": "Run Name: Thin Layer Maze\nDate: 2026-03-21\n...",
  "profileTitle": "Thin Layer Maze",
  "source": "manual-local",
  "rendererVersion": "nivium-v1"
}
```

## Response

```json
{
  "documentKind": "plot",
  "rendererVersion": "nivium-v1",
  "pdfBase64": "<base64-pdf>",
  "fileName": "thin-layer-maze.pdf"
}
```

## Notes

- `engineText` should already be in renderer-ready formatter output shape.
- The current app manual-entry flow is the first target for this endpoint.
- The later AI/dictation flow should POST the same normalized `engineText` shape.
- If no endpoint is configured, the app falls back to the existing report PDF.
