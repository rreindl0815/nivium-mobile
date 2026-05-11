import { buildTimeOptions } from './editor-utils';

export const observationGroups = [
  {
    title: 'General',
    fields: ['date', 'time', 'run_name', 'observer', 'organization'],
  },
  {
    title: 'Location',
    fields: ['elevation_unit', 'elevation', 'lat_long', 'aspect', 'slope_angle'],
  },
  {
    title: 'Weather',
    fields: ['air_temperature', 'sky', 'precip', 'wind'],
  },
  {
    title: 'Snow Conditions',
    fields: ['total_hs', 'surface_grain', 'foot_pen', 'ski_pen'],
  },
] as const;

export const chipOptionFieldIds = new Set(['aspect', 'sky', 'precip', 'surface_grain']);

export const windSpeedOptions = ['calm', 'light', 'moderate', 'strong'];
export const windDirectionOptions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
export const monthOptions = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
export const dayOptions = Array.from({ length: 31 }, (_, index) => `${index + 1}`);
export const yearOptions = ['2025', '2026', '2027'];
export const timeOptions = buildTimeOptions(6, 20, 15);
