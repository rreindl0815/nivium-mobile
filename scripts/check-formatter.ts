import assert from 'node:assert/strict';

import { formatDraftToEngineText } from '../utils/formatter';
import { extractDraftValuesFromRawNotes } from '../utils/raw-note-parser';
import type { ProfileDraft } from '../types/profile';

function makeDraft(values: Record<string, string>): ProfileDraft {
  return {
    rawNotes: '',
    values,
    updatedAt: new Date().toISOString(),
  };
}

function runChecks() {
  const continuityDraft = makeDraft({
    date: 'February 19, 2026',
    run_name: 'Ball Steep',
    observer: 'Martin W./Hannes',
    layer_1: '0-3 DF F',
    layer_2: '4-25 rounds pencil',
  });

  const continuityResult = formatDraftToEngineText(continuityDraft);
  assert.match(continuityResult.formattedText, /0-3 DF F/);
  assert.match(continuityResult.formattedText, /3-25 RG P/);

  const concernDraft = makeDraft({
    date: 'February 12, 2026',
    run_name: 'Star Catcher',
    observer: 'Martin W\/Martin K',
    layer_1: '50-60 rain crust knife',
    layer_2: '60-65 facets 2 millimeters four finger',
    layer_of_concern: '60-65',
  });

  const concernResult = formatDraftToEngineText(concernDraft);
  assert.match(concernResult.formattedText, /60-65 FC 2mm 4F red|60-65 FC 4F 2mm red/);

  const extracted = extractDraftValuesFromRawNotes(
    'Layer 1 from 0 to 10 centimeters, rounds, pencil hardness. Next layer down to 45, facets, four finger hardness. This layer in red.'
  );
  assert.equal(extracted.layer_1, '0-10 rounds, pencil hardness');
  assert.equal(extracted.layer_2, '10-45 facets, four finger hardness red');

  const corrected = extractDraftValuesFromRawNotes(
    'Observer: Robert. Organization: Skina. Aspect: East. Correction: Aspect: West. No precip. Winds: Calm.'
  );
  assert.equal(corrected.organization, 'Skeena');
  assert.equal(corrected.aspect, 'west');
  assert.equal(corrected.precip, 'nil');
  assert.equal(corrected.wind, 'Calm');

  const surfaceAndWind = extractDraftValuesFromRawNotes(
    'Surface grain: DF and stellars. Wind speed: Moderate from the southwest. Foot pen: 10 centimeters. Correction: foot pen 45 centimeters.'
  );
  assert.equal(surfaceAndWind.surface_grain, 'DF/PP');
  assert.equal(surfaceAndWind.wind, 'Moderate SW');
  assert.equal(surfaceAndWind.foot_pen, '45');

  const crustDraft = makeDraft({
    date: 'January 19, 2026',
    run_name: 'Burger Bar',
    observer: 'Corey/Hannes',
    layer_1: '10-30 rain crust and wet grains knife',
  });
  const crustResult = formatDraftToEngineText(crustDraft);
  assert.match(crustResult.formattedText, /10-30 IFrc K crust \| wet grains present/);

  const commentAndRed = extractDraftValuesFromRawNotes(
    'From 100 to 101 centimeters, sun crust, ice resistance. Add a comment in the 100 to 101 centimeter. January 14th crust. Make the layer from 100 to 101 centimeters red.'
  );
  assert.equal(commentAndRed.layer_1, '100-101 sun crust, ice resistance red | January 14th crust');

  const spokenDraft = makeDraft({
    date: 'January 18, 2026',
    run_name: 'Yogi Bear',
    observer: 'Robert',
    temp_profile: 'minus 0.5 at zero\nminus 1 at 40 centimeters',
    stability_tests: 'compression test hard 28 taps resistant planar at 51 centimeters',
  });
  const spokenResult = formatDraftToEngineText(spokenDraft);
  assert.match(spokenResult.formattedText, /-0.5 surface/);
  assert.match(spokenResult.formattedText, /-1 40cm/);
  assert.match(spokenResult.formattedText, /CTH 28 RP at 51 cm|CTH28 RP at 51 cm/);

  const witchesChair = extractDraftValuesFromRawNotes(
    `Date: February 3rd, 2026 at 12:30 Run name: Witches Chair Observer: Robert Organization: Skeena Elevation: 1,150 m Aspect: Northeast Slope Angle: 0° Air Temperature: -1° Sky: OVC Precip: S-1 Wind: Calm Total Hs: 345 Surface Crain: Stellers Foot Pen: 45 Ski Pen: 30 cm Layer 1: from 0 to 18 cm, DF, 4 finger resistance From 18 to 35 cm, rounds, 1 mm, 4 finger plus resistance From 35 to 40 cm, facets Fist resistance. This layer in red. From 310 correction, from 40 to 50 centimeters. Rain crust, knife plus resistance. The layer of concern, I already said that, is from 35 to 40 centimeters. Stability test, shear test easy at 36 centimeters. Also add a comment into this layer, please, that says, woomph at valley bottom. Woomph is spelled W-O-O-M-P-F.`
  );
  assert.equal(witchesChair.layer_1, '0-18 DF, 4 finger resistance');
  assert.equal(witchesChair.layer_2, '18-35 rounds, 1 mm, 4 finger plus resistance');

  const pantyThief = extractDraftValuesFromRawNotes(
    `Date: 31st of January at 11 o'clock. Run name: Panty Thief. Server: Robert. Organization: Skina. Elevation: 1570 meters. Aspect: Southwest. Slope angle: 30 degrees. Air temperature: minus 1. Sky: Few. Precip: nil. Wind: light from the southeast. Total Hs: 310 centimeters. Surface grain: stellars. Foot pen: 10 centimeters. Ski pen: 5 centimeters. Layer 1, from 0 to 15 centimeters, EF, four-finger resistance. Layer 2, from 15 to 17 centimeters, stellars, fist resistance. From 17 to 30 centimeters... Rounds, 1 millimeter, four-finger plus resistance. Layer 3, 30 to 34 centimeters, rain crust, knife resistance. Layer from 34 to 36, facets, four-finger resistance. This is the layer of concern. 36 to 50 centimeters, another rain crust, knife resistance. And make the facets two millimeters in size. The facets from 34 to 36 centimeters. Also make the layer from 15 to 17 centimeters, red. And the stability test, shear test easy, sudden collapse at 16 centimeters, also a shear test easy at 35 centimeters, sudden collapse. 56°01'11", -128°14'00"`
  );
  assert.equal(pantyThief.observer, 'Robert');
  assert.match(pantyThief.stability_tests ?? '', /shear test easy, sudden collapse at 16 centimeters/i);
  assert.match(pantyThief.stability_tests ?? '', /shear test easy at 35 centimeters, sudden collapse/i);
  assert.equal((pantyThief.stability_tests ?? '').split('\n').length, 2);

  console.log('Formatter checks passed.');
}

runChecks();
