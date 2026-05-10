import type { FieldValueMap } from './editor-types';

export const temperatureIndexes = Array.from({ length: 20 }, (_, index) => index + 1);
export const temperatureDepthOptions = ['surface', '0', ...Array.from({ length: 40 }, (_, index) => `${(index + 1) * 10}`)];

export function countTemperatureWarnings(values: FieldValueMap) {
  let total = 0;
  for (const index of temperatureIndexes.slice(0, getVisibleTemperatureRowCount(values))) {
    total += countTemperatureWarning(values, index);
  }
  total += countTemperatureTrendWarnings(values);
  return total;
}

export function countTemperatureWarning(values: FieldValueMap, index: number) {
  const depth = (values[`temp_${index}_depth`] ?? '').trim();
  const temperature = (values[`temp_${index}_value`] ?? '').trim();
  return depth && temperature ? 0 : depth || temperature ? 1 : 0;
}

export function countTemperatureTrendWarnings(values: FieldValueMap) {
  let warnings = 0;
  let previousDepth: number | null = null;

  for (const index of temperatureIndexes.slice(0, getVisibleTemperatureRowCount(values))) {
    const depthValue = (values[`temp_${index}_depth`] ?? '').trim();
    const temperatureValue = (values[`temp_${index}_value`] ?? '').trim();
    if (!depthValue || !temperatureValue) {
      continue;
    }

    const depth = depthValue === 'surface' ? -1 : Number(depthValue);
    const temperature = Number(temperatureValue);
    if (!Number.isFinite(depth) || !Number.isFinite(temperature)) {
      continue;
    }

    if (previousDepth !== null && depth <= previousDepth) {
      warnings += 1;
    }

    previousDepth = depth;
  }

  return warnings;
}

export function getActualTemperatureCount(values: FieldValueMap) {
  let count = 0;
  for (const index of temperatureIndexes.slice(0, getVisibleTemperatureRowCount(values))) {
    if ((values[`temp_${index}_depth`] ?? '').trim() && (values[`temp_${index}_value`] ?? '').trim()) {
      count += 1;
    }
  }
  return count;
}

export function getVisibleTemperatureRowCount(values: FieldValueMap) {
  const explicitCount = Number(values.temp_count ?? '');
  if (Number.isFinite(explicitCount) && explicitCount > 0) {
    return Math.min(Math.max(Math.trunc(explicitCount), 1), temperatureIndexes.length);
  }

  let highestIndex = 0;
  for (const index of temperatureIndexes) {
    if ((values[`temp_${index}_depth`] ?? '').trim() || (values[`temp_${index}_value`] ?? '').trim()) {
      highestIndex = index;
    }
  }

  return Math.max(highestIndex, 1);
}

export function buildValuesWithRemovedLastTemperature(values: FieldValueMap) {
  const activeCount = getVisibleTemperatureRowCount(values);
  if (activeCount <= 1) {
    return values;
  }

  const next = { ...values };
  next[`temp_${activeCount}_depth`] = '';
  next[`temp_${activeCount}_value`] = '';
  next.temp_count = `${Math.max(activeCount - 1, 1)}`;
  return next;
}

export function normalizeTemperatureDraftValue(value: string, depth: string) {
  const cleaned = value.replace(/[^0-9.-]/g, '');
  if (!cleaned) {
    return '';
  }
  if (cleaned === '-') {
    return '-';
  }
  if (depth === 'surface' || depth === '0') {
    return cleaned.replace(/(?!^)-/g, '');
  }
  const normalized = cleaned.startsWith('-') ? cleaned : `-${cleaned}`;
  return normalized.replace(/(?!^)-/g, '');
}
