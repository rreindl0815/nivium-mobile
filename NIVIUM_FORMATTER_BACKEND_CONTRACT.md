# Nivium Formatter Backend Contract

This contract defines the raw-notes formatter step that sits between:

- the mobile app's raw-notes capture screen
- the plotted Nivium renderer

The long-term implementation can use OpenAI on the backend, but the app should
only depend on this contract, not on a specific model/provider.

## Purpose

Input:

- messy field dictation / raw notes

Output:

- engine-ready structured text that the Nivium renderer already accepts
- optionally the resolved draft values used to build that text

## Endpoint

`POST /format`

`POST /transcribe-format` (audio-first path)

Health:

`GET /health`

## Request

```json
{
  "rawNotes": "Date: ... Layer 1 ...",
  "source": "raw-notes-ai",
  "formatterVersion": "nivium-ai-v1"
}
```

For `POST /transcribe-format` (multipart form-data):

- `audio` (required): recorded audio file (`.m4a`, `.wav`, or `.mp3`)
- `source` (optional): defaults to `raw-notes-audio`
- `formatterVersion` (optional): defaults to `nivium-ai-v1`

## Response

```json
{
  "formatterVersion": "nivium-ai-v1",
  "formattedText": "Date: ...\nRun Name: ...\n\n0-10 PP F ...",
  "resolvedValues": {
    "run_name": "Ball Steep",
    "observer": "Martin W."
  },
  "warnings": []
}
```

For `POST /transcribe-format`, include transcript text:

```json
{
  "formatterVersion": "nivium-ai-v1",
  "transcript": "Date April 16 ...",
  "formattedText": "Date: April 16 ...",
  "resolvedValues": {
    "run_name": "Pow Pow"
  },
  "warnings": []
}
```

## Required Behavior

- `formattedText` must be valid engine-ready text for the Nivium renderer
- the formatter should normalize metadata, layers, temperatures, tests, and notes
- the formatter should be conservative: if uncertain, prefer omission or warnings over invented details
- the renderer should remain formatter-agnostic; manual/local and AI/raw-notes should converge on the same output shape

## App Behavior

- if formatting succeeds:
  - save the formatted text
  - send it to the plotted renderer
- if formatting fails or the device is offline:
  - save the raw notes locally
  - route the user to the `raw-notes-pending` waiting screen
  - allow retry when connection returns

## Local Dev Stand-in

For development, the app includes a local formatter service started with:

```bash
npm run format:service
```

Behavior:

- if `OPENAI_API_KEY` is not set:
  - the service runs in `local-mock` mode using the existing parser/formatter logic
- if `OPENAI_API_KEY` is set:
  - the same service uses the OpenAI API behind the same `/format` contract

Suggested environment variables:

```bash
OPENAI_API_KEY=...
OPENAI_FORMATTER_MODEL=gpt-4o-mini
```
