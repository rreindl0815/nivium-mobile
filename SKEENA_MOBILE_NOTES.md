# Skeena Mobile Notes

## What Exists Now

This folder contains the new cross-platform mobile app prototype built with Expo and React Native.

Current screens:

- Home
- Dictation
- Field Card
- Review
- Profile Preview
- Archive
- Print

This is now a working prototype shell with:

- a shared saved draft
- raw notes storage
- first-pass raw note extraction into draft fields
- extraction preview before applying parsed values into the shared draft
- critical missing-field feedback on Dictation and Field Card
- an accordion-style field card
- a demo notes loader for quick visual testing
- a first-pass formatter preview with layer continuity normalization
- local saved profile snapshots
- archive, share, and print flows based on the saved profile
- generated report-style PDFs for sharing and printing

Verified formatter sample behaviors now include:

- continuous layer boundaries
- `layer of concern` to `red`
- `next layer down to ...` using previous layer bottom
- repeated `From X to Y` layer clauses splitting correctly in run-on dictation
- correction-style metadata updates such as aspect changes
- `DF and stellars` to `DF/PP`
- wind normalization like `Moderate from the southwest` to `Moderate SW`
- crust plus wet grains becoming a crust line with a comment

Still not wired up yet:

- real voice dictation
- full formatter intelligence from the guide examples
- final PDF generation that matches the existing engine output

## How To Run

From this folder:

```bash
export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh"
npm start
```

Then:

- press `i` for iPhone simulator if available
- press `a` for Android emulator if available
- or scan the Expo QR code with Expo Go on a phone

## Verified Checks

These passed:

- local ESLint
- TypeScript compile check

## Next Build Steps

1. Add local app data model for profile drafts.
2. Turn the field card into structured editable sections.
3. Rebuild the formatter logic from the training examples.
4. Enforce continuous layer boundaries in the formatter.
5. Add archive storage and list view.
6. Rebuild the final profile renderer on mobile.

## Important Formatter Rule

Layer boundaries should stay continuous by default.

Examples:

- `0-3 cm` then `4-25 cm` should become `3-25 cm`
- `next layer down to 45` should become `previous-bottom to 45`

This rule came from real guide behavior and should be built into the formatter.
