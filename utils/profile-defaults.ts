export type ElevationUnit = 'm' | 'ft';

export type ProfileDefaults = {
  observerDefault: string;
  organizationDefault: string;
  elevationUnitDefault: ElevationUnit;
};

export const DEFAULT_PROFILE_DEFAULTS: ProfileDefaults = {
  observerDefault: '',
  organizationDefault: '',
  elevationUnitDefault: 'm',
};

export const elevationUnitOptions = [
  { label: 'Meters', value: 'm' },
  { label: 'Feet', value: 'ft' },
] as const;

const METERS_TO_FEET = 3.28084;

export function normalizeElevationUnit(value: string | undefined | null): ElevationUnit {
  return value?.trim().toLowerCase() === 'ft' ? 'ft' : 'm';
}

export function buildDefaultProfileValues(
  defaults: ProfileDefaults,
  values: Record<string, string> = {}
) {
  const nextValues = { ...values };

  if (!nextValues.observer?.trim() && defaults.observerDefault.trim()) {
    nextValues.observer = defaults.observerDefault.trim();
  }
  if (!nextValues.organization?.trim() && defaults.organizationDefault.trim()) {
    nextValues.organization = defaults.organizationDefault.trim();
  }
  if (!nextValues.elevation_unit?.trim()) {
    nextValues.elevation_unit = normalizeElevationUnit(defaults.elevationUnitDefault);
  }

  return nextValues;
}

export function formatElevationDisplay(value: string | undefined, unit: string | undefined) {
  const cleanValue = value?.trim() ?? '';
  if (!cleanValue) {
    return '';
  }
  return `${cleanValue} ${normalizeElevationUnit(unit)}`;
}

export function convertElevationValue(
  value: string | undefined,
  fromUnit: string | undefined,
  toUnit: string | undefined
) {
  const cleanValue = value?.replace(/[^\d.]/g, '').trim() ?? '';
  if (!cleanValue) {
    return '';
  }

  const numericValue = Number(cleanValue);
  if (!Number.isFinite(numericValue)) {
    return cleanValue;
  }

  const normalizedFrom = normalizeElevationUnit(fromUnit);
  const normalizedTo = normalizeElevationUnit(toUnit);
  if (normalizedFrom === normalizedTo) {
    return `${Math.round(numericValue)}`;
  }

  const convertedValue =
    normalizedFrom === 'm'
      ? numericValue * METERS_TO_FEET
      : numericValue / METERS_TO_FEET;

  return `${Math.round(convertedValue)}`;
}

export function convertMetersToElevationUnit(
  elevationMeters: string | undefined,
  unit: string | undefined
) {
  return convertElevationValue(elevationMeters, 'm', unit);
}

export function parseElevationMetadata(value: string | undefined) {
  const cleanValue = value?.trim() ?? '';
  if (!cleanValue) {
    return { elevation: '', unit: '' };
  }

  return {
    elevation: cleanValue.replace(/[^\d.]/g, ''),
    unit: /\b(?:ft|feet|foot)\b/i.test(cleanValue) ? ('ft' as ElevationUnit) : ('m' as ElevationUnit),
  };
}
