import type { FieldSection } from '@/types/profile';

export const fieldCardSections: FieldSection[] = [
  {
    id: 'metadata',
    title: 'Metadata',
    description: '',
    accent: '#A94C2A',
    fields: [
      { id: 'date', label: 'Date', placeholder: 'Say: Date April 19, 2026' },
      { id: 'time', label: 'Time', placeholder: 'Say: Time 9:45' },
      { id: 'run_name', label: 'Run Name / Location', placeholder: 'Enter run/location name' },
      { id: 'observer', label: 'Observer(s)', placeholder: 'Enter observer names' },
      { id: 'organization', label: 'Organization', placeholder: 'Enter organization' },
      { id: 'elevation', label: 'Elevation (m)', placeholder: 'Enter elevation', keyboardType: 'numeric' },
      { id: 'lat_long', label: 'Lat / Long', placeholder: 'Enter latitude and longitude' },
      { id: 'aspect', label: 'Aspect', placeholder: 'Choose aspect', options: ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'] },
      { id: 'slope_angle', label: 'Slope Angle (degrees)', placeholder: 'Enter slope angle', keyboardType: 'numeric' },
      { id: 'air_temperature', label: 'Air Temperature (°C)', placeholder: 'Enter air temperature', keyboardType: 'numeric' },
      { id: 'sky', label: 'Sky', placeholder: 'Choose sky condition', options: ['clear', 'few', 'scattered', 'broken', 'OVC'] },
      { id: 'precip', label: 'Precip', placeholder: 'Choose precipitation', options: ['nil', 'S-1', 'S1', 'S2', 'S3', 'R', 'mixed'] },
      { id: 'wind', label: 'Wind', placeholder: 'Say: Wind light SW' },
      { id: 'total_hs', label: 'Total Hs (cm)', placeholder: 'Enter total snow height', keyboardType: 'numeric' },
      { id: 'surface_grain', label: 'Surface Grain', placeholder: 'Choose surface grain', options: ['PP', 'DF', 'RG', 'FC', 'SH', 'DH', 'MF'] },
      { id: 'foot_pen', label: 'Foot Pen (cm)', placeholder: 'Enter foot pen', keyboardType: 'numeric' },
      { id: 'ski_pen', label: 'Ski Pen (cm)', placeholder: 'Enter ski pen', keyboardType: 'numeric' },
    ],
  },
  {
    id: 'layers',
    title: 'Snowpack Layers',
    description: '',
    accent: '#3D6B5A',
    fields: [
      { id: 'layer_builder', label: 'Layer Builder', placeholder: 'Say: 0-40 FC/RG P 7mm/1mm, then next layer down to...' },
    ],
  },
  {
    id: 'temperatures',
    title: 'Temperature Profile',
    description: '',
    accent: '#395B88',
    fields: [
      { id: 'temp_builder', label: 'Temperature Builder', placeholder: 'Say: -10 surface, -6 40cm, -2 100cm' },
    ],
  },
  {
    id: 'tests',
    title: 'Stability Tests',
    description: '',
    accent: '#8D6A2B',
    fields: [
      { id: 'test_builder', label: 'Test Builder', placeholder: 'Say: ECTP14 at 41 cm or PST 40/100 ARR at 46 cm' },
    ],
  },
  {
    id: 'notes',
    title: 'Notes',
    description: '',
    accent: '#5E5A88',
    fields: [{ id: 'comments', label: 'Extra Notes', placeholder: 'Enter any extra notes to preserve', multiline: true }],
  },
];

export const requiredFieldIds = [
  'date',
  'run_name',
  'observer',
  'aspect',
  'total_hs',
];
