import assert from 'node:assert/strict';

import { formatDraftToEngineText, formatRawNotesToEngineText } from '../utils/formatter';
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

  const narrowLayerContinuity = extractDraftValuesFromRawNotes(
    `Date: February 8th 2026 at 12:15. Run name: Narrow Layer Example. Observer: Paul. Organization: Nivium. Elevation: 1520 meters. Aspect: East. Slope angle: 31 degrees. Air temperature: minus 6. Sky: OVC. Precip: nil. Wind: calm. Total HS: 240 centimeters. Surface grain: rounds. Foot pen: 12 centimeters. Ski pen: 6 centimeters. Layer 1 from 0 to 4 centimeters, DF, fist resistance. Next layer down to 6 centimeters, rain crust, knife resistance. From there to 14 centimeters, facets, 2 millimeters, four-finger resistance. Make this layer red. From there to 18 centimeters, rain crust, knife resistance. And from there to 35 centimeters, rounds, 1 millimeter, pencil resistance.`
  );
  assert.equal(narrowLayerContinuity.layer_1, '0-4 DF, fist resistance');
  assert.equal(narrowLayerContinuity.layer_2, '4-6 rain crust, knife resistance');
  assert.equal(narrowLayerContinuity.layer_3, '6-14 facets, 2 millimeters, four-finger resistance red');
  assert.equal(narrowLayerContinuity.layer_4, '14-18 rain crust, knife resistance');
  assert.equal(narrowLayerContinuity.layer_5, '18-35 rounds, 1 millimeter, pencil resistance');

  const littleBornHorseman = extractDraftValuesFromRawNotes(
    `Date 21st of January 2026 at 12:09. Run name Little Born Horseman. Observer Corey. Organization Skeena. Elevation 1610 meters. Aspect southeast. Slope angle 23 degrees. Air temperature minus 2 degrees. Sky OVC. Precip nil. Winds calm. Total HS 295. Surface grain rounds. Foot pen 5 centimeters. Ski pen 2 centimeters. Layer 1 from 0 to 3 centimeters. Sun crust. Pencil resistance. From 4 to 10 centimeters. DF. Fist resistance. From 10 to 15 centimeters. Rain crust. Knife resistance. From 15 to 45 centimeters. Facets 1.5 to 2 millimeters. From 4 finger to 1 finger resistance. 45 to 55 centimeters. Rain crust. From pencil plus to knife resistance. From 55 to 75. Facets 2 to 3 millimeters. From pencil to pencil plus resistance. 75 to 80cm facets 1 finger resistance. And from there to 100 centimeters, the last layer. Rounds. 1mm pencil`
  );
  assert.equal(littleBornHorseman.layer_1, '0-3 Sun crust Pencil resistance');
  assert.equal(littleBornHorseman.layer_2, '3-10 DF Fist resistance');
  assert.equal(littleBornHorseman.layer_3, '10-15 Rain crust Knife resistance');
  assert.equal(littleBornHorseman.layer_4, '15-45 Facets 1.5 to 2 millimeters From 4 finger to 1 finger resistance');
  assert.equal(littleBornHorseman.layer_5, '45-55 Rain crust From pencil plus to knife resistance');
  assert.equal(littleBornHorseman.layer_6, '55-75 Facets 2 to 3 millimeters From pencil to pencil plus resistance');
  assert.equal(littleBornHorseman.layer_7, '75-80 facets 1 finger resistance');
  assert.equal(littleBornHorseman.layer_8, '80-100 the last layer Rounds 1mm pencil');

  const challengeA = extractDraftValuesFromRawNotes(
    `Date: February 11th 2026 at 13:40. Run name: Challenge A. Observer: Paul. Organization: Nivium. Elevation: 1685 meters. Aspect: Northeast. Slope angle: 34 degrees. Air temperature: minus 9. Sky: BKN. Precip: nil. Wind: light southwest. Total HS: 278 centimeters. Surface grain: stellars. Foot pen: 18 centimeters. Ski pen: 8 centimeters. Layer 1 from 0 to 4 centimeters, DF, fist resistance. Next layer down to 7 centimeters, rain crust, knife resistance. From there to 12 centimeters, facets, 2 millimeters, four-finger resistance. Make this layer red. From there to 20 centimeters, rain crust, knife resistance. And from there to 48 centimeters, rounds, 1 millimeter, pencil resistance. Stability test: shear test easy, sudden collapse at 11 centimeters.`
  );
  assert.equal(challengeA.layer_1, '0-4 DF, fist resistance');
  assert.equal(challengeA.layer_2, '4-7 rain crust, knife resistance');
  assert.equal(challengeA.layer_3, '7-12 facets, 2 millimeters, four-finger resistance red');
  assert.equal(challengeA.layer_4, '12-20 rain crust, knife resistance');
  assert.equal(challengeA.layer_5, '20-48 rounds, 1 millimeter, pencil resistance');
  assert.equal(challengeA.stability_tests, 'shear test easy, sudden collapse at 11 centimeters');

  const challengeB3 = extractDraftValuesFromRawNotes(
    `Date: February 14th 2026 at 11:05. Run name: Challenge B3. Server: Robert. Organization: Skina. Elevation: 1540 meters. Aspect: West. Slope angle: 29 degrees. Air temperature: minus 3. Sky: FEW. Precip: nil. Wind: calm. Total HS: 305 centimeters. Surface grain: rounds. Foot pen: 9 centimeters. Ski pen: 4 centimeters. Layer 1 from 0 to 12 centimeters, EF, four-finger resistance. Layer 2 from 12 to 14 centimeters, stellars, fist resistance. From 14 to 28 centimeters, rounds, 1 millimeter, four-finger plus resistance. From 28 to 31 centimeters, rain crust, knife resistance. Layer from 31 to 33 centimeters, facets, four-finger resistance. Make the layer from 31 to 33 centimeters red. Make the layer from 12 to 14 centimeters red. From there to 47 centimeters, another rain crust, knife resistance. And the stability test, shear test easy, sudden collapse at 13 centimeters, and a shear test easy at 32 centimeters, sudden collapse also. 55°48'10", -126°11'08"`
  );
  assert.equal(challengeB3.observer, 'Robert');
  assert.equal(challengeB3.organization, 'Skeena');
  assert.equal(challengeB3.layer_1, '0-12 EF, four-finger resistance');
  assert.equal(challengeB3.layer_2, '12-14 stellars, fist resistance red');
  assert.equal(challengeB3.layer_3, '14-28 rounds, 1 millimeter, four-finger plus resistance');
  assert.equal(challengeB3.layer_4, '28-31 rain crust, knife resistance');
  assert.equal(challengeB3.layer_5, '31-33 facets, four-finger resistance red');
  assert.equal(challengeB3.layer_6, '33-47 another rain crust, knife resistance');
  assert.match(challengeB3.stability_tests ?? '', /shear test easy, sudden collapse at 13 centimeters/i);
  assert.match(challengeB3.stability_tests ?? '', /shear test easy at 32 centimeters, sudden collapse/i);
  assert.equal((challengeB3.stability_tests ?? '').split('\n').length, 2);

  const challengeCNotes =
    `Date: January 22nd 2026 at 12:20. Run name: Challenge C. Observer: Corey. Organization: Skeena. Elevation: 1495 meters. Aspect: East. Correction: Aspect: Southeast. Slope angle: 27 degrees. Air temperature: minus 4 degrees. Sky: OVC. No precip. Winds calm. Correction: wind light south. Total HS: 260 centimeters. Surface grain: DF and stellars. Foot pen: 14 centimeters. Correction: foot pen 22 centimeters. Ski pen: 7 centimeters. Layer 1 from 0 to 6 centimeters, DF, four-finger resistance. From 6 to 9 centimeters, sun crust, pencil resistance. From 9 to 26 centimeters, rounds, 1 millimeter, one-finger resistance. From 26 to 29 centimeters, facets, 1.5 millimeters, four-finger resistance. This layer in red. From there to 42 centimeters, rain crust, knife resistance. And from there to 85 centimeters, rounds, 1 millimeter, pencil hardness. Temperature profile: at the surface minus 3, at 10 centimeters minus 4, at 30 centimeters minus 5, at 80 centimeters minus 3. Stability test: compression test hard, 24 taps, resistant planar at 28 centimeters. Notes: test profile below rocky rollover.`
  const challengeC = formatRawNotesToEngineText(challengeCNotes).formattedText;
  assert.match(challengeC, /Aspect: southeast/);
  assert.match(challengeC, /Wind: light S/);
  assert.match(challengeC, /Foot Pen: 22 cm/);
  assert.match(challengeC, /Surface Grain: DF\/PP/);
  assert.match(challengeC, /0-6 DF 4F/);
  assert.match(challengeC, /6-9 MFcr P crust/);
  assert.match(challengeC, /9-26 RG 1F 1mm/);
  assert.match(challengeC, /26-29 FC 4F 1\.5mm red/);
  assert.match(challengeC, /29-42 IFrc K crust/);
  assert.match(challengeC, /42-85 RG P 1mm/);

  console.log('Formatter checks passed.');
}

runChecks();
