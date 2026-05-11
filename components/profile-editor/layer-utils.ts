import type { FieldValueMap } from './editor-types';

export const hardnessOptions = ['F', 'F+', '4F', '4F+', '1F', '1F+', 'P', 'P+', 'K', 'K+', 'I'] as const;
export const grainOptions = ['PP', 'DF', 'RG', 'FC', 'SH', 'DH', 'MF', 'IFrc', 'MFcr'] as const;
export const sizeOptions = [
  '0.5 mm',
  '1 mm',
  '1.5 mm',
  '2 mm',
  '2.5 mm',
  '3 mm',
  '4 mm',
  '5 mm',
  '6 mm',
  '7 mm',
  '8 mm',
  '9 mm',
  '10 mm',
  '11 mm',
  '12 mm',
  '13 mm',
  '14 mm',
  '15 mm',
  '16 mm',
  '17 mm',
  '18 mm',
  '19 mm',
  '20 mm',
  '21 mm',
  '22 mm',
  '23 mm',
  '24 mm',
  '25 mm',
  '3 cm',
  '4 cm',
  '5 cm',
  '6 cm',
  '7 cm',
  '8 cm',
  '9 cm',
  '10 cm',
] as const;
export const layerIndexes = Array.from({ length: 12 }, (_, index) => index + 1);
export const layerFieldSuffixes = [
  'top',
  'bottom',
  'hardness_1',
  'hardness_2',
  'grain_1',
  'grain_2',
  'size_1',
  'size_2',
  'comment',
  'concern',
] as const;

export function getVisibleLayerCardCount(values: FieldValueMap) {
  const explicitCount = Number(values.layer_count ?? '');
  if (Number.isFinite(explicitCount) && explicitCount > 0) {
    return Math.min(Math.max(Math.trunc(explicitCount), 1), layerIndexes.length);
  }

  let highestIndex = 0;
  for (const index of layerIndexes) {
    const keys = getLayerFieldIds(index);
    if (keys.some((key) => (values[key] ?? '').trim().length > 0)) {
      highestIndex = index;
    }
  }

  return Math.max(highestIndex, 1);
}

export function getActualLayerCount(values: FieldValueMap) {
  let count = 0;
  for (const index of layerIndexes.slice(0, getVisibleLayerCardCount(values))) {
    if (
      [
        values[`layer_${index}_bottom`] ?? '',
        values[`layer_${index}_hardness_1`] ?? '',
        values[`layer_${index}_grain_1`] ?? '',
      ].some((value) => value.trim())
    ) {
      count += 1;
    }
  }
  return count;
}

export function buildLayerOverview(values: FieldValueMap, index: number) {
  const top = index === 1 ? values[`layer_${index}_top`] ?? '0' : values[`layer_${index - 1}_bottom`] ?? '';
  const bottom = values[`layer_${index}_bottom`] ?? '';
  const hardness1 = values[`layer_${index}_hardness_1`] ?? '';
  const rawHardness2 = values[`layer_${index}_hardness_2`] ?? '';
  const hardness2 = rawHardness2 && rawHardness2 === hardness1 ? '' : rawHardness2;
  const hardness = [hardness1, hardness2].filter(Boolean).join('-');
  const primary = [values[`layer_${index}_grain_1`] ?? '', normalizeStructuredSizeLabel(values[`layer_${index}_size_1`] ?? '')]
    .filter(Boolean)
    .join(' ');
  const secondary = [values[`layer_${index}_grain_2`] ?? '', normalizeStructuredSizeLabel(values[`layer_${index}_size_2`] ?? '')]
    .filter(Boolean)
    .join(' ');

  return {
    depth: top && bottom ? `${top}-${bottom} cm` : 'Depth pending',
    hardness: hardness || 'Hardness pending',
    primary: primary || 'Primary grain pending',
    secondary,
  };
}

export function countLayerWarnings(values: FieldValueMap) {
  let total = 0;
  for (const index of layerIndexes.slice(0, getVisibleLayerCardCount(values))) {
    total += countLayerWarning(values, index);
  }
  return total;
}

export function countLayerWarning(values: FieldValueMap, index: number) {
  let count = 0;
  const top = index === 1 ? (values[`layer_${index}_top`] ?? '0').trim() : (values[`layer_${index - 1}_bottom`] ?? '').trim();
  const bottom = (values[`layer_${index}_bottom`] ?? '').trim();
  const hardness1 = (values[`layer_${index}_hardness_1`] ?? '').trim();
  const grain1 = (values[`layer_${index}_grain_1`] ?? '').trim();
  const grain2 = (values[`layer_${index}_grain_2`] ?? '').trim();
  const size2 = (values[`layer_${index}_size_2`] ?? '').trim();

  if (!bottom) count += 1;
  if (!hardness1) count += 1;
  if (!grain1) count += 1;
  if (!grain2 && size2) count += 1;
  if (bottom && top) {
    const numericBottom = Number(bottom);
    const numericTop = Number(top);
    if (Number.isFinite(numericBottom) && Number.isFinite(numericTop) && numericBottom <= numericTop) {
      count += 1;
    }
  }

  return count;
}

export function normalizeStructuredSizeLabel(value: string) {
  const clean = value.trim();
  if (!clean) {
    return '';
  }
  return /\b(?:mm|cm)\b$/i.test(clean) ? clean : `${clean} mm`;
}

export function normalizeBottomDepthDraftValue(value: string) {
  return value.replace(/[^0-9.]/g, '');
}

export function getMinimumBottomDepth(topValue: string) {
  const numericTop = Number(topValue);
  if (!Number.isFinite(numericTop)) {
    return '';
  }
  if (Number.isInteger(numericTop)) {
    return `${numericTop + 1}`;
  }
  return `${Math.ceil(numericTop)}`;
}

export function enforceMinimumBottomDepth(value: string, topValue: string) {
  const cleaned = value.replace(/[^0-9.]/g, '');
  if (!cleaned) {
    return '';
  }

  const minimum = getMinimumBottomDepth(topValue);
  if (!minimum) {
    return cleaned;
  }

  const numeric = Number(cleaned);
  return Number.isFinite(numeric) && numeric < Number(minimum) ? minimum : cleaned;
}

export function buildValuesWithInsertedLayerRange(
  values: FieldValueMap,
  topDraft: string,
  bottomDraft: string
): { nextValues: FieldValueMap; insertedIndex: number } | { error: string } {
  const activeCount = getVisibleLayerCardCount(values);
  if (activeCount >= layerIndexes.length) {
    return { error: 'Maximum layers reached.' };
  }

  const numericTop = Number(topDraft.trim());
  const numericBottom = Number(bottomDraft.trim());
  if (!Number.isFinite(numericTop) || !Number.isFinite(numericBottom)) {
    return { error: 'Enter both depths before inserting a layer.' };
  }
  if (numericBottom <= numericTop) {
    return { error: 'Bottom depth must be deeper than top depth.' };
  }

  const segments: { top: number; bottom: number; snapshot: Record<string, string> }[] = [];
  for (let slot = 1; slot <= activeCount; slot += 1) {
    const topValue = slot === 1 ? (values[`layer_${slot}_top`] ?? '0').trim() || '0' : (values[`layer_${slot - 1}_bottom`] ?? '').trim();
    const bottomValue = (values[`layer_${slot}_bottom`] ?? '').trim();
    const top = Number(topValue);
    const bottom = Number(bottomValue);
    if (!Number.isFinite(top) || !Number.isFinite(bottom) || bottom <= top) {
      return { error: 'Fill valid layer depths before inserting a missing layer.' };
    }
    segments.push({ top, bottom, snapshot: snapshotLayerValues(values, slot) });
  }

  const firstTop = segments[0]?.top ?? 0;
  const packBottom = segments[segments.length - 1]?.bottom ?? 0;
  if (numericTop < firstTop) {
    return { error: 'Top depth must stay within the current snowpack.' };
  }
  if (numericBottom > packBottom && numericTop !== packBottom) {
    return { error: 'Bottom depth must stay within the current snowpack.' };
  }

  const blankSnapshot = Object.fromEntries(layerFieldSuffixes.map((suffix) => [suffix, '']));
  const nextSegments: { top: number; bottom: number; snapshot: Record<string, string> }[] = [];
  let insertedIndex = 0;

  for (const segment of segments) {
    if (segment.bottom <= numericTop) {
      nextSegments.push({ ...segment, snapshot: { ...segment.snapshot } });
      continue;
    }

    if (segment.top >= numericBottom) {
      if (!insertedIndex) {
        nextSegments.push({ top: numericTop, bottom: numericBottom, snapshot: { ...blankSnapshot } });
        insertedIndex = nextSegments.length;
      }
      nextSegments.push({ ...segment, snapshot: { ...segment.snapshot } });
      continue;
    }

    if (segment.top < numericTop) {
      nextSegments.push({
        top: segment.top,
        bottom: numericTop,
        snapshot: { ...segment.snapshot, bottom: formatLayerDepthValue(numericTop) },
      });
    }

    if (!insertedIndex) {
      nextSegments.push({ top: numericTop, bottom: numericBottom, snapshot: { ...blankSnapshot } });
      insertedIndex = nextSegments.length;
    }

    if (segment.bottom > numericBottom) {
      nextSegments.push({
        top: numericBottom,
        bottom: segment.bottom,
        snapshot: { ...segment.snapshot, top: formatLayerDepthValue(numericBottom) },
      });
    }
  }

  if (!insertedIndex) {
    if (numericTop !== packBottom) {
      return { error: 'Choose a layer range that fits inside the current snowpack.' };
    }
    nextSegments.push({ top: numericTop, bottom: numericBottom, snapshot: { ...blankSnapshot } });
    insertedIndex = nextSegments.length;
  }

  if (nextSegments.length > layerIndexes.length) {
    return { error: `This insert needs more than ${layerIndexes.length} layers.` };
  }

  const next = { ...values };
  for (const slot of layerIndexes) {
    getLayerFieldIds(slot).forEach((fieldId) => {
      next[fieldId] = '';
    });
  }

  nextSegments.forEach((segment, slotIndex) => {
    const targetIndex = slotIndex + 1;
    const rewritten = { ...segment.snapshot };
    if (targetIndex === 1) {
      rewritten.top = formatLayerDepthValue(segment.top);
    } else {
      rewritten.top = formatLayerDepthValue(nextSegments[targetIndex - 2]?.bottom ?? numericTop);
    }
    rewritten.bottom = formatLayerDepthValue(segment.bottom);
    writeLayerSnapshot(next, rewritten, targetIndex);
  });
  next.layer_count = `${nextSegments.length}`;
  return { nextValues: next, insertedIndex };
}

export function buildValuesWithAddedLayer(values: FieldValueMap) {
  const activeCount = getVisibleLayerCardCount(values);
  if (activeCount >= layerIndexes.length) {
    return values;
  }

  const next = { ...values };
  const nextIndex = activeCount + 1;
  next.layer_count = `${nextIndex}`;
  next[`layer_${nextIndex}_top`] = nextIndex === 1 ? '0' : values[`layer_${activeCount}_bottom`] ?? '';
  return next;
}

export function buildValuesWithRemovedLayerAtIndex(values: FieldValueMap, index: number) {
  const activeCount = getVisibleLayerCardCount(values);
  if (activeCount <= 1 || index < 1 || index > activeCount) {
    return values;
  }

  const next = { ...values };
  const snapshots: Record<string, string>[] = [];
  for (let slot = 1; slot <= activeCount; slot += 1) {
    if (slot === index) {
      continue;
    }
    snapshots.push(snapshotLayerValues(values, slot));
  }

  for (const slot of layerIndexes) {
    getLayerFieldIds(slot).forEach((fieldId) => {
      next[fieldId] = '';
    });
  }

  snapshots.forEach((snapshot, slotIndex) => {
    const targetIndex = slotIndex + 1;
    const rewritten = { ...snapshot };
    rewritten.top = targetIndex === 1 ? '0' : snapshots[targetIndex - 2]?.bottom ?? '';
    writeLayerSnapshot(next, rewritten, targetIndex);
  });

  next.layer_count = `${Math.max(snapshots.length, 1)}`;
  return next;
}

function getLayerFieldIds(index: number) {
  return layerFieldSuffixes.map((suffix) => `layer_${index}_${suffix}`);
}

function snapshotLayerValues(values: FieldValueMap, index: number) {
  return Object.fromEntries(layerFieldSuffixes.map((suffix) => [suffix, values[`layer_${index}_${suffix}`] ?? '']));
}

function writeLayerSnapshot(target: FieldValueMap, snapshot: Record<string, string>, index: number) {
  layerFieldSuffixes.forEach((suffix) => {
    target[`layer_${index}_${suffix}`] = snapshot[suffix] ?? '';
  });
}

function formatLayerDepthValue(value: number) {
  if (Number.isInteger(value)) {
    return `${value}`;
  }
  return value.toFixed(2).replace(/\.?0+$/, '');
}
