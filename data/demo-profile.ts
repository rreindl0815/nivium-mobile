export const demoRawNotes = `Date: February 19, 2026 at 12:30. Run name: Ball Steep. Observer: Martin W./Hannes. Organization: Skina. Elevation: 1,385 meters. Aspect: East. Slope angle: 38 degrees. Air temperature: minus 18. Sky: few. Precip: nil. Wind: calm. Total HS: 250. Foot pen: 20 centimeters. Correction: foot pen 45 centimeters. Ski pen: 20 centimeters. Surface grain: stellars. Layer 1: from 0 to 10 centimeters. Stellar and DF. Fist hardness. Layer 2: from 10 centimeters to 38 centimeters. DF. Hardness is from fist to four-finger plus. Next layer, from 38 to 40 centimeters, a rain crust, knife hardness. 40 centimeters to 42 centimeters, facets, four-finger hardness. 42 centimeters to 55 centimeters, rain crust, knife hardness. As a second grain form, put wet grains in there also. Next layer, 55 to 60 centimeters, rounds, one millimeter, pencil hardness. Next layer, from 60 to 70 centimeters, wet grains and rain crust, knife hardness. And last layer from 70 centimeters to 120 centimeters, rounds, one millimeters, pencil hardness. Layer of concern is from 40 to 42 centimeters. Stability tests, compression test, moderate, 15 taps, sudden collapse at 41 centimeters. And another stability test, compression test, hard. 27 taps at 102 centimeters. 55°45'13", -128°10'51"`;

export const demoManualEntryValues: Record<string, string> = {
  date: 'March 22, 2026',
  time: '12:30',
  run_name: 'Ball Steep',
  observer: 'Martin W. / Hannes',
  organization: 'Nivium',
  elevation: '1385',
  aspect: 'east',
  slope_angle: '38',
  lat_long: `55deg45'13" -128deg10'51"`,
  air_temperature: '-18',
  sky: 'few',
  precip: 'nil',
  wind: 'calm',
  total_hs: '120',
  surface_grain: 'PP',
  foot_pen: '45',
  ski_pen: '20',
  layer_count: '7',
  layer_1_top: '0',
  layer_1_bottom: '10',
  layer_1_hardness_1: 'F',
  layer_1_grain_1: 'PP',
  layer_1_grain_2: 'DF',
  layer_1_concern: 'no',
  layer_2_bottom: '38',
  layer_2_hardness_1: 'F',
  layer_2_hardness_2: '4F+',
  layer_2_grain_1: 'DF',
  layer_2_concern: 'no',
  layer_3_bottom: '40',
  layer_3_hardness_1: 'K',
  layer_3_grain_1: 'IFrc',
  layer_3_concern: 'no',
  layer_4_bottom: '42',
  layer_4_hardness_1: '4F',
  layer_4_grain_1: 'FC',
  layer_4_size_1: '1',
  layer_4_comment: 'buried weak facet interface',
  layer_4_concern: 'yes',
  layer_5_bottom: '55',
  layer_5_hardness_1: 'K',
  layer_5_grain_1: 'IFrc',
  layer_5_grain_2: 'MF',
  layer_5_concern: 'no',
  layer_6_bottom: '60',
  layer_6_hardness_1: 'P',
  layer_6_grain_1: 'RG',
  layer_6_size_1: '1',
  layer_6_concern: 'no',
  layer_7_bottom: '120',
  layer_7_hardness_1: 'P',
  layer_7_grain_1: 'RG',
  layer_7_size_1: '1',
  layer_7_concern: 'no',
  temp_count: '6',
  temp_1_depth: 'surface',
  temp_1_value: '-18',
  temp_2_depth: '10',
  temp_2_value: '-17',
  temp_3_depth: '20',
  temp_3_value: '-15',
  temp_4_depth: '40',
  temp_4_value: '-12',
  temp_5_depth: '80',
  temp_5_value: '-8',
  temp_6_depth: '120',
  temp_6_value: '-5',
  test_count: '2',
  test_1_type: 'CT',
  test_1_taps: '15',
  test_1_character: 'SC',
  test_1_depth: '41',
  test_2_type: 'CT',
  test_2_taps: '27',
  test_2_character: 'RP',
  test_2_depth: '102',
  comments: 'Sample manual-entry profile for faster renderer testing.',
};

export const demoManualEntryProfiles = [
  {
    rawNotes: `Date: February 19, 2026
Time: 12:30
Run Name: Test Profile 1
Observer: Paul
Organization: Nivium
Elevation: 1385 m
Aspect: east
Slope Angle: 38 degrees
Lat/Long: 53deg45'13" -126deg10'51"
Air Temperature: -18
Sky: few
Precip: nil
Wind: calm
Total HS: 250 cm
Surface Grain: PP
Foot Pen: 45 cm
Ski Pen: 20 cm

0-10 PP/DF F
10-38 DF F-4F+
38-40 IFrc K crust
40-45 FC 4F red
45-55 IFrc K crust | soft, partially frozen crust
55-60 RG P 1mm
60-70 IFrc K crust | soft, partially frozen crust
70-102 RG P 1mm
102-130 RG P+ 1mm

CTM15 SC at 41 cm
CTH27 at 102 cm

-16 surface
-10 20cm
-6 50cm
-3 100cm
-2 120cm

Notes: Starting Zone in an East Facing avalanche path.`,
    values: {
      ...demoManualEntryValues,
      date: 'February 19, 2026',
      time: '12:30',
      run_name: 'Test Profile 1',
      observer: 'Paul',
      organization: 'Nivium',
      elevation: '1385',
      aspect: 'east',
      slope_angle: '38',
      lat_long: `53deg45'13" -126deg10'51"`,
      air_temperature: '-18',
      sky: 'few',
      precip: 'nil',
      wind: 'calm',
      total_hs: '250',
      surface_grain: 'PP',
      foot_pen: '45',
      ski_pen: '20',
      layer_count: '9',
      layer_1_top: '0',
      layer_1_bottom: '10',
      layer_1_hardness_1: 'F',
      layer_1_grain_1: 'PP',
      layer_1_grain_2: 'DF',
      layer_1_concern: 'no',
      layer_2_top: '10',
      layer_2_bottom: '38',
      layer_2_hardness_1: 'F',
      layer_2_hardness_2: '4F+',
      layer_2_grain_1: 'DF',
      layer_2_concern: 'no',
      layer_3_top: '38',
      layer_3_bottom: '40',
      layer_3_hardness_1: 'K',
      layer_3_grain_1: 'IFrc',
      layer_3_concern: 'no',
      layer_4_top: '40',
      layer_4_bottom: '45',
      layer_4_hardness_1: '4F',
      layer_4_grain_1: 'FC',
      layer_4_concern: 'yes',
      layer_5_top: '45',
      layer_5_bottom: '55',
      layer_5_hardness_1: 'K',
      layer_5_grain_1: 'IFrc',
      layer_5_comment: 'soft, partially frozen crust',
      layer_5_concern: 'no',
      layer_6_top: '55',
      layer_6_bottom: '60',
      layer_6_hardness_1: 'P',
      layer_6_grain_1: 'RG',
      layer_6_size_1: '1',
      layer_6_concern: 'no',
      layer_7_top: '60',
      layer_7_bottom: '70',
      layer_7_hardness_1: 'K',
      layer_7_grain_1: 'IFrc',
      layer_7_comment: 'soft, partially frozen crust',
      layer_7_concern: 'no',
      layer_8_top: '70',
      layer_8_bottom: '102',
      layer_8_hardness_1: 'P',
      layer_8_grain_1: 'RG',
      layer_8_size_1: '1',
      layer_8_concern: 'no',
      layer_9_top: '102',
      layer_9_bottom: '130',
      layer_9_hardness_1: 'P+',
      layer_9_grain_1: 'RG',
      layer_9_size_1: '1',
      layer_9_concern: 'no',
      temp_count: '5',
      temp_1_depth: 'surface',
      temp_1_value: '-16',
      temp_2_depth: '20',
      temp_2_value: '-10',
      temp_3_depth: '50',
      temp_3_value: '-6',
      temp_4_depth: '100',
      temp_4_value: '-3',
      temp_5_depth: '120',
      temp_5_value: '-2',
      test_count: '2',
      test_1_type: 'CT',
      test_1_taps: '15',
      test_1_character: 'SC',
      test_1_depth: '41',
      test_2_type: 'CT',
      test_2_taps: '27',
      test_2_character: '',
      test_2_depth: '102',
      comments: 'Starting Zone in an East Facing avalanche path.',
    },
  },
  {
    rawNotes: `Date: January 18, 2026
Time: 13:00
Run Name: Test Profile 2
Observer: Paul
Organization: Nivium
Elevation: 1400 m
Aspect: northeast
Slope Angle: 35 degrees
Lat/Long: 54deg51'01" -126deg15'55"
Air Temperature: -1
Sky: clear
Precip: nil
Wind: calm
Total HS: 320 cm
Surface Grain: RG
Foot Pen: 10 cm
Ski Pen: 5 cm

0-5 DF 4F
5-6 PP F red
6-11 RG 4F
11-16 IFrc K crust
16-40 RG 1F+ 1mm
40-42 DF 4F red
42-90 RG P 1mm | well settled lower pack in this profile

CTH27 RP at 41 cm

-2 surface
-3 12cm
-2 40cm
-1.5 50cm
-1 90cm

Notes: Fracture Line Profile on an old Natural Release Size 2 on a loaded convexity.`,
    values: {
      ...demoManualEntryValues,
      date: 'January 18, 2026',
      time: '13:00',
      run_name: 'Test Profile 2',
      observer: 'Paul',
      organization: 'Nivium',
      elevation: '1400',
      aspect: 'northeast',
      slope_angle: '35',
      lat_long: `54deg51'01" -126deg15'55"`,
      air_temperature: '-1',
      sky: 'clear',
      precip: 'nil',
      wind: 'calm',
      total_hs: '320',
      surface_grain: 'RG',
      foot_pen: '10',
      ski_pen: '5',
      layer_count: '7',
      layer_1_top: '0',
      layer_1_bottom: '5',
      layer_1_hardness_1: '4F',
      layer_1_grain_1: 'DF',
      layer_1_concern: 'no',
      layer_2_top: '5',
      layer_2_bottom: '6',
      layer_2_hardness_1: 'F',
      layer_2_grain_1: 'PP',
      layer_2_concern: 'yes',
      layer_3_top: '6',
      layer_3_bottom: '11',
      layer_3_hardness_1: '4F',
      layer_3_grain_1: 'RG',
      layer_3_concern: 'no',
      layer_4_top: '11',
      layer_4_bottom: '16',
      layer_4_hardness_1: 'K',
      layer_4_grain_1: 'IFrc',
      layer_4_concern: 'no',
      layer_5_top: '16',
      layer_5_bottom: '40',
      layer_5_hardness_1: '1F+',
      layer_5_grain_1: 'RG',
      layer_5_size_1: '1',
      layer_5_concern: 'no',
      layer_6_top: '40',
      layer_6_bottom: '42',
      layer_6_hardness_1: '4F',
      layer_6_grain_1: 'DF',
      layer_6_concern: 'yes',
      layer_7_top: '42',
      layer_7_bottom: '90',
      layer_7_hardness_1: 'P',
      layer_7_grain_1: 'RG',
      layer_7_size_1: '1',
      layer_7_comment: 'well settled lower pack in this profile',
      layer_7_concern: 'no',
      temp_count: '5',
      temp_1_depth: 'surface',
      temp_1_value: '-2',
      temp_2_depth: '12',
      temp_2_value: '-3',
      temp_3_depth: '40',
      temp_3_value: '-2',
      temp_4_depth: '50',
      temp_4_value: '-1.5',
      temp_5_depth: '90',
      temp_5_value: '-1',
      test_count: '1',
      test_1_type: 'CT',
      test_1_taps: '27',
      test_1_character: 'RP',
      test_1_depth: '41',
      comments: 'Fracture Line Profile on an old Natural Release Size 2 on a loaded convexity.',
    },
  },
  {
    rawNotes: `Date: January 18, 2026
Time: 11:00
Run Name: Test Profile 3
Observer: Paul
Organization: Nivium
Elevation: 1480 m
Aspect: west
Slope Angle: 32 degrees
Lat/Long: 54deg51'51" -126deg07'54"
Air Temperature: 2
Sky: clear
Precip: nil
Wind: calm
Total HS: 310 cm
Surface Grain: DF/PP
Foot Pen: 10 cm
Ski Pen: 5 cm

0-5 PP/FC 4F
5-7 IFrc K crust
7-15 RG 4F+
15-30 IFrc I crust
30-50 RG P 1mm
50-52 FC 4F 2mm red
52-120 RG P+ 1mm

ECTP22 at 51 cm

-0.5 surface
-0.8 5cm
-1 40cm
-1 60cm
-1.5 100cm
-1 120cm

Notes: Test Profile in a west facing regular performer TL feature.`,
    values: {
      ...demoManualEntryValues,
      date: 'January 18, 2026',
      time: '11:00',
      run_name: 'Test Profile 3',
      observer: 'Paul',
      organization: 'Nivium',
      elevation: '1480',
      aspect: 'west',
      slope_angle: '32',
      lat_long: `54deg51'51" -126deg07'54"`,
      air_temperature: '2',
      sky: 'clear',
      precip: 'nil',
      wind: 'calm',
      total_hs: '310',
      surface_grain: 'DF',
      foot_pen: '10',
      ski_pen: '5',
      layer_count: '7',
      layer_1_top: '0',
      layer_1_bottom: '5',
      layer_1_hardness_1: '4F',
      layer_1_grain_1: 'PP',
      layer_1_grain_2: 'FC',
      layer_1_concern: 'no',
      layer_2_top: '5',
      layer_2_bottom: '7',
      layer_2_hardness_1: 'K',
      layer_2_grain_1: 'IFrc',
      layer_2_concern: 'no',
      layer_3_top: '7',
      layer_3_bottom: '15',
      layer_3_hardness_1: '4F+',
      layer_3_grain_1: 'RG',
      layer_3_concern: 'no',
      layer_4_top: '15',
      layer_4_bottom: '30',
      layer_4_hardness_1: 'I',
      layer_4_grain_1: 'IFrc',
      layer_4_concern: 'no',
      layer_5_top: '30',
      layer_5_bottom: '50',
      layer_5_hardness_1: 'P',
      layer_5_grain_1: 'RG',
      layer_5_size_1: '1',
      layer_5_concern: 'no',
      layer_6_top: '50',
      layer_6_bottom: '52',
      layer_6_hardness_1: '4F',
      layer_6_grain_1: 'FC',
      layer_6_size_1: '2',
      layer_6_concern: 'yes',
      layer_7_top: '52',
      layer_7_bottom: '120',
      layer_7_hardness_1: 'P+',
      layer_7_grain_1: 'RG',
      layer_7_size_1: '1',
      layer_7_concern: 'no',
      temp_count: '6',
      temp_1_depth: 'surface',
      temp_1_value: '-0.5',
      temp_2_depth: '5',
      temp_2_value: '-0.8',
      temp_3_depth: '40',
      temp_3_value: '-1',
      temp_4_depth: '60',
      temp_4_value: '-1',
      temp_5_depth: '100',
      temp_5_value: '-1.5',
      temp_6_depth: '120',
      temp_6_value: '-1',
      test_count: '1',
      test_1_type: 'ECT',
      test_1_result: 'ECTP',
      test_1_taps: '22',
      test_1_character: '',
      test_1_depth: '51',
      comments: 'Test Profile in a west facing regular performer TL feature.',
    },
  },
] as const;
