import type { FieldValueMap, SelectorOption } from './editor-types';

export const stabilityTestTypeOptions: readonly SelectorOption[] = [
  { label: 'Compression Test', value: 'CT' },
  { label: 'Shovel Shear Test', value: 'SS' },
  { label: 'Hand Shear Test', value: 'HS' },
  { label: 'Ext. Col. Test', value: 'ECT' },
  { label: 'Propagation Saw Test', value: 'PST' },
  { label: 'Rutschblock Test', value: 'RB' },
];
export const stabilityResultOptions = ['easy', 'moderate', 'hard'] as const;
export const ectResultOptions = ['ECTN', 'ECTP', 'ECTX'] as const;
export const pstResultOptions = ['END', 'ARR', 'SF'] as const;
export const rbScoreOptions = ['RB1', 'RB2', 'RB3', 'RB4', 'RB5', 'RB6', 'RB7'] as const;
export const stabilityCharacterOptions = ['SC', 'SP', 'PC', 'RP', 'BRK'] as const;
export const stabilityTestIndexes = Array.from({ length: 12 }, (_, index) => index + 1);

export function countStabilityWarnings(values: FieldValueMap) {
  let total = 0;
  for (const index of stabilityTestIndexes.slice(0, getVisibleStabilityTestCount(values))) {
    total += countStabilityWarning(values, index);
  }
  return total;
}

export function countStabilityWarning(values: FieldValueMap, index: number) {
  const type = (values[`test_${index}_type`] ?? '').trim();
  const result = (values[`test_${index}_result`] ?? '').trim();
  const depth = (values[`test_${index}_depth`] ?? '').trim();
  const pstCut = (values[`test_${index}_pst_cut`] ?? '').trim();
  const pstColumn = (values[`test_${index}_pst_column`] ?? '').trim();

  if (!type && !result && !depth && !pstCut && !pstColumn) {
    return 0;
  }

  let count = 0;
  if (!type) count += 1;
  if (!result && type !== 'CT') count += 1;
  if (!depth) count += 1;
  if (type === 'PST' && (!pstCut || !pstColumn)) count += 1;
  return count;
}

export function getActualStabilityCount(values: FieldValueMap) {
  let count = 0;
  for (const index of stabilityTestIndexes.slice(0, getVisibleStabilityTestCount(values))) {
    if ((values[`test_${index}_type`] ?? '').trim()) {
      count += 1;
    }
  }
  return count;
}

export function getVisibleStabilityTestCount(values: FieldValueMap) {
  const explicitCount = Number(values.test_count ?? '');
  if (Number.isFinite(explicitCount) && explicitCount > 0) {
    return Math.min(Math.max(Math.trunc(explicitCount), 1), stabilityTestIndexes.length);
  }

  let highestIndex = 0;
  for (const index of stabilityTestIndexes) {
    const hasAny = [
      `test_${index}_type`,
      `test_${index}_result`,
      `test_${index}_taps`,
      `test_${index}_character`,
      `test_${index}_depth`,
      `test_${index}_pst_cut`,
      `test_${index}_pst_column`,
    ].some((fieldId) => (values[fieldId] ?? '').trim());
    if (hasAny) {
      highestIndex = index;
    }
  }

  return Math.max(highestIndex, 1);
}

export function buildValuesWithRemovedLastTest(values: FieldValueMap) {
  const activeCount = getVisibleStabilityTestCount(values);
  if (activeCount <= 1) {
    return values;
  }

  const next = { ...values };
  [
    `test_${activeCount}_type`,
    `test_${activeCount}_result`,
    `test_${activeCount}_taps`,
    `test_${activeCount}_character`,
    `test_${activeCount}_depth`,
    `test_${activeCount}_pst_cut`,
    `test_${activeCount}_pst_column`,
  ].forEach((fieldId) => {
    next[fieldId] = '';
  });
  next.test_count = `${Math.max(activeCount - 1, 1)}`;
  return next;
}

export function buildStabilityPreview(type: string, result: string, taps: string, character: string, depth: string) {
  if (!type && !result && !taps && !character && !depth) {
    return '';
  }

  const resultPreview =
    result
      ? type === 'CT'
        ? `${type}${resolveCtPreviewLetter(result, taps)}${taps ? ` ${taps} taps` : ''}`
        : type === 'ECT'
          ? `${result}${result !== 'ECTX' && taps ? ` ${taps} taps` : ''}`
          : type === 'PST'
            ? `${type} ${result}`
            : type === 'RB'
              ? result || type
              : `${type} ${result}`
      : type || 'test pending';
  const characterPreview = character ? `character ${character}` : '';
  const depthPreview = depth ? `at ${depth} cm` : 'depth pending';
  return [resultPreview, characterPreview, depthPreview].filter(Boolean).join(' · ');
}

export function resolveCtResultLabel(taps: string, fallbackResult: string) {
  const numericTaps = Number(taps);
  if (Number.isFinite(numericTaps)) {
    if (numericTaps >= 1 && numericTaps <= 10) {
      return 'easy';
    }
    if (numericTaps >= 11 && numericTaps <= 20) {
      return 'moderate';
    }
    if (numericTaps >= 21 && numericTaps <= 30) {
      return 'hard';
    }
  }

  if (fallbackResult === 'easy' || fallbackResult === 'moderate' || fallbackResult === 'hard') {
    return fallbackResult;
  }

  return '';
}

export function resolveCtPreviewLetter(result: string, taps: string) {
  if (result === 'auto') {
    const numericTaps = Number(taps);
    if (!Number.isFinite(numericTaps)) {
      return '';
    }
    if (numericTaps >= 1 && numericTaps <= 10) {
      return 'E';
    }
    if (numericTaps >= 11 && numericTaps <= 20) {
      return 'M';
    }
    if (numericTaps >= 21 && numericTaps <= 30) {
      return 'H';
    }
    return '';
  }
  return result[0]?.toUpperCase() ?? '';
}
